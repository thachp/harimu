/**
 * Postgres migrations for preview (#119, #128).
 * D1 bootstraps its own schema at runtime; Postgres (Hyperdrive) never does. Numbered
 * db/postgres/NNNN_*.sql files are recorded in `schema_migrations` once applied.
 * Everything fails closed: if anything is uncertain, nothing deploys.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

/** Migrations already on preview before `schema_migrations` existed; recorded, not re-run. */
export const backfillThrough = '0010';
export const destructiveReviewedMarker = '-- harimu:destructive-reviewed';
const lockKey = 1191280; // advisory lock: one migrator at a time
export const schemaMigrationsTable = `CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY, checksum TEXT NOT NULL, backfilled BOOLEAN NOT NULL DEFAULT false,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`;

const tablePattern = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?([a-z_][a-z_0-9]*)[`"]?/gi;
export function createdTables(sql) { return [...new Set([...sql.matchAll(tablePattern)].map(m => m[1].toLowerCase()))]; }
const destructivePattern = /\b(DROP\s+(TABLE|COLUMN|INDEX|SCHEMA|VIEW|TYPE)|TRUNCATE|DELETE\s+FROM|ALTER\s+TABLE\s+\S+\s+(DROP|RENAME)|ALTER\s+COLUMN\s+\S+\s+TYPE)\b/i;
export function isDestructive(sql) {
  const code = sql.split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
  return destructivePattern.test(code);
}
export const checksum = sql => createHash('sha256').update(sql).digest('hex');

/** Numbered migrations (`NNNN_name.sql`) in order. */
export function postgresMigrations(dir = 'db/postgres') {
  return readdirSync(dir).filter(f => /^\d{4}_[a-z0-9_]+\.sql$/i.test(f)).sort().map(file => {
    const sql = readFileSync(join(dir, file), 'utf8');
    return { id: file.replace(/\.sql$/, ''), file, number: file.slice(0, 4), sql, checksum: checksum(sql), tables: createdTables(sql) };
  });
}
/** Every table any repo migration creates, across D1 (drizzle/) and Postgres (db/postgres/). */
export function repoTables(dirs = ['drizzle', 'db/postgres']) {
  const names = new Set();
  for (const dir of dirs) for (const f of readdirSync(dir).filter(f => f.endsWith('.sql'))) for (const t of createdTables(readFileSync(join(dir, f), 'utf8'))) names.add(t);
  return [...names].sort();
}

const publicTables = async db => new Set((await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows.map(r => String(r.tablename).toLowerCase()));
const recorded = async db => {
  const tables = await publicTables(db);
  if (!tables.has('schema_migrations')) return null;
  return new Map((await db.query('SELECT id, checksum FROM schema_migrations')).rows.map(r => [r.id, r.checksum]));
};

/** Pure check: which migrations are not recorded, changed after recording, or missing tables. */
export function migrationProblems(migrations, recordedMap, tables) {
  const problems = [];
  for (const m of migrations) {
    const sum = recordedMap?.get(m.id);
    if (sum === undefined) problems.push({ file: m.file, reason: 'not applied' });
    else if (sum !== m.checksum) problems.push({ file: m.file, reason: 'changed after it was applied' });
    const missing = m.tables.filter(t => !tables.has(t));
    if (missing.length) problems.push({ file: m.file, reason: `missing table(s) ${missing.join(', ')}` });
  }
  return problems;
}
/** #119 deploy guard: throws, listing every problem, unless all migrations are applied. */
export async function assertPostgresMigrationsApplied(db, migrations = postgresMigrations()) {
  const problems = migrationProblems(migrations, await recorded(db), await publicTables(db));
  if (problems.length) throw new Error(`Postgres migrations are not applied: ${problems.map(p => `${p.file} (${p.reason})`).join('; ')}. Run "npm run db:postgres:migrate" with the admin URL; nothing was deployed.`);
}

/**
 * Apply pending migrations in order, each in its own transaction, recording it in the
 * same transaction. First run backfills <= backfillThrough without re-running, but only
 * if every table they create already exists. Destructive SQL needs the reviewed marker.
 * `db` = { query(text, params?) -> {rows}, exec(text) }.
 */
export async function applyPostgresMigrations(db, migrations = postgresMigrations(), { dryRun = false, log = () => {} } = {}) {
  for (const m of migrations) if (isDestructive(m.sql) && !m.sql.includes(destructiveReviewedMarker)) throw new Error(`${m.file} looks destructive; add "${destructiveReviewedMarker}" after manual review.`);
  await db.query('SELECT pg_advisory_lock($1)', [lockKey]);
  try {
    let done = await recorded(db);
    const tables = await publicTables(db);
    if (done === null) {
      const backfill = migrations.filter(m => m.number <= backfillThrough);
      const missing = backfill.flatMap(m => m.tables.filter(t => !tables.has(t)).map(t => `${m.file}:${t}`));
      if (missing.length) throw new Error(`Cannot backfill schema_migrations; expected existing tables are missing: ${missing.join(', ')}.`);
      if (dryRun) { log(`Would create schema_migrations and backfill ${backfill.map(m => m.file).join(', ') || 'nothing'}.`); done = new Map(backfill.map(m => [m.id, m.checksum])); }
      else {
        await db.exec('BEGIN');
        try {
          await db.exec(schemaMigrationsTable);
          for (const m of backfill) await db.query('INSERT INTO schema_migrations (id, checksum, backfilled) VALUES ($1, $2, true)', [m.id, m.checksum]);
          await db.exec('COMMIT');
        } catch (error) { await db.exec('ROLLBACK'); throw error; }
        log(`Backfilled ${backfill.map(m => m.file).join(', ') || 'nothing'}.`);
        done = await recorded(db);
      }
    }
    const changed = migrations.filter(m => done.has(m.id) && done.get(m.id) !== m.checksum);
    if (changed.length) throw new Error(`Applied migrations were edited: ${changed.map(m => m.file).join(', ')}. Add a new migration instead.`);
    const pending = migrations.filter(m => !done.has(m.id));
    const applied = [];
    for (const m of pending) {
      if (dryRun) { log(`Would apply ${m.file}.`); continue; }
      await db.exec('BEGIN');
      try {
        await db.exec(m.sql);
        await db.query('INSERT INTO schema_migrations (id, checksum) VALUES ($1, $2)', [m.id, m.checksum]);
        await db.exec('COMMIT');
      } catch (error) { await db.exec('ROLLBACK'); throw new Error(`${m.file} failed and was rolled back: ${error.message}`); }
      applied.push(m.file); log(`Applied ${m.file}.`);
    }
    return { applied, pending: pending.map(m => m.file) };
  } finally { await db.query('SELECT pg_advisory_unlock($1)', [lockKey]); }
}

/** node-postgres adapter (deploy machine / CI only). */
export async function connectPostgres(connectionString) {
  const { Client } = await import('pg');
  const client = new Client({ connectionString });
  await client.connect();
  return { query: (text, params) => client.query(text, params), exec: text => client.query(text), close: () => client.end() };
}

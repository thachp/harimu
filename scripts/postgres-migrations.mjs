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
export const backfillThrough = '0012'; // 0008-0012 confirmed on preview (ARC, #143)
export const destructiveReviewedMarker = '-- harimu:destructive-reviewed';
const lockKey = 1191280; // advisory lock: one migrator at a time
export const schemaMigrationsTable = `CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY, checksum TEXT NOT NULL, backfilled BOOLEAN NOT NULL DEFAULT false,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`;

const tablePattern = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?([a-z_][a-z_0-9]*)[`"]?/gi;
export function createdTables(sql) { return [...new Set([...sql.matchAll(tablePattern)].map(m => m[1].toLowerCase()))]; }
// Block any DROP (table, column, function, sequence, view, trigger, policy, ...), any RENAME,
// TRUNCATE, DELETE FROM (even with WHERE: over-broad, fails closed) and column type changes.
const destructivePattern = /\b(DROP\s+[A-Z]|RENAME\b|TRUNCATE\b|DELETE\s+FROM\b|ALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE\b)/i;
const stripComments = sql => sql.replace(/\/\*[\s\S]*?\*\//g, ' /*c*/ ').split('\n').map(line => line.replace(/--.*$/, '')).join('\n');
export function isDestructive(sql) { return destructivePattern.test(stripComments(sql)); }
/** The review marker counts only on its own line within the first 5 lines. */
export const hasReviewMarker = sql => sql.split('\n').slice(0, 5).some(line => line.trim() === destructiveReviewedMarker);
const constraintWords = new Set(['primary', 'unique', 'check', 'foreign', 'constraint', 'exclude']);
function splitTopLevel(body) {
  const parts = []; let depth = 0, cur = '';
  for (const ch of body) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch; }
  if (cur.trim()) parts.push(cur); return parts;
}
/** Columns and indexes a migration creates: { columns: [[table, column]], indexes: [name] }. */
export function createdObjects(sql) {
  const code = stripComments(sql), columns = [], indexes = [], checks = [];
  for (const m of code.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?([a-z_][a-z_0-9]*)[`"]?\s*\(/gi)) {
    let depth = 1, i = m.index + m[0].length; const start = i;
    while (i < code.length && depth) { if (code[i] === '(') depth++; if (code[i] === ')') depth--; i++; }
    const body = code.slice(start, i - 1);
    const checkCount = (body.match(/\bCHECK\s*\(/gi) ?? []).length;
    if (checkCount) checks.push([m[1].toLowerCase(), checkCount]);
    for (const part of splitTopLevel(body)) {
      const word = part.trim().match(/^["`]?([a-z_][a-z_0-9]*)/i)?.[1].toLowerCase();
      if (word && !constraintWords.has(word)) columns.push([m[1].toLowerCase(), word]);
    }
  }
  for (const m of code.matchAll(/ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?[`"]?([a-z_][a-z_0-9]*)[`"]?\s+ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?[`"]?([a-z_][a-z_0-9]*)/gi)) {
    if (!constraintWords.has(m[2].toLowerCase())) columns.push([m[1].toLowerCase(), m[2].toLowerCase()]);
  }
  for (const m of code.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?[`"]?([a-z_][a-z_0-9]*)/gi)) indexes.push(m[1].toLowerCase());
  return { columns, indexes, checks };
}
export const checksum = sql => createHash('sha256').update(sql).digest('hex');

/** Numbered migrations (`NNNN_name.sql`) in order. */
export function postgresMigrations(dir = 'db/postgres') {
  return readdirSync(dir).filter(f => /^\d{4}_[a-z0-9_]+\.sql$/i.test(f)).sort().map(file => {
    const sql = readFileSync(join(dir, file), 'utf8');
    return { id: file.replace(/\.sql$/, ''), file, number: file.slice(0, 4), sql, checksum: checksum(sql), tables: createdTables(sql), ...createdObjects(sql) };
  });
}
/** Every table any repo migration creates, across D1 (drizzle/) and Postgres (db/postgres/). */
export function repoTables(dirs = ['drizzle', 'db/postgres']) {
  const names = new Set();
  for (const dir of dirs) for (const f of readdirSync(dir).filter(f => f.endsWith('.sql'))) for (const t of createdTables(readFileSync(join(dir, f), 'utf8'))) names.add(t);
  return [...names].sort();
}

const publicTables = async db => new Set((await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows.map(r => String(r.tablename).toLowerCase()));
/** Live schema: tables, "table.column" and index names in public. */
async function liveSchema(db) {
  const tables = await publicTables(db);
  const columns = new Set((await db.query("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public'")).rows.map(r => `${String(r.table_name).toLowerCase()}.${String(r.column_name).toLowerCase()}`));
  const indexes = new Set((await db.query("SELECT indexname FROM pg_indexes WHERE schemaname='public'")).rows.map(r => String(r.indexname).toLowerCase()));
  const checks = new Map((await db.query("SELECT c.relname AS table_name, COUNT(*)::int AS n FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace s ON s.oid=c.relnamespace WHERE s.nspname='public' AND k.contype='c' GROUP BY c.relname")).rows.map(r => [String(r.table_name).toLowerCase(), Number(r.n)]));
  return { tables, columns, indexes, checks };
}
/** Everything a migration should have created that the live schema lacks. */
export function missingObjects(m, live) {
  return [...(m.tables ?? []).filter(t => !live.tables.has(t)).map(t => `table ${t}`),
    ...(m.columns ?? []).filter(([t, c]) => live.tables.has(t) && !live.columns.has(`${t}.${c}`)).map(([t, c]) => `column ${t}.${c}`),
    ...(m.indexes ?? []).filter(i => !live.indexes.has(i)).map(i => `index ${i}`),
    // #152: CHECK constraints: the live table must have at least as many as the migration declares.
    ...(live.checks ? (m.checks ?? []).filter(([t, n]) => live.tables.has(t) && (live.checks.get(t) ?? 0) < n).map(([t, n]) => `CHECK constraints on ${t} (${live.checks.get(t) ?? 0} of ${n})`) : [])];
}
const recorded = async db => {
  const tables = await publicTables(db);
  if (!tables.has('schema_migrations')) return null;
  return new Map((await db.query('SELECT id, checksum FROM schema_migrations')).rows.map(r => [r.id, r.checksum]));
};

/** Pure check: which migrations are not recorded, changed after recording, or missing tables. */
export function migrationProblems(migrations, recordedMap, live) {
  if (live instanceof Set) live = { tables: live, columns: new Set(), indexes: new Set() };
  const problems = [];
  for (const m of migrations) {
    const sum = recordedMap?.get(m.id);
    if (sum === undefined) problems.push({ file: m.file, reason: 'not applied' });
    else if (sum !== m.checksum) problems.push({ file: m.file, reason: 'changed after it was applied' });
    const missing = live.columns.size || live.indexes.size ? missingObjects(m, live) : m.tables.filter(t => !live.tables.has(t)).map(t => `table ${t}`);
    if (missing.length) problems.push({ file: m.file, reason: `missing ${missing.join(', ')}` });
  }
  return problems;
}
/** #119 deploy guard: throws, listing every problem, unless all migrations are applied. */
export async function assertPostgresMigrationsApplied(db, migrations = postgresMigrations()) {
  const problems = migrationProblems(migrations, await recorded(db), await liveSchema(db));
  if (problems.length) throw new Error(`Postgres migrations are not applied: ${problems.map(p => `${p.file} (${p.reason})`).join('; ')}. Run "npm run db:postgres:migrate" with the admin URL; nothing was deployed.`);
}

/**
 * Apply pending migrations in order, each in its own transaction, recording it in the
 * same transaction. First run backfills <= backfillThrough without re-running, but only
 * if every table they create already exists. Destructive SQL needs the reviewed marker.
 * `db` = { query(text, params?) -> {rows}, exec(text) }.
 */
export async function applyPostgresMigrations(db, migrations = postgresMigrations(), { dryRun = false, log = () => {} } = {}) {
  for (const m of migrations) if (isDestructive(m.sql) && !hasReviewMarker(m.sql)) throw new Error(`${m.file} looks destructive; add "${destructiveReviewedMarker}" after manual review.`);
  await db.query('SELECT pg_advisory_lock($1)', [lockKey]);
  try {
    let done = await recorded(db);
    if (done === null) {
      const live = await liveSchema(db);
      const backfill = migrations.filter(m => m.number <= backfillThrough);
      const missing = backfill.flatMap(m => missingObjects(m, live).map(x => `${m.file}: ${x}`));
      if (missing.length) throw new Error(`Cannot backfill schema_migrations; nothing recorded. Expected schema is missing: ${missing.join(', ')}.`);
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

export const connectTimeoutMs = 15000;
/**
 * Client config for node-postgres. pg-connection-string 2.14.x reads `sslrootcert=system` as a
 * file path and crashes, so strip it (and sslmode, which would override our ssl option) and
 * verify against the system CAs with `ssl: { rejectUnauthorized: true }` instead.
 */
export function postgresClientConfig(connectionString, timeoutMs = connectTimeoutMs) {
  const config = { connectionString, connectionTimeoutMillis: timeoutMs };
  let url;
  try { url = new URL(connectionString); } catch { return config; }
  if (url.searchParams.get('sslrootcert') === 'system') {
    url.searchParams.delete('sslrootcert'); url.searchParams.delete('sslmode');
    return { connectionString: url.toString(), connectionTimeoutMillis: timeoutMs, ssl: { rejectUnauthorized: true } };
  }
  return config;
}
const redact = connectionString => { try { const u = new URL(connectionString); return `${u.hostname}${u.port ? `:${u.port}` : ''}`; } catch { return 'the database'; } };
/**
 * #152: bootstrap an EMPTY database (local dev, new preview, disaster recovery). Refuses unless
 * schema public has no tables. Applies compatibility.sql + schema.sql + schema_migrations in one
 * transaction, then runs every numbered migration as a normal pending migration (all idempotent),
 * so each is recorded with backfilled=false. Finally verifies with the deploy guard.
 */
export async function bootstrapEmptyPostgres(db, { dir = 'db/postgres', log = () => {} } = {}) {
  await db.query('SELECT pg_advisory_lock($1)', [lockKey]);
  try {
    const tables = await publicTables(db);
    if (tables.size) throw new Error(`--bootstrap-empty refuses: schema public already has ${tables.size} table(s). Use the normal migrate command.`);
    const base = ['compatibility.sql', 'schema.sql'].map(f => readFileSync(join(dir, f), 'utf8'));
    await db.exec('BEGIN');
    try { for (const sql of base) await db.exec(sql); await db.exec(schemaMigrationsTable); await db.exec('COMMIT'); }
    catch (error) { await db.exec('ROLLBACK'); throw new Error(`Bootstrap rolled back: ${error.message}`); }
    log('Applied compatibility.sql and schema.sql.');
  } finally { await db.query('SELECT pg_advisory_unlock($1)', [lockKey]); }
  const migrations = postgresMigrations(dir);
  const result = await applyPostgresMigrations(db, migrations, { log });
  await assertPostgresMigrationsApplied(db, migrations);
  return result;
}

/** node-postgres adapter (deploy machine / CI only). Fails within timeoutMs, never hangs. */
export async function connectPostgres(connectionString, { timeoutMs = connectTimeoutMs } = {}) {
  const { Client } = await import('pg');
  const client = new Client(postgresClientConfig(connectionString, timeoutMs));
  try { await client.connect(); }
  catch (error) {
    await client.end().catch(() => {});
    const timedOut = /timeout/i.test(error?.message ?? '');
    throw new Error(timedOut ? `Postgres connection to ${redact(connectionString)} timed out after ${timeoutMs} ms; nothing was migrated or deployed.` : `Postgres connection to ${redact(connectionString)} failed: ${error?.message ?? error}; nothing was migrated or deployed.`);
  }
  return { query: (text, params) => client.query(text, params), exec: text => client.query(text), close: () => client.end() };
}

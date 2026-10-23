/** #831 / QA1 review on #832: real-Postgres race for the plank cap. CI has no real PostgreSQL (the Postgres jobs use PGlite, one connection),
 *  so this runs only when HARIMU_TEST_PG_URL points at a disposable database; it works in its own temporary schema and drops it. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
const url = process.env.HARIMU_TEST_PG_URL;
test('real PG: parallel up-votes from many connections never store more than 3 per member', { skip: !url && 'HARIMU_TEST_PG_URL not set' }, async t => {
  const { default: pg } = await import('pg');
  const schema = `plank_race_${process.pid}`, pool = new pg.Pool({ connectionString: url, max: 12, options: `-c search_path=${schema}` });
  t.after(async () => { await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await pool.end(); });
  await pool.query(`CREATE SCHEMA ${schema}`);
  await pool.query('CREATE TABLE citizens (clerk_user_id TEXT COLLATE "C" PRIMARY KEY); CREATE TABLE party_members (clerk_user_id TEXT PRIMARY KEY, party_id TEXT NOT NULL, joined_at BIGINT NOT NULL)');
  await pool.query(readFileSync('db/postgres/0077_plank_votes.sql', 'utf8'));
  const db = { prepare: sql => ({ bind: (...a) => { let i = 0; const q = sql.replace(/\?/g, () => `$${++i}`);
    return { run: () => pool.query(q, a), first: async () => (await pool.query(q, a)).rows[0] ?? null, all: async () => ({ results: (await pool.query(q, a)).rows }) }; } }) };
  // lib/plank-votes.ts uses extensionless imports; point them at absolute .ts files so Node's type stripping can load it as-is.
  const lib = f => pathToFileURL(resolve('lib', f)).href, file = join(mkdtempSync(join(tmpdir(), 'plank-')), 'plank-votes.ts');
  writeFileSync(file, readFileSync('lib/plank-votes.ts', 'utf8').replace("'./kindle-parties'", `'${lib('kindle-parties.ts')}'`).replace(/'\.\/plank-votes-rules'/g, `'${lib('plank-votes-rules.ts')}'`));
  const { runPlankCommand } = await import(pathToFileURL(file).href);
  const { pledgeCatalog } = await import('../lib/kindle-parties.ts');
  for (let round = 0; round < 10; round++) {
    const u = `u${round}`; await pool.query("INSERT INTO citizens VALUES ($1); INSERT INTO party_members VALUES ($1,'open-ledger',1)".replace('$1', `'${u}'`).replace('$1', `'${u}'`));
    await Promise.all(pledgeCatalog.slice(0, 10).map(p => runPlankCommand(db, u, { action: 'upvote', pledgeKey: p.key }, 1)));
    const n = Number((await pool.query('SELECT COUNT(*) AS n FROM party_plank_votes WHERE clerk_user_id=$1', [u])).rows[0].n);
    assert.ok(n <= 3, `round ${round}: ${n} votes`);
  }
});

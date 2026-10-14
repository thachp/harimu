// #201 follow-up (QA1 nit on #179): through the real adapter on PGlite, an undefined-table error names the
// relation and never echoes bound values or SQL.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
import { isMissingStabilityTable } from '../lib/stability.ts';

const source = (await readFile(new URL('../lib/postgres/database.ts', import.meta.url), 'utf8')).replace("'./sql'", JSON.stringify(new URL('../lib/postgres/sql.ts', import.meta.url).href));
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { PostgresDatabase } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('#179 adapter: a missing table error names the relation and contains no bound values', async t => {
  const pg = new PGlite(); await pg.waitReady; t.after(() => pg.close());
  await pg.exec('CREATE TABLE nation_stability_scores(id text)');
  const db = new PostgresDatabase(async () => ({ query: (text, values) => pg.query(text, values), release: async () => {} }), {});
  const secret = 'secret-bound-value-7f3a';
  const error = await db.prepare('SELECT id FROM world_ticks_missing WHERE id = ?').bind(secret).first().then(() => null, e => e);
  assert.ok(error, 'query must fail');
  assert.match(error.message, /^PostgreSQL operation failed \(42P01\): relation "world_ticks_missing" does not exist\.$/);
  assert.ok(!error.message.includes(secret), 'no bound values');
  assert.ok(!/SELECT|WHERE/.test(error.message), 'no SQL');
  assert.equal(isMissingStabilityTable(error), false, 'another missing table is rethrown');
  await pg.exec('DROP TABLE nation_stability_scores');
  const missing = await db.prepare('SELECT id FROM nation_stability_scores WHERE id = ?').bind(secret).first().then(() => null, e => e);
  assert.match(missing.message, /relation "nation_stability_scores" does not exist/);
  assert.ok(!missing.message.includes(secret));
  assert.equal(isMissingStabilityTable(missing), true);
});

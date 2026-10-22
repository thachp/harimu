/** #486 (ARC: 30x24 additive, slice 2): migration 0066 only adds the squares of the larger grid. It never changes, deletes or overwrites an existing row. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { DatabaseSync } from 'node:sqlite';
import { localRuntime } from './helpers/local-runtime.mjs';
const z = await (async () => { const r = await localRuntime(); try { return await r.importModule('lib/map-zones.ts'); } finally { await r.close(); } })();
const file = await readFile(new URL('../db/postgres/0066_world_grid_30x24.sql', import.meta.url), 'utf8');
const body = file.split('\n').filter(l => !l.startsWith('--')).join('\n');
const { from, to } = z.gridGrowth486;
const added = to.width * to.height - from.width * from.height;

test('0066 is exactly the generated growth, insert-only, and flagged non-destructive', async () => {
  assert.deepEqual([from, to], [{ width: 24, height: 18 }, { width: 30, height: 24 }]);
  assert.equal(body, [...z.gridGrowthSql().map(s => s + ';'), ''].join('\n'));
  assert.doesNotMatch(body, /\b(UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/i, 'no statement can change an existing row');
  assert.equal((body.match(/ON CONFLICT \(x,y\) DO NOTHING;/g) ?? []).length, body.split(';').length - 1, 'every insert is DO NOTHING on conflict');
  const { isDestructive } = await import('../scripts/postgres-migrations.mjs'); assert.equal(isDestructive(file), false);
  assert.equal(added, 288);
});

test('Postgres: every existing row is byte-identical after 0066 (including changed and pre-existing rows), 288 rows are added, a second run changes nothing', async t => {
  const pg = new PGlite(); t.after(() => pg.close());
  await pg.exec(z.postgresWorldSquaresMigration());
  await pg.exec(await readFile(new URL('../db/postgres/0060_confluence_capital.sql', import.meta.url), 'utf8'));
  // live data the seed would not reproduce: a square whose owner changed in play, and a row already present inside the growth area
  await pg.exec("UPDATE world_squares SET zone='frontier', owner='kindle' WHERE x=0 AND y=0");
  await pg.exec("INSERT INTO world_squares (x,y,zone,owner,terrain,resource,feature) VALUES (25,3,'frontier','korund','city',NULL,'test row')");
  const read = async () => (await pg.query('SELECT x,y,zone,owner,terrain,resource,feature FROM world_squares ORDER BY y,x')).rows;
  const before = await read();
  await pg.exec(file); const once = await read(); await pg.exec(file);
  assert.deepEqual(await read(), once, 'a second run changes nothing');
  const key = r => `${r.x},${r.y}`, after = new Map(once.map(r => [key(r), r]));
  for (const row of before) assert.deepEqual(after.get(key(row)), row, `existing row ${key(row)} unchanged`);
  assert.equal(once.length, to.width * to.height);
  assert.equal(once.length - before.length, added - 1, 'the pre-existing growth-area row was kept, not replaced');
  for (const r of once.filter(r => r.x >= from.width || r.y >= from.height)) if (!(r.x === 25 && r.y === 3)) assert.equal(r.zone, 'wildlands', key(r));
});

test('SQLite/D1 accepts the same statements with the same guarantees', () => {
  const db = new DatabaseSync(':memory:'); db.exec(z.worldSquaresSchema); for (const s of z.worldSquaresSeedSql()) db.exec(s);
  const before = db.prepare('SELECT * FROM world_squares ORDER BY y,x').all();
  db.exec(body); db.exec(body);
  const after = db.prepare('SELECT * FROM world_squares WHERE x < ? AND y < ? ORDER BY y,x').all(from.width, from.height);
  assert.deepEqual(after, before); assert.equal(db.prepare('SELECT COUNT(*) AS n FROM world_squares').get().n, to.width * to.height);
});

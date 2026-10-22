/** #486 (ARC): opening a nation overwrites only untouched Wildlands, and refuses (logging the nation and the squares) when a player holds any square of its block. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { localRuntime } from './helpers/local-runtime.mjs';
const { z, g, reg } = await (async () => { const r = await localRuntime(); try { return { z: await r.importModule('lib/map-zones.ts'), g: await r.importModule('lib/nation-opening-guard.ts'), reg: await r.importModule('lib/nation-openings.ts') }; } finally { await r.close(); } })();

// A GameDatabase over PGlite (`?` placeholders → $n) with the three player tables, reduced to the columns the guard reads.
async function world(t) {
  const pg = new PGlite(); t.after(() => pg.close());
  await pg.exec(z.postgresWorldSquaresMigration()); for (const s of z.gridGrowthSql()) await pg.exec(s);
  await pg.exec('CREATE TABLE world_square_purchases (x INTEGER, y INTEGER); CREATE TABLE city_capture_squares (x INTEGER, y INTEGER); CREATE TABLE world_cities (center_x INTEGER, center_y INTEGER);');
  const stmt = (sql, args = []) => { let i = 0; const text = sql.replace(/\?/g, () => `$${++i}`); return { sql: text, args, bind: (...a) => stmt(sql, a), all: async () => ({ results: (await pg.query(text, args)).rows }) }; };
  return { pg, db: { prepare: sql => stmt(sql), batch: async list => { for (const s of list) await pg.query(s.sql, s.args); return []; } } };
}
const hoarvale = [...z.mappedNations, { id: 'hoarvale', capital: reg.nationOpening('hoarvale').capital, biome: ['hills', 'plains'] }]; // (3,20): block x 0..6, y 17..23

test('a clean block opens: Wildlands become the nation\'s Heartland and Frontier, nothing is logged', async t => {
  const { pg, db } = await world(t), logs = [];
  assert.deepEqual(await g.openNationSquares(db, 'hoarvale', hoarvale, m => logs.push(m)), { ok: true });
  assert.deepEqual(logs, []);
  assert.equal((await pg.query("SELECT COUNT(*)::int n FROM world_squares WHERE owner='hoarvale'")).rows[0].n, 25);
});

test('a purchased, captured or city-claimed square anywhere in the block refuses the opening, logs nation and squares, and writes nothing', async t => {
  for (const [table, sql, want] of [
    ['purchase', 'INSERT INTO world_square_purchases VALUES (0,17)', '(0,17) purchased'],
    ['capture', 'INSERT INTO city_capture_squares VALUES (6,23)', '(6,23) captured'],
    ['city', 'INSERT INTO world_cities VALUES (8,17)', '(6,17) city claim'], // a city centred outside the block still claims its edge
  ]) {
    const { pg, db } = await world(t), logs = [];
    const before = (await pg.query('SELECT * FROM world_squares ORDER BY y,x')).rows;
    await pg.exec(sql);
    const res = await g.openNationSquares(db, 'hoarvale', hoarvale, m => logs.push(m));
    assert.equal(res.ok, false, table); assert.ok(res.blockers.length > 0);
    assert.equal(logs.length, 1); assert.match(logs[0], /opening of hoarvale refused/); assert.ok(logs[0].includes(want), `${table}: ${logs[0]}`); assert.match(logs[0], /Move the capital/);
    assert.deepEqual((await pg.query('SELECT * FROM world_squares ORDER BY y,x')).rows, before, `${table}: nothing written`);
  }
});

test('a player square just outside the block does not block; an unreadable table refuses (fail closed)', async t => {
  const { db, pg } = await world(t);
  await pg.exec('INSERT INTO world_square_purchases VALUES (7,20); INSERT INTO world_cities VALUES (9,20)');
  assert.deepEqual(await g.nationOpeningBlockers(db, 'hoarvale', hoarvale), []);
  await pg.exec('DROP TABLE city_capture_squares'); const logs = [];
  assert.equal((await g.openNationSquares(db, 'hoarvale', hoarvale, m => logs.push(m))).ok, false); assert.match(logs[0], /fail closed/);
});

test('opening PRs go through the guard: only the guard and the existing boot step (Confluence) call nationSquaresUpsertSql', async () => {
  const { readdirSync } = await import('node:fs');
  const callers = ['lib', 'app'].flatMap(d => readdirSync(d, { recursive: true }).filter(f => /\.tsx?$/.test(f)).map(f => `${d}/${f}`))
    .filter(f => /nationSquaresUpsertSql\(/.test(readFileSync(f, 'utf8')) && f !== 'lib/map-zones.ts');
  assert.deepEqual(callers, ['lib/nation-opening-guard.ts']);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { seedWorldSquares, mvpNations, mapWidth, mapHeight, acquisitionRules, worldSquaresSchema, worldSquaresSeedSql, postgresWorldSquaresMigration, readWorldSquares } from '../lib/map-zones.ts';

const at = (squares, x, y) => squares.find(s => s.x === x && s.y === y);
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

test('seed is deterministic and covers the full reduced grid', () => {
  const a = seedWorldSquares(), b = seedWorldSquares();
  assert.deepEqual(a, b);
  assert.equal(a.length, mapWidth * mapHeight);
  assert.equal(new Set(a.map(s => `${s.x},${s.y}`)).size, a.length);
});
test('each MVP nation has a Heartland ring and a Frontier border outpost it owns', () => {
  const squares = seedWorldSquares();
  for (const n of mvpNations) {
    const capital = at(squares, n.capital.x, n.capital.y);
    assert.equal(capital.zone, 'heartland'); assert.equal(capital.owner, n.id); assert.equal(capital.feature, 'capital');
    const ring = squares.filter(s => cheb(s, n.capital) <= 2);
    assert.equal(ring.length, 25); assert.ok(ring.every(s => s.zone === 'heartland' && s.owner === n.id));
    const outpost = at(squares, n.outpost.x, n.outpost.y);
    assert.equal(outpost.zone, 'frontier'); assert.equal(outpost.owner, n.id); assert.equal(outpost.feature, 'border outpost');
  }
});
test('Wildlands separate nations and a small Commons sits between them', () => {
  const squares = seedWorldSquares();
  const commons = squares.filter(s => s.zone === 'commons');
  assert.ok(commons.length > 0 && commons.length <= 12);
  assert.ok(commons.every(s => s.owner === null));
  // No claimed square of one nation touches another nation's land or the Commons.
  const land = squares.filter(s => s.zone === 'heartland' || s.zone === 'frontier');
  for (const s of land) {
    const owner = mvpNations.find(n => cheb(s, n.capital) <= 3).id;
    for (const t of squares) if (cheb(s, t) === 1) {
      if (t.zone === 'commons') assert.fail(`nation land ${s.x},${s.y} touches the Commons`);
      if (t.zone === 'heartland' || t.zone === 'frontier') assert.equal(mvpNations.find(n => cheb(t, n.capital) <= 3).id, owner);
    }
  }
  assert.ok(squares.some(s => s.zone === 'wildlands'));
});
test('acquisition rules use the documented plain words', () => {
  assert.equal(acquisitionRules.heartland, 'Never capturable');
  assert.match(acquisitionRules.commons, /^Cannot be bought/);
  assert.match(acquisitionRules.frontier, /Purchasable when unclaimed/);
  assert.match(acquisitionRules.commons, /Claimed only by war or treaty/);
});
test('committed Postgres migration matches the generator', async () => {
  const file = await readFile(new URL('../db/postgres/0011_world_squares.sql', import.meta.url), 'utf8');
  assert.equal(file, postgresWorldSquaresMigration());
});
const adapter = sqlite => ({ prepare: sql => ({ all: async () => ({ results: sqlite.prepare(sql).all() }) }) });
test('reads seeded table rows (idempotent seed) and falls back to the seed without a table', async () => {
  const sqlite = new DatabaseSync(':memory:');
  assert.equal((await readWorldSquares(adapter(sqlite))).source, 'seed');
  sqlite.exec(worldSquaresSchema);
  for (let i = 0; i < 2; i++) for (const s of worldSquaresSeedSql()) sqlite.exec(s);
  const read = await readWorldSquares(adapter(sqlite));
  assert.equal(read.source, 'table');
  assert.deepEqual(read.squares, seedWorldSquares());
});
test('committed D1 migration matches the generator and applies idempotently', async () => {
  const { sqliteWorldSquaresMigration } = await import('../lib/map-zones.ts');
  const file = await readFile(new URL('../drizzle/0011_world_squares.sql', import.meta.url), 'utf8');
  assert.equal(file, sqliteWorldSquaresMigration());
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec(file); sqlite.exec(file);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM world_squares').get().n, mapWidth * mapHeight);
});
test('a partially seeded table falls back to the full seed', async () => {
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec(worldSquaresSchema); sqlite.exec(worldSquaresSeedSql()[0]);
  const read = await readWorldSquares({ prepare: sql => ({ all: async () => ({ results: sqlite.prepare(sql).all() }) }) });
  assert.equal(read.source, 'seed'); assert.equal(read.squares.length, mapWidth * mapHeight);
});

// #745: every map-design §6.2 rare node type is seeded on at least one square of the 24x18 grid (migration 0067 on both backends, the boot seed and the in-code fallback).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { localRuntime } from './helpers/local-runtime.mjs';
import { WORLD_GRID } from '../lib/globe-mapping.ts';
const zones = await (async () => { const r = await localRuntime(); try { return await r.importModule('lib/map-zones.ts'); } finally { await r.close(); } })();
const RARE = ['Emberstone', 'Riverpearl', 'Ironroot', 'Skysilk', 'Geotherm core', 'Sunglass', 'Frostcore', 'Hazequartz', 'Heartwood', 'Stormcells']; // map-design §6.2
const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');

function migrated() { // 0011 then 0067, exactly as a database that already has the seed gets them
  const db = new DatabaseSync(':memory:');
  return read('drizzle/0011_world_squares.sql').then(async s0011 => { db.exec(s0011); db.exec(await read('drizzle/0067_rare_nodes.sql')); return db; });
}

test('after migration 0067 every §6.2 rare type is on at least one in-bounds square, and no existing node changed', async () => {
  const db = await migrated(), rows = db.prepare('SELECT x,y,zone,owner,resource,feature FROM world_squares').all();
  for (const type of RARE) {
    const on = rows.filter(r => r.resource === type);
    assert.ok(on.length >= 1, `${type} is seeded`);
    assert.ok(on.every(r => r.x >= 0 && r.y >= 0 && r.x < WORLD_GRID.width && r.y < WORLD_GRID.height), `${type} in bounds`);
  }
  const before = zones.seedWorldSquares(), changed = rows.filter(r => before.find(b => b.x === r.x && b.y === r.y).resource !== r.resource);
  assert.deepEqual(changed.map(r => `${r.x},${r.y}:${r.resource}`).sort(), zones.rareNodePlacements.map(p => `${p.x},${p.y}:${p.resource}`).sort(), 'only the seven placements change');
  assert.ok(changed.every(r => r.owner === null && r.feature === null && before.find(b => b.x === r.x && b.y === r.y).resource === null), 'only empty, unowned squares');
  db.exec(await read('drizzle/0067_rare_nodes.sql')); assert.equal(db.prepare('SELECT COUNT(*) n FROM world_squares WHERE resource IS NOT NULL').get().n, rows.filter(r => r.resource).length, 'idempotent');
});

test('placements: the seven missing types, each on the grid, on an empty square of its zone; a taken square is left alone', () => {
  assert.deepEqual(zones.rareNodePlacements.map(p => p.resource).sort(), ['Frostcore', 'Geotherm core', 'Hazequartz', 'Heartwood', 'Ironroot', 'Stormcells', 'Sunglass']);
  const seed = zones.seedWorldSquares();
  for (const p of zones.rareNodePlacements) { const s = seed.find(q => q.x === p.x && q.y === p.y); assert.ok(s && s.zone === p.zone && !s.owner && !s.resource && !s.feature, `${p.resource} at ${p.x},${p.y}`); }
  const taken = zones.withRareNodes(seed.map(s => (s.x === 12 && s.y === 5 ? { ...s, owner: 'kindle' } : s)));
  assert.equal(taken.find(s => s.x === 12 && s.y === 5).resource, null, 'an owned square keeps its resource');
});

test('0067 is generated (identical in drizzle/ and db/postgres/), additive, and the boot seed and fallback apply the same placements', async () => {
  for (const f of ['drizzle/0067_rare_nodes.sql', 'db/postgres/0067_rare_nodes.sql']) assert.equal(await read(f), zones.rareNodesMigration(), f);
  assert.doesNotMatch(zones.rareNodesMigration(), /DROP|DELETE|TRUNCATE|INSERT/i);
  assert.match(await read('lib/db.ts'), /\.\.\.rareNodesSql\(\)\.map\(sql => database\.prepare\(sql\)\)/);
  const db = new DatabaseSync(':memory:'); db.exec(zones.worldSquaresSchema); for (const s of zones.worldSquaresSeedSql()) db.exec(s); for (const s of zones.rareNodesSql()) db.exec(s);
  const { squares, source } = await zones.readWorldSquares({ prepare: q => ({ all: async () => ({ results: db.prepare(q).all() }) }) });
  assert.equal(source, 'table'); assert.ok(RARE.every(t => squares.some(s => s.resource === t)), 'boot seed path');
  const fallback = await zones.readWorldSquares({ prepare: () => ({ all: async () => { throw new Error('no table'); } }) });
  assert.equal(fallback.source, 'seed'); assert.ok(RARE.every(t => fallback.squares.some(s => s.resource === t)), 'in-code fallback');
});

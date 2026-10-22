// #486 (30x24 additive grid, slice 1): a world_squares table that already holds the extra rows of a larger grid still reads as complete on this build,
// so the additive migration can run before the build that switches WORLD_GRID. Rows beyond the grid are ignored; a missing on-grid row still falls back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { localRuntime } from './helpers/local-runtime.mjs';
const zones = await (async () => { const r = await localRuntime(); try { return await r.importModule('lib/map-zones.ts'); } finally { await r.close(); } })();
const { mapWidth, mapHeight, worldSquaresSchema, worldSquaresSeedSql, readWorldSquares, seedWorldSquares, onGrid } = zones;
const dbOf = sqlite => ({ prepare: sql => ({ all: async () => ({ results: sqlite.prepare(sql).all() }) }) });
const extraRows = () => { const rows = []; for (let y = 0; y < mapHeight + 6; y++) for (let x = 0; x < mapWidth + 6; x++) if (x >= mapWidth || y >= mapHeight) rows.push(`(${x},${y},'wildlands',NULL,'plains',NULL,NULL)`); return rows; };

test('a table with rows beyond the grid still reads as the complete on-grid table', async () => {
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec(worldSquaresSchema); for (const s of worldSquaresSeedSql()) sqlite.exec(s);
  sqlite.exec(`INSERT INTO world_squares (x,y,zone,owner,terrain,resource,feature) VALUES ${extraRows().join(',')}`);
  assert.ok(sqlite.prepare('SELECT COUNT(*) AS n FROM world_squares').get().n > mapWidth * mapHeight);
  const read = await readWorldSquares(dbOf(sqlite));
  assert.equal(read.source, 'table'); assert.equal(read.squares.length, mapWidth * mapHeight); assert.deepEqual(read.squares, seedWorldSquares());
});

test('a missing on-grid row still falls back to the seed even when off-grid rows make up the count', async () => {
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec(worldSquaresSchema); for (const s of worldSquaresSeedSql()) sqlite.exec(s);
  sqlite.exec('DELETE FROM world_squares WHERE x=0 AND y=0');
  sqlite.exec(`INSERT INTO world_squares (x,y,zone,owner,terrain,resource,feature) VALUES ${extraRows().join(',')}`);
  assert.equal((await readWorldSquares(dbOf(sqlite))).source, 'seed');
});

test('onGrid keeps exactly the squares inside the grid, and the purchase and founding checks use it', () => {
  assert.deepEqual(onGrid([{ x: 0, y: 0 }, { x: mapWidth - 1, y: mapHeight - 1 }, { x: mapWidth, y: 0 }, { x: 0, y: mapHeight }, { x: -1, y: 0 }, { x: '3', y: '2' }]),
    [{ x: 0, y: 0 }, { x: mapWidth - 1, y: mapHeight - 1 }, { x: '3', y: '2' }]);
  for (const f of ['lib/world-registry.ts', 'lib/city-founding.ts']) assert.match(readFileSync(f, 'utf8'), /const squares = onGrid\(results \?\? \[\]\)/, f);
});

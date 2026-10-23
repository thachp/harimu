/** #486 follow-up: the 30x24 grid's far corner (29,23) exists and is in bounds; (30,24) and its neighbours past the edge are not. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';
const { z, globe } = await (async () => { const r = await localRuntime(); try { return { z: await r.importModule('lib/map-zones.ts'), globe: await r.importModule('lib/globe-mapping.ts') }; } finally { await r.close(); } })();

test('corner (29,23) is on the 30x24 grid and seeded; (30,24), (30,23), (29,24) are not', () => {
  assert.deepEqual({ ...globe.WORLD_GRID }, { width: 30, height: 24 });
  assert.equal(z.onGrid([{ x: 29, y: 23 }]).length, 1, '(29,23) in bounds');
  for (const p of [[30, 24], [30, 23], [29, 24], [-1, 0], [0, -1]]) assert.equal(z.onGrid([{ x: p[0], y: p[1] }]).length, 0, `(${p}) out of bounds`);
  const seeded = z.seedWorldSquares();
  assert.equal(seeded.length, 720);
  assert.ok(seeded.some(s => s.x === 29 && s.y === 23), '(29,23) is seeded');
  assert.ok(!seeded.some(s => s.x >= 30 || s.y >= 24), 'nothing past the edge is seeded');
});

test('0066 adds the corner (29,23) and nothing past the edge', () => {
  const sql = z.gridGrowthSql().join('\n');
  assert.match(sql, /\(29,23,/); assert.doesNotMatch(sql, /\((30,\d+|\d+,24),/);
});

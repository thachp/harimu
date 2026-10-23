/** #486 (ARC on #486, approved by Patrick: 30x24 additive): the grid, the six new capitals, the spacing rules, the markers and the zones near the old edges. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';
const { z, reg, globe } = await (async () => { const r = await localRuntime(); try { return { z: await r.importModule('lib/map-zones.ts'), reg: await r.importModule('lib/nation-openings.ts'), globe: await r.importModule('lib/globe-mapping.ts') }; } finally { await r.close(); } })();
const { WORLD_GRID, nationGlobeSquares, squareLatLon } = globe;
const old = z.gridGrowth486.from, commons = { centre: reg.mapFitRules.commonsCentre, minCommons: reg.mapFitRules.minCommonsDistance };
const placed = { kindle: [5, 4], korund: [18, 4], aurelle: [12, 14], confluence: [4, 13], ilmar: [25, 3], veldwood: [26, 10], varkand: [19, 11], meridian: [26, 17], fulmara: [19, 18], hoarvale: [3, 20] };

test('WORLD_GRID is 30x24, the spacing rules live in one constant, and all 10 capitals fit', () => {
  assert.deepEqual({ ...WORLD_GRID }, { width: 30, height: 24 }); assert.deepEqual([z.mapWidth, z.mapHeight], [30, 24]);
  assert.deepEqual({ ...reg.capitalSpacing }, { blockRadius: 3, minCapitalDistance: 7, minCommonsDistance: 5 });
  for (const k of Object.keys(reg.capitalSpacing)) assert.equal(reg.mapFitRules[k], reg.capitalSpacing[k], k);
  assert.deepEqual(reg.mapFitRules.commonsCentre, { x: 12, y: 6 });
  const caps = reg.nationOpenings.map(o => [o.id, o.capital]);
  assert.deepEqual(Object.fromEntries(caps.map(([id, c]) => [id, [c.x, c.y]])), placed);
  for (const [id, c] of caps) assert.equal(reg.capitalFits(c, caps.filter(([o]) => o !== id).map(([, x]) => x)), true, `${id} fits`);
});

test('each new capital replaces the stand-in it was closest to (unique least-total-arc assignment), and markers rescale through squareLatLon', () => {
  const mappedCaps = reg.nationOpenings.map(o => o.biome ? o.capital : undefined); // the four capitals the 24x18 stand-ins were placed around
  const standIn = nationGlobeSquares(mappedCaps, old, 3, commons), ids = reg.nationOpenings.map(o => o.id), six = ids.filter((_, i) => !mappedCaps[i]);
  const r = Math.PI / 180, arc = (a, b) => Math.acos(Math.min(1, Math.sin(a.latitude * r) * Math.sin(b.latitude * r) + Math.cos(a.latitude * r) * Math.cos(b.latitude * r) * Math.cos((a.longitude - b.longitude) * r)));
  const from = six.map(id => squareLatLon(standIn[ids.indexOf(id)], old)), to = six.map(id => squareLatLon(reg.nationOpening(id).capital, WORLD_GRID));
  const costs = []; const perm = (a, k) => { if (k === a.length) { costs.push({ a: [...a], c: a.reduce((t, j, i) => t + arc(from[i], to[j]), 0) }); return; } for (let i = k; i < a.length; i++) { [a[k], a[i]] = [a[i], a[k]]; perm(a, k + 1); [a[k], a[i]] = [a[i], a[k]]; } };
  perm([0, 1, 2, 3, 4, 5], 0); costs.sort((p, q) => p.c - q.c);
  assert.deepEqual(costs[0].a, [0, 1, 2, 3, 4, 5], 'the registry assignment is the least total arc'); assert.ok(costs[1].c - costs[0].c > 0.1, 'and it is unique');
  const markers = nationGlobeSquares(reg.nationOpenings.map(o => o.capital), WORLD_GRID, 3, commons);
  assert.deepEqual(markers, reg.nationOpenings.map(o => o.capital), 'every marker stands on its capital: no stand-ins left');
  assert.deepEqual(squareLatLon({ x: 5, y: 4 }), { latitude: 90 - 4.5 * 7.5, longitude: -180 + 5.5 * 12 }, 'Kindle rescaled to 30x24');
});

test('zones near the old edges: the 30x24 seed keeps every 24x18 square, the new area is plain Wildlands, and 0066 matches the boot seed', () => {
  const now = z.seedWorldSquares(), was = z.seedWorldSquares(z.mvpNations, old), key = s => `${s.x},${s.y}`;
  assert.deepEqual(now.filter(s => s.x < old.width && s.y < old.height), was);
  const fresh = now.filter(s => s.x >= old.width || s.y >= old.height);
  assert.equal(fresh.length, 288); assert.ok(fresh.every(s => s.zone === 'wildlands' && s.owner === null && s.feature === null));
  const rows = z.gridGrowthSql().join(' ').match(/\((\d+),(\d+),/g).map(m => m.slice(1, -1));
  assert.deepEqual(rows, fresh.map(key), 'Postgres 0066 adds exactly the squares the D1 boot seed adds');
});

test('each new capital\'s 7x7 block is untouched Wildlands today, so its opening PR can seed it with the existing upsert', () => {
  const squares = z.seedWorldSquares(z.mappedNations);
  for (const id of ['ilmar', 'veldwood', 'varkand', 'meridian', 'fulmara', 'hoarvale']) {
    const nations = [...z.mappedNations, { id, capital: reg.nationOpening(id).capital, biome: ['plains'] }];
    assert.deepEqual(z.nationBlockConflicts(id, nations, squares), [], id);
  }
  assert.deepEqual(z.mappedNations.map(n => n.id), ['kindle', 'confluence', 'korund', 'aurelle'], 'no new nation is on the square map yet');
  assert.deepEqual(z.bootNationSquaresSql(), z.nationSquaresUpsertSql('confluence'), 'the boot step writes no new nation squares');
});

test('guard (ARC): the #501 deploy refuses a 30x24 build until world_squares holds all 720 squares (0066 applied)', async t => {
  const { PGlite } = await import('@electric-sql/pglite'), { readFileSync } = await import('node:fs');
  const { assertWorldGridCovered, worldGridOfBuild } = await import('../scripts/postgres-migrations.mjs');
  assert.deepEqual(worldGridOfBuild(), { width: 30, height: 24 }); assert.throws(() => worldGridOfBuild('nothing'), /could not be read/);
  const pg = new PGlite(); t.after(() => pg.close()); const db = { query: (q, p) => pg.query(q, p) };
  await pg.exec(z.postgresWorldSquaresMigration());
  await assert.rejects(assertWorldGridCovered(db), /432 of the 720 squares/);
  for (const s of z.gridGrowthSql()) await pg.exec(s);
  await assertWorldGridCovered(db);
  assert.match(readFileSync('scripts/deploy-production.mjs', 'utf8'), /await assertDatabaseNotAhead\(db\); await assertWorldGridCovered\(db\);/);
});

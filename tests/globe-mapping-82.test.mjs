// #82 (ARC on #720): one square-to-globe mapping for nation markers, regions and the Ownership overlay; the grid size has one definition.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';
import { WORLD_GRID, squareLatLon, nationGlobeSquares, nationGlobeCoordinates } from '../lib/globe-mapping.ts';
const { createRegionWorld, globePoint } = await import('../lib/game-art.ts');
const [zones, openings] = await (async () => { const r = await localRuntime(); try { return [await r.importModule('lib/map-zones.ts'), await r.importModule('lib/nation-openings.ts')]; } finally { await r.close(); } })();

const rad = d => d * Math.PI / 180;
const arc = (a, b) => Math.acos(Math.min(1, Math.sin(rad(a.latitude)) * Math.sin(rad(b.latitude)) + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.cos(rad(a.longitude - b.longitude))));
const places = nationGlobeCoordinates(openings.nationOpenings.map(o => o.capital));
const all = openings.nationOpenings.map((o, i) => ({ id: o.id, ...places[i] }));

test('the grid size is defined once, in lib/globe-mapping.ts, and map-zones reads it', async () => {
  assert.deepEqual([zones.mapWidth, zones.mapHeight], [WORLD_GRID.width, WORLD_GRID.height]);
  assert.match(await readFile(new URL('../lib/map-zones.ts', import.meta.url), 'utf8'), /export const mapWidth = WORLD_GRID\.width;[^\n]*\nexport const mapHeight = WORLD_GRID\.height;/);
  assert.deepEqual(squareLatLon({ x: 0, y: 0 }, { width: 128, height: 128 }), { latitude: 90 - 180 / 256, longitude: -180 + 360 / 256 }, 'any grid size maps');
});

test('a known square of every nation with a capital, Kindle included, lands at its marker and inside its own region', () => {
  const mapped = zones.mappedNations;
  assert.ok(mapped.some(n => n.id === 'kindle') && mapped.length >= 3);
  const world = createRegionWorld(all);
  for (const nation of mapped) {
    const marker = all.find(n => n.id === nation.id), at = squareLatLon(nation.capital);
    assert.deepEqual({ latitude: marker.latitude, longitude: marker.longitude }, at, `${nation.id}: capital square is the marker`);
    const mesh = world.selectables.find(m => m.userData.nationId === nation.id);
    assert.ok(mesh.position.distanceTo(globePoint(at.latitude, at.longitude, 7.22)) < 1e-9, `${nation.id}: the drawn marker stands on the capital square`);
    // region: land is seeded from the markers, so a nation's region is where its marker is nearest; its whole Heartland must be there
    const heartland = zones.nationBlockSquares(nation.id).filter(s => Math.max(Math.abs(s.x - nation.capital.x), Math.abs(s.y - nation.capital.y)) <= zones.heartlandRadius);
    assert.ok(heartland.length >= 9);
    const surface = world.group.children[0].material.map.image; // the drawn region: land pixels (green over blue) under the capital square (the coast ripple leaves lakes nearer the edge)
    for (const sq of [nation.capital]) {
      const { latitude, longitude } = squareLatLon(sq), py = Math.round((latitude / 180 + .5) * surface.height - .5);
      const px = ((Math.round(((longitude + 90) / 360) * surface.width - .5) % surface.width) + surface.width) % surface.width, o = (py * surface.width + px) * 4;
      assert.ok(surface.data[o + 1] > surface.data[o + 2], `${nation.id} square ${sq.x},${sq.y} is drawn as land`);
    }
    for (const s of heartland) {
      const p = squareLatLon(s), nearest = all.reduce((best, n) => (arc(p, n) < arc(p, best) ? n : best));
      assert.equal(nearest.id, nation.id, `${nation.id} square ${s.x},${s.y} is in ${nearest.id}'s region`);
    }
  }
});

test('nations without a capital keep distinct stand-in squares on the grid', () => {
  const squares = nationGlobeSquares(openings.nationOpenings.map(o => o.capital));
  assert.equal(new Set(squares.map(s => `${s.x},${s.y}`)).size, squares.length);
  assert.ok(squares.every(s => s.x >= 0 && s.y >= 0 && s.x < WORLD_GRID.width && s.y < WORLD_GRID.height));
});

test('GameViewport places markers through the shared mapping with each nation\'s capital', async () => {
  const vp = await readFile(new URL('../app/game-viewport.tsx', import.meta.url), 'utf8');
  assert.match(vp, /nationGlobeCoordinates\(\(nations \?\? \[\]\)\.map\(\(\{ id \}\) => nationOpenings\.find\(o => o\.id === id\)\?\.capital\)\)/);
  assert.doesNotMatch(await readFile(new URL('../lib/game-art.ts', import.meta.url), 'utf8'), /globeNationCoordinates|-145 \+/, 'no second marker layout');
});

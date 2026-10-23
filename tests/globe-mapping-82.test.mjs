// #82 (ARC on #720): one square-to-globe mapping for nation markers, regions and the Ownership overlay; the grid size has one definition.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';
import { WORLD_GRID, squareLatLon, nationGlobeSquares, nationPlaces } from '../lib/globe-mapping.ts';
const { createRegionWorld, globePoint } = await import('../lib/game-art.ts');
const [zones, openings] = await (async () => { const r = await localRuntime(); try { return [await r.importModule('lib/map-zones.ts'), await r.importModule('lib/nation-openings.ts')]; } finally { await r.close(); } })();

const rad = d => d * Math.PI / 180;
const arc = (a, b) => Math.acos(Math.min(1, Math.sin(rad(a.latitude)) * Math.sin(rad(b.latitude)) + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.cos(rad(a.longitude - b.longitude))));
const { mapFitRules, nationOpenings } = openings, commons = { centre: mapFitRules.commonsCentre, minCommons: mapFitRules.minCommonsDistance }; // exactly what GameViewport passes
const ids = nationOpenings.map(o => o.id), places = nationPlaces(nationOpenings, ids, WORLD_GRID, commons);
const all = ids.map((id, i) => ({ id, ...places[i] }));
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

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
    for (const s of heartland) {
      const p = squareLatLon(s), nearest = all.reduce((best, n) => (arc(p, n) < arc(p, best) ? n : best));
      assert.equal(nearest.id, nation.id, `${nation.id} square ${s.x},${s.y} is in ${nearest.id}'s region`);
    }
  }
});

test('QA3: every marker, the stand-ins included, is drawn on land', () => {
  const surface = createRegionWorld(all).group.children[0].material.map.image; // land pixels are green over blue
  const squares = nationGlobeSquares(nationOpenings.map(o => o.capital), WORLD_GRID, 3, commons);
  assert.equal(squares.length, 10);
  squares.forEach((sq, i) => {
    const { latitude, longitude } = squareLatLon(sq), py = Math.round((latitude / 180 + .5) * surface.height - .5);
    const px = ((Math.round(((longitude + 90) / 360) * surface.width - .5) % surface.width) + surface.width) % surface.width, o = (py * surface.width + px) * 4;
    assert.ok(surface.data[o + 1] > surface.data[o + 2], `${ids[i]} marker ${sq.x},${sq.y} is drawn as land`);
  });
});

test('stand-ins: distinct, on the grid, clear of capital blocks and at least minCommonsDistance from the Commons centre', () => {
  // #486: every nation now has a capital, so the stand-in rule is exercised with only the mapped (biome) nations' capitals, as before #486
  const squares = nationGlobeSquares(nationOpenings.map(o => o.biome ? o.capital : undefined), WORLD_GRID, 3, commons), standIns = squares.filter((_, i) => !nationOpenings[i].biome);
  assert.equal(new Set(squares.map(s => `${s.x},${s.y}`)).size, squares.length);
  assert.ok(squares.every(s => s.x >= 0 && s.y >= 0 && s.x < WORLD_GRID.width && s.y < WORLD_GRID.height));
  assert.equal(standIns.length, 6);
  for (const s of standIns) {
    assert.ok(cheb(s, mapFitRules.commonsCentre) >= mapFitRules.minCommonsDistance, `stand-in ${s.x},${s.y} too close to the Commons`);
    assert.ok(zones.mappedNations.every(n => cheb(s, n.capital) > zones.frontierRadius), `stand-in ${s.x},${s.y} inside a capital block`);
  }
  assert.ok(standIns.every((a, i) => standIns.every((b, j) => i === j || cheb(a, b) >= 3)), 'stand-ins spread apart');
});

test('stand-ins are keyed to the catalog order: shuffling the input does not move any marker', () => {
  for (const order of [[...ids].reverse(), [...ids].sort(), ['veldwood', 'kindle', 'ilmar', 'korund', 'fulmara', 'aurelle', 'varkand', 'confluence', 'meridian', 'hoarvale']]) {
    const shuffled = nationPlaces(nationOpenings, order, WORLD_GRID, commons);
    order.forEach((id, i) => assert.deepEqual(shuffled[i], places[ids.indexOf(id)], `${id} keeps its place`));
  }
  assert.deepEqual(nationPlaces(nationOpenings, ['kindle'], WORLD_GRID, commons), [places[0]], 'a subset keeps its place too');
});

test('[ASSUMPTION] tag on the stand-ins, and nation-openings reads the grid size from WORLD_GRID', async () => {
  assert.match(await readFile(new URL('../lib/globe-mapping.ts', import.meta.url), 'utf8'), /\[ASSUMPTION\] Stand-ins are placeholders, not lore: the docs give the six unopened nations no map coordinates/);
  assert.deepEqual([mapFitRules.width, mapFitRules.height], [WORLD_GRID.width, WORLD_GRID.height]);
  assert.match(await readFile(new URL('../lib/nation-openings.ts', import.meta.url), 'utf8'), /mapFitRules = \{ width: WORLD_GRID\.width, height: WORLD_GRID\.height,/);
});

test('GameViewport places markers through the shared mapping with each nation\'s capital', async () => {
  const vp = await readFile(new URL('../app/game-viewport.tsx', import.meta.url), 'utf8');
  assert.match(vp, /nationPlaces\(nationOpenings, \(nations \?\? \[\]\)\.map\(\(\{ id \}\) => id\), WORLD_GRID, \{ centre: mapFitRules\.commonsCentre, minCommons: mapFitRules\.minCommonsDistance \}\)/);
  assert.doesNotMatch(await readFile(new URL('../lib/game-art.ts', import.meta.url), 'utf8'), /globeNationCoordinates|-145 \+/, 'no second marker layout');
});

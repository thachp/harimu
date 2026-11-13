/** #1381: a signed-in Korund viewer sees Korund squares and their 8-neighbours. SQLite and PGlite. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';
import { localRuntime } from './helpers/local-runtime.mjs';

const FLAG = 'HARIMU_KORUND_MAP_FOG_ENABLED';
const PUBLIC_SQUARES = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400';
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const key = (x, y) => `${x},${y}`;

test('the Korund map fog flag is at index 90 in HARIMU_GRAY_PACK (after expedition, before city local books), preview on and production off, and is not its own binding', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf('HARIMU_CITY_EXPEDITION_ENABLED'), 89);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf(FLAG), 90);
  assert.equal(preview.vars[FLAG], undefined); assert.equal(prod.vars[FLAG], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[FLAG], 'true'); assert.equal(prod.vars.HARIMU_GRAY_PACK[FLAG], 'false');
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [FLAG]: 'false' }, FLAG), false, 'a direct string wins');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).indexOf(FLAG), 90);
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).indexOf(FLAG), 90);
});

for (const backend of ['sqlite', 'postgres']) test(`Korund map fog (${backend})`, async t => {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  r.setMapOverlays(true);
  await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='alice'").run();
  r.setFixtureEnv(FLAG, 'true');
  const full = await r.call('world/squares', 'bob');
  const fog = await r.call('world/squares', 'alice');
  const anon = await r.call('world/squares');
  assert.equal(full.cache, 'private, no-store', 'flag on: a non-Korund response is not publicly cacheable');
  assert.equal(anon.cache, 'private, no-store', 'flag on: a signed-out response is not publicly cacheable');
  assert.deepEqual(anon.data.squares, full.data.squares, 'signed-out still receives the full map body');
  assert.equal(fog.cache, 'private, no-store');
  const owned = new Set(full.data.squares.filter(s => s.owner === 'korund').map(s => key(s.x, s.y)));
  const visible = square => owned.has(key(square.x, square.y)) || [-1, 0, 1].some(dy => [-1, 0, 1].some(dx => (dx || dy) && owned.has(key(square.x + dx, square.y + dy))));
  assert.deepEqual(fog.data.squares, full.data.squares.filter(visible));
  assert.ok(fog.data.squares.some(s => s.x === 21 && s.y === 7), 'a diagonal neighbour is visible');
  assert.equal(fog.data.squares.some(s => s.x === 22 && s.y === 6), false, 'distance 2 is hidden');
  assert.ok(fog.data.squares.length < full.data.squares.length);

  const at = (x, y) => full.data.squares.find(s => s.x === x && s.y === y);
  const owners = await r.call('world/ownership', 'alice');
  const ownersFull = await r.call('world/ownership', 'bob');
  assert.equal(owners.cache, 'private, no-store');
  assert.equal(ownersFull.cache, 'private, no-store');
  const anonOwn = await r.call('world/ownership');
  assert.equal(anonOwn.cache, 'private, no-store', 'flag on: a signed-out ownership response is not publicly cacheable');
  assert.deepEqual(anonOwn.data, ownersFull.data);
  assert.ok(owners.data.cells.every(([x, y]) => visible(at(x, y))));
  assert.ok(ownersFull.data.cells.some(([, , nation]) => nation !== 'korund'));

  const resources = await r.call('world/resources', 'alice');
  const resourcesFull = await r.call('world/resources', 'bob');
  assert.equal(resources.cache, 'private, no-store');
  assert.equal(resourcesFull.cache, 'private, no-store');
  const anonRes = await r.call('world/resources');
  assert.equal(anonRes.cache, 'private, no-store', 'flag on: a signed-out resources response is not publicly cacheable');
  assert.deepEqual(anonRes.data, resourcesFull.data);
  assert.ok(resources.data.cells.every(([x, y]) => visible(at(x, y))));
  assert.ok(resourcesFull.data.cells.some(([x, y]) => !visible(at(x, y))));

  r.setFixtureEnv(FLAG, 'false');
  const off = await r.call('world/squares', 'alice');
  const offOwn = await r.call('world/ownership', 'alice');
  const offRes = await r.call('world/resources', 'alice');
  assert.equal(off.cache, PUBLIC_SQUARES, 'flag off: the squares read stays public');
  assert.deepEqual(off.data, full.data);
  assert.equal(offOwn.cache, 'public, max-age=60');
  assert.deepEqual(offOwn.data, ownersFull.data);
  assert.equal(offRes.cache, 'public, max-age=60');
  assert.deepEqual(offRes.data, resourcesFull.data);
});

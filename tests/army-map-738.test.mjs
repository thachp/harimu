/** #738 slice 4: units on the map (docs §15.3: AI officers command stacks on the tile map; 1 square per 20–60 real minutes by terrain).
 *  Positions are derived on read (no table); flag HARIMU_ARMY_MAP_ENABLED on top of the slice-1 flags. SQLite + PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { localRuntime } from './helpers/local-runtime.mjs';
import * as O from '../lib/map-overlays.ts';

const ON = { HARIMU_ARMIES_ENABLED: 'true', HARIMU_WAR_ENABLED: 'true', HARIMU_ARMY_MAP_ENABLED: 'true' };
const boot = await localRuntime({ backend: 'sqlite' });
const M = await boot.importModule('lib/army-map.ts'), Z = await boot.importModule('lib/map-zones.ts');
await boot.close();
const cap = id => Z.mappedNations.find(n => n.id === id).capital;

test('rules: three flags; terrain costs are named constants inside 20–60 minutes; route stops one square short; terrain paid on entry', () => {
  assert.equal(M.armyMapEnabled(ON), true); for (const k of Object.keys(ON)) assert.equal(M.armyMapEnabled({ ...ON, [k]: 'false' }), false, k); assert.equal(M.armyMapEnabled(null), false);
  assert.deepEqual([M.ARMY_MOVE_SECONDS_FAST, M.ARMY_MOVE_SECONDS_MEDIUM, M.ARMY_MOVE_SECONDS_SLOW, M.ARMY_MOVE_SECONDS_ROUGH, M.ARMY_STAGING_DISTANCE], [1200, 1800, 2400, 3600, 1]);
  for (const s of Object.values(M.armyMoveSeconds)) assert.ok(s >= 1200 && s <= 3600); assert.equal(M.moveSeconds('lava'), M.ARMY_MOVE_SECONDS_SLOW);
  assert.deepEqual(M.marchRoute({ x: 0, y: 0 }, { x: 3, y: 1 }), [{ x: 1, y: 1 }, { x: 2, y: 1 }]); assert.deepEqual(M.marchRoute({ x: 0, y: 0 }, { x: 1, y: 1 }), []);
  const route = [{ x: 1, y: 0 }, { x: 2, y: 0 }], terrain = p => (p.x === 1 ? 'plains' : 'hills');
  assert.deepEqual(M.positionAfter({ x: 0, y: 0 }, route, 1199, terrain), { x: 0, y: 0, arrived: false }, 'plains takes 20 min');
  assert.deepEqual(M.positionAfter({ x: 0, y: 0 }, route, 1200, terrain), { x: 1, y: 0, arrived: false });
  assert.deepEqual(M.positionAfter({ x: 0, y: 0 }, route, 1200 + 3599, terrain), { x: 1, y: 0, arrived: false }, 'hills take 60 min');
  assert.deepEqual(M.positionAfter({ x: 0, y: 0 }, route, 4800, terrain), { x: 2, y: 0, arrived: true });
});

test('orders: no war, every unit at its capital; an attacker marches only after mobilization; the defender holds; ended wars are not passed in', () => {
  const home = M.armyPositions([], 1000);
  assert.deepEqual(home.map(u => [u.nationId, u.x, u.y, u.status]), ['kindle', 'korund', 'aurelle'].map(n => [n, cap(n).x, cap(n).y, 'home']));
  const war = { attacker_nation: 'kindle', defender_nation: 'korund', declared_at: 0, mobilization_ends_at: 5000 };
  assert.equal(M.armyPositions([war], 4999).find(u => u.nationId === 'kindle').status, 'home', 'still mobilizing');
  const moving = M.armyPositions([war], 5000 + 100000), k = moving.find(u => u.nationId === 'kindle');
  assert.equal(moving.find(u => u.nationId === 'korund').status, 'home', 'defender holds');
  assert.equal(k.towardNationId, 'korund'); assert.ok(['marching', 'staged'].includes(k.status));
  const staged = M.armyPositions([war], 5000 + 10 ** 7).find(u => u.nationId === 'kindle');
  assert.equal(staged.status, 'staged'); assert.equal(Math.max(Math.abs(staged.x - cap('korund').x), Math.abs(staged.y - cap('korund').y)), 1, 'one square short of the capital');
  const two = M.armyPositions([{ ...war, defender_nation: 'aurelle', declared_at: 9 }, war], 10 ** 7).find(u => u.nationId === 'kindle');
  assert.equal(two.towardNationId, 'korund', 'the earliest-declared war wins');
});

test('overlay rules: Army positions toggles only as a real overlay, combines with others, survives the session replay; constants intact', () => {
  assert.deepEqual(O.MAP_OVERLAYS.map(o => o.id), ['ownership', 'resources', 'unrest']); assert.ok(O.UNAVAILABLE_OVERLAYS.some(o => o.id === 'armies'));
  assert.deepEqual(O.toggleOverlay(['ownership'], 'armies'), ['ownership', 'armies']); assert.deepEqual(O.toggleOverlay(['armies', 'unrest'], 'ownership'), ['ownership', 'armies']);
  assert.deepEqual(O.readSessionOverlays({ getItem: () => '["armies","unrest"]' }), ['unrest', 'armies']); assert.equal(O.overlayLabel('armies'), 'Army positions');
  const ui = readFileSync('app/map-overlays.tsx', 'utf8');
  assert.match(ui, /readSessionOverlays\(session\(\)\)\.filter\(id => armies \|\| id !== 'armies'\)/); assert.match(ui, /const armiesOn = armies && active\.includes\('armies'\)/);
  assert.match(ui, /UNAVAILABLE_OVERLAYS\.filter\(o => !armies \|\| o\.id !== 'armies'\)/); assert.match(ui, /<div className="map-resources map-armies"/, 'placed on the globe squares by the .map-resources rule in GameViewport');
});

async function spy(r, fn) { const prepare = r.db.prepare.bind(r.db), seen = { sql: [] }; r.db.prepare = q => { seen.sql.push(q); return prepare(q); }; try { seen.result = await fn(); } finally { r.db.prepare = prepare; } return seen; }
for (const backend of ['sqlite', 'postgres']) {
  test(`${backend}: flag off (any of the three) is 404 with no database access; citizen flags.armyMap appears only while on`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close()); await r.call('citizen', 'alice');
    for (const [k, v] of Object.entries(ON)) r.setFixtureEnv(k, v);
    for (const k of Object.keys(ON)) {
      r.setFixtureEnv(k, 'false');
      const off = await spy(r, async () => [await r.call('army/positions', null), await r.call('army/positions', 'alice')]);
      assert.deepEqual(off.result.map(x => x.status), [404, 404], k); assert.deepEqual(off.sql, [], `${k}: no database access`);
      assert.equal('armyMap' in (await r.call('citizen', 'alice')).data.flags, false, `${k}: no key while off`);
      r.setFixtureEnv(k, 'true');
    }
    assert.equal((await r.call('citizen', 'alice')).data.flags.armyMap, true);
  });

  test(`${backend}: GET reads once, never writes, and shows a declared war's attacker marching out of its capital`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close()); for (const [k, v] of Object.entries(ON)) r.setFixtureEnv(k, v);
    const now = Math.floor(r.now / 1000);
    await r.db.prepare("INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,casus_belli,declared_by,declared_at,mobilization_ends_at) VALUES ('w738','r-738-map1','aurelle:korund','aurelle','korund','','AI',?,?)").bind(now - 1300 - 172800, now - 1300).run();
    await r.db.prepare("INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,casus_belli,declared_by,declared_at,mobilization_ends_at,ended_at,end_kind) VALUES ('w738b','r-738-map2','kindle:korund','kindle','korund','','AI',?,?,?,'treaty')").bind(now - 9000 - 172800, now - 9000, now - 10).run();
    const read = await spy(r, () => r.call('army/positions', null));
    assert.equal(read.result.status, 200); assert.equal(read.result.cache, 'private, no-store');
    assert.equal(read.sql.length, 1, 'one read'); assert.deepEqual(read.sql.filter(q => /^\s*(INSERT|UPDATE|DELETE)/i.test(q)), [], 'never writes');
    const by = Object.fromEntries(read.result.data.units.map(u => [u.nationId, u]));
    assert.equal(by.kindle.status, 'home', 'an ended war does not move the unit'); assert.equal(by.korund.status, 'home');
    assert.equal(by.aurelle.status, 'marching'); assert.equal(by.aurelle.towardNationId, 'korund');
    const route = M.marchRoute(cap('aurelle'), cap('korund')), tm = M.terrainMap(), expected = M.positionAfter(cap('aurelle'), route, 1300, p => tm.get(`${p.x},${p.y}`));
    assert.deepEqual([by.aurelle.x, by.aurelle.y], [expected.x, expected.y], '1300 s in: where the terrain costs put it');
    assert.deepEqual(Object.keys(by.aurelle).sort(), ['name', 'nationId', 'status', 'towardNationId', 'unitId', 'x', 'y'], 'no member identities');
  });
}

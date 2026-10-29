/** #1038: winter multiplies army march time by [ASSUMPTION] 1.5, locked at march start. Flag HARIMU_WINTER_MARCH_ENABLED. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { localRuntime } from './helpers/local-runtime.mjs';

const boot = await localRuntime({ backend: 'sqlite' });
const M = await boot.importModule('lib/army-map.ts'), W = await boot.importModule('lib/winter-march.ts'), Season = await boot.importModule('lib/game-season.ts'), S = await boot.importModule('lib/army-supply.ts');
await boot.close();
const seasonSec = Season.seasonLengthMs / 1000, epoch = 5_000_000, winterStart = epoch + 3 * seasonSec;
const plains = new Map(), routeOf = n => Array.from({ length: n }, (_, i) => ({ x: i + 1, y: 0 }));
const long = routeOf(Math.ceil(seasonSec / M.ARMY_MOVE_SECONDS_FAST) + 3);
for (const s of long) plains.set(`${s.x},${s.y}`, 'plains');
const duration = (startAt, enabled) => {
  const march = { war: { attacker_nation: 'kindle', defender_nation: 'korund', declared_at: 0, mobilization_ends_at: startAt }, route: long };
  return M.marchArrivalAt(march, plains, W.marchTimeFactor(epoch, startAt, enabled)) - startAt;
};

test('winter ETA is 1.5×; spring, summer and autumn match the base; flag off leaves winter unchanged', () => {
  assert.equal(W.WINTER_MARCH_MULTIPLIER, 1.5);
  assert.equal(W.winterMarchEnabled({ HARIMU_WINTER_MARCH_ENABLED: 'false' }), false, 'flag off');
  assert.equal(W.winterMarchEnabled({}), false, 'unset means off');
  assert.equal(W.winterMarchEnabled({ HARIMU_ARMY_PACK: '{"HARIMU_WINTER_MARCH_ENABLED":"true"}' }), true);
  assert.equal(W.winterMarchEnabled({ HARIMU_ARMY_PACK: '{"HARIMU_WINTER_MARCH_ENABLED":"true"}', HARIMU_WINTER_MARCH_ENABLED: 'false' }), false, 'a direct string wins');
  const base = duration(epoch, true);
  assert.equal(duration(epoch + seasonSec, true), base, 'summer');
  assert.equal(duration(epoch + 2 * seasonSec, true), base, 'autumn');
  assert.equal(duration(winterStart - 1, true), base, 'last second of autumn');
  assert.equal(duration(winterStart, true), base * W.WINTER_MARCH_MULTIPLIER, 'winter');
  assert.equal(duration(winterStart, false), base, 'flag off');
  assert.equal(Season.gameSeasonAt(epoch * 1000, winterStart * 1000).season, 'winter');
  const war = { attacker_nation: 'kindle', defender_nation: 'korund', declared_at: winterStart - 10, mobilization_ends_at: winterStart };
  const note = M.winterRoadNote('kindle', [war], winterStart + 60, { epochSeconds: epoch, enabled: true });
  assert.equal(W.winterMarchConfirmation(note.arrivesAt - (winterStart + 60)), `Winter roads: marches take longer. ${note.time}`);
  assert.match(note.time, /real time; .+ game time\./);
  assert.equal(M.winterRoadNote('kindle', [war], winterStart + 60, null), null, 'flag off: no note');
  assert.equal(M.winterRoadNote('kindle', [{ ...war, mobilization_ends_at: epoch }], epoch + 60, { epochSeconds: epoch, enabled: true }), null, 'spring');
  assert.equal(W.winterMarchConfirmation(3600), 'Winter roads: marches take longer. 1h real time; 12h game time.');
});

test('a march already under way keeps its original ETA when the season turns', () => {
  const start = winterStart + 1000;
  const march = { war: { attacker_nation: 'kindle', defender_nation: 'korund', declared_at: start - 10, mobilization_ends_at: start }, route: long };
  const eta = M.marchArrivalAt(march, plains, W.marchTimeFactor(epoch, start, true));
  const spring = epoch + 4 * seasonSec;
  assert.equal(Season.gameSeasonAt(epoch * 1000, spring * 1000).season, 'spring');
  assert.ok(start < spring && spring < eta, 'still marching when winter ends');
  assert.equal(M.marchArrivalAt(march, plains, W.marchTimeFactor(epoch, start, true)), eta, 'ETA stays the one fixed at march start');
  assert.equal(W.marchTimeFactor(epoch, spring, true), 1, 'a march started now would not be slow');
  const at = factor => M.positionAfter({ x: 0, y: 0 }, long, spring - start, () => 'plains', factor);
  assert.notDeepEqual(at(W.marchTimeFactor(epoch, start, true)), at(W.marchTimeFactor(epoch, spring, true)));
});

test('a winter march stays 1.5× in spring, and an autumn march stays 1× with no card line in winter', () => {
  const terrain = M.terrainMap(), pace = { epochSeconds: epoch, enabled: true };
  const probe = M.unitMarch('kindle', [{ attacker_nation: 'kindle', defender_nation: 'korund', declared_at: 0, mobilization_ends_at: 1 }], 2);
  const first = M.moveSeconds(terrain.get(`${probe.route[0].x},${probe.route[0].y}`));
  const spot = (start, now) => {
    const war = { attacker_nation: 'kindle', defender_nation: 'korund', declared_at: start - 10, mobilization_ends_at: start };
    const unit = M.armyPositions([war], now, terrain, pace).find(u => u.nationId === 'kindle');
    const at = factor => M.positionAfter(probe.home, probe.route, now - start, p => terrain.get(`${p.x},${p.y}`), factor);
    return { unit, note: M.winterRoadNote('kindle', [war], now, pace), slow: at(W.WINTER_MARCH_MULTIPLIER), fast: at(1) };
  };
  const spring = epoch + 4 * seasonSec, wStart = spring - 1, wNow = wStart + first + 1;
  assert.equal(Season.gameSeasonAt(epoch * 1000, wStart * 1000).season, 'winter');
  assert.equal(Season.gameSeasonAt(epoch * 1000, wNow * 1000).season, 'spring');
  const winter = spot(wStart, wNow);
  assert.notDeepEqual([winter.slow.x, winter.slow.y], [winter.fast.x, winter.fast.y]);
  assert.deepEqual([winter.unit.x, winter.unit.y], [winter.slow.x, winter.slow.y], 'armyPositions stays 1.5× after the season turns');
  const slowEta = wStart + (M.marchArrivalAt({ war: { attacker_nation: 'kindle', defender_nation: 'korund', declared_at: 0, mobilization_ends_at: wStart }, route: probe.route }, terrain) - wStart) * W.WINTER_MARCH_MULTIPLIER;
  assert.equal(winter.note?.arrivesAt, slowEta, 'card ETA stays 1.5×');
  assert.equal(winter.note.time, W.winterMarchTime(slowEta - wNow));
  const aStart = winterStart - 1, aNow = aStart + first + 1;
  assert.equal(Season.gameSeasonAt(epoch * 1000, aStart * 1000).season, 'autumn');
  assert.equal(Season.gameSeasonAt(epoch * 1000, aNow * 1000).season, 'winter');
  const autumn = spot(aStart, aNow);
  assert.deepEqual([autumn.unit.x, autumn.unit.y], [autumn.fast.x, autumn.fast.y], 'armyPositions stays 1×');
  assert.notDeepEqual([autumn.unit.x, autumn.unit.y], [autumn.slow.x, autumn.slow.y]);
  assert.equal(autumn.note, null, 'no winter card line');
});

const supplyScene = () => {
  const terrain = M.terrainMap(), pace = { epochSeconds: epoch, enabled: true }, day = S.ARMY_SUPPLY_GAME_DAY_SECONDS;
  const home = M.nationCapital('kindle');
  const probe = M.unitMarch('kindle', [{ attacker_nation: 'kindle', defender_nation: 'korund', declared_at: 0, mobilization_ends_at: 1 }], 2);
  const step = p => terrain.get(`${p.x},${p.y}`);
  const cutAt = (start, factor) => S.supplyCutAt(home, probe.route, start, step, factor);
  const base = cutAt(0, 1);
  const war = start => [{ attacker_nation: 'kindle', defender_nation: 'korund', declared_at: start - 10, mobilization_ends_at: start }];
  const spring = epoch + 4 * seasonSec, wStart = spring - 1, wNow = wStart + base + day;
  const aStart = winterStart - 1, aNow = aStart + base + day;
  return { terrain, pace, cutAt, base, war, wStart, wNow, aStart, aNow };
};
test('a winter march checked in spring keeps the 1.5× supply cut, including cutDays and strengthLossPct', () => {
  const { terrain, pace, cutAt, base, war, wStart, wNow } = supplyScene();
  assert.equal(cutAt(0, W.WINTER_MARCH_MULTIPLIER), base * W.WINTER_MARCH_MULTIPLIER);
  assert.equal(Season.gameSeasonAt(epoch * 1000, wStart * 1000).season, 'winter');
  assert.equal(Season.gameSeasonAt(epoch * 1000, wNow * 1000).season, 'spring');
  const slow = S.supplyState(cutAt(wStart, W.WINTER_MARCH_MULTIPLIER), wNow), fast = S.supplyState(cutAt(wStart, 1), wNow);
  assert.notDeepEqual(slow, fast);
  assert.ok(slow.cut && fast.cut && slow.cutDays !== fast.cutDays && slow.strengthLossPct !== fast.strengthLossPct);
  assert.deepEqual(S.unitSupply('kindle', war(wStart), wNow, terrain, pace), slow);
});
test('an autumn march checked in winter keeps the 1× supply cut', () => {
  const { terrain, pace, cutAt, war, aStart, aNow } = supplyScene();
  assert.equal(Season.gameSeasonAt(epoch * 1000, aStart * 1000).season, 'autumn');
  assert.equal(Season.gameSeasonAt(epoch * 1000, aNow * 1000).season, 'winter');
  const fast = S.supplyState(cutAt(aStart, 1), aNow), slow = S.supplyState(cutAt(aStart, W.WINTER_MARCH_MULTIPLIER), aNow);
  assert.notDeepEqual(fast, slow);
  assert.deepEqual(S.unitSupply('kindle', war(aStart), aNow, terrain, pace), fast);
});
test('flag off leaves the supply cut time unchanged', () => {
  const { terrain, cutAt, war, wStart, wNow } = supplyScene();
  assert.deepEqual(S.unitSupply('kindle', war(wStart), wNow, terrain, null), S.supplyState(cutAt(wStart, 1), wNow));
});

test('the army card shows Winter roads: marches take longer with the real and game time', async () => {
  const card = readFileSync('app/army-card.tsx', 'utf8');
  assert.match(card, /Winter roads: marches take longer\. \{army\.march\.time\}/);
  const { Window } = await import('happy-dom'), ts = (await import('typescript')).default, { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url), w = new Window({ url: 'http://localhost/' });
  globalThis.window = w; globalThis.document = w.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const React = require('react'), { createRoot } = require('react-dom/client'), { act } = React;
  const js = ts.transpileModule(card, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  new Function('exports', 'require', 'module', js)(mod.exports, n => n === './session-retry' ? (() => { const m = { exports: {} }; new Function('exports', 'require', 'module', ts.transpileModule(readFileSync('app/session-retry.tsx', 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText)(m.exports, require, m); return m.exports; })() : n.startsWith('@/lib/') ? require(`../lib/${n.slice(6)}.ts`) : require(n), mod);
  const time = '4h 12m real time; 2d 2h 24m game time.';
  const army = { unit: { id: 'kindle-home-guard', name: 'Kindle Home Guard', officer: 'Captain Ardent', memberCount: 1, openToVolunteers: true }, member: true, stance: 'hold', march: { arrivesAt: 1, time } };
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ army }) });
  const el = document.createElement('div'); document.body.appendChild(el); const root = createRoot(el);
  await act(async () => { root.render(React.createElement(mod.exports.ArmyCard)); await new Promise(r => setTimeout(r, 0)); });
  assert.ok(el.textContent.includes(`Winter roads: marches take longer. ${time}`));
  await act(async () => root.unmount()); el.remove();
});

for (const backend of ['sqlite', 'postgres']) {
  test(`${backend}: readBattles starts at the slowed winter arrival`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    const B = await r.importModule('lib/army-battle.ts');
    const spring = epoch + 4 * seasonSec, start = spring - 1;
    const wars = [{ id: 'w1038b', attacker_nation: 'kindle', defender_nation: 'korund', declared_at: start - 10, mobilization_ends_at: start }];
    const march = M.unitMarch('kindle', wars, start + 1), terrain = M.terrainMap();
    const fastAt = M.marchArrivalAt(march, terrain, 1), slowAt = M.marchArrivalAt(march, terrain, W.WINTER_MARCH_MULTIPLIER);
    assert.ok(fastAt + 1 < slowAt);
    const pace = { epochSeconds: epoch, enabled: true };
    assert.equal((await B.readBattles(r.db, wars, fastAt + 1, pace)).length, 0, 'still on the road at 1.5×');
    const [battle] = await B.readBattles(r.db, wars, slowAt, pace);
    assert.equal(battle.startedAt, slowAt);
  });
}

const MAP = { HARIMU_ARMIES_ENABLED: 'true', HARIMU_WAR_ENABLED: 'true', HARIMU_ARMY_MAP_ENABLED: 'true' };
for (const backend of ['sqlite', 'postgres']) {
  test(`${backend}: flag off keeps the march; flag on in winter slows it and the card says why`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    for (const [k, v] of Object.entries(MAP)) r.setFixtureEnv(k, v);
    const now = Math.floor(r.now / 1000);
    const probe = M.unitMarch('kindle', [{ attacker_nation: 'kindle', defender_nation: 'korund', declared_at: 0, mobilization_ends_at: now - 10 }], now);
    const terrain = M.terrainMap(), first = M.moveSeconds(terrain.get(`${probe.route[0].x},${probe.route[0].y}`));
    const start = now - (first + 1), clock = start - 3 * seasonSec;
    await r.db.prepare("INSERT INTO world_clock (id, epoch_seconds) VALUES ('main', ?)").bind(clock).run();
    await r.db.prepare("INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,casus_belli,declared_by,declared_at,mobilization_ends_at) VALUES ('w1038','r-1038','kindle:korund','kindle','korund','','AI',?,?)").bind(start - 172800, start).run();
    const place = factor => M.positionAfter(probe.home, probe.route, first + 1, p => terrain.get(`${p.x},${p.y}`), factor);
    r.setFixtureEnv('HARIMU_WINTER_MARCH_ENABLED', 'false');
    const off = (await r.call('army/positions', null)).data.units.find(u => u.nationId === 'kindle');
    const fast = place(1);
    assert.deepEqual([off.x, off.y], [fast.x, fast.y], 'flag off');
    assert.equal((await r.call('army', 'alice')).data.army.march, undefined, 'flag off: the card has no winter line');
    r.setFixtureEnv('HARIMU_WINTER_MARCH_ENABLED', 'true');
    const on = (await r.call('army/positions', null)).data.units.find(u => u.nationId === 'kindle');
    const slow = place(W.WINTER_MARCH_MULTIPLIER);
    assert.deepEqual([on.x, on.y], [slow.x, slow.y]);
    assert.notDeepEqual([on.x, on.y], [off.x, off.y]);
    const card = (await r.call('army', 'alice')).data.army.march;
    assert.match(card.time, /real time; .+ game time\./);
    assert.equal(W.winterMarchConfirmation(card.arrivesAt - now), `Winter roads: marches take longer. ${card.time}`);
  });
}

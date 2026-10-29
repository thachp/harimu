/** #1038: winter multiplies army march time by [ASSUMPTION] 1.5, locked at march start. Flag HARIMU_WINTER_MARCH_ENABLED. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { localRuntime } from './helpers/local-runtime.mjs';

const boot = await localRuntime({ backend: 'sqlite' });
const M = await boot.importModule('lib/army-map.ts'), W = await boot.importModule('lib/winter-march.ts'), Season = await boot.importModule('lib/game-season.ts');
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

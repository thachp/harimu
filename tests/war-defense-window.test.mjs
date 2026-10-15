/** #310: daily 4-hour defense window per nation and the city-assault timing rule, behind HARIMU_WAR_ENABLED (default "false"). Fixed clocks only. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import ts from 'typescript';
import { localRuntime } from './helpers/local-runtime.mjs';
import { canResolveCityAssault, canResolveFieldSkirmish, defaultDefenseStartHours, defenseWindowChangeAllowed, defenseWindowConfig, defenseWindowLocal, defenseWindowNextChange, inDefenseWindow, isDefenseStartHour } from '../lib/war-rules.ts';

const H = 3600, D = 86400, DAY0 = 20_000 * D; // a UTC midnight

test('pinned numbers: a 4-hour window (docs 15.3), a 7-day change cooldown [ASSUMPTION], staggered seed windows [ASSUMPTION]', () => {
  assert.equal(defenseWindowConfig.windowSeconds, 4 * H); assert.equal(defenseWindowConfig.changeCooldownSeconds, 7 * D);
  assert.deepEqual(defaultDefenseStartHours, { kindle: 22, korund: 14, aurelle: 18 });
  for (const hour of Object.values(defaultDefenseStartHours)) assert.equal(isDefenseStartHour(hour), true);
  assert.equal(isDefenseStartHour(24), false); assert.equal(isDefenseStartHour(-1), false); assert.equal(isDefenseStartHour(1.5), false); assert.equal(isDefenseStartHour('3'), false);
});

test('the city-assault helper is true only inside the defender window, exact at both edges', () => {
  // Korund 14:00-18:00 UTC: the start second is inside, the end second is outside.
  assert.equal(canResolveCityAssault('korund', DAY0 + 14 * H - 1), false, 'one second before the window');
  assert.equal(canResolveCityAssault('korund', DAY0 + 14 * H), true, 'the first second');
  assert.equal(canResolveCityAssault('korund', DAY0 + 18 * H - 1), true, 'the last second');
  assert.equal(canResolveCityAssault('korund', DAY0 + 18 * H), false, 'the window is exactly 4 hours');
  assert.equal(canResolveCityAssault('korund', DAY0 + 5 * D + 15 * H), true, 'every day');
  assert.equal(canResolveCityAssault('korund', DAY0 + 5 * D + 3 * H), false);
  // Aurelle 18:00-22:00 starts where Korund's ends.
  assert.equal(canResolveCityAssault('aurelle', DAY0 + 18 * H), true); assert.equal(canResolveCityAssault('aurelle', DAY0 + 22 * H), false);
});

test('a window that crosses UTC midnight: Kindle 22:00-02:00', () => {
  assert.equal(canResolveCityAssault('kindle', DAY0 + 22 * H - 1), false);
  assert.equal(canResolveCityAssault('kindle', DAY0 + 22 * H), true);
  assert.equal(canResolveCityAssault('kindle', DAY0 + 24 * H - 1), true, 'the last second of the UTC day');
  assert.equal(canResolveCityAssault('kindle', DAY0 + 24 * H), true, 'the first second of the next UTC day');
  assert.equal(canResolveCityAssault('kindle', DAY0 + 26 * H - 1), true, 'the last second, 01:59:59');
  assert.equal(canResolveCityAssault('kindle', DAY0 + 26 * H), false, '02:00:00 is outside');
  assert.equal(canResolveCityAssault('kindle', DAY0 + 12 * H), false);
  assert.equal(inDefenseWindow(23, DAY0 + 3 * H - 1), true, 'a 23:00 start reaches 02:59:59'); assert.equal(inDefenseWindow(23, DAY0 + 3 * H), false);
  assert.equal(inDefenseWindow(0, DAY0 + 4 * H - 1), true); assert.equal(inDefenseWindow(0, DAY0 + 4 * H), false);
});

test('saved start hours override the seeds, and unknown input fails closed', () => {
  const saved = { kindle: 3, korund: 3, aurelle: 3 };
  assert.equal(canResolveCityAssault('kindle', DAY0 + 3 * H, saved), true); assert.equal(canResolveCityAssault('kindle', DAY0 + 22 * H, saved), false);
  assert.equal(canResolveCityAssault('varkand', DAY0 + 14 * H), false); assert.equal(canResolveCityAssault('', DAY0), false);
  assert.equal(canResolveCityAssault('korund', Number.NaN), false); assert.equal(inDefenseWindow(24, DAY0), false);
  assert.equal(canResolveFieldSkirmish(), true, 'open-field skirmishes can happen anytime, at any hour');
});

test('the 7-day change rule is exact: first pick free, one second early is refused, exactly 7 days is allowed', () => {
  assert.equal(defenseWindowChangeAllowed(null, 5), true); assert.equal(defenseWindowNextChange(null), null);
  assert.equal(defenseWindowChangeAllowed(1000, 1000 + 7 * D - 1), false); assert.equal(defenseWindowChangeAllowed(1000, 1000 + 7 * D), true);
  assert.equal(defenseWindowNextChange(1000), 1000 + 7 * D);
});

test('the local-time range is right for a viewer in UTC-7 and one in UTC+9 (and across midnight)', () => {
  assert.deepEqual(defenseWindowLocal(14, -7 * 60), { start: '07:00', end: '11:00' }); // Korund
  assert.deepEqual(defenseWindowLocal(14, 9 * 60), { start: '23:00', end: '03:00' });
  assert.deepEqual(defenseWindowLocal(22, -7 * 60), { start: '15:00', end: '19:00' }); // Kindle
  assert.deepEqual(defenseWindowLocal(22, 9 * 60), { start: '07:00', end: '11:00' });
  assert.deepEqual(defenseWindowLocal(18, 0), { start: '18:00', end: '22:00' }); // Aurelle in UTC
  assert.deepEqual(defenseWindowLocal(0, -7 * 60), { start: '17:00', end: '21:00' }, 'the previous local day');
  assert.deepEqual(defenseWindowLocal(20, 330), { start: '01:30', end: '05:30' }, 'a half-hour zone (UTC+5:30)');
  assert.deepEqual(defenseWindowLocal(20, Number.NaN), { start: '20:00', end: '00:00' }, 'an unknown offset reads as UTC');
});

test('the war flag stays "false", migration 0033 only adds a table, and no route or app code sets a window', async () => {
  const cfg = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.deepEqual([...cfg.matchAll(/"HARIMU_WAR_ENABLED"\s*:\s*"([^"]*)"/g)].map(m => m[1]), ['false']);
  for (const file of ['../drizzle/0033_war_defense_windows.sql', '../db/postgres/0033_war_defense_windows.sql']) {
    const sql = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(sql, /\b(DROP|ALTER|RENAME|DELETE|UPDATE)\b/i, file); assert.match(sql, /CREATE TABLE IF NOT EXISTS war_defense_windows/);
  }
  const walk = async dir => (await Promise.all((await readdir(dir, { withFileTypes: true })).map(e => e.isDirectory() ? walk(new URL(`${e.name}/`, dir)) : [new URL(e.name, dir)]))).flat();
  for (const file of await walk(new URL('../app/', import.meta.url))) if (/\.(ts|tsx)$/.test(file.pathname)) assert.doesNotMatch(await readFile(file, 'utf8'), /setDefenseWindow/, file.pathname);
});

async function setup(t, { flag = true, backend } = {}) {
  const r = await localRuntime(backend ? { backend } : {}); t.after(() => r.close());
  const nowS = () => Math.floor(r.now / 1000);
  const war = await r.importModule('lib/war.ts');
  const set = (nation, startHourUtc, now = nowS(), enabled = flag) => war.setDefenseWindow(r.db, { nation, startHourUtc, setBy: 'AI President' }, now, enabled);
  const rows = async () => (await r.db.prepare('SELECT * FROM war_defense_windows ORDER BY nation_id').all()).results.map(x => ({ ...x }));
  return { r, war, set, rows, nowS };
}

test('flag off: nothing is saved, nothing is sent, and the Country view shows nothing', async t => {
  const { r, set, rows } = await setup(t, { flag: false });
  const res = await set('korund', 5);
  assert.equal(res.ok, false); assert.equal(res.reason, 'disabled'); assert.deepEqual(await rows(), []);
  const world = await r.call('world', null);
  assert.equal(world.status, 200); assert.equal('wars' in world.data.simulation, false, 'no war or window state is sent while the flag is off');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const require = createRequire(import.meta.url);
  const rules = await r.importModule('lib/war-rules.ts'), copy = await r.importModule('lib/war-copy.ts');
  const src = await readFile(new URL('../app/war-banner.tsx', import.meta.url), 'utf8');
  const exports = {}; new Function('exports', 'require', ts.transpileModule(src, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText)(exports,
    name => ({ '@/lib/war-copy': copy, '@/lib/war-rules': rules, './game-timer': { GameTimer: () => null }, './display-preferences': { useDisplayTimestamp: () => v => String(v) }, '@/lib/war': {} })[name] ?? require(name));
  const { DefenseWindow } = exports;
  assert.equal(renderToStaticMarkup(createElement(DefenseWindow, { windows: world.data.simulation.wars?.defenseWindows, nationId: 'korund', offsetMinutes: -420 })), '', 'flag off: nothing renders');
  const windows = { korund: { startHourUtc: 14, changedAt: null, nextChangeAt: null }, kindle: { startHourUtc: 22, changedAt: null, nextChangeAt: null } };
  const view = (nationId, offsetMinutes) => renderToStaticMarkup(createElement(DefenseWindow, { windows, nationId, offsetMinutes }));
  assert.match(view('korund', -420), /Defense window: 07:00–11:00 your time/); assert.match(view('korund', 540), /Defense window: 23:00–03:00 your time/);
  assert.match(view('kindle', -420), /Defense window: 15:00–19:00 your time/); assert.match(view('kindle', 540), /Defense window: 07:00–11:00 your time/);
  assert.match(view('korund', -420), /4-hour defense window/); assert.match(view('korund', -420), /Open-field skirmishes/);
  assert.equal(view('korund', undefined), '', 'before the browser offset is known nothing renders (no server-side guess)');
  assert.equal(view('aurelle', 0), '', 'no saved or sent window for the nation'); assert.equal(view('varkand', 0), '');
  assert.equal(renderToStaticMarkup(createElement(DefenseWindow, { windows: undefined, nationId: 'korund', offsetMinutes: 0 })), '');
});

test('flag on: seeds are read, the first pick is free, a second change inside 7 real days is refused, exactly 7 days later is allowed', async t => {
  const { r, war, set, rows, nowS } = await setup(t);
  const t0 = nowS();
  const seeds = await war.readDefenseWindows(r.db);
  assert.deepEqual(seeds, { kindle: { startHourUtc: 22, changedAt: null, nextChangeAt: null }, korund: { startHourUtc: 14, changedAt: null, nextChangeAt: null }, aurelle: { startHourUtc: 18, changedAt: null, nextChangeAt: null } });
  assert.deepEqual(await rows(), [], 'reading writes nothing');
  const first = await set('korund', 3, t0); assert.equal(first.ok, true); assert.equal(first.unchanged, false); assert.equal(first.window.startHourUtc, 3); assert.equal(first.window.changedAt, t0); assert.equal(first.window.nextChangeAt, t0 + 7 * D);
  const early = await set('korund', 9, t0 + 7 * D - 1); assert.equal(early.ok, false); assert.equal(early.status, 409); assert.equal(early.reason, 'window_cooldown');
  assert.equal((await war.readDefenseWindows(r.db)).korund.startHourUtc, 3, 'the refused change did not apply');
  assert.equal((await set('korund', 9, t0 + 1 * D)).reason, 'window_cooldown');
  const later = await set('korund', 9, t0 + 7 * D); assert.equal(later.ok, true); assert.equal(later.window.startHourUtc, 9); assert.equal(later.window.changedAt, t0 + 7 * D);
  assert.equal((await set('korund', 10, t0 + 7 * D + 5)).reason, 'window_cooldown', 'the cooldown restarts from the last change');
  // Each nation has its own cooldown; the other nations kept their seeds.
  assert.equal((await set('kindle', 6, t0 + 60)).ok, true);
  const windows = await war.readDefenseWindows(r.db);
  assert.equal(windows.kindle.startHourUtc, 6); assert.equal(windows.aurelle.startHourUtc, 18);
  const midnight = Math.floor(t0 / D) * D + 7 * D;
  assert.equal(canResolveCityAssault('korund', midnight + 9 * H, war.defenseStartHours(windows)), true, 'the saved window drives the helper');
  assert.equal(canResolveCityAssault('korund', midnight + 14 * H, war.defenseStartHours(windows)), false, 'the seed no longer applies to a nation that moved');
  assert.equal((await rows()).length, 2);
});

test('asking for the hour a nation already has changes nothing and does not start the cooldown', async t => {
  const { set, rows, nowS } = await setup(t); const t0 = nowS();
  const same = await set('aurelle', 18, t0); assert.equal(same.ok, true); assert.equal(same.unchanged, true); assert.deepEqual(await rows(), []);
  assert.equal((await set('aurelle', 2, t0 + 10)).ok, true, 'the first real pick is still free');
  const again = await set('aurelle', 2, t0 + 20); assert.equal(again.ok, true); assert.equal(again.unchanged, true);
  assert.equal((await rows())[0].changed_at, t0 + 10, 'a no-op does not move the cooldown');
});

test('bad input is refused and writes nothing', async t => {
  const { r, war, set, rows, nowS } = await setup(t);
  assert.equal((await set('varkand', 3)).reason, 'bad_nations'); assert.equal((await set('korund', 24)).reason, 'bad_hour'); assert.equal((await set('korund', -1)).reason, 'bad_hour'); assert.equal((await set('korund', 2.5)).reason, 'bad_hour');
  assert.equal((await war.setDefenseWindow(r.db, { nation: 'korund', startHourUtc: 3, setBy: '  ' }, nowS(), true)).reason, 'bad_request');
  await assert.rejects(set('korund', 3, -1), /Invalid authoritative world time/);
  assert.deepEqual(await rows(), []);
});

test('concurrent changes cannot both land: exactly one of two competing hours is saved', async t => {
  const { r, war, set, rows, nowS } = await setup(t); const t0 = nowS();
  await set('korund', 3, t0);
  const later = t0 + 8 * D;
  const results = await Promise.all([set('korund', 5, later), set('korund', 7, later)]);
  assert.equal(results.filter(x => x.ok && !x.unchanged).length, 1, 'only one change applies');
  assert.equal(results.filter(x => !x.ok && x.reason === 'window_cooldown').length, 1);
  const saved = await rows(); assert.equal(saved.length, 1); assert.equal(Number(saved[0].changed_at), later); assert.ok([5, 7].includes(Number(saved[0].start_hour_utc)));
  assert.equal((await war.readDefenseWindows(r.db)).korund.startHourUtc, Number(saved[0].start_hour_utc));
});

test('flag on: the world read carries the windows, and GETs write nothing', async t => {
  const { r, set, rows, nowS } = await setup(t, { flag: true });
  r.setFixtureEnv('HARIMU_WAR_ENABLED', 'true');
  await set('korund', 3, nowS());
  const before = await rows();
  const world = await r.call('world', null);
  assert.equal(world.status, 200); assert.equal(world.data.simulation.wars.defenseWindows.korund.startHourUtc, 3); assert.equal(world.data.simulation.wars.defenseWindows.kindle.startHourUtc, 22);
  await r.call('world', null);
  assert.deepEqual(await rows(), before, 'reading the windows never writes');
});

test('the same change rule holds on PostgreSQL (PGlite): upsert guarded by the cooldown, concurrent change lands once', async t => {
  const { war, set, rows, r, nowS } = await setup(t, { backend: 'postgres' }); const t0 = nowS();
  assert.equal((await set('korund', 3, t0)).ok, true);
  assert.equal((await set('korund', 9, t0 + 7 * D - 1)).reason, 'window_cooldown');
  const results = await Promise.all([set('korund', 5, t0 + 7 * D), set('korund', 7, t0 + 7 * D)]);
  assert.equal(results.filter(x => x.ok && !x.unchanged).length, 1);
  const saved = await rows(); assert.equal(saved.length, 1); assert.equal(Number(saved[0].changed_at), t0 + 7 * D);
  assert.ok([5, 7].includes((await war.readDefenseWindows(r.db)).korund.startHourUtc));
});

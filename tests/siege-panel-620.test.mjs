/** #620: siege snapshot read (GET only, read-only, only with HARIMU_WAR_ENABLED), the small read-only panel, the typeof guard in resolveCityAssault, and the mid-siege window change that must not speed up a capture. SQLite and PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { localRuntime } from './helpers/local-runtime.mjs';
const require = createRequire(import.meta.url);
const React = require('react'); const { renderToStaticMarkup } = require('react-dom/server');

const D = 86400, DAY1 = Date.UTC(2026, 9, 10, 22, 30), H = 3600 * 1000; // Kindle (defender here) seed window 22:00-02:00 UTC
async function setup(t, backend) {
  const r = await localRuntime(backend ? { backend } : {}); t.after(() => r.close()); r.setNow(DAY1);
  const siege = await r.importModule('lib/siege-actions.ts'), nowS = () => Math.floor(r.now / 1000);
  const run = (sql, ...b) => r.db.prepare(sql).bind(...b).run(), one = (sql, ...b) => r.db.prepare(sql).bind(...b).first(), all = async (sql, ...b) => (await r.db.prepare(sql).bind(...b).all(...[])).results.map(x => ({ ...x }));
  await run('INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,declared_by,declared_at,mobilization_ends_at) VALUES (?,?,?,?,?,?,?,?)', 'w1', 'rq-w1', 'kindle:korund', 'korund', 'kindle', 'test', nowS() - 5 * D, nowS() - 3 * D);
  let n = 0;
  const assault = (over = {}, at) => { if (at !== undefined) r.setNow(at); return siege.resolveCityAssault(r.db, { nation: 'korund', warId: 'w1', cityKind: 'outpost', cityId: 'kindle', requestId: `req-620-${++n}`, ...over }, nowS(), true); };
  const setWindow = (nation, hour) => run('INSERT INTO war_defense_windows (nation_id,start_hour_utc,changed_at,set_by) VALUES (?,?,?,\'test\') ON CONFLICT(nation_id) DO UPDATE SET start_hour_utc=excluded.start_hour_utc', nation, hour, nowS());
  return { r, siege, run, one, all, assault, setWindow, nowS };
}
const fail = (res, status, reason) => { assert.equal(res.ok, false, JSON.stringify(res)); assert.deepEqual([res.status, res.reason], [status, reason], res.error); };

test('nextAssaultWindowAt: this window while it is ahead or open and uncounted, otherwise the next day; unknown time is null', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const { nextAssaultWindowAt } = await r.importModule('lib/siege-actions.ts');
  const at = (day, hour, min = 0) => Date.UTC(2026, 9, day, hour, min) / 1000;
  assert.equal(nextAssaultWindowAt(22, [], at(10, 20)), at(10, 22), 'ahead today');
  assert.equal(nextAssaultWindowAt(22, [], at(10, 23)), at(10, 22), 'open now');
  assert.equal(nextAssaultWindowAt(22, [at(10, 23)], at(10, 23, 30)), at(11, 22), 'counted: next window');
  assert.equal(nextAssaultWindowAt(22, [at(10, 23)], at(11, 1)), at(11, 22), 'after midnight, same window, counted');
  assert.equal(nextAssaultWindowAt(14, [], at(10, 19)), at(11, 14), 'window already over today');
  assert.ok(Number.isNaN(Number(nextAssaultWindowAt(22, [], -1))) || nextAssaultWindowAt(22, [], -1) === null);
});

for (const backend of ['sqlite', 'postgres']) {
  test(`typeof guard: a missing or non-string cityId is a 400 bad_request, not a TypeError (${backend})`, async t => {
    const c = await setup(t, backend);
    for (const cityId of [undefined, null, 5, {}, ['kindle']]) fail(await c.assault({ cityId }), 400, 'bad_request');
    fail(await c.assault({ cityId: 'k'.repeat(200) }), 409, 'city_id_too_long');
    assert.equal((await c.assault()).ok, true, 'a real assault still counts');
    assert.equal((await c.one('SELECT COUNT(*) AS n FROM siege_assaults')).n, 1);
  });

  test(`a window changed mid-siege cannot make two assaults in one real window count as two days (${backend})`, async t => {
    const c = await setup(t, backend);
    assert.equal((await c.assault({}, DAY1 + 2 * H)).ok, true); // 00:30 UTC Oct 11, Kindle window 22:00: stored as Oct 10's day
    await c.setWindow('kindle', 0); // the defender now defends 00:00-04:00 UTC
    fail(await c.assault({}, DAY1 + 3 * H), 409, 'already_assaulted_today'); // 01:30: same real 00:00 window, but a new day number under the new start hour
    assert.equal((await c.one('SELECT COUNT(*) AS n FROM siege_assaults')).n, 1);
    assert.equal((await c.one('SELECT captured_at FROM city_sieges')).captured_at, null);
    const next = await c.assault({}, DAY1 + 26 * H); // 00:30 UTC Oct 12: the next real window, which counts and captures
    assert.equal(next.ok, true, JSON.stringify(next)); assert.deepEqual(next.captured, { moved: 1, keptPrivate: 0 });
  });

  test(`with no window change the stored-day behaviour is unchanged: next window captures (${backend})`, async t => {
    const c = await setup(t, backend);
    assert.equal((await c.assault()).ok, true);
    fail(await c.assault({}, DAY1 + 2 * H), 409, 'already_assaulted_today');
    assert.equal((await c.assault({}, DAY1 + 24 * H)).ok, true);
  });

  test(`snapshot: only with the war flag, read-only, counts days and the next window (${backend})`, async t => {
    const c = await setup(t, backend);
    assert.equal((await c.assault()).ok, true);
    assert.equal('sieges' in (await c.r.call('world', null)).data.simulation, false, 'flag off: nothing is queried or returned');
    c.r.setFixtureEnv('HARIMU_WAR_ENABLED', 'true');
    const writes = [], prepare = c.r.db.prepare.bind(c.r.db), batch = c.r.db.batch.bind(c.r.db);
    const snap = await c.siege.readSiegeSnapshot(c.r.db, c.nowS());
    c.r.db.prepare = sql => { if (/^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i.test(sql)) writes.push(sql.slice(0, 40)); return prepare(sql); }; c.r.db.batch = x => { writes.push('batch'); return batch(x); };
    const again = await c.siege.readSiegeSnapshot(c.r.db, c.nowS());
    c.r.db.prepare = prepare; c.r.db.batch = batch;
    assert.deepEqual(writes, [], 'the read writes nothing'); assert.deepEqual(again, snap);
    assert.equal(snap.length, 1);
    assert.deepEqual({ ...snap[0], id: 'x', warId: 'x' }, { id: 'x', warId: 'x', cityKey: 'outpost:kindle', attacker: 'korund', defender: 'kindle', days: 1, needed: 2, capturedAt: null, cityKind: 'outpost', cityName: null, nextWindowAt: (Math.floor(DAY1 / 1000 / D) + 1) * D + 22 * 3600 });
    // the world route carries it only with the flag on; byte-identical across repeated GETs
    const world = (await c.r.call('world', null)).data.simulation, world2 = (await c.r.call('world', null)).data.simulation;
    assert.equal(world.sieges.length, 1); assert.deepEqual(world.sieges, world2.sieges);
    assert.equal((await c.assault({}, DAY1 + 24 * H)).ok, true);
    const captured = await c.siege.readSiegeSnapshot(c.r.db, c.nowS());
    assert.equal(captured[0].days, 2); assert.ok(captured[0].capturedAt > 0); assert.equal(captured[0].nextWindowAt, null);
    await c.run("UPDATE wars SET ended_at=?, end_kind='other' WHERE id='w1'", c.nowS());
    assert.equal((await c.siege.readSiegeSnapshot(c.r.db, c.nowS())).length, 1, 'a captured siege stays after the war ends');
  });
}

test('a database without the siege tables reads as no sieges', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const { readSiegeSnapshot } = await r.importModule('lib/siege-actions.ts');
  const failing = error => ({ prepare: () => ({ all: () => Promise.reject(error), bind() { return this; } }) });
  assert.deepEqual(await readSiegeSnapshot(failing(new Error('no such table: city_sieges')), 1_800_000_000), []);
  await assert.rejects(() => readSiegeSnapshot(failing(new Error('database is locked')), 1_800_000_000), /locked/);
});

// ---- panel (real React) ----
const rtp = await localRuntime(); test.after(() => rtp.close());
const copy = await rtp.importModule('lib/siege-copy.ts');
async function loadPanel() {
  const src = await readFile(new URL('../app/siege-panel.tsx', import.meta.url), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const exports = {};
  new Function('exports', 'require', 'module', js)(exports, name => name === './display-preferences' ? { useDisplayTimestamp: () => ms => `T${ms}` } : name === '../lib/siege-copy' ? copy : name === '../lib/nation-themes' ? require('../lib/nation-themes.ts') : require(name), { exports });
  return exports;
}
const { SiegePanel } = await loadPanel();
const render = props => renderToStaticMarkup(React.createElement(SiegePanel, props));
const s1 = { id: 's1', cityKey: 'outpost:kindle', cityKind: 'outpost', cityName: null, attacker: 'korund', defender: 'kindle', days: 1, needed: 2, capturedAt: null, nextWindowAt: 1_800_000_000 };
const s2 = { id: 's2', cityKey: 'city:c1', cityKind: 'founded', cityName: 'Harrowgate', attacker: 'aurelle', defender: 'korund', days: 2, needed: 2, capturedAt: 1_800_100_000, nextWindowAt: null };

test('panel: flag off or no sieges renders nothing; only sieges against or by the viewer show', () => {
  assert.equal(render({ sieges: undefined, nationId: 'kindle' }), ''); assert.equal(render({ sieges: [], nationId: 'kindle' }), '');
  assert.equal(render({ sieges: [s1, s2], nationId: 'confluence' }), '');
  const kindle = render({ sieges: [s1, s2], nationId: 'kindle' });
  assert.match(kindle, /besieging your nation/); assert.doesNotMatch(kindle, /Harrowgate/);
  const korund = render({ sieges: [s1, s2], nationId: 'korund' });
  assert.match(korund, /Your nation is besieging/); assert.match(korund, /Harrowgate/);
});

test('panel: caption from the copy module, next window or captured line, rules line, no controls', () => {
  const html = render({ sieges: [s1], nationId: 'korund' });
  assert.ok(html.includes(copy.siegeStrip.caption.text.replace('{city}', `${require('../lib/nation-themes.ts').nationMark('kindle').name} outpost`).replace('{n}', '1')));
  assert.ok(html.includes('Next assault that counts: T1800000000000.')); assert.ok(html.includes(copy.siegeRules.lines[0].text));
  assert.doesNotMatch(html, /<(button|input|form|a)\b/);
  const done = render({ sieges: [s2], nationId: 'aurelle' });
  assert.ok(done.includes('Captured T1800100000000.')); assert.ok(done.includes(copy.siegeStrip.caption.text.replace('{city}', 'Harrowgate').replace('{n}', '2'))); assert.doesNotMatch(done, /Next assault/);
});

test('the government view mounts the panel from simulation.sieges, and the war flag stays off in wrangler.jsonc', async () => {
  const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /\{simulation\?\.sieges && <SiegePanel sieges=\{simulation\.sieges\} nationId=\{citizenNation\.id\} \/>\}\s*<GovernmentPanel /);
  const cfg = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.deepEqual([...cfg.matchAll(/"HARIMU_WAR_ENABLED"\s*:\s*"([^"]*)"/g)].map(m => m[1]), ['false']);
});

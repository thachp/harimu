/** #855 Religious Harmony slice 2: holy-site pilgrimages (granted or denied by the custodian) and clergy charity as Harmony signals, and
 *  festival joins split by the per-nation stance table. Behind HARIMU_RELIGIOUS_HARMONY_ENABLED. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';
import * as H from '../lib/religious-harmony.ts';
import { holySites, parseHarmonyAct } from '../lib/holy-sites.ts';

test('pure: granted pilgrimage and charity raise Harmony, a denied pilgrimage lowers it; each term capped; clamps hold; named constants', () => {
  const h = s => H.religiousHarmony('kindle', s);
  assert.deepEqual([H.HARMONY_POINTS_PER_PILGRIMAGE, H.HARMONY_PILGRIMAGE_CAP, H.HARMONY_POINTS_PER_DENIED, H.HARMONY_DENIED_CAP, H.HARMONY_POINTS_PER_CHARITY, H.HARMONY_CHARITY_CAP], [2, 10, 3, 15, 2, 10]);
  assert.equal(h({ pilgrimagesGranted: 1 }), 52); assert.equal(h({ charityActs: 2 }), 54); assert.equal(h({ pilgrimagesDenied: 1 }), 47);
  assert.equal(h({ pilgrimagesGranted: 99 }), 60, 'pilgrimage cap'); assert.equal(h({ charityActs: 99 }), 60, 'charity cap'); assert.equal(h({ pilgrimagesDenied: 99 }), 35, 'denied cap');
  assert.equal(h({ pilgrimagesGranted: -3, charityActs: -1, pilgrimagesDenied: -2 }), 50, 'negative signals ignored');
  assert.equal(H.religiousHarmony('korund', { raids: 9, raidHits: 99, bannedFestivalJoins: 99, pilgrimagesDenied: 99 }), 0, 'clamped at 0');
  assert.equal(H.religiousHarmony('aurelle', { festivalHoliday: 1, festivalJoins: 99, pilgrimagesGranted: 99, charityActs: 99 }), 100, 'clamped at 100');
  assert.deepEqual(Object.fromEntries(Object.entries(holySites).map(([k, v]) => [k, [v.custodian, v.access]])), { 'hearth-of-first-names': ['aurelle', 'granted'], 'high-retreat': ['korund', 'denied'] });
  assert.equal(parseHarmonyAct({ action: 'pilgrimage', siteId: 'prism-spire', requestId: 'req-00001' }), null, 'unknown site'); assert.equal(parseHarmonyAct({ action: 'charity', requestId: 'x' }), null, 'short request id');
});

const at = r => new Date(r.now).toISOString();
const rid = (() => { let i = 0; return () => `req-855-${++i}-${Math.random().toString(36).slice(2, 8)}`; })();
async function scene(t, backend, on = true) {
  const r = await localRuntime({ backend }); t.after(() => r.close()); r.setFaith(true);
  r.setFixtureEnv('HARIMU_RELIGIOUS_HARMONY_ENABLED', on ? 'true' : undefined);
  for (const [id, nation] of [['kim', 'kindle'], ['kai', 'korund'], ['ava', 'aurelle']]) await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,?,?,18,0,'Good standing',?,?)").bind(id, nation, id, at(r), at(r)).run();
  await r.db.prepare("INSERT INTO congregation_officiants (congregation_id,user_id,since_day,seated_at) VALUES ('open-hand:kindle-capital','kim',1,1)").run();
  return r;
}
const scores = async r => H.readHarmonyScores(r.db, Math.floor(r.now / 1000) + 1, new Set(), (await r.importModule('lib/festivals.ts')).festivalStance);
const spy = async (r, fn) => { const prepare = r.db.prepare.bind(r.db), sql = []; r.db.prepare = q => { sql.push(q); return prepare(q); }; try { return { result: await fn(), sql }; } finally { r.db.prepare = prepare; } };

test('#889: faith-panel buttons render and post pilgrimage and charity; the outcome or a failure shows (stubbed fetch)', async () => {
  const { Window } = await import('happy-dom'), ts = (await import('typescript')).default, { createRequire } = await import('node:module'), { readFileSync } = await import('node:fs');
  const require = createRequire(import.meta.url), w = new Window({ url: 'http://localhost/' }); globalThis.window = w; globalThis.document = w.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const React = require('react'), { createRoot } = require('react-dom/client'), { act } = React;
  const src = readFileSync('app/faith-panel.tsx', 'utf8'); assert.match(src, /\{harmony && <HolySiteActions \/>\}/, 'shown only with the harmony line (flag on)');
  const js = ts.transpileModule(src, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const mod = { exports: {} }; new Function('exports', 'require', 'module', js)(mod.exports, n => n.startsWith('../lib/') ? require(`${n}.ts`) : n.startsWith('./') ? {} : require(n), mod);
  const { holySiteCopy: C } = require('../lib/holy-sites.ts'), sent = [];
  let reply = { status: 200, body: { outcome: 'denied' } };
  globalThis.fetch = async (url, init) => { sent.push([url, JSON.parse(init.body)]); if (reply === 'throw') throw new Error('offline'); return { ok: reply.status < 400, status: reply.status, json: async () => reply.body }; };
  const el = document.createElement('div'); document.body.appendChild(el); const root = createRoot(el);
  await act(async () => root.render(React.createElement(mod.exports.HolySiteActions)));
  const click = async label => act(async () => { [...el.querySelectorAll('button')].find(b => b.textContent === label).dispatchEvent(new w.MouseEvent('click', { bubbles: true })); await new Promise(r => setTimeout(r, 0)); });
  await click(C.pilgrimage['high-retreat']); assert.ok(el.textContent.includes(C.outcome.denied));
  assert.deepEqual([sent[0][0], sent[0][1].action, sent[0][1].siteId, typeof sent[0][1].requestId], ['/api/faith/holy-sites', 'pilgrimage', 'high-retreat', 'string']);
  reply = { status: 403, body: { error: 'Only a seated officiant can give clergy charity.' } }; await click(C.charity);
  assert.equal(sent[1][1].action, 'charity'); assert.ok(el.textContent.includes('Only a seated officiant'));
  reply = 'throw'; await click(C.charity); assert.ok(el.textContent.includes(C.failed.replace('{reason}', 'network')));
  await act(async () => root.unmount());
});

for (const backend of ['sqlite', 'postgres']) {
  test(`${backend}: #889: denied pilgrimages count at most HARMONY_DENIED_ACTS_PER_SOURCE_NATION per source nation`, async t => {
    const r = await scene(t, backend), before = await scores(r);
    for (const id of ['k2', 'k3']) await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,'kindle',?,18,0,'Good standing',?,?)").bind(id, id, at(r), at(r)).run();
    for (const u of ['kim', 'k2', 'k3', 'ava']) assert.equal((await r.call('faith/holy-sites', u, { action: 'pilgrimage', siteId: 'high-retreat', requestId: rid() })).data.outcome, 'denied', u);
    assert.equal(H.HARMONY_DENIED_ACTS_PER_SOURCE_NATION, 2);
    assert.equal(before.korund - (await scores(r)).korund, (2 + 1) * H.HARMONY_POINTS_PER_DENIED, 'three Kindle denials count as two; one Aurelle denial counts');
  });

  test(`${backend}: a granted pilgrimage raises the custodian's Harmony, a denied one lowers it, clergy charity raises the officiant's nation; replay pays once`, async t => {
    const r = await scene(t, backend), before = await scores(r);
    const id = rid(), go = await r.call('faith/holy-sites', 'kim', { action: 'pilgrimage', siteId: 'hearth-of-first-names', requestId: id });
    assert.equal(go.status, 200); assert.equal(go.data.outcome, 'granted');
    assert.deepEqual((await r.call('faith/holy-sites', 'kim', { action: 'pilgrimage', siteId: 'hearth-of-first-names', requestId: id })).data.replayed, true, 'replay');
    assert.equal((await r.call('faith/holy-sites', 'kim', { action: 'pilgrimage', siteId: 'high-retreat', requestId: rid() })).data.reason, 'already_today', 'one pilgrimage per game day');
    assert.equal((await r.call('faith/holy-sites', 'ava', { action: 'pilgrimage', siteId: 'high-retreat', requestId: rid() })).data.outcome, 'denied');
    assert.equal((await r.call('faith/holy-sites', 'kim', { action: 'charity', requestId: rid() })).data.outcome, 'given');
    const notClergy = await r.call('faith/holy-sites', 'ava', { action: 'charity', requestId: rid() });
    assert.deepEqual([notClergy.status, notClergy.data.reason], [403, 'not_clergy']);
    const after = await scores(r);
    assert.deepEqual([after.aurelle - before.aurelle, after.korund - before.korund, after.kindle - before.kindle], [2, -3, 2]);
  });

  test(`${backend}: concurrent pilgrimages by one citizen on one game day: exactly one row`, async t => {
    const r = await scene(t, backend);
    const res = await Promise.all([1, 2, 3].map(() => r.call('faith/holy-sites', 'ava', { action: 'pilgrimage', siteId: 'hearth-of-first-names', requestId: rid() })));
    assert.equal(res.filter(x => x.status === 200).length, 1); assert.equal(res.filter(x => x.data.reason === 'already_today').length, 2);
    assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM faith_harmony_acts').first()).n), 1);
  });

  test(`${backend}: QA1: same user, same act, same game day at different seconds: the second is refused, one row stored`, async t => {
    const r = await scene(t, backend); r.setNow(Math.floor(r.now / 7200000) * 7200000 + 1000);
    for (const body of [{ action: 'pilgrimage', siteId: 'hearth-of-first-names' }, { action: 'charity' }]) {
      const user = body.action === 'charity' ? 'kim' : 'ava';
      assert.equal((await r.call('faith/holy-sites', user, { ...body, requestId: rid() })).status, 200);
      r.setNow(r.now + 37 * 1000);
      const again = await r.call('faith/holy-sites', user, { ...body, requestId: rid() });
      assert.deepEqual([again.status, again.data.reason], [409, 'already_today'], body.action);
      assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM faith_harmony_acts WHERE user_id = ? AND act = ?').bind(user, body.action).first()).n), 1, body.action);
    }
  });

  test(`${backend}: QA1: user B reusing user A's request id gets 409 request_reused and none of A's act`, async t => {
    const r = await scene(t, backend), id = rid();
    assert.equal((await r.call('faith/holy-sites', 'ava', { action: 'pilgrimage', siteId: 'hearth-of-first-names', requestId: id })).status, 200);
    for (const body of [{ action: 'pilgrimage', siteId: 'high-retreat' }, { action: 'charity' }]) {
      const b = await r.call('faith/holy-sites', 'kim', { ...body, requestId: id });
      assert.deepEqual([b.status, b.data.reason], [409, 'request_reused']);
      assert.deepEqual(Object.keys(b.data).sort(), ['error', 'reason']);
      assert.doesNotMatch(JSON.stringify(b.data), /ava|aurelle|hearth|granted|pilgrimage/);
    }
    assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM faith_harmony_acts').first()).n), 1, 'B stored nothing');
  });

  test(`${backend}: flag off: 404 before auth or any database access; the world tick reads no acts`, async t => {
    const r = await scene(t, backend, false);
    const off = await spy(r, async () => [await r.call('faith/holy-sites', 'kim', { action: 'charity', requestId: rid() }), await r.call('faith/holy-sites', null, { action: 'charity', requestId: rid() })]);
    assert.deepEqual(off.result.map(x => x.status), [404, 404]); assert.deepEqual(off.sql, []);
    const tick = await spy(r, () => r.call('world', null)); assert.deepEqual(tick.sql.filter(q => /faith_harmony_acts/.test(q)), []);
  });

  test(`${backend}: festival joins follow the stance table (Aurelle Kinward endorsed, Korund banned); one query for all nations`, async t => {
    const r = await scene(t, backend), now = Math.floor(r.now / 1000);
    for (const [u, f] of [['ava', 'oath-day'], ['kai', 'night-of-names']]) await r.db.prepare("INSERT INTO citizen_festival_joins (user_id,festival_id,occurrence,faith_id,game_day,joined_at,request_id) VALUES (?,?,1,'kinward-rite',1,?,?)").bind(u, f, now - 60, rid()).run();
    const read = await spy(r, () => H.readAllHarmonySignals(r.db, now + 1, new Set(), nation => nation === 'korund' ? 'banned' : 'endorsed'));
    assert.equal(read.sql.length, 1, 'one round trip');
    assert.deepEqual([read.result.aurelle.festivalJoins, read.result.korund.bannedFestivalJoins, read.result.korund.festivalJoins], [1, 1, 0]);
    const tolerant = await H.readAllHarmonySignals(r.db, now + 1, new Set(), () => 'tolerated');
    assert.deepEqual([tolerant.korund.festivalJoins, tolerant.korund.bannedFestivalJoins], [1, 0], 'stances come from the table, not a Korund rule');
  });
}

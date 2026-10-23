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

for (const backend of ['sqlite', 'postgres']) {
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

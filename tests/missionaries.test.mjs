/** #225: cross-border missionaries behind HARIMU_FAITH_ENABLED. Fixed clock; mission timers use the capital-to-capital travel formula. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';
import { missionaryState } from '../scripts/faith-ui-fixtures.mjs';
import { hostDecision, invitationAllowed, missionActive, missionStatus, missionaryConfig as cfg, nextInvitationAt, presenceSeconds } from '../lib/missionary-rules.ts';

const DAY = 7200, H = 3600, D = 86400;
const faithCall = (r, user, body) => r.call('faith', user, { requestId: randomUUID(), ...body });
const choose = (r, user, faithId) => faithCall(r, user, { action: 'choose-faith', faithId });
const worship = (r, user) => faithCall(r, user, { action: 'attend-worship' });
const request = (r, user, hostNation, requestId = randomUUID()) => r.call('faith', user, { action: 'request-mission', hostNation, requestId });
const accept = (r, user, requestId = randomUUID()) => r.call('faith', user, { action: 'accept-mission', requestId });
const answer = (r, user, missionId, ans, requestId = randomUUID()) => r.call('faith', user, { action: 'answer-mission', missionId, answer: ans, requestId });
const mute = (r, user, muted) => faithCall(r, user, { action: 'mute-missionaries', muted });
const read = async (r, user) => (await r.call('faith', user)).data;
async function citizen(r, id, nation) {
  const at = new Date(r.now).toISOString();
  await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,?,?,18,0,'Good standing',?,?)").bind(id, nation, id, at, at).run();
}
async function setup(t, { flag = true, backend } = {}) {
  const r = await localRuntime(backend ? { backend } : {}); t.after(() => r.close());
  if (flag) r.setFaith(true);
  const nowS = () => Math.floor(r.now / 1000);
  return { r, nowS };
}
/** Worship on `days` consecutive game days for each user (3 Devotion a day, no decay between consecutive days). */
async function devote(r, users, days) {
  for (let i = 0; i < days; i++) { for (const u of users) assert.equal((await worship(r, u)).status, 200, `${u} day ${i}`); r.setNow(r.now + DAY * 1000); }
  r.setNow(r.now - 0); // the next game day has begun; Devotion has had no gap yet
}
/** Every write statement run while `fn` executes. */
async function writesDuring(r, fn) {
  const writes = [], prepare = r.db.prepare.bind(r.db);
  r.db.prepare = sql => { if (/^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|REPLACE)/i.test(sql)) writes.push(sql.replace(/\s+/g, ' ').trim()); return prepare(sql); };
  try { await fn(); } finally { r.db.prepare = prepare; }
  return writes;
}
const tables = writes => [...new Set(writes.map(w => (w.match(/(?:INTO|UPDATE|FROM)\s+([a-z_]+)/i) ?? [])[1]))].sort();
/** An Aurelle Kinward citizen (Devotion 42) who can preach in Kindle, and Kindle citizens in the host capital. */
async function scene(t, backend) {
  const ctx = await setup(t, { backend }); const { r } = ctx;
  await citizen(r, 'ava', 'aurelle'); await citizen(r, 'kim', 'kindle'); await citizen(r, 'kay', 'kindle'); await citizen(r, 'kai', 'korund');
  await devote(r, ['ava'], 14);
  return ctx;
}

test('pure rules: pinned numbers and the host stance table (docs 14.8)', async t => {
  const rt = await localRuntime(); t.after(() => rt.close());
  const { gameDaySeconds } = await rt.importModule('lib/faith.ts'), { INVITATION_COOLDOWN_DAYS } = await rt.importModule('lib/missionary-copy.ts');
  assert.equal(cfg.minDevotion, 40); assert.equal(cfg.presenceGameDays, 3); assert.equal(presenceSeconds(), 3 * 2 * H);
  assert.equal(cfg.invitationGapSeconds, 14 * D); assert.equal(INVITATION_COOLDOWN_DAYS, 14, 'the copy and the rule agree'); assert.equal(cfg.inviteTtlSeconds, 24 * H);
  assert.equal(cfg.gameDaySeconds, gameDaySeconds, 'a game day is the same length as in lib/faith.ts');
  assert.deepEqual(hostDecision('aurelle', 'kindle', 'kinward-rite'), { allowed: true });
  assert.deepEqual(hostDecision('kindle', 'kindle', 'open-hand'), { allowed: false, reason: 'same_nation' });
  assert.deepEqual(hostDecision('kindle', 'korund', 'open-hand'), { allowed: false, reason: 'host_banned' });
  assert.deepEqual(hostDecision('aurelle', 'korund', 'kinward-rite'), { allowed: false, reason: 'host_banned' }, 'Korund refuses every faith');
  assert.deepEqual(hostDecision('kindle', 'aurelle', 'fair-wind-vow'), { allowed: false, reason: 'host_private_only' });
  assert.deepEqual(hostDecision('kindle', 'aurelle', 'kinward-rite'), { allowed: true }, 'Aurelle takes the Kinward Rite only');
  assert.equal(hostDecision('kindle', 'varkand', 'open-hand').allowed, false); assert.equal(hostDecision('kindle', 'aurelle', 'lumen').allowed, false);
});

test('pure rules: mission status is exact at every boundary and the 14-day gap is exact', () => {
  const m = { expiresAt: 1000, acceptedAt: null, arrivesAt: null, endsAt: null };
  assert.equal(missionStatus(m, 999), 'invited'); assert.equal(missionStatus(m, 1000), 'lapsed'); assert.equal(missionActive(m, 999), true); assert.equal(missionActive(m, 1000), false);
  const go = { expiresAt: 1000, acceptedAt: 500, arrivesAt: 800, endsAt: 800 + presenceSeconds() };
  assert.equal(missionStatus(go, 799), 'traveling'); assert.equal(missionStatus(go, 800), 'present'); assert.equal(missionStatus(go, 800 + presenceSeconds() - 1), 'present');
  assert.equal(missionStatus(go, 800 + presenceSeconds()), 'over', 'the badge lasts exactly 3 game days'); assert.equal(missionActive(go, 800 + presenceSeconds()), false);
  assert.equal(invitationAllowed(null, 5), true); assert.equal(invitationAllowed(1000, 1000 + 14 * D - 1), false); assert.equal(invitationAllowed(1000, 1000 + 14 * D), true);
  assert.equal(nextInvitationAt(1000), 1000 + 14 * D); assert.equal(nextInvitationAt(null), null);
});

test('flag off: no state, every action refused, nothing written', async t => {
  const { r } = await setup(t, { flag: false });
  await citizen(r, 'ava', 'aurelle');
  const state = await read(r, 'ava'); assert.equal(state.enabled, false); assert.equal(state.missionary, null);
  for (const res of [await request(r, 'ava', 'kindle'), await accept(r, 'ava'), await answer(r, 'ava', 'mission-xxxxxxxx', 'accept'), await mute(r, 'ava', true)]) assert.equal(res.data.reason, 'disabled');
  for (const table of ['faith_missions', 'missionary_responses', 'missionary_mutes']) assert.equal((await r.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n, 0, table);
});

test('requests: needs 40 Devotion in a public faith; Korund and non-Kinward Aurelle hosts refuse; one active mission with a visible reason', async t => {
  const { r, nowS } = await setup(t);
  await citizen(r, 'ava', 'aurelle'); await citizen(r, 'kim', 'kindle'); await citizen(r, 'kai', 'korund'); await citizen(r, 'kit', 'kindle');
  assert.equal((await choose(r, 'kim', 'fair-wind-vow')).status, 200); assert.equal((await choose(r, 'kit', 'kinward-rite')).status, 200);
  await devote(r, ['ava', 'kim', 'kit'], 13); // 13 days of worship, minus one game day of decay
  assert.equal((await read(r, 'ava')).devotion.value, 38);
  const low = await request(r, 'ava', 'kindle'); assert.equal(low.status, 409); assert.equal(low.data.reason, 'devotion_too_low'); assert.match(low.data.error, /Reach 40 Devotion.*You have 38/);
  assert.match((await read(r, 'ava')).missionary.request.blockedReason, /Reach 40 Devotion/);
  await devote(r, ['ava', 'kim', 'kit'], 1); assert.ok((await read(r, 'ava')).devotion.value >= 40);
  assert.equal((await request(r, 'kai', 'kindle')).data.reason, 'no_public_faith', 'a Korund citizen has no public faith to send');
  const korund = await request(r, 'ava', 'korund'); assert.equal(korund.status, 403); assert.equal(korund.data.reason, 'host_banned'); assert.equal(korund.data.error, 'Preaching is banned in Korund. This missionary cannot preach here.');
  assert.equal((await request(r, 'ava', 'aurelle')).data.reason, 'same_nation'); assert.equal((await request(r, 'ava', 'varkand')).data.reason, 'bad_nations');
  assert.equal((await request(r, 'kim', 'aurelle')).data.reason, 'host_private_only'); assert.equal((await request(r, 'kim', 'aurelle')).data.error, 'In Aurelle only the Kinward Rite may preach. Other faiths are private-only here.');
  assert.equal((await request(r, 'nobody', 'kindle')).status === 200, false);
  const visible = (await read(r, 'kim')).missionary.request.hosts; assert.deepEqual(visible.map(h => [h.nationId, h.allowed]), [['aurelle', false], ['korund', false]]);
  assert.equal((await read(r, 'ava')).missionary.request.hosts.find(h => h.nationId === 'kindle').allowed, true);
  // Allowed pairs: Aurelle (Kinward) to Kindle, and Kindle (Kinward) to Aurelle.
  const id = randomUUID(); const ok = await request(r, 'ava', 'kindle', id);
  assert.equal(ok.status, 200, JSON.stringify(ok.data)); assert.equal(ok.data.state.missionary.mission.status, 'invited'); assert.equal(ok.data.state.missionary.mission.hostName, 'Kindle');
  assert.equal((await request(r, 'ava', 'kindle', id)).data.replay, true, 'a retry with the same id returns the saved mission');
  assert.equal((await request(r, 'ava', 'kindle')).data.reason, 'mission_active'); assert.match((await request(r, 'ava', 'kindle')).data.error, /already have a mission/);
  assert.match((await read(r, 'ava')).missionary.request.blockedReason, /already have a mission/);
  assert.equal((await request(r, 'kit', 'aurelle')).status, 200, 'Kindle Kinward missionary may go to Aurelle');
  assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM faith_missions').first()).n, 2);
  assert.equal(nowS() > 0, true);
});

test('concurrent requests create exactly one mission', async t => {
  const { r } = await scene(t);
  const both = await Promise.all([request(r, 'ava', 'kindle'), request(r, 'ava', 'kindle')]);
  assert.deepEqual(both.map(b => b.status).sort(), [200, 409]);
  assert.equal((await r.db.prepare("SELECT COUNT(*) AS n FROM faith_missions WHERE user_id='ava'").first()).n, 1);
});

test('accept starts the travel timer; presence begins on arrival, lasts exactly 3 game days, then the next request is allowed', async t => {
  const { r, nowS } = await scene(t);
  const rules = await r.importModule('lib/missionaries.ts');
  assert.equal((await accept(r, 'ava')).data.reason, 'no_invitation');
  const req = await request(r, 'ava', 'kindle'); const missionId = req.data.state.missionary.mission.id;
  const travel = rules.missionTravelSeconds('aurelle', 'kindle'); assert.ok(travel > 0 && travel <= 3600, `travel ${travel}s uses the capped travel formula`);
  const t0 = nowS(); const acc = await accept(r, 'ava'); assert.equal(acc.status, 200, JSON.stringify(acc.data));
  const m = acc.data.state.missionary.mission; assert.equal(m.id, missionId); assert.equal(m.status, 'traveling'); assert.equal(m.arrivesAt, t0 + travel); assert.equal(m.endsAt, t0 + travel + 3 * DAY);
  const accId = randomUUID(); assert.equal((await accept(r, 'ava', accId)).data.reason, 'no_invitation', 'an already accepted invitation cannot be accepted twice');
  // Nobody in Kindle sees the badge while she travels; at the arrival second it appears; at the end second it is gone.
  r.setNow((t0 + travel - 1) * 1000); assert.equal((await read(r, 'kim')).missionary.here.length, 0); assert.equal((await read(r, 'ava')).missionary.mission.status, 'traveling');
  r.setNow((t0 + travel) * 1000); const here = (await read(r, 'kim')).missionary.here; assert.equal(here.length, 1); assert.equal(here[0].faithId, 'kinward-rite'); assert.equal(here[0].until, t0 + travel + 3 * DAY);
  assert.equal(JSON.stringify(await read(r, 'kim')).includes('ava'), false, 'the badge never names the missionary');
  assert.equal((await read(r, 'ava')).missionary.mission.status, 'present'); assert.equal((await request(r, 'ava', 'kindle')).data.reason, 'mission_active');
  r.setNow((t0 + travel + 3 * DAY - 1) * 1000); assert.equal((await read(r, 'kim')).missionary.here.length, 1);
  r.setNow((t0 + travel + 3 * DAY) * 1000); assert.equal((await read(r, 'kim')).missionary.here.length, 0, 'the badge ends at exactly 3 game days'); assert.equal((await read(r, 'ava')).missionary.mission, null);
  await devote(r, ['ava'], 14); // Devotion decays while she preaches abroad
  assert.equal((await request(r, 'ava', 'kindle')).status, 200, 'a finished mission frees the slot'); // closes the old row, inserts the new one
  assert.equal((await r.db.prepare("SELECT COUNT(*) AS n FROM faith_missions WHERE user_id='ava' AND closed_at IS NULL").first()).n, 1);
});

test('an invitation nobody accepts lapses after 24 real hours and cannot be accepted', async t => {
  const { r, nowS } = await scene(t);
  const t0 = nowS(); await request(r, 'ava', 'kindle');
  r.setNow((t0 + 24 * H - 1) * 1000); assert.equal((await read(r, 'ava')).missionary.mission.status, 'invited');
  r.setNow((t0 + 24 * H) * 1000); const late = await accept(r, 'ava'); assert.equal(late.data.reason, 'invitation_expired');
  assert.equal((await read(r, 'ava')).missionary.mission, null); await devote(r, ['ava'], 14); assert.equal((await request(r, 'ava', 'kindle')).status, 200);
});

/** Ava's mission to Kindle, accepted and arrived. */
async function arrived(r, nowS) { const req = await request(r, 'ava', 'kindle'); await accept(r, 'ava'); const rules = await r.importModule('lib/missionaries.ts'); r.setNow((nowS() + rules.missionTravelSeconds('aurelle', 'kindle')) * 1000); return req.data.state.missionary.mission.id; }

test('a host-city citizen sees the invitation, may Accept once, and the conversion uses the same 60-day cooldown; no one is converted automatically', async t => {
  const { r, nowS } = await scene(t);
  const missionId = await arrived(r, nowS);
  const state = await read(r, 'kim'); const offer = state.missionary.offer;
  assert.equal(offer.faithId, 'kinward-rite'); assert.equal(offer.pitch, 'A missionary of the Kinward Rite invites you.'); assert.deepEqual(offer.buttons, { accept: 'Accept', notNow: 'Not now', mute: 'Mute missionaries' }); assert.deepEqual(offer.warnings, []);
  assert.deepEqual(Object.keys(missionaryState({ nation: 'kindle', faith: 'unaffiliated', offer: 'kinward-rite' }).offer).sort(), Object.keys(offer).sort(), 'UI fixture offer has the live shape');
  assert.equal(state.faith.id, 'unaffiliated', 'seeing the invitation changes nothing'); assert.equal((await read(r, 'kim')).faith.id, 'unaffiliated');
  assert.equal((await read(r, 'kai')).missionary.offer, null, 'Korund citizens are never offered');
  assert.equal((await answer(r, 'kai', missionId, 'accept')).data.reason, 'no_mission_here', 'a citizen of another nation cannot answer');
  assert.equal((await answer(r, 'ava', missionId, 'accept')).data.reason, 'no_mission_here', 'the missionary cannot answer her own mission');
  assert.equal((await answer(r, 'kim', 'mission-does-not-exist', 'accept')).data.reason, 'no_mission_here');
  const id = randomUUID(); const done = await answer(r, 'kim', missionId, 'accept', id);
  assert.equal(done.status, 200, JSON.stringify(done.data)); assert.equal(done.data.completion, 'You joined Kinward Rite. The choice was yours.'); assert.equal(done.data.state.faith.id, 'kinward-rite');
  assert.equal((await answer(r, 'kim', missionId, 'accept', id)).data.replay, true, 'a retry with the same id is idempotent');
  assert.equal((await answer(r, 'kim', missionId, 'accept')).data.reason, 'already_answered', 'Accept works once per mission');
  assert.equal((await r.db.prepare("SELECT COUNT(*) AS n FROM missionary_responses WHERE user_id='kim'").first()).n, 1);
  // Conversion is the real faith change (chooseFaith).
  const kim = await read(r, 'kim'); assert.equal(kim.changeAvailableAt, null, 'a first pick from Unaffiliated is free and starts no cooldown');
  // Kay did not answer: still Unaffiliated, nothing was done to her.
  assert.equal((await read(r, 'kay')).faith.id, 'unaffiliated');
  // A citizen who changed faith inside the cooldown cannot be converted: the same cooldown applies and the invitation stays open.
  await citizen(r, 'kit', 'kindle'); assert.equal((await choose(r, 'kit', 'open-hand')).status, 200); assert.equal((await choose(r, 'kit', 'fair-wind-vow')).status, 200);
  const locked = await read(r, 'kit'); assert.match(locked.missionary.notice, /You changed faith recently\. You can change again after \d{4}-\d{2}-\d{2}\./); assert.equal(locked.missionary.offer, null);
  const refused = await answer(r, 'kit', missionId, 'accept'); assert.equal(refused.status, 409); assert.equal(refused.data.reason, 'cooldown');
  assert.equal((await read(r, 'kit')).faith.id, 'fair-wind-vow'); assert.equal((await r.db.prepare("SELECT COUNT(*) AS n FROM missionary_responses WHERE user_id='kit'").first()).n, 0);
});

test('Not now declines without changing faith; the 14-day invitation gap then holds (exact), and a later mission waits for it', async t => {
  const { r, nowS } = await scene(t);
  const missionId = await arrived(r, nowS); const t0 = nowS();
  const declined = await answer(r, 'kim', missionId, 'decline'); assert.equal(declined.status, 200); assert.equal(declined.data.completion, 'Invitation declined. Nothing about your faith has changed.'); assert.equal(declined.data.state.faith.id, 'unaffiliated');
  const after = await read(r, 'kim'); assert.equal(after.missionary.offer, null, 'no second card for the same mission');
  // A second missionary arrives the next day: Kim was invited inside 14 days, so she sees only the notice.
  await citizen(r, 'bea', 'aurelle'); await devote(r, ['bea'], 14);
  const req = await request(r, 'bea', 'kindle'); await accept(r, 'bea'); r.setNow(r.now + H * 1000);
  const second = await read(r, 'kim'); assert.equal(second.missionary.offer, null); assert.match(second.missionary.notice, /No new invitation until \d{4}-\d{2}-\d{2}\./);
  assert.equal((await answer(r, 'kim', req.data.state.missionary.mission.id, 'accept')).data.reason, 'invitation_recent');
  assert.equal((await read(r, 'kim')).faith.id, 'unaffiliated');
  const repo = await r.importModule('lib/missionaries.ts');
  assert.equal(await repo.lastAnswerAt(r.db, 'kim'), t0); assert.equal(repo.invitationAllowed(t0, t0 + 14 * D - 1), false); assert.equal(repo.invitationAllowed(t0, t0 + 14 * D), true);
});

test('mute: no invitation reaches a muted citizen and answers are refused; unmuting brings it back', async t => {
  const { r, nowS } = await scene(t);
  const missionId = await arrived(r, nowS);
  assert.equal((await read(r, 'kim')).missionary.muted, false); assert.ok((await read(r, 'kim')).missionary.offer);
  const m = await mute(r, 'kim', true); assert.equal(m.status, 200); assert.equal(m.data.state.missionary.muted, true); assert.equal(m.data.state.missionary.offer, null);
  assert.equal((await answer(r, 'kim', missionId, 'accept')).data.reason, 'muted'); assert.equal((await read(r, 'kim')).faith.id, 'unaffiliated');
  assert.equal((await mute(r, 'kim', true)).status, 200, 'muting twice is safe');
  assert.equal((await mute(r, 'kim', false)).data.state.missionary.muted, false); assert.ok((await read(r, 'kim')).missionary.offer);
  assert.equal((await mute(r, 'nobody', true)).status === 200, false);
});

test('Aurelle host: an Aurelle citizen of another faith can accept the Kinward Rite; leaving it later still costs Royal Favor (same rules)', async t => {
  const { r, nowS } = await setup(t);
  await citizen(r, 'kim', 'kindle'); await citizen(r, 'ava', 'aurelle'); await citizen(r, 'ana', 'aurelle');
  assert.equal((await choose(r, 'kim', 'kinward-rite')).status, 200); await r.db.prepare("INSERT INTO citizen_faith (user_id,nation_id,faith_id,chosen_at,request_id) VALUES ('ana','aurelle','fair-wind-vow',?,?)").bind(Math.floor(r.now / 1000), randomUUID()).run(); // a private holder (leaving the state church would cost Royal Favor)
  await devote(r, ['kim'], 14);
  const req = await request(r, 'kim', 'aurelle'); assert.equal(req.status, 200, JSON.stringify(req.data)); await accept(r, 'kim');
  const rules = await r.importModule('lib/missionaries.ts'); r.setNow((nowS() + rules.missionTravelSeconds('kindle', 'aurelle')) * 1000);
  assert.equal((await read(r, 'ava')).missionary.offer, null, 'an Aurelle citizen who already holds the Kinward Rite is not invited to it');
  const offer = (await read(r, 'ana')).missionary.offer; assert.equal(offer.faithId, 'kinward-rite'); assert.deepEqual(offer.warnings, []);
  const done = await answer(r, 'ana', req.data.state.missionary.mission.id, 'accept'); assert.equal(done.status, 200, JSON.stringify(done.data)); assert.equal(done.data.state.faith.id, 'kinward-rite'); assert.equal(done.data.state.leaveCost, 10, 'leaving the Kinward Rite in Aurelle still costs Royal Favor');
});

test('no wage, production, market or combat effect: a mission writes only its own tables (plus the faith change on Accept)', async t => {
  const { r, nowS } = await scene(t);
  let missionId;
  const own = await writesDuring(r, async () => { missionId = (await request(r, 'ava', 'kindle')).data.state.missionary.mission.id; assert.equal((await accept(r, 'ava')).status, 200); });
  assert.deepEqual(tables(own), ['faith_missions']);
  const rules = await r.importModule('lib/missionaries.ts'); r.setNow((nowS() + rules.missionTravelSeconds('aurelle', 'kindle')) * 1000);
  const declineWrites = await writesDuring(r, async () => { assert.equal((await answer(r, 'kay', missionId, 'decline')).status, 200); });
  assert.deepEqual(tables(declineWrites), ['missionary_responses']);
  const acceptWrites = await writesDuring(r, async () => { assert.equal((await answer(r, 'kim', missionId, 'accept')).status, 200); });
  assert.deepEqual(tables(acceptWrites), ['citizen_faith', 'missionary_responses']);
  const src = (await Promise.all(['lib/missionaries.ts', 'lib/missionary-actions.ts', 'lib/missionary-rules.ts'].map(f => readFile(new URL(`../${f}`, import.meta.url), 'utf8')))).join('\n');
  assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''), /citizen_wallets|wage|shift|market|order_book|inventory|combat|aurelle_favor/i, 'no economy, market or combat table is touched');
});

test('GETs stay read-only: the faith read with missions, offers and badges writes nothing', async t => {
  const { r, nowS } = await scene(t);
  await arrived(r, nowS);
  const writes = await writesDuring(r, async () => { for (const u of ['ava', 'kim', 'kai']) assert.equal((await r.call('faith', u)).status, 200); await r.call('news', 'kim'); });
  assert.deepEqual(writes, []);
});

test('the same rules hold on PostgreSQL (PGlite): one open mission, travel timer, Accept converts once', async t => {
  const { r, nowS } = await scene(t, 'postgres');
  const both = await Promise.all([request(r, 'ava', 'kindle'), request(r, 'ava', 'kindle')]);
  assert.deepEqual(both.map(b => b.status).sort(), [200, 409]);
  assert.equal((await accept(r, 'ava')).status, 200);
  const rules = await r.importModule('lib/missionaries.ts'); r.setNow((nowS() + rules.missionTravelSeconds('aurelle', 'kindle')) * 1000);
  const id = (await read(r, 'kim')).missionary.offer.missionId;
  assert.equal((await answer(r, 'kim', id, 'accept')).data.state.faith.id, 'kinward-rite');
  assert.equal((await answer(r, 'kim', id, 'accept')).data.reason, 'already_answered');
});

test('flag default, migration 0037 is additive, and the app never imports the missionary copy (the server sends the strings)', async () => {
  const cfg = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.deepEqual([...cfg.matchAll(/"HARIMU_FAITH_ENABLED"\s*:\s*"([^"]*)"/g)].map(m => m[1]), ['false']);
  for (const file of ['../drizzle/0037_faith_missions.sql', '../db/postgres/0037_faith_missions.sql']) {
    const sql = (await readFile(new URL(file, import.meta.url), 'utf8')).replace(/^--.*$/gm, '').replace(/ON DELETE CASCADE/g, '');
    assert.doesNotMatch(sql, /\b(DROP|ALTER|RENAME|DELETE|UPDATE)\b/i, file);
    for (const table of ['faith_missions', 'missionary_responses', 'missionary_mutes']) assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`), `${file} ${table}`);
  }
  const walk = async dir => (await Promise.all((await readdir(dir, { withFileTypes: true })).map(e => e.isDirectory() ? walk(new URL(`${e.name}/`, dir)) : [new URL(e.name, dir)]))).flat();
  for (const file of await walk(new URL('../app/', import.meta.url))) if (/\.(ts|tsx)$/.test(file.pathname)) assert.doesNotMatch(await readFile(file, 'utf8'), /missionary-copy|missionary-notice-copy/, file.pathname);
});

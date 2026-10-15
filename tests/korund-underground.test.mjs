/** #295: Korund underground worship and capped inspections (raids), behind HARIMU_FAITH_ENABLED. Fixed clock; HARIMU_TEST_STORAGE=postgres runs it on PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';
import { appealGranted, deriveDuties, dutyDays, hash32, isRepeatDiscovery, suspicionBand, suspicionLevel, suspicionWord, pickIndex, raidAllowed, raidDue, raidId, raidRoll, undergroundConfig as cfg, undergroundGameDay } from '../lib/underground-rules.ts';

const DAY = 7200, WEEK = 7 * 86400;
const choose = (r, user, faithId, hiddenFaithId, requestId = randomUUID()) => r.call('faith', user, { action: 'choose-faith', faithId, ...(hiddenFaithId ? { hiddenFaithId } : {}), requestId });
const underground = (r, user, requestId = randomUUID()) => r.call('faith', user, { action: 'worship-underground', requestId });
const read = async (r, user) => (await r.call('faith', user)).data;
async function citizen(r, id, nation) {
  const at = new Date(r.now).toISOString();
  await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,?,?,18,0,'Good standing',?,?)").bind(id, nation, id, at, at).run();
}
async function setup(t, { flag = true } = {}) {
  const r = await localRuntime(); t.after(() => r.close());
  if (flag) r.setFaith(true);
  const mod = await r.importModule('lib/korund-underground.ts');
  const nowS = () => Math.floor(r.now / 1000);
  return { r, mod, nowS };
}
/** The first game day at or after `from` where `cityId` rolls a discovery (and, optionally, `not` does not). */
function dueDay(cityId, from, not = []) { for (let d = from; d < from + 5000; d++) if (raidDue(cityId, d) && !not.some(c => raidDue(c, d))) return d; throw new Error('no due day'); }
const hold = async (r, id, faith = 'open-hand') => { await citizen(r, id, 'korund'); assert.equal((await choose(r, id, 'unaffiliated', faith)).status, 200); };
/** Every write statement run while `fn` executes. */
async function writesDuring(r, fn) {
  const writes = [], prepare = r.db.prepare.bind(r.db), batch = r.db.batch.bind(r.db);
  const note = sql => { if (/^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|REPLACE)/i.test(sql)) writes.push(sql.replace(/\s+/g, ' ').trim()); };
  r.db.prepare = sql => { note(sql); return prepare(sql); };
  r.db.batch = statements => batch(statements);
  try { await fn(); } finally { r.db.prepare = prepare; r.db.batch = batch; }
  return writes;
}

test('pure rules: one inspection per city per 14 real days (exact gap), deterministic low chance, hash is stable', () => {
  assert.equal(cfg.raidMinGapSeconds, 14 * 86400); assert.equal(cfg.devotionHit, 5); assert.equal(cfg.holderLookbackSeconds, WEEK);
  // Pin the two [ASSUMPTION] numbers (docs 14.6 gives neither): changing one must be a deliberate edit of undergroundConfig and of this test.
  assert.equal(cfg.raidChancePerMille, 42); assert.equal(cfg.devotionHit, 5);
  assert.equal(raidAllowed(1000, null), true);
  assert.equal(raidAllowed(1000 + cfg.raidMinGapSeconds - 1, 1000), false, 'one second inside the gap');
  assert.equal(raidAllowed(1000 + cfg.raidMinGapSeconds, 1000), true, 'exactly 14 days after');
  assert.equal(raidRoll('stonehearth', 5), raidRoll('stonehearth', 5)); assert.equal(hash32('a'), hash32('a')); assert.notEqual(hash32('a'), hash32('b'));
  assert.equal(raidId('stonehearth', 9), 'raid:stonehearth:9');
  let due = 0; for (let d = 0; d < 20000; d++) if (raidDue('stonehearth', d)) due++;
  assert.ok(due > 20000 * 0.03 && due < 20000 * 0.055, `about 4.2% of game days roll a discovery, got ${due}`);
  assert.equal(undergroundGameDay(DAY * 3 + 5), 3); assert.equal(pickIndex('x', 0), 0); assert.ok(pickIndex('seed', 3) < 3);
});

test('wrangler ships faith off, migration 0032 is additive, and the game day matches faith.ts', async t => {
  const cfgText = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.deepEqual([...cfgText.matchAll(/"HARIMU_FAITH_ENABLED"\s*:\s*"([^"]*)"/g)].map(m => m[1]), ['false']);
  for (const dir of ['drizzle', 'db/postgres']) {
    const sql = await readFile(new URL(`../${dir}/0032_korund_underground.sql`, import.meta.url), 'utf8');
    assert.doesNotMatch(sql.replace(/--[^\n]*/g, '').replace(/ON DELETE CASCADE/g, ''), /\b(DROP|ALTER|DELETE|UPDATE|TRUNCATE)\b/i, `${dir} 0032 is additive`);
    assert.deepEqual([...sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(m => m[1]), ['korund_raids', 'korund_raid_hits']);
  }
  const { r } = await setup(t); const faith = await r.importModule('lib/faith.ts');
  assert.equal(cfg.gameDaySeconds, faith.gameDaySeconds);
});

test('flag off: no underground state, worship refused, no inspections, no rumors', async t => {
  const { r, mod, nowS } = await setup(t);
  await hold(r, 'kai'); assert.equal((await underground(r, 'kai')).status, 200);
  r.setFaith(false);
  assert.equal((await underground(r, 'kai')).data.reason, 'disabled');
  const state = await read(r, 'kai'); assert.equal(state.enabled, false); assert.equal(state.underground, null);
  r.setNow(dueDay('stonehearth', undergroundGameDay(nowS())) * DAY * 1000 + 1000);
  assert.equal((await r.call('world', null)).status, 200);
  assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM korund_raids').first()).n, 0, 'the tick does nothing while the flag is off');
  assert.ok(!(await r.call('news', 'kai')).data.items.some(i => i.id.startsWith('korund:inspection:')));
  assert.deepEqual(await mod.undergroundNewsItems(r.db, nowS()), []);
});

test('underground worship: hidden-faith Korund holders only, once per game day, +Devotion, idempotent, nothing public', async t => {
  const { r } = await setup(t);
  await hold(r, 'kai'); await citizen(r, 'kit', 'korund'); await citizen(r, 'kim', 'kindle');
  assert.equal((await underground(r, 'kit')).data.reason, 'no_hidden_faith', 'Unaffiliated-only citizens cannot');
  assert.equal((await choose(r, 'kit', 'unaffiliated')).status, 200); assert.equal((await underground(r, 'kit')).data.reason, 'no_hidden_faith');
  assert.equal((await underground(r, 'kim')).data.reason, 'unsupported_nation');
  assert.equal((await underground(r, 'nobody')).status === 200, false);
  const before = await read(r, 'kai'); assert.equal(before.underground.label, 'Worship quietly'); assert.equal(before.devotion.value, 0); assert.equal(before.underground.worshippedToday, false);
  const id = randomUUID(); const first = await underground(r, 'kai', id);
  assert.equal(first.status, 200, JSON.stringify(first.data)); assert.equal(first.data.completion, 'You worshipped in private. Nothing is posted.');
  assert.equal(first.data.state.devotion.value, 3); assert.equal(first.data.state.underground.worshippedToday, true);
  assert.equal((await underground(r, 'kai', id)).data.replay, true); assert.equal((await read(r, 'kai')).devotion.value, 3, 'a retry adds nothing');
  const again = await underground(r, 'kai'); assert.equal(again.data.reason, 'already_worshipped'); assert.equal(again.data.error, 'You have already worshipped today. Try again tomorrow.');
  assert.equal((await r.call('faith', 'kai', { action: 'attend-worship', requestId: randomUUID() })).data.reason, 'no_faith', 'public worship stays refused in Korund');
  r.setNow(r.now + DAY * 1000);
  const both = await Promise.all([underground(r, 'kai'), underground(r, 'kai')]);
  assert.deepEqual(both.map(b => b.status).sort(), [200, 409], 'concurrent attempts record exactly one');
  assert.equal((await read(r, 'kai')).devotion.value, 3 + 3, 'consecutive days: no decay, then +3');
  // Private: nothing in the news or in another citizen's state mentions it.
  const news = JSON.stringify((await r.call('news', 'kit')).data); assert.doesNotMatch(news, /Open Hand|quietly|worship/i);
  const kit = await read(r, 'kit'); assert.equal(kit.hiddenFaith, null); assert.equal(kit.underground, null); assert.equal(JSON.stringify(kit).includes('kai'), false);
});

test('the world tick inspects a city with underground worship: capped, a Devotion hit for its holders only, a State Media rumor naming no faith', async t => {
  const { r, nowS } = await setup(t);
  const capital = 'stonehearth', other = 'strova-mines';
  await hold(r, 'kai'); await hold(r, 'kay', 'fair-wind-vow'); await hold(r, 'ova'); await citizen(r, 'kit', 'korund'); await citizen(r, 'kim', 'kindle');
  assert.equal((await choose(r, 'kit', 'unaffiliated')).status, 200);
  await r.db.prepare("INSERT INTO citizen_city_locations (user_id,nation_id,home_city_id,current_city_id,updated_at) VALUES ('ova','korund',?,?,?)").bind(other, other, nowS()).run();
  const d = dueDay(capital, undergroundGameDay(nowS()) + 3, [other]);
  for (const offset of [2, 1, 0]) { r.setNow((d - offset) * DAY * 1000 + 1000); for (const u of ['kai', 'kay', 'ova']) assert.equal((await underground(r, u)).status, 200, u); }
  assert.equal((await read(r, 'kai')).devotion.value, 9, 'three worships, no decay');
  assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM korund_raids').first()).n, 0, 'reads and worship never create an inspection');
  assert.equal((await r.call('world', null)).status, 200); // the tick runs on this write path
  const raids = (await r.db.prepare('SELECT * FROM korund_raids').all()).results; assert.equal(raids.length, 1);
  assert.equal(raids[0].city_id, capital); assert.equal(Number(raids[0].raided_at), nowS()); assert.equal(raids[0].id, raidId(capital, d));
  const hits = (await r.db.prepare('SELECT user_id,devotion_hit FROM korund_raid_hits ORDER BY user_id').all()).results;
  assert.deepEqual(hits.map(h => [h.user_id, Number(h.devotion_hit)]), [['kai', 5], ['kay', 5]], 'holders in that city only; not the other city, not Unaffiliated-only, not Kindle');
  const kai = await read(r, 'kai');
  assert.equal(kai.devotion.value, 4, '9 + 3 (that day) - 5');
  assert.equal(kai.underground.lastRaid.text, 'An inspection found a shrine. Suspicion was recorded.'); assert.equal(kai.underground.lastRaid.devotionNote, 'Your Devotion fell a little.');
  assert.equal(kai.underground.quietWeek, null);
  assert.equal((await read(r, 'ova')).underground.lastRaid, null); assert.match((await read(r, 'ova')).underground.quietWeek, /quiet/i);
  assert.equal((await read(r, 'kit')).underground, null);
  // The tick is idempotent: another tick the same game day adds nothing.
  assert.equal((await r.call('world', null)).status, 200); assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM korund_raid_hits').first()).n, 2);
  // Public rumor: State Media voice, only {city}, never a faith, shrine, person or number.
  const rumor = (await r.call('news', 'kit')).data.items.find(i => i.id === `korund:inspection:${raidId(capital, d)}`);
  assert.ok(rumor, 'Korund readers see the rumor'); assert.equal(rumor.kind, 'template'); assert.match(rumor.text, /Stonehearth/);
  assert.doesNotMatch(rumor.text, /Open Hand|Fair-Wind|Kinward|shrine|faith|worship|believer|kai|kay|\d/i);
  assert.ok(!(await r.call('news', 'kim')).data.items.some(i => i.id.startsWith('korund:inspection:')), 'other nations do not get the Korund rumor');
});

test('the 14-day cap: no second inspection of a city inside 14 real days, allowed on the exact day (fixed clock)', async t => {
  const { r, mod, nowS } = await setup(t);
  await hold(r, 'kai'); assert.equal((await underground(r, 'kai')).status, 200);
  const capital = 'stonehearth', gap = cfg.raidMinGapSeconds;
  const d = dueDay(capital, undergroundGameDay(nowS()) + 1); const t0 = d * DAY + 60;
  const seed = (id, at) => r.db.prepare('INSERT INTO korund_raids (id,city_id,game_day,raided_at) VALUES (?,?,?,?)').bind(id, capital, -1 - Math.floor(Math.random() * 1e6), at).run();
  // A previous inspection one second inside the gap blocks it.
  r.setNow(t0 * 1000); await r.db.prepare('UPDATE citizen_worship SET worshipped_at=?').bind(t0 - 100).run();
  await seed('prev-a', t0 - gap + 1);
  assert.deepEqual(await mod.runKorundRaids(r.db, t0), [], 'gap - 1 second: blocked');
  assert.equal((await r.db.prepare("SELECT COUNT(*) AS n FROM korund_raids WHERE id=?").bind(raidId(capital, d)).first()).n, 0);
  await r.db.prepare("DELETE FROM korund_raids WHERE id='prev-a'").run(); await seed('prev-b', t0 - gap);
  assert.deepEqual(await mod.runKorundRaids(r.db, t0), [capital], 'exactly 14 days after: allowed');
  assert.deepEqual(await mod.runKorundRaids(r.db, t0 + 1), [], 'and then capped again');
});

test('#382 pure rules: Suspicion is 0..100, +10 per discovery or +5 for a repeat within 30 days, -1 per real day, derived from discovery times', () => {
  const D = 86400, t = 1_000_000;
  assert.equal(suspicionLevel([], t), 0); assert.equal(suspicionLevel([t], t), 10);
  assert.equal(suspicionLevel([t], t + 3 * D + 86399), 7, 'decays a whole day at a time, computed on read'); assert.equal(suspicionLevel([t], t + 10 * D), 0); assert.equal(suspicionLevel([t], t + 400 * D), 0, 'never below 0');
  assert.equal(isRepeatDiscovery(null, t), false); assert.equal(isRepeatDiscovery(t, t + 30 * D), true, 'the window is the last 30 real days, inclusive'); assert.equal(isRepeatDiscovery(t, t + 30 * D + 1), false); assert.equal(isRepeatDiscovery(t, t + 14 * D), true, 'longer than the 14-day inspection gap');
  assert.equal(suspicionLevel([t, t + 14 * D], t + 14 * D), 5, '10 decays to 0 over 14 days, then a repeat adds 5'); assert.equal(suspicionLevel([t, t + 30 * D], t + 30 * D), 5); assert.equal(suspicionLevel([t, t + 30 * D + 1], t + 30 * D + 1), 10, 'outside the window it is a first step again');
  assert.equal(suspicionLevel([t, t + 14 * D], t + 14 * D), suspicionLevel([t + 14 * D, t], t + 14 * D), 'order does not matter');
  assert.equal(suspicionLevel([t, t + D, t + 2 * D], t + 2 * D), 10 + 4 + 4);
  assert.equal(suspicionLevel(Array.from({ length: 60 }, (_, i) => t + i * D), t + 59 * D), 100, 'capped at 100');
  assert.deepEqual([0, 1, 29, 30, 59, 60, 100].map(l => suspicionBand(l)), ['none', 'low', 'low', 'raised', 'raised', 'high', 'high']);
  assert.deepEqual(suspicionWord, { low: 'Low', raised: 'Raised', high: 'High' });
  assert.equal(cfg.suspicionFirstStep, 10); assert.equal(cfg.suspicionRepeatStep, 5); assert.equal(cfg.repeatWindowSeconds, 30 * 86400); assert.equal(cfg.raidMinGapSeconds, 14 * 86400); // pin the [ASSUMPTION] numbers
});

test('#382: the first inspection shows the first-discovery line and a private Suspicion band; a repeat inside the 30-day window shows the repeat line; re-choosing a faith resets nothing; others are not affected', async t => {
  const { r, mod, nowS } = await setup(t);
  await hold(r, 'kai'); assert.equal((await underground(r, 'kai')).status, 200);
  const capital = 'stonehearth', gap = cfg.raidMinGapSeconds;
  // Two game days a real 14 days apart that both roll a discovery: the second lands exactly on the per-city gap boundary, well inside the 30-day repeat window.
  let d1 = undergroundGameDay(nowS()) + 1; while (!(raidDue(capital, d1) && raidDue(capital, d1 + gap / DAY))) d1++;
  const t1 = d1 * DAY + 60, t2 = t1 + gap;
  r.setNow(t1 * 1000); await r.db.prepare('UPDATE citizen_worship SET worshipped_at=?').bind(t1 - 100).run();
  assert.deepEqual(await mod.runKorundRaids(r.db, t1), [capital]);
  const first = (await read(r, 'kai')).underground;
  assert.equal(first.lastRaid.text, 'An inspection found a shrine. Suspicion was recorded.'); assert.equal(first.lastRaid.repeat, false);
  assert.deepEqual(first.suspicion, { line: 'Suspicion: Low', privateTag: 'Private to you', tooltip: ['State Security keeps a private record. Only you can see it.', 'Each inspection that finds a shrine adds to it. Nobody else sees it.'] });
  assert.doesNotMatch(JSON.stringify(first.suspicion), /\b10\b/, 'the number is never sent');
  r.setNow((t2 - 200) * 1000); await hold(r, 'kay'); assert.equal((await underground(r, 'kay')).status, 200); assert.equal((await underground(r, 'kai')).status, 200);
  r.setNow(t2 * 1000); assert.deepEqual(await mod.runKorundRaids(r.db, t2), [capital]);
  const again = (await read(r, 'kai')).underground;
  assert.equal(again.lastRaid.text, 'An inspection found a shrine again. Correction Duty may follow, for up to 7 days.'); assert.equal(again.lastRaid.repeat, true);
  assert.equal(again.suspicion.line, 'Suspicion: Low');
  const newcomer = (await read(r, 'kay')).underground;
  assert.equal(newcomer.lastRaid.repeat, false); assert.equal(newcomer.suspicion.line, 'Suspicion: Low', "another holder's history does not count"); assert.equal(newcomer.suspicion.line, 'Suspicion: Low');
  // Re-choosing the faith (chosen_at moves forward) keeps Suspicion: it is keyed to the citizen and counted from stored discoveries.
  await r.db.prepare("UPDATE citizen_faith SET chosen_at=? WHERE user_id='kai'").bind(t2 + 60).run(); r.setNow((t2 + 120) * 1000);
  const rechosen = (await read(r, 'kai')).underground;
  assert.equal(rechosen.lastRaid, null, 'the notice is for this faith choice'); assert.equal(rechosen.suspicion.line, 'Suspicion: Low', 'Suspicion survives re-choosing');
  // It decays on read: a day short of its decay to zero it still shows, and after it is gone nothing is shown.
  r.setNow((t2 + 4 * 86400) * 1000); assert.equal((await read(r, 'kai')).underground.suspicion.line, 'Suspicion: Low');
  r.setNow((t2 + 6 * 86400) * 1000); assert.equal((await read(r, 'kai')).underground.suspicion, null, 'decayed to 0');
  // The news rumor carries none of it.
  const rumor = (await r.call('news', 'kai')).data.items.find(i => i.id === `korund:inspection:${raidId(capital, Math.floor(t2 / DAY))}`);
  assert.ok(rumor); assert.doesNotMatch(JSON.stringify(rumor), /repeat|Correction|Suspicion|kai|kay/);
  assert.equal('discoveries' in first.lastRaid, false, 'the exact count is not sent');
});

test('#382: more discoveries raise the band (Raised, then High) from stored rows, and a GET writes nothing', async t => {
  const { r, nowS } = await setup(t);
  await hold(r, 'kai'); assert.equal((await underground(r, 'kai')).status, 200);
  const seed = async (n, step) => { for (let i = 0; i < n; i++) { const at = nowS() - (n - i) * step, id = `seed-${step}-${i}`;
    await r.db.prepare('INSERT INTO korund_raids (id,city_id,game_day,raided_at) VALUES (?,?,?,?)').bind(id, 'stonehearth', -1000 - i - step, at).run();
    await r.db.prepare('INSERT INTO korund_raid_hits (raid_id,user_id,game_day,raided_at,devotion_hit) VALUES (?,?,?,?,?)').bind(id, 'kai', -1000 - i - step, at, 0).run(); } };
  await seed(8, 86400); // +10, then +4 a day: 38 at the last one, 37 now
  assert.equal((await read(r, 'kai')).underground.suspicion.line, 'Suspicion: Raised');
  assert.deepEqual(await writesDuring(r, () => read(r, 'kai')), [], 'reading Suspicion writes nothing');
  await r.db.prepare('DELETE FROM korund_raid_hits').run(); await r.db.prepare('DELETE FROM korund_raids').run();
  await seed(25, 86400 / 2); // twelve-hour steps: +5 each and no real decay between them
  assert.equal((await read(r, 'kai')).underground.suspicion.line, 'Suspicion: High');
});

test('#382 PR B pure rules: a repeat starts a 3-day duty (longer by band, 7-day cap), a repeat during it extends it without stacking, and the automatic appeal rule', () => {
  const D = 86400, t = 5_000_000, days = d => deriveDuties(d).map(x => [x.startAt, x.endsAt, dutyDays(x)]);
  assert.deepEqual(deriveDuties([]), []); assert.deepEqual(deriveDuties([t]), [], 'a first discovery starts no duty');
  assert.deepEqual(days([t, t + 14 * D]), [[t + 14 * D, t + 17 * D, 3]], 'a repeat starts the default 3-day duty (Suspicion Low)');
  assert.deepEqual(days([t, t + 40 * D]), [], 'outside the 30-day repeat window it is a first discovery again');
  const climb = Array.from({ length: 12 }, (_, i) => t + i * 12 * 3600); // twelve-hour steps: +5 each, no real decay: High after the 11th
  assert.equal(dutyDays(deriveDuties(climb.slice(0, 2)).at(-1)), 3, 'Low'); assert.equal(deriveDuties(climb).length, 1, 'repeats during an active duty extend it; they never stack');
  assert.equal(deriveDuties(climb)[0].endsAt - deriveDuties(climb)[0].startAt, 7 * D, 'capped at 7 real days from its start');
  assert.deepEqual(days([t, t + 14 * D, t + 15 * D]).map(x => x[2]), [6], 'a second repeat 1 day in extends the 3-day duty by 3 more: 6 days from its start, still under the 7-day cap, and still one duty');
  assert.equal(appealGranted([t, t + 14 * D], t + 14 * D), true, 'no discovery inside the 14 days before the duty began: exactly 14 days earlier is outside');
  assert.equal(appealGranted([t, t + 14 * D - 1], t + 14 * D - 1), false, 'a discovery 14 days minus a second earlier: denied');
  assert.equal(cfg.dutyMaxSeconds, 7 * D); assert.deepEqual(cfg.dutyDaysByBand, { none: 3, low: 3, raised: 5, high: 7 }); assert.equal(cfg.dutyDevotionPerDay, 1); assert.equal(cfg.appealWindowSeconds, 14 * D); // pin the [ASSUMPTION] numbers
});

test('#382 PR B: Correction Duty shows from stored repeat discoveries, costs Devotion only, has one automatic appeal (granted lifts it and the cost), and nobody else can use it', async t => {
  const { r, mod, nowS } = await setup(t);
  const D = 86400, id = (suffix, n) => `duty-${suffix}-${n}`;
  const seed = async (user, agoDays) => { for (const [i, ago] of agoDays.entries()) { const at = nowS() - Math.round(ago * D), rid = id(user, i);
    await r.db.prepare('INSERT INTO korund_raids (id,city_id,game_day,raided_at) VALUES (?,?,?,?)').bind(rid, 'stonehearth', -5000 - i - user.length * 100 - Math.floor(Math.random() * 1e4), at).run();
    await r.db.prepare('INSERT INTO korund_raid_hits (raid_id,user_id,game_day,raided_at,devotion_hit) VALUES (?,?,?,?,?)').bind(rid, user, -1, at, 0).run(); } };
  const appeal = (user, requestId = randomUUID()) => r.call('faith', user, { action: 'appeal-duty', requestId });
  await hold(r, 'kai'); await hold(r, 'kay'); await hold(r, 'ova'); await citizen(r, 'kim', 'kindle');
  assert.equal((await read(r, 'kai')).underground.duty, null, 'no discovery, no duty');
  await seed('kai', [15, 1]); // found 15 days ago and again 1 day ago: a repeat 14 days apart; the duty began 1 day ago, 3 days long
  const duty = (await read(r, 'kai')).underground.duty;
  assert.equal(duty.active, true); assert.equal(duty.daysLeft, 'Days left: 2'); assert.equal(duty.banner, 'State Security: you are on Correction Duty.');
  assert.deepEqual(duty.lines, ['Correction Duty lasts at most 7 real days.', 'You can still play and work while on Correction Duty.']);
  assert.deepEqual(duty.appeal, { available: true, explainer: 'Correction Duty can be appealed once. The result is decided automatically.', status: null, statusLine: null });
  assert.doesNotMatch(JSON.stringify(duty), /staff/i, 'the appeal is automatic, not staff');
  assert.deepEqual(await mod.dutyDevotionEvents(r.db, 'kai'), [{ day: undergroundGameDay(nowS() - D), amount: -3 }], 'Devotion only: 1 per duty day');
  // Others cannot see or use it.
  assert.equal((await read(r, 'kay')).underground.duty, null); assert.equal((await appeal('kay')).status, 409);
  assert.equal((await appeal('kim')).status, 403, 'only Korund hidden-faith holders');
  // The automatic appeal: no discovery in the 14 days before the one that started the duty, so it is granted, once.
  const reqId = randomUUID(), done = await appeal('kai', reqId);
  assert.equal(done.status, 200); assert.equal(done.data.completion, 'Your appeal was decided automatically. Correction Duty is lifted.');
  assert.equal(done.data.state.underground.duty.active, false); assert.equal(done.data.state.underground.duty.appeal.status, 'granted'); assert.equal(done.data.state.underground.duty.appeal.available, false);
  assert.deepEqual(await mod.dutyDevotionEvents(r.db, 'kai'), [], 'lifted: no Devotion cost');
  assert.equal((await appeal('kai', reqId)).data.replay, true, 'a replayed request id is a no-op'); const second = await appeal('kai'); assert.equal(second.status, 409); assert.equal(second.data.reason, 'no_duty', 'a lifted duty cannot be appealed again');
  assert.equal((await r.db.prepare("SELECT COUNT(*) AS n FROM korund_duty_appeals WHERE user_id='kai'").first()).n, 1);
  // A holder found twice within 14 days (moved city): the appeal is denied, the duty stands, and a second appeal is refused.
  await seed('ova', [6, 2]);
  assert.equal((await read(r, 'ova')).underground.duty.active, true);
  const denied = await appeal('ova'); assert.equal(denied.status, 200); assert.equal(denied.data.completion, 'Your appeal was decided automatically. Correction Duty stands.');
  assert.equal(denied.data.state.underground.duty.active, true); assert.equal(denied.data.state.underground.duty.appeal.available, false);
  const again = await appeal('ova'); assert.equal(again.status, 409); assert.equal(again.data.reason, 'already_appealed');
  assert.equal((await mod.dutyDevotionEvents(r.db, 'ova')).length, 1, 'a denied appeal keeps the cost');
  // The duty ends on its own and the Devotion effect is the only one: no wage, production or market table is touched.
  r.setNow((nowS() + 5 * D) * 1000); assert.equal((await read(r, 'ova')).underground.duty, null, 'ended');
  assert.deepEqual(await writesDuring(r, () => read(r, 'ova')), [], 'reading a duty writes nothing');
});

test('#382 PR B: with the flag off the appeal is refused and nothing is stored; migration 0056 is additive in both copies', async t => {
  const { r } = await setup(t, { flag: false });
  assert.equal((await r.call('faith', 'kai', { action: 'appeal-duty', requestId: randomUUID() })).status, 403);
  for (const dir of ['drizzle', 'db/postgres']) {
    const sql = await readFile(new URL(`../${dir}/0056_korund_duty_appeals.sql`, import.meta.url), 'utf8');
    assert.doesNotMatch(sql.replace(/--[^\n]*/g, '').replace(/ON DELETE CASCADE/g, ''), /\b(DROP|ALTER|DELETE|UPDATE|TRUNCATE)\b/i, `${dir} 0056 is additive`);
    assert.match(sql, /CREATE TABLE IF NOT EXISTS korund_duty_appeals/);
  }
});

test('no wage, production, market or combat effect: an inspection writes only its own two tables and Devotion stays social', async t => {
  const { r, mod, nowS } = await setup(t);
  await hold(r, 'kai'); assert.equal((await underground(r, 'kai')).status, 200);
  const d = dueDay('stonehearth', undergroundGameDay(nowS()) + 1); const at = d * DAY + 30;
  await r.db.prepare('UPDATE citizen_worship SET worshipped_at=?').bind(at - 10).run();
  const writes = await writesDuring(r, async () => { assert.deepEqual(await mod.runKorundRaids(r.db, at), ['stonehearth']); });
  assert.ok(writes.length > 0 && writes.every(w => /^INSERT INTO (korund_raids|korund_raid_hits) /.test(w)), `only inspection rows: ${writes.join(' | ')}`);
  const sources = await Promise.all(['lib/korund-underground.ts', 'lib/underground-rules.ts'].map(f => readFile(new URL(`../${f}`, import.meta.url), 'utf8')));
  for (const text of sources) assert.doesNotMatch(text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, ''), /\b(wage|wallet|balance|shift|market|production|settlement|combat|food|ration|citizen_economy|work_)\w*/i, 'no economy or combat code is touched');
  assert.match((await read(r, 'kai')).devotion.explanation, /never changes wages, production, prices or combat/);
});

test('GETs stay read-only: faith, news and the citizen read write nothing', async t => {
  const { r, nowS } = await setup(t);
  await hold(r, 'kai'); assert.equal((await underground(r, 'kai')).status, 200);
  const d = dueDay('stonehearth', undergroundGameDay(nowS()) + 1); r.setNow(d * DAY * 1000 + 5000);
  const writes = await writesDuring(r, async () => { await r.call('faith', 'kai'); await r.call('news', 'kai'); });
  assert.deepEqual(writes, [], 'GET faith and GET news never write, even on a game day that would roll a discovery');
});

test('Devotion hits never push Devotion below zero', async t => {
  const { r } = await setup(t); const faith = await r.importModule('lib/faith.ts');
  assert.equal(faith.devotionFromEvents([{ day: 5, amount: 3 }, { day: 5, amount: -5 }], 5), 0);
  assert.equal(faith.devotionFromEvents([{ day: 1, amount: 3 }, { day: 2, amount: 3 }, { day: 3, amount: -5 }], 3), 1);
  assert.equal(faith.devotionFromEvents([{ day: 1, amount: 3 }], 1), 3, 'plain worship is unchanged');
});

test('the unwired-copy rule still holds: app/ never imports the underground copy, the server sends the strings', async () => {
  const walk = async dir => (await readdir(new URL(`../${dir}/`, import.meta.url), { withFileTypes: true })).flatMap(e => e.isDirectory() ? [] : [`${dir}/${e.name}`]);
  for (const f of [...await walk('app'), ...await walk('components').catch(() => [])]) if (/\.(t|j)sx?$/.test(f)) assert.doesNotMatch(await readFile(new URL(`../${f}`, import.meta.url), 'utf8'), /korundUndergroundCopy|stateMediaRumors|UNDERGROUND_/, f);
});

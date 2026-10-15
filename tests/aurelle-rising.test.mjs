import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';
import { pledgeThreshold, risingReady, risingSucceeds, unrestSustainedSeconds, risingConfig, claimants, validPledgeCommand } from '../lib/aurelle-rising-rules.ts';
import { postgresMigrations, isDestructive, transactionProblem } from '../scripts/postgres-migrations.mjs';

const backend = process.env.HARIMU_TEST_STORAGE === 'postgres' ? 'postgres' : 'd1';
const H = 3600;

test('#71 thresholds: just below and just above 15% of weekly humans and 48 hours of Unrest ≥ 60', () => {
  assert.equal(pledgeThreshold(0), null); assert.equal(pledgeThreshold(20), 3); assert.equal(pledgeThreshold(100), 15); assert.equal(pledgeThreshold(7), 2);
  const ok = { weeklyHumans: 100, pledges: 15, sustainedSeconds: 48 * H };
  assert.equal(risingReady(ok), true, 'exactly 15% and exactly 48h');
  assert.equal(risingReady({ ...ok, pledges: 14 }), false, '14% is below');
  assert.equal(risingReady({ ...ok, pledges: 16 }), true);
  assert.equal(risingReady({ ...ok, sustainedSeconds: 48 * H - 1 }), false, 'one second short of 48h');
  assert.equal(risingReady({ ...ok, sustainedSeconds: 48 * H + 1 }), true);
  assert.equal(risingReady({ ...ok, weeklyHumans: 0, pledges: 5 }), false, 'no verified weekly population');
  const now = 1_000_000;
  const scores = u => u.map((unrest, i) => ({ scheduledAt: now - i * 2 * H, unrest })); // newest first
  assert.equal(unrestSustainedSeconds(scores([70, 65, 60, 59, 80]), now), 4 * H, 'run breaks at the first score below 60');
  assert.equal(unrestSustainedSeconds(scores([59, 90]), now), 0, 'latest below threshold');
  assert.equal(risingSucceeds({ pledges: 15, weeklyHumans: 100, stability: 49 }), true);
  assert.equal(risingSucceeds({ pledges: 15, weeklyHumans: 100, stability: 50 }), false, 'Stability holds the crown');
  assert.equal(risingSucceeds({ pledges: 14, weeklyHumans: 100, stability: 10 }), false, 'pledges fell below the share');
  assert.equal(claimants.length, 3); assert.equal(risingConfig.pledgeChangeSeconds, 7 * 86400);
  assert.ok(risingConfig.windowSeconds >= 24 * H && risingConfig.windowSeconds <= 48 * H);
  assert.ok(validPledgeCommand({ action: 'aurelle-pledge', requestId: randomUUID(), claimantId: 'vaelcourt' }));
  assert.ok(!validPledgeCommand({ action: 'aurelle-pledge', requestId: randomUUID(), claimantId: 'solenne' }));
  assert.ok(!validPledgeCommand({ action: 'aurelle-pledge', requestId: randomUUID(), claimantId: 'vaelcourt', weight: 9 }));
});

async function setup(t, flag = true) {
  const r = await localRuntime(); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_AURELLE_RISING_ENABLED', flag ? 'true' : undefined);
  await r.call('citizen', 'alice'); await r.call('citizen', 'bob');
  await r.db.prepare("UPDATE citizens SET nation_id='aurelle' WHERE clerk_user_id IN ('alice','bob')").run();
  const iso = new Date(r.now).toISOString();
  for (const [u, nation] of [['carol', 'aurelle'], ['dave', 'aurelle'], ['kim', 'kindle']])
    await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,?,?,6,0,'Good standing',?,?)").bind(u, nation, u, iso, iso).run();
  const tier1 = ['alice', 'bob', 'carol', 'kim'];
  const verify = () => { for (const u of tier1) r.setVerification(u, { userId: u, emailVerified: true, phoneVerified: true, phoneUnique: true, revoked: false, checkedAt: r.now, expiresAt: r.now + 60000 }); };
  const at = ms => { r.setNow(ms); verify(); };
  verify();
  const pledge = (u, claimantId, requestId = randomUUID()) => r.call('aurelle/rising', u, { action: 'aurelle-pledge', requestId, claimantId });
  const unrest = async (fromSeconds, toSeconds, value, stability = 30) => {
    const rows = []; for (let s = fromSeconds, i = 0; s <= toSeconds; s += 2 * H, i++) rows.push(r.db.prepare("INSERT INTO nation_stability_scores (nation_id,tick,scheduled_at,computed_at,stability,unrest,inputs_json,breakdown_json) VALUES ('aurelle',?,?,?,?,?,'{}','{}')").bind(100000 + Math.floor(s / (2 * H)), s, s, stability, value));
    await r.db.batch(rows);
  };
  const risings = async () => (await r.db.prepare('SELECT * FROM aurelle_risings ORDER BY opened_at').all()).results;
  const gazette = async () => (await r.db.prepare("SELECT headline FROM world_events WHERE kind='court-gazette' ORDER BY sort_order").all()).results.map(x => x.headline);
  return { r, at, pledge, unrest, risings, gazette };
}

test(`#71 ${backend}: only Tier-1 Aurelle citizens pledge; others see why; replay is idempotent; change once per 7 days; pledges private`, async t => {
  const { r, at, pledge } = await setup(t);
  const dave = await r.call('aurelle/rising', 'dave');
  assert.equal(dave.status, 200); assert.equal(dave.data.pledge.allowed, false); assert.match(dave.data.pledge.reason, /Tier-1/);
  assert.equal((await pledge('dave', 'vaelcourt')).status, 403, 'Tier 0 cannot pledge');
  const kim = await r.call('aurelle/rising', 'kim'); assert.match(kim.data.pledge.reason, /Only citizens of Aurelle/);
  assert.equal((await pledge('kim', 'vaelcourt')).status, 403, 'Kindle citizen cannot pledge');
  const id = randomUUID();
  const first = await pledge('alice', 'vaelcourt', id); assert.equal(first.status, 200);
  assert.equal((await pledge('alice', 'vaelcourt', id)).data.replayed, true);
  assert.equal((await pledge('bob', 'brightvane', id)).status, 409, 'request id bound to its first intent');
  const change = await pledge('alice', 'brightvane'); assert.equal(change.status, 409); assert.match(change.data.error, /changed your pledge recently/);
  at(r.now + 7 * 86400 * 1000 - 5000); assert.equal((await pledge('alice', 'brightvane')).status, 409, 'just under 7 days');
  at(r.now + 10000); assert.equal((await pledge('alice', 'brightvane')).status, 200, 'after 7 days');
  const bob = await r.call('aurelle/rising', 'bob');
  assert.equal(bob.data.myPledge, null, "another player's pledge is not shown as theirs");
  assert.equal(bob.data.claimants.find(c => c.id === 'brightvane').pledges, 1, 'counted in aggregate');
  assert.ok(!JSON.stringify(bob.data).includes('alice'), 'no pledger identity leaves the server');
  assert.equal(Number((await r.db.prepare("SELECT COUNT(*) AS n FROM aurelle_pledges").first()).n), 1);
});

test(`#71 ${backend}: a Rising opens once at the thresholds, resolves exactly once, crowns the claimant and writes the gazette`, async t => {
  const { r, at, pledge, unrest, risings, gazette } = await setup(t);
  const now = Math.floor(r.now / 1000);
  // Three verified Aurelle humans this week; one pledge meets ceil(3 × 15%) = 1.
  await r.call('aurelle/rising', 'bob'); for (const u of ['bob', 'carol']) await (await r.importModule('lib/collective-petitions.ts')).recordVerifiedHumanVisit(r.db, u, now, { aurelleRising: true });
  assert.equal((await pledge('alice', 'larkspire')).status, 200);
  await unrest(now - 47 * H, now, 70);
  await r.call('world', null);
  assert.equal((await risings()).length, 0, '47 hours of Unrest is not enough');
  await unrest(now - 49 * H, now - 48 * H, 70);
  await r.call('world', null); await r.call('world', null);
  const [rising] = await risings();
  assert.equal((await risings()).length, 1, 'opens once');
  assert.equal(rising.claimant_id, 'larkspire'); assert.equal(Number(rising.closes_at) - Number(rising.opened_at), risingConfig.windowSeconds);
  const view = await r.call('aurelle/rising', 'bob');
  assert.equal(view.data.rising.status, 'open'); assert.equal(view.data.rising.closesAt, Number(rising.closes_at), 'banner countdown deadline');
  assert.equal((await gazette()).length, 1); assert.match((await gazette())[0], /the Crown calls the realm to loyalty/);
  assert.match(JSON.stringify((await r.db.prepare("SELECT detail FROM world_events WHERE kind='court-gazette'").all()).results), /Lord Aubert of House Larkspire calls the commons to rise/, 'Content #269 copy, placeholders filled');
  at((Number(rising.closes_at) - 60) * 1000); await r.call('world', null);
  assert.equal((await risings())[0].resolved_at, null, 'still open before the window closes');
  at((Number(rising.closes_at) + 1) * 1000);
  await unrest(Number(rising.closes_at) - 2 * H, Number(rising.closes_at), 70, 30);
  await r.call('world', null); await r.call('world', null); await r.call('world', null);
  const done = (await risings())[0];
  assert.equal(done.outcome, 'succeeded'); assert.equal((await risings()).length, 1);
  assert.equal((await gazette()).length, 2, 'resolution logged exactly once'); assert.equal((await gazette())[0], 'Be it known: Lord Aubert of House Larkspire takes the Sky Throne. The Crown endures.', 'newest entry first, #269 copy');
  const government = await r.readGovernment('aurelle', 'bob');
  assert.equal(government.crown.name, 'Lord Aubert'); assert.equal(government.crown.house, 'House Larkspire');
  const after = await r.call('aurelle/rising', 'bob');
  assert.equal(after.data.crown.claimantId, 'larkspire'); assert.equal(after.data.claimants.find(c => c.id === 'larkspire').crowned, true);
  assert.equal((await pledge('carol', 'larkspire')).status, 409, 'the crowned claimant is no longer a claimant');
  const world = await r.call('world', null);
  assert.ok(JSON.stringify(world.data).includes('takes the Sky Throne'), 'court gazette entry is public');
});

test(`#71 ${backend}: a Rising fails when Stability holds; the crown stays; GET is read-only; flag off does nothing`, async t => {
  const { r, at, pledge, unrest, risings, gazette } = await setup(t);
  const now = Math.floor(r.now / 1000);
  assert.equal((await pledge('alice', 'vaelcourt')).status, 200);
  await unrest(now - 50 * H, now, 75, 30);
  const snapshot = async () => JSON.stringify(await Promise.all(['aurelle_risings', 'aurelle_pledges', 'world_events', 'world_ticks', 'civic_human_activity'].map(async x => (await r.db.prepare(`SELECT * FROM ${x}`).all()).results)));
  const before = await snapshot(); await r.call('aurelle/rising', 'alice'); await r.call('aurelle/rising', 'bob');
  assert.equal(await snapshot(), before, 'GET wrote nothing');
  await r.call('world', null);
  const [rising] = await risings(); assert.ok(rising);
  at((Number(rising.closes_at) + 1) * 1000);
  await unrest(Number(rising.closes_at), Number(rising.closes_at) + 2 * H, 75, 60);
  await r.call('world', null);
  assert.equal((await risings())[0].outcome, 'failed');
  assert.equal((await r.readGovernment('aurelle', 'bob')).crown, undefined, 'House Solenne keeps the crown');
  assert.match((await gazette())[0], /the Crown holds/, 'newest entry first');
  await r.call('world', null); assert.equal((await risings()).length, 1, 'cool-down: no immediate second Rising');

  const off = await setup(t, false);
  const closed = await off.r.call('aurelle/rising', 'alice'); assert.equal(closed.data.enabled, false);
  assert.equal((await off.pledge('alice', 'vaelcourt')).status, 403);
  const n = Math.floor(off.r.now / 1000);
  await off.r.db.prepare("INSERT INTO aurelle_pledges (clerk_user_id,claimant_id,request_id,pledged_at,policy) VALUES ('alice','vaelcourt','x',1,'tier1-human-v1')").run();
  await off.unrest(n - 50 * H, n, 90); await off.r.call('world', null);
  assert.equal((await off.risings()).length, 0, 'flag off: world tick opens nothing');
});

test(`#71 ${backend}: flag off records no Aurelle visits (citizen POST or direct); Kindle visits unchanged`, async t => {
  const { r } = await setup(t, false);
  const now = Math.floor(r.now / 1000);
  const visits = async () => (await r.db.prepare('SELECT clerk_user_id FROM civic_human_activity ORDER BY clerk_user_id').all()).results.map(x => x.clerk_user_id);
  const before = await visits();
  await r.call('citizen', 'alice', { action: 'korund-transfer-coupon', requestId: randomUUID(), coupon: 'clothing', to: 'bob' });
  await r.call('aurelle/rising', 'alice', { action: 'aurelle-pledge', requestId: randomUUID(), claimantId: 'vaelcourt' });
  const lib = await r.importModule('lib/collective-petitions.ts');
  for (const u of ['alice', 'bob', 'carol']) await lib.recordVerifiedHumanVisit(r.db, u, now);
  assert.deepEqual((await visits()).filter(u => ['alice', 'bob', 'carol', 'dave'].includes(u)), before.filter(u => ['alice', 'bob', 'carol', 'dave'].includes(u)), 'no Aurelle visit writes while the flag is off');
  await lib.recordVerifiedHumanVisit(r.db, 'kim', now);
  assert.ok((await visits()).includes('kim'), 'Kindle visits still recorded');
});

test('#71 migration 0023 matches the runtime schema, is additive, and passes the guard', async () => {
  const { aurelleRisingSchemas } = await import('../lib/aurelle-rising.ts').catch(() => ({}));
  const d1 = await readFile('drizzle/0023_aurelle_rising.sql', 'utf8'); const pg = await readFile('db/postgres/0023_aurelle_rising.sql', 'utf8');
  if (aurelleRisingSchemas) for (const s of aurelleRisingSchemas) assert.ok(d1.includes(s.replace(/\s*\n\s*/g, ' ').trim()), s.slice(0, 50));
  const m = postgresMigrations().find(x => x.file === '0023_aurelle_rising.sql');
  assert.ok(m); assert.deepEqual([...m.tables].sort(), ['aurelle_pledges', 'aurelle_risings']);
  assert.equal(postgresMigrations().filter(x => x.number === '0023').length, 1);
  assert.equal(postgresMigrations().filter(x => x.number === '0022').length, 1, '0022 is #86 (Kindle income tax)');
  assert.ok(!isDestructive(pg) && !isDestructive(d1)); assert.equal(transactionProblem(pg), null);
});

test('#71 claimant persona data fits Content #269 limits and fills every placeholder', async () => {
  const copy = await import('../lib/claimant-copy.ts');
  const fill = (text, c) => text.replaceAll('{claimant}', c.name).replaceAll('{house}', c.house).replaceAll('{motto}', c.motto);
  for (const c of claimants) {
    const label = fill(copy.pledgeCard.nameLine.text, c);
    assert.ok(label.length <= copy.CLAIMANT_LABEL_MAX, label);
    for (const s of copy.risingStageCopy) for (const k of ['notice', 'crownGazette', 'claimantVoice']) { const t = fill(s[k], c); assert.ok(!/\{(claimant|house|motto)\}/.test(t)); assert.ok(t.length <= copy.CLAIMANT_BODY_MAX, t); }
    assert.ok(`${c.grievance} ${c.programme}`.length <= copy.CLAIMANT_BODY_MAX);
  }
});

test('#71 UI: greyed-out pledge shows why; open Rising shows a banner with real and game countdown', async () => {
  const React = (await import('react')).default; const { renderToStaticMarkup } = await import('react-dom/server'); const ts = (await import('typescript')).default;
  const { createRequire } = await import('node:module'); const require = createRequire(import.meta.url);
  const compiled = ts.transpileModule(await readFile(new URL('../app/aurelle-rising.tsx', import.meta.url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  const fill = (text, c) => text.replaceAll('{claimant}', c.name).replaceAll('{house}', c.house).replaceAll('{motto}', c.motto);
  new Function('exports', 'require', compiled)(exports, name => name === '../lib/claimant-copy' ? require('../lib/claimant-copy.ts') : name === '../lib/palace-coup-copy' ? require('../lib/palace-coup-copy.ts') : name === '../lib/aurelle-rising' ? { fillClaimantCopy: fill }
    : name === '../lib/action-reasons' ? require('../lib/action-reasons.ts') : name === './game-timer' ? { GameTimer: ({ endsAt, label }) => React.createElement('span', { role: 'timer' }, `${label} ${endsAt} real · game`) }
    : name === './ai-disclosure' ? { AiBadge: () => React.createElement('span', null, 'AI') } : require(name));
  const base = { enabled: true, asOf: 1, crown: null, claimants: claimants.map(c => ({ ...c, pledges: 0, crowned: false })), weeklyHumans: 3, threshold: 1, unrest: 70, unrestSustainedSeconds: 3600,
    myPledge: null, pledge: { allowed: false, reason: 'Only Tier-1 verified citizens can pledge.' }, rising: null, config: risingConfig };
  const greyed = renderToStaticMarkup(React.createElement(exports.AurelleRisingView, { state: base, busy: false, error: '', onPledge: () => {} }));
  assert.match(greyed, /Only Tier-1 verified citizens can pledge\./); assert.match(greyed, /aria-disabled="true"|disabled=""/); assert.match(greyed, /aria-describedby="aurelle-pledge-reason"/);
  assert.match(greyed, /Lady Ysolde, claimant of House Vaelcourt/);
  const open = renderToStaticMarkup(React.createElement(exports.AurelleRisingView, { state: { ...base, pledge: { allowed: true, reason: null },
    rising: { id: 'r', claimantId: 'larkspire', claimantName: 'Lord Aubert', house: 'House Larkspire', openedAt: 1, closesAt: 200, status: 'open', resolvedAt: null } }, busy: false, error: '', onPledge: () => {} }));
  assert.match(open, /A Rising has begun\. The Crisis Window is open\./); assert.match(open, /role="timer"[^>]*>Crisis Window closes 200000 real · game/);
  assert.match(open, /Lord Aubert of House Larkspire calls the commons to rise\./);
});

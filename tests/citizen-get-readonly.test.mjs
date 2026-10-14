/** #205: GET /api/citizen performs no writes. World ticks, capacity recovery, the starter food grant, the preview
 *  election and the verified-human visit are projected on GET and written on the write paths, so players see the same
 *  values. Also covers the first-week latch hooks on the square and election POSTs. HARIMU_TEST_STORAGE=postgres
 *  runs the same suite on PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { localRuntime } from './helpers/local-runtime.mjs';

const writePattern = /^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i;
function recordWrites(r) {
  const writes = []; const prepare = r.db.prepare.bind(r.db); const batch = r.db.batch.bind(r.db);
  r.db.prepare = sql => { if (writePattern.test(sql)) writes.push(sql.replace(/\s+/g, ' ').slice(0, 90)); return prepare(sql); };
  r.db.batch = statements => { writes.push(`batch(${statements.length})`); return batch(statements); };
  return { writes, restore() { r.db.prepare = prepare; r.db.batch = batch; } };
}
const tierOne = (r, user) => ({ userId: user, emailVerified: true, phoneVerified: true, phoneUnique: true, revoked: false, checkedAt: r.now, expiresAt: r.now + 30 * 86400000 });
const visible = d => ({
  capacity: d.profile.capacity, inventory: d.economy.inventory, nextRecoveryAt: d.economy.nextRecoveryAt,
  starterFood: d.market.householdRecord?.starterFoodGranted, election: d.election && { status: d.election.status, opensAt: d.election.opensAt, closesAt: d.election.closesAt },
  weeklyHumans: d.collectivePetitions?.weeklyHumans, gameDay: d.simulation.clock.gameDay, epoch: d.simulation.clock.epochSeconds,
  ticksDue: d.simulation.clock.latestTick + d.simulation.clock.pendingTicks,
});

for (const accountElection of [false, true]) test(`GET /api/citizen makes no writes and matches what the old write-on-read GET showed (account election ${accountElection})`, async t => {
  const r = await localRuntime({ accountElection, ballotPrivacyReady: !accountElection }); t.after(() => r.close());
  // A fresh Kindle citizen with no clock, starter grant, election or visit rows yet; then time passes so ticks are due.
  const now = r.now; await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES ('carol','kindle','Carol',6,0,'Good standing',?,?)").bind(new Date(now).toISOString(), new Date(now).toISOString()).run();
  await r.db.prepare("UPDATE citizens SET capacity=6 WHERE clerk_user_id='alice'").run();
  r.setNow(now + 5 * 3600 * 1000);
  r.setVerification('carol', tierOne(r, 'carol')); r.setVerification('alice', tierOne(r, 'alice'));
  for (const user of ['carol', 'alice']) {
    const probe = recordWrites(r);
    const first = await r.call('citizen', user); const second = await r.call('citizen', user);
    probe.restore();
    assert.equal(first.status, 200); assert.deepEqual(probe.writes, [], `${user}: GET wrote ${JSON.stringify(probe.writes)}`);
    assert.deepEqual(visible(second.data), visible(first.data), 'GET is stable');
    // Now perform exactly what the old GET wrote, then read again: players must see the same values.
    const world = await r.importModule('lib/world-simulation.ts'); const economy = await r.importModule('lib/economy.ts');
    const elections = await r.importModule('lib/elections.ts'); const petitions = await r.importModule('lib/collective-petitions.ts');
    const preview = await r.importModule('lib/preview-election.ts');
    const sec = Math.floor(r.now / 1000);
    await world.advanceWorld(r.db, sec); await economy.recoverCapacity(r.db, user, new Date(r.now).toISOString(), economy.recoveryInterval(undefined)); await economy.readEconomy(r.db, user, economy.recoveryInterval(undefined));
    if (accountElection) await elections.openPreviewElection(preview.accountElectionDatabase(r.db), user, sec, true);
    if (first.data.verification.countedActionsEligible) { await petitions.recordVerifiedHumanVisit(r.db, user, sec); await elections.openPreviewElection(r.db, user, sec); }
    const legacy = await r.call('citizen', user);
    if (user === 'alice' && !accountElection) assert.equal(first.data.verification.countedActionsEligible, true, 'the verified path is exercised');
    assert.deepEqual(visible(first.data), visible(legacy.data), `${user}: read-only GET shows what the write-on-read GET showed`);
  }
});

test('write paths now record the starter grant, capacity clock, visit and election that GET no longer writes', async t => {
  const r = await localRuntime({ ballotPrivacyReady: true }); t.after(() => r.close());
  r.setVerification('alice', tierOne(r, 'alice'));
  const count = async (sql) => Number((await r.db.prepare(sql).first()).n);
  assert.equal((await r.call('citizen', 'alice')).status, 200);
  assert.equal(await count("SELECT COUNT(*) AS n FROM civic_human_activity WHERE clerk_user_id='alice'"), 0, 'GET records no visit');
  const res = await r.call('citizen', 'alice', { action: 'first-week-complete', goalId: 'kindle-1-shift', requestId: randomUUID() });
  assert.ok(res.status === 200 || res.status === 403 || res.status === 400);
  // Any successful write records them; use a plan save if the goal was not accepted.
  if (res.status !== 200) assert.equal((await r.call('citizen', 'alice', { action: 'save-plan', horizon: 'today', note: '' })).status, 200);
  assert.equal(await count("SELECT COUNT(*) AS n FROM starter_food_grants WHERE clerk_user_id='alice'"), 1);
  assert.equal(await count("SELECT COUNT(*) AS n FROM capacity_clocks WHERE clerk_user_id='alice'"), 1);
  assert.equal(await count("SELECT COUNT(*) AS n FROM civic_human_activity WHERE clerk_user_id='alice'"), 1);
  assert.equal(await count('SELECT COUNT(*) AS n FROM civic_elections'), 1);
});

test('first-week latch hooks: square POST and election POST latch their goals', async t => {
  const r = await localRuntime({ accountElection: true }); t.after(() => r.close());
  const created = Date.parse((await r.db.prepare("SELECT created_at FROM citizens WHERE clerk_user_id='alice'").first()).created_at);
  const goals = async () => (await r.db.prepare("SELECT goal_id,source FROM citizen_first_week_goals WHERE clerk_user_id='alice'").all()).results.map(x => `${x.goal_id}:${x.source}`);
  r.setNow(created + (2 * 86400 + 600) * 1000); // arc day 3
  await r.call('citizen', 'alice');
  const post = await r.call('square', 'alice', { action: 'post', expectedNationId: 'kindle', id: randomUUID(), text: 'Plain talk from day three' });
  assert.equal(post.status, 200, JSON.stringify(post.data));
  assert.ok((await goals()).includes('kindle-3-square:ledger'), 'square POST latched kindle-3-square');
  r.setNow(created + (4 * 86400 + 600) * 1000); // arc day 5
  const open = await r.call('election', 'alice'); assert.equal(open.status, 200, JSON.stringify(open.data));
  const vote = await r.call('election', 'alice', { action: 'vote', electionId: open.data.id, requestId: randomUUID(), ranking: ['ines-varro', 'tobin-achterberg', 'mara-quell'] });
  assert.equal(vote.status, 200, JSON.stringify(vote.data));
  assert.ok((await goals()).includes('kindle-5-ballot:ledger'), 'election POST latched kindle-5-ballot');
  // A rejected POST latches nothing new.
  const before = (await goals()).length;
  assert.notEqual((await r.call('square', 'alice', { action: 'post', expectedNationId: 'kindle', id: 'bad', text: '' })).status, 200);
  assert.equal((await goals()).length, before);
});

test('a petition filed on a past day is reviewed on GET without writes; the next POST latches the same review (QA1 on #217)', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  r.setVerification('alice', tierOne(r, 'alice'));
  const filed = await r.call('citizen', 'alice', { action: 'government-petition', topic: 'infrastructure', requestId: randomUUID() });
  assert.equal(filed.status, 200, JSON.stringify(filed.data));
  r.setNow(Math.floor(r.now / 86400000) * 86400000 + 86400000 + 3600000); // next UTC day
  r.setVerification('alice', tierOne(r, 'alice'));
  const probe = recordWrites(r);
  const get = await r.call('citizen', 'alice');
  probe.restore();
  assert.equal(get.status, 200); assert.deepEqual(probe.writes, [], `GET wrote ${JSON.stringify(probe.writes)}`);
  const reviews = async () => Number((await r.db.prepare('SELECT COUNT(*) AS n FROM government_reviews').first()).n);
  const resolutions = async () => Number((await r.db.prepare('SELECT COUNT(*) AS n FROM government_petition_resolutions').first()).n);
  assert.equal(await reviews(), 0); assert.equal(await resolutions(), 0);
  const projected = get.data.government;
  assert.equal(projected.petitions[0].status, 'accepted'); assert.ok(projected.review, 'projected review is shown');
  // A write path latches the review; GET then shows the same decision from the persisted row.
  assert.equal((await r.call('citizen', 'alice', { action: 'commit-work', workOrderId: 'harvest' })).status, 200);
  assert.equal(await reviews(), 1); assert.equal(await resolutions(), 1);
  const after = (await r.call('citizen', 'alice')).data.government;
  assert.equal(after.petitions[0].status, projected.petitions[0].status);
  assert.equal(after.decision?.topic, projected.decision?.topic);
  assert.equal(after.review.periodStart, projected.review.periodStart); assert.equal(after.review.petitionCount, projected.review.petitionCount);
});

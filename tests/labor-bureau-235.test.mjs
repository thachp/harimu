/** #235 Korund Labor Bureau: 3 job preferences, AI assignment (skills, Standing, quota gaps), 30-day reassignment, flag off by default. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';
import { assignJob, validPreferences, nextRequestAt, bureauJobs, reassignmentSeconds, fallbackJobId, quotaGap } from '../lib/labor-bureau-rules.ts';

const FOOD = 'korund-food-production', QUARRY = 'korund-quarry-gang', FOUNDRY = 'korund-foundry-hand', RAIL = 'korund-rail-crew', CLERK = 'korund-plan-clerk';
const input = (preferences, extra = {}) => ({ preferences, shifts: 0, standing: 'Good standing', filled: {}, ...extra });
async function bureau(t, on = true) {
  const r = await localRuntime(); t.after(() => r.close());
  await r.db.prepare("UPDATE citizens SET nation_id='korund'").run(); await r.call('world', null);
  r.setFixtureEnv('HARIMU_LABOR_BUREAU_ENABLED', on ? 'true' : undefined);
  return r;
}
const prefs = (r, user, preferences) => r.call('citizen', user, { action: 'korund-set-preferences', requestId: randomUUID(), preferences });
const assign = (r, user, requestId = randomUUID()) => r.call('citizen', user, { action: 'korund-request-assignment', requestId });
async function shift(r, user) {
  const id = randomUUID(); assert.equal((await r.call('citizen', user, { action: 'korund-start-work', requestId: id })).status, 200);
  r.setNow(r.now + 7200 * 1000); assert.equal((await r.call('citizen', user, { action: 'korund-claim-work', shiftId: id })).status, 200);
}

test('rule: preference order wins when skills, Standing and seats allow; outcome and reasons are explainable', () => {
  const first = assignJob(input([FOOD, QUARRY, FOUNDRY], { shifts: 6 }));
  assert.equal(first.jobId, FOOD); assert.equal(first.outcome, 'first-choice'); assert.ok(first.reasons.includes('listed-first') && first.reasons.includes('standing-good') && first.reasons.includes('open-seats'));
  const lower = assignJob(input([CLERK, RAIL, QUARRY], { shifts: 1 })); // clerk and rail need more shifts
  assert.equal(lower.jobId, QUARRY); assert.equal(lower.outcome, 'lower-choice'); assert.ok(lower.reasons.includes('listed-lower'));
});
test('rule: skills gate a post (shift experience) and raise the utility once met', () => {
  assert.equal(assignJob(input([FOUNDRY, RAIL, CLERK], { shifts: 2 })).jobId, FOOD, 'nothing listed is open to a beginner: the plan places them');
  assert.equal(assignJob(input([FOUNDRY, RAIL, CLERK], { shifts: 3 })).jobId, FOUNDRY);
  assert.ok(assignJob(input([FOUNDRY, RAIL, CLERK], { shifts: 3 })).reasons.includes('skills-meet'));
  assert.ok(assignJob(input([FOUNDRY, QUARRY, FOOD], { shifts: 10 })).utility > assignJob(input([FOUNDRY, QUARRY, FOOD], { shifts: 3 })).utility);
});
test('rule: Standing gates the clerk post and adds utility', () => {
  assert.equal(assignJob(input([CLERK, RAIL, FOUNDRY], { shifts: 9, standing: 'Good standing' })).jobId, CLERK);
  const poor = assignJob(input([CLERK, RAIL, FOUNDRY], { shifts: 9, standing: 'Under review' }));
  assert.equal(poor.jobId, RAIL); assert.ok(!poor.reasons.includes('standing-good'));
  assert.ok(assignJob(input([RAIL, FOUNDRY, FOOD], { shifts: 9 })).utility > assignJob(input([RAIL, FOUNDRY, FOOD], { shifts: 9, standing: 'Under review' })).utility);
});
test('rule: quota gaps: a full post is skipped, and a post outside the list is chosen when the plan needs it', () => {
  const clerkSeats = bureauJobs.find(j => j.id === CLERK).seats;
  assert.equal(quotaGap(bureauJobs.find(j => j.id === CLERK), { [CLERK]: clerkSeats }), 0);
  assert.equal(assignJob(input([CLERK, RAIL, FOUNDRY], { shifts: 9, filled: { [CLERK]: clerkSeats } })).jobId, RAIL, 'full clerk post skipped');
  const quota = assignJob(input([QUARRY, FOUNDRY, RAIL], { shifts: 1, filled: { [QUARRY]: 5 } })); // only the brigade is open to a 1-shift citizen
  assert.equal(quota.jobId, FOOD); assert.equal(quota.outcome, 'quota-posting'); assert.ok(quota.reasons.includes('not-listed'));
  const everythingFull = Object.fromEntries(bureauJobs.map(j => [j.id, j.seats]));
  const fallback = assignJob(input([RAIL, FOUNDRY, QUARRY], { shifts: 9, filled: everythingFull }));
  assert.equal(fallback.jobId, fallbackJobId); assert.deepEqual(fallback.reasons, ['fallback']);
  assert.deepEqual(assignJob(input([QUARRY, FOUNDRY, RAIL], { shifts: 3 })), assignJob(input([QUARRY, FOUNDRY, RAIL], { shifts: 3 })));
});
test('rule: preferences must be exactly three distinct known jobs; the 30-day window is 30 real days', () => {
  assert.deepEqual(validPreferences([FOOD, QUARRY, FOUNDRY]), [FOOD, QUARRY, FOUNDRY]);
  for (const bad of [[FOOD, QUARRY], [FOOD, FOOD, QUARRY], [FOOD, QUARRY, 'nope'], [FOOD, QUARRY, FOUNDRY, RAIL], 'x', null, [FOOD, QUARRY, 7]]) assert.equal(validPreferences(bad), null, JSON.stringify(bad));
  assert.equal(reassignmentSeconds, 30 * 86400);
  assert.equal(nextRequestAt(null, 1000), null); assert.equal(nextRequestAt(1000, 1000 + reassignmentSeconds - 1), 1000 + reassignmentSeconds); assert.equal(nextRequestAt(1000, 1000 + reassignmentSeconds), null);
});

test('a Korund citizen files 3 preferences; invalid lists are refused; filing replaces the previous list', async t => {
  const r = await bureau(t);
  const empty = (await r.call('citizen', 'alice')).data.korundPlan.bureau;
  assert.equal(empty.preferences, null); assert.equal(empty.assignment, null); assert.equal(empty.canRequest, false);
  assert.deepEqual(empty.jobs.map(j => j.id), bureauJobs.map(j => j.id));
  for (const bad of [[FOOD, QUARRY], [FOOD, FOOD, QUARRY], [FOOD, QUARRY, 'nope']]) { const res = await prefs(r, 'alice', bad); assert.equal(res.status, 400); assert.equal(res.data.reason, 'bad_preferences'); }
  assert.equal((await r.call('citizen', 'alice', { action: 'korund-set-preferences', requestId: 'x', preferences: [FOOD, QUARRY, FOUNDRY] })).status, 400, 'bad request id');
  assert.equal((await prefs(r, 'alice', [QUARRY, FOUNDRY, FOOD])).status, 200);
  assert.deepEqual((await r.call('citizen', 'alice')).data.korundPlan.bureau.preferences, [QUARRY, FOUNDRY, FOOD]);
  assert.equal((await prefs(r, 'alice', [FOOD, RAIL, CLERK])).status, 200);
  assert.deepEqual((await r.call('citizen', 'alice')).data.korundPlan.bureau.preferences, [FOOD, RAIL, CLERK]);
  assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM korund_job_preferences').first()).n), 1);
  r.setFixtureEnv('HARIMU_LABOR_BUREAU_ENABLED', 'true');
  await r.db.prepare("UPDATE citizens SET nation_id='kindle' WHERE clerk_user_id='bob'").run();
  assert.equal((await prefs(r, 'bob', [FOOD, QUARRY, FOUNDRY])).status, 409, 'Korund citizenship required');
});

test('the AI Bureau assigns from skills, Standing and quota gaps; a replayed request id changes nothing', async t => {
  const r = await bureau(t);
  assert.equal((await assign(r, 'alice')).data.reason, 'no_preferences');
  await prefs(r, 'alice', [CLERK, RAIL, QUARRY]);
  const id = randomUUID(); const res = await assign(r, 'alice', id);
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const a = res.data.korundPlan.bureau.assignment;
  assert.equal(a.jobId, FOOD, 'no shifts yet: the posts listed need experience, the plan places the citizen in the brigade'); assert.equal(a.outcome, 'quota-posting'); assert.ok(a.reasons.includes('not-listed'));
  assert.equal((await assign(r, 'alice', id)).data.replayed, true);
  assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM korund_job_assignments').first()).n), 1);
  assert.equal((await assign(r, 'bob', id)).data.reason, 'request_reused', "another citizen cannot reuse alice's request id");
  await prefs(r, 'bob', [QUARRY, FOOD, FOUNDRY]);
  // Skills: after one settled shift the quarry post opens to bob.
  await shift(r, 'bob');
  const bob = await assign(r, 'bob'); assert.equal(bob.status, 200);
  assert.equal(bob.data.korundPlan.bureau.assignment.jobId, QUARRY); assert.equal(bob.data.korundPlan.bureau.assignment.outcome, 'first-choice');
  // Standing changes the answer for the same history.
  await r.db.prepare("UPDATE citizens SET standing='Under review' WHERE clerk_user_id='alice'").run();
  const info = (await r.call('citizen', 'alice')).data.korundPlan.bureau; assert.ok(info.jobs.find(j => j.id === QUARRY).filled >= 1, 'headcount counts current assignments');
});

test('reassignment: allowed once every 30 real days, enforced by the server', async t => {
  const r = await bureau(t);
  await prefs(r, 'alice', [FOOD, QUARRY, FOUNDRY]);
  const first = await assign(r, 'alice'); assert.equal(first.status, 200);
  const bureauView = first.data.korundPlan.bureau; assert.equal(bureauView.canRequest, false); assert.ok(bureauView.nextRequestAt);
  const assignedAt = Date.parse(bureauView.assignment.assignedAt);
  assert.equal(Date.parse(bureauView.nextRequestAt) - assignedAt, 30 * 86400 * 1000);
  const early = await assign(r, 'alice'); assert.equal(early.status, 409); assert.equal(early.data.reason, 'too_soon'); assert.equal(early.data.nextRequestAt, bureauView.nextRequestAt);
  r.setNow(assignedAt + (30 * 86400 - 1) * 1000); assert.equal((await assign(r, 'alice')).status, 409, 'one second early');
  await prefs(r, 'alice', [FOUNDRY, RAIL, CLERK]); // preferences can be updated meanwhile; they apply at the next assignment
  assert.equal((await r.call('citizen', 'alice')).data.korundPlan.bureau.assignment.jobId, FOOD, 'current assignment unchanged');
  r.setNow(assignedAt + 30 * 86400 * 1000);
  const again = await assign(r, 'alice'); assert.equal(again.status, 200, JSON.stringify(again.data));
  assert.equal(again.data.korundPlan.bureau.assignment.outcome, 'quota-posting'); assert.equal(again.data.korundPlan.bureau.nextRequestAt !== null, true);
  assert.equal(Number((await r.db.prepare("SELECT COUNT(*) AS n FROM korund_job_assignments WHERE clerk_user_id='alice'").first()).n), 2, 'history is kept');
  // Concurrent duplicate requests in the same window: exactly one assignment is recorded.
  const racing = await bureau(t); await prefs(racing, 'alice', [FOOD, QUARRY, FOUNDRY]);
  const both = await Promise.all([assign(racing, 'alice'), assign(racing, 'alice')]);
  assert.deepEqual(both.map(x => x.status).sort(), [200, 409]);
  assert.equal(Number((await racing.db.prepare('SELECT COUNT(*) AS n FROM korund_job_assignments').first()).n), 1);
});

test('flag off (shipped default): nothing changes: no bureau in the plan, actions refused, no rows written', async t => {
  const r = await bureau(t, false);
  const plan = (await r.call('citizen', 'alice')).data.korundPlan;
  assert.equal(plan.bureau, undefined); assert.equal(plan.available, true); assert.equal(plan.assignment.id, 'korund-food-production');
  for (const body of [{ action: 'korund-set-preferences', requestId: randomUUID(), preferences: [FOOD, QUARRY, FOUNDRY] }, { action: 'korund-request-assignment', requestId: randomUUID() }]) {
    const res = await r.call('citizen', 'alice', body); assert.equal(res.status, 403); assert.equal(res.data.reason, 'disabled'); assert.equal(res.data.korundPlan.bureau, undefined);
  }
  for (const table of ['korund_job_preferences', 'korund_job_assignments']) assert.equal(Number((await r.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n), 0);
  await shift(r, 'alice'); // existing Korund work is untouched
  assert.equal((await r.call('citizen', 'alice')).data.korundPlan.walletMinor, 800);
  const cfg = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.deepEqual([...cfg.matchAll(/"HARIMU_LABOR_BUREAU_ENABLED"\s*:\s*"([^"]*)"/g)].map(x => x[1]), ['false']);
});

test('assignment is recorded only: shift pay and the brigade job are unchanged by the Bureau', async t => {
  const r = await bureau(t);
  await prefs(r, 'alice', [QUARRY, FOUNDRY, RAIL]); await assign(r, 'alice');
  await shift(r, 'alice');
  const plan = (await r.call('citizen', 'alice')).data.korundPlan;
  assert.equal(plan.walletMinor, 800); assert.equal(plan.assignment.wageMinor, 800);
});

test('the panel shows the Bureau only when the server sends it, with placeholder copy that Content can swap', async () => {
  const panel = await readFile(new URL('../app/korund-plan-panel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /plan\.bureau \? <LaborBureau/); assert.match(panel, /bureauText\.fileButton/); assert.match(panel, /bureauText\.refusal/);
  const text = await readFile(new URL('../lib/labor-bureau-text.ts', import.meta.url), 'utf8');
  assert.match(text, /Content's strings \(#321/); assert.doesNotMatch(text, /30/, 'the 30-day rule is never written as a number in the copy');
});

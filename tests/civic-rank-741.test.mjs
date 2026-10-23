/** #741: Kindle civic rank ladder (docs §11.6): pure rules, read-only route (flag off: 404, no DB), /api/citizen gains one aggregate in its second wave, first-week kindle-7-rank. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { localRuntime } from './helpers/local-runtime.mjs';
import * as rules from '../lib/civic-rank-rules.ts';
const { civicLadders, civicRank, citizenRankShifts, civicInputsSql } = rules;

const at = (shifts, civicActs = 0, walletMinor = 0) => civicRank('kindle', { shifts, civicActs, walletMinor });
test('rules: the Kindle ladder, its [ASSUMPTION] thresholds in one place, and every boundary', () => {
  assert.deepEqual(civicLadders.kindle.map(s => s.rank), ['Resident', 'Citizen', 'Emberwarden', 'Leading Citizen']);
  assert.deepEqual(civicLadders.kindle.map(s => s.needs), [{ shifts: 0, civicActs: 0, walletMinor: 0 }, { shifts: 3, civicActs: 0, walletMinor: 0 }, { shifts: 10, civicActs: 2, walletMinor: 0 }, { shifts: 30, civicActs: 6, walletMinor: 50000 }]);
  assert.equal(at(2).rank, 'Resident'); assert.equal(at(3).rank, 'Citizen');
  assert.equal(at(10, 1).rank, 'Citizen'); assert.equal(at(9, 2).rank, 'Citizen'); assert.equal(at(10, 2).rank, 'Emberwarden');
  assert.equal(at(30, 6, 49999).rank, 'Emberwarden'); assert.equal(at(29, 6, 50000).rank, 'Emberwarden'); assert.equal(at(30, 5, 50000).rank, 'Emberwarden'); assert.equal(at(30, 6, 50000).rank, 'Leading Citizen');
  assert.equal(at(100, 0, 999999).rank, 'Citizen', 'steps are cumulative: no skipping a missing threshold');
  assert.deepEqual(at(4, 1, 120), { rank: 'Citizen', next: 'Emberwarden', progress: { have: { shifts: 4, civicActs: 1, walletMinor: 120 }, needs: { shifts: 10, civicActs: 2, walletMinor: 0 } } });
  assert.deepEqual(at(30, 6, 50000).next, null); assert.equal(at(30, 6, 50000).progress.needs, null);
  assert.equal(at(-5, -1, -9).rank, 'Resident', 'negative inputs clamp to 0');
  for (const nation of ['korund', 'aurelle', null, undefined]) assert.equal(civicRank(nation, { shifts: 99, civicActs: 99, walletMinor: 1e9 }), null, `${nation}: no ladder yet`);
  assert.deepEqual([rules.CITIZEN_MIN_SHIFTS, rules.EMBERWARDEN_MIN_SHIFTS, rules.EMBERWARDEN_MIN_CIVIC_ACTS, rules.LEADING_CITIZEN_MIN_SHIFTS, rules.LEADING_CITIZEN_MIN_CIVIC_ACTS, rules.LEADING_CITIZEN_MIN_WALLET_MINOR], [3, 10, 2, 30, 6, 50000], 'named threshold exports (ARC-approved on #778)');
  assert.equal(citizenRankShifts, 3); assert.deepEqual([civicLadders.kindle[1].needs.civicActs, civicLadders.kindle[1].needs.walletMinor], [0, 0], 'the first-week probe counts shifts only, so Citizen must need nothing else');
});

test('rank grants no gameplay power: only the rank modules, the citizen GET, the route and the card read it', () => {
  const files = []; const walk = d => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) && files.push(p); } };
  ['app', 'lib', 'worker'].forEach(walk);
  const readers = files.filter(f => /civic-rank(-rules)?'/.test(readFileSync(f, 'utf8'))).sort();
  assert.deepEqual(readers, ['app/api/citizen/civic-rank/route.ts', 'app/api/citizen/route.ts', 'app/civic-rank-card.tsx', 'app/page.tsx', 'lib/civic-rank.ts', 'lib/first-week-server.ts']);
});

async function spy(r, fn) { const prepare = r.db.prepare.bind(r.db), seen = { sql: [] }; r.db.prepare = q => { seen.sql.push(q); return prepare(q); }; try { seen.result = await fn(); } finally { r.db.prepare = prepare; } return seen; }
const iso = ms => new Date(ms).toISOString();
async function settled(r, user, n, beforeMs) {
  for (let i = 0; i < n; i++) await r.db.prepare("INSERT INTO work_shifts (id,clerk_user_id,work_order_id,order_name,output,capacity_spent,started_at,completes_at,claimed_at) VALUES (?,?,'harvest','Harvest','food',1,?,?,?)")
    .bind(`s741-${user}-${i}`, user, iso(beforeMs - 7200000), iso(beforeMs - 3600000), iso(beforeMs - 1000)).run();
}

for (const backend of ['sqlite', 'postgres']) {
  test(`GET /api/citizen/civic-rank (${backend}): flag off is 404 with no database read (spy); on: 401 signed out, Resident, then Citizen and Emberwarden from the records`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    await r.call('citizen', 'alice');
    for (const flag of [undefined, 'false']) {
      r.setFixtureEnv('HARIMU_CIVIC_RANK_ENABLED', flag);
      const off = await spy(r, async () => [await r.call('citizen/civic-rank', 'alice'), await r.call('citizen/civic-rank', null)]);
      assert.deepEqual(off.result.map(x => x.status), [404, 404]); assert.deepEqual(off.sql, [], 'flag off opens no database');
    }
    r.setFixtureEnv('HARIMU_CIVIC_RANK_ENABLED', 'true');
    assert.equal((await r.call('citizen/civic-rank', null)).status, 401);
    const first = await spy(r, () => r.call('citizen/civic-rank', 'alice'));
    assert.equal(first.result.status, 200); assert.ok(first.sql.length > 0, 'baseline: the same spy sees the reads'); assert.ok(first.sql.every(q => /^\s*SELECT/i.test(q)), 'read-only');
    assert.equal(first.result.data.civicRank.rank, 'Resident'); assert.equal(first.result.data.civicRank.next, 'Citizen');
    await settled(r, 'alice', 3, r.now);
    assert.equal((await r.call('citizen/civic-rank', 'alice')).data.civicRank.rank, 'Citizen');
    await r.call('citizen', 'bob');
    for (const id of ['e741a', 'e741b']) {
      await r.db.prepare("INSERT INTO civic_elections (id,nation_id,candidates_json,opens_at,closes_at) VALUES (?,'kindle',?,0,259200)").bind(id, JSON.stringify(['a', 'b', 'c'])).run();
      await r.db.prepare("INSERT INTO civic_voter_receipts (election_id,clerk_user_id,request_id,checked_at,ballot_written,policy) VALUES (?,?,?,0,1,'tier1-human-v1')").bind(id, 'alice', `rq-${id}`).run();
    }
    for (let i = 3; i < 10; i++) await r.db.prepare("INSERT INTO work_shifts (id,clerk_user_id,work_order_id,order_name,output,capacity_spent,started_at,completes_at,claimed_at) VALUES (?,'alice','harvest','Harvest','food',1,?,?,?)").bind(`s741-alice-${i}`, iso(r.now - 7200000), iso(r.now - 3600000), iso(r.now - 1000)).run();
    // #778 dedupe: re-signing / re-voting the same ballot must not add a civic act (rejected by the PK, and COUNT(DISTINCT) would collapse it anyway).
    await assert.rejects(r.db.prepare("INSERT INTO civic_voter_receipts (election_id,clerk_user_id,request_id,checked_at,ballot_written,policy) VALUES ('e741a','alice','rq-dup',0,1,'tier1-human-v1')").run());
    assert.match(civicInputsSql, /COUNT\(DISTINCT petition_id\)/); assert.equal(civicInputsSql.match(/COUNT\(DISTINCT election_id\)/g).length, 3, 'one act per ballot in each receipt table');
    const rank = (await r.call('citizen/civic-rank', 'alice')).data.civicRank;
    assert.deepEqual([rank.rank, rank.progress.have.shifts, rank.progress.have.civicActs], ['Emberwarden', 10, 2]);
    await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='bob'").run();
    assert.equal((await r.call('citizen/civic-rank', 'bob')).data.civicRank, null, 'no ladder outside Kindle');
  });

  test(`GET /api/citizen (${backend}): flag off adds nothing; on, Kindle gets civicRank from exactly one more (aggregate) query; Korund gets nothing`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    await r.call('citizen', 'alice'); await r.call('citizen', 'kim'); await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='kim'").run();
    r.setFixtureEnv('HARIMU_CIVIC_RANK_ENABLED', 'false');
    const off = await spy(r, () => r.call('citizen', 'alice'));
    assert.equal('civicRank' in off.result.data, false); assert.equal('civicRank' in off.result.data.flags, false);
    assert.equal(off.sql.filter(q => /civic_petition_signatures WHERE clerk_user_id=\?\)\+/.test(q)).length, 0, 'flag off: no rank read');
    r.setFixtureEnv('HARIMU_CIVIC_RANK_ENABLED', 'true');
    const on = await spy(r, () => r.call('citizen', 'alice'));
    assert.equal(on.sql.length, off.sql.length + 1, 'one extra statement, run in the second Promise.all wave with the election and first-week reads');
    assert.equal(on.result.data.civicRank.rank, 'Resident'); assert.equal(on.result.data.flags.civicRank, true);
    assert.equal(on.result.data.civicRank.progress.have.walletMinor, on.result.data.economy.walletMinor, 'the same wallet the citizen sees');
    const korund = await spy(r, () => r.call('citizen', 'kim'));
    assert.equal('civicRank' in korund.result.data, false); assert.equal(korund.sql.some(q => /primary_voter_receipts WHERE clerk_user_id/.test(q)), false);
  });

  test(`first week (${backend}): kindle-7-rank stays hidden and unlatched with the flag off; on, it latches once the rank is Citizen by day 7`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    await r.call('citizen', 'alice');
    const fw = await r.importModule('lib/first-week-server.ts');
    const enrolled = Date.parse((await r.db.prepare("SELECT created_at FROM citizens WHERE clerk_user_id='alice'").first()).created_at), day7 = Math.floor(enrolled / 1000) + 6 * 86400 + 60;
    await settled(r, 'alice', 3, enrolled + 6 * 86400000 + 30000);
    assert.equal((await fw.latchFirstWeekGoals(r.db, 'alice', day7)).includes('kindle-7-rank'), false, 'flag off (default): the goal is not available');
    assert.equal(fw.checkFirstWeekGoal('kindle', iso(enrolled), 'kindle-7-rank', day7).ok, false);
    assert.ok((await fw.latchFirstWeekGoals(r.db, 'alice', day7, fw.availableWith(true))).includes('kindle-7-rank'));
    assert.equal(fw.checkFirstWeekGoal('kindle', iso(enrolled), 'kindle-7-rank', day7, fw.availableWith(true)).ok, true);
    assert.deepEqual(fw.availableWith(false), fw.firstWeekAvailable);
  });
}

// #778 QA3 mutants M8, M10, M11, M12/M13, M14, M15: counting and first-week paths through the real SQL and routes.
const shift = (r, id, user, claimedMs) => r.db.prepare("INSERT INTO work_shifts (id,clerk_user_id,work_order_id,order_name,output,capacity_spent,started_at,completes_at,claimed_at) VALUES (?,?,'harvest','Harvest','food',1,?,?,?)")
  .bind(id, user, iso(claimedMs - 7200000), iso(claimedMs - 3600000), claimedMs === null ? null : iso(claimedMs)).run();
async function receipt(r, id, written) {
  await r.db.prepare("INSERT INTO civic_elections (id,nation_id,candidates_json,opens_at,closes_at) VALUES (?,'kindle',?,0,259200)").bind(id, JSON.stringify(['a', 'b', 'c'])).run();
  await r.db.prepare("INSERT INTO civic_voter_receipts (election_id,clerk_user_id,request_id,checked_at,ballot_written,policy) VALUES (?,?,?,0,?,'tier1-human-v1')").bind(id, 'alice', `rq-${id}`, written).run();
}
for (const backend of ['sqlite', 'postgres']) {
  test(`civic inputs (${backend}): unclaimed shifts and unwritten ballots do not count; Leading Citizen needs the 500 SPK wallet (499 fails)`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    await r.call('citizen', 'alice'); r.setFixtureEnv('HARIMU_CIVIC_RANK_ENABLED', 'true');
    const get = async () => (await r.call('citizen/civic-rank', 'alice')).data.civicRank;
    for (let i = 0; i < 2; i++) await shift(r, `m-${i}`, 'alice', r.now - 1000);
    await shift(r, 'm-open', 'alice', null);
    await receipt(r, 'm-e0', 0);
    let rank = await get();
    assert.deepEqual([rank.rank, rank.progress.have.shifts, rank.progress.have.civicActs], ['Resident', 2, 0], 'M10: unclaimed shift; M11: ballot_written=0');
    for (let i = 2; i < 30; i++) await shift(r, `m-${i}`, 'alice', r.now - 1000);
    for (let i = 1; i <= 6; i++) await receipt(r, `m-e${i}`, 1);
    const base = (await get()).progress.have.walletMinor;
    const pay = (id, minor) => r.db.prepare("INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES (?,'alice','sell','fixture-cash',-1,?,1)").bind(id, minor).run();
    await pay('m-pay1', 49900 - base);
    rank = await get(); assert.deepEqual([rank.rank, rank.progress.have.walletMinor, rank.progress.have.civicActs], ['Emberwarden', 49900, 6], 'M15: 499 SPK is short');
    await pay('m-pay2', 100);
    rank = await get(); assert.deepEqual([rank.rank, rank.progress.have.walletMinor], ['Leading Citizen', 50000], 'M15: 500 SPK reaches Leading Citizen through the DB');
  });

  test(`kindle-7-rank (${backend}): 2 shifts or a 3rd after day 7 do not latch; flag off the POST is 403 and a write does not latch; flag on both work`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    await r.call('citizen', 'alice');
    const fw = await r.importModule('lib/first-week-server.ts'), on = fw.availableWith(true);
    const enrolled = Date.parse((await r.db.prepare("SELECT created_at FROM citizens WHERE clerk_user_id='alice'").first()).created_at);
    const day7ms = enrolled + 6 * 86400000 + 60000, day7 = Math.floor(day7ms / 1000);
    await shift(r, 'd-0', 'alice', day7ms - 30000); await shift(r, 'd-1', 'alice', day7ms - 20000);
    assert.equal((await fw.latchFirstWeekGoals(r.db, 'alice', day7, on)).includes('kindle-7-rank'), false, 'M8: 2 shifts are not Citizen');
    await shift(r, 'd-late', 'alice', enrolled + 7 * 86400000 + 60000);
    assert.equal((await fw.latchFirstWeekGoals(r.db, 'alice', day7 + 2 * 86400, on)).includes('kindle-7-rank'), false, 'M14: a 3rd shift after day 7 ends does not count');
    await shift(r, 'd-2', 'alice', day7ms - 10000);
    const latched = async () => !!(await r.db.prepare("SELECT 1 AS x FROM citizen_first_week_goals WHERE clerk_user_id='alice' AND goal_id='kindle-7-rank'").first());
    r.setNow(day7ms + 1000); r.setFixtureEnv('HARIMU_CIVIC_RANK_ENABLED', 'false');
    assert.equal((await r.call('citizen', 'alice', { action: 'first-week-complete', goalId: 'kindle-7-rank', requestId: 'req-741-off1' })).status, 403, 'M12: flag off refuses the goal');
    const started = await r.call('citizen', 'alice', { action: 'commit-work', workOrderId: 'harvest' }); assert.equal(started.status, 200, JSON.stringify(started.data));
    assert.equal(await latched(), false, 'M13: flag off, a write does not latch kindle-7-rank');
    r.setFixtureEnv('HARIMU_CIVIC_RANK_ENABLED', 'true');
    const open = started.data.shifts.find(s => !s.claimedAt); r.setNow(Date.parse(open.completesAt) + 1000);
    assert.equal((await r.call('citizen', 'alice', { action: 'claim-work', shiftId: open.id })).status, 200);
    assert.equal(await latched(), true, 'flag on: the write latches it');
    r.setNow(day7ms + 2000);
    assert.equal((await r.call('citizen', 'alice', { action: 'first-week-complete', goalId: 'kindle-7-rank', requestId: 'req-741-on01' })).status, 200, 'flag on: the POST is accepted');
  });
}

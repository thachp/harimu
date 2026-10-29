/** #983: after a #967 ration-cut Stability step, the next met week adds one recovery step of the same size.
 *  [ASSUMPTION] one step, once, the week after the cut week if that cut week's own output met the quota. A later met week does not step up again.
 *  Behind HARIMU_KORUND_STABILITY_RECOVERY_ENABLED, which also needs the #967 flags. Either flag off leaves the score, the notice and the recovery read unchanged. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';
import { computeStability, korundRationStabilityStep } from '../lib/stability.ts';
import { korundRationRecoveryCopy, korundStabilityRecoveryCount, korundStabilityRecoveryEnabled, korundWeekSeconds } from '../lib/korund-coupons.ts';

const sum = terms => terms.reduce((t, x) => t + x.points, 0);
const base = { citizens: 4, fed: 2, worked: 2, promisesKept: 0, promisesBroken: 0, petitionBacklog: 0 };
const flags = { HARIMU_KORUND_RATION_CUT_ENABLED: 'true', HARIMU_KORUND_RATION_STABILITY_ENABLED: 'true', HARIMU_KORUND_STABILITY_RECOVERY_ENABLED: 'true' };
const isRecoveryQuery = sql => /AS closed_food/.test(sql) && /prior_food/.test(sql);
const weekOf = (epoch, at) => Math.floor(Math.max(0, at - epoch) / korundWeekSeconds) + 1;
const recoveryTerm = row => row.breakdown.stability.find(x => x.input === 'rationRecovery');

test('pure: one step, once; a later met week and an unmet week do not; the ceiling stays 100', () => {
  assert.equal(korundStabilityRecoveryEnabled(flags), true);
  for (const env of [null, {}, { ...flags, HARIMU_KORUND_STABILITY_RECOVERY_ENABLED: undefined }, { ...flags, HARIMU_KORUND_RATION_STABILITY_ENABLED: undefined }, { ...flags, HARIMU_KORUND_RATION_CUT_ENABLED: undefined }, { ...flags, HARIMU_KORUND_STABILITY_RECOVERY_ENABLED: 'TRUE' }]) assert.equal(korundStabilityRecoveryEnabled(env), false);
  assert.equal(korundStabilityRecoveryCount(2, 40, 0), 0, 'the cut week itself is not the recovery');
  assert.equal(korundStabilityRecoveryCount(3, 40, 20), 1, 'met week after a shortfall');
  assert.equal(korundStabilityRecoveryCount(3, 44, 20), 1, 'over quota still meets');
  assert.equal(korundStabilityRecoveryCount(3, 40, 20), korundStabilityRecoveryCount(3, 40, 20), 'same food, still one city');
  assert.equal(korundStabilityRecoveryCount(3, 36, 20), 0, 'unmet week after a cut');
  assert.equal(korundStabilityRecoveryCount(3, 40, 40), 0, 'met week that did not follow a cut');
  assert.equal(korundStabilityRecoveryCount(4, 40, 40), 0, 'second met week');
  const off = computeStability(base);
  assert.ok(!off.breakdown.stability.some(x => x.input === 'rationRecovery'));
  const on = computeStability({ ...base, rationRecovery: 1 }), term = recoveryTerm(on);
  assert.equal(term.points, korundRationStabilityStep);
  assert.equal(term.detail, korundRationRecoveryCopy.notice);
  assert.equal(on.stability, off.stability + korundRationStabilityStep);
  assert.equal(sum(on.breakdown.stability), on.stability);
  assert.ok(on.stability <= 100);
  assert.equal(computeStability({ ...base, rationRecovery: 1 }).stability, on.stability, 'same inputs, still one step');
  assert.ok(!computeStability({ ...base, rationRecovery: 0 }).breakdown.stability.some(x => x.input === 'rationRecovery'));
  assert.ok(!computeStability({ ...base, rationCuts: 1 }).breakdown.stability.some(x => x.input === 'rationRecovery'), 'a cut week has no recovery term');
  const high = { citizens: 10, fed: 10, worked: 10, promisesKept: 10, promisesBroken: 0, petitionBacklog: 0, festivalHoliday: 1, harmony: 100 };
  const plain = computeStability(high), capped = computeStability({ ...high, rationRecovery: 20 });
  assert.equal(capped.stability, 100);
  assert.equal(recoveryTerm(capped).points, 100 - plain.stability);
  assert.ok(recoveryTerm(capped).points < 20 * korundRationStabilityStep);
  assert.equal(sum(capped.breakdown.stability), capped.stability);
  assert.equal(computeStability({ ...high, rationRecovery: 1 }).stability, plain.stability + korundRationStabilityStep, 'one city still fits under 100');
});

test('copy: one notice line, mirrored onto the plan panel only when recovery applies', async () => {
  assert.equal(korundRationRecoveryCopy.notice, 'Stability recovers with the plan.');
  const src = await readFile(new URL('../lib/ration-copy.ts', import.meta.url), 'utf8');
  assert.ok(src.includes(`notice:L('${korundRationRecoveryCopy.notice}')`));
  assert.match(src, /\[ASSUMPTION\]/);
  const panel = await readFile(new URL('../app/korund-plan-panel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /plan\.rationRecovery &&/);
  assert.match(panel, /korundRationRecoveryCopy\.notice/);
  assert.doesNotMatch(panel, /ration-copy/);
});

async function setup(t, { stability = true, recovery = true } = {}) {
  const r = await localRuntime(); t.after(() => r.close());
  await r.db.prepare("UPDATE citizens SET nation_id='korund'").run();
  await r.call('world', null);
  r.setFixtureEnv('HARIMU_KORUND_RATION_CUT_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_KORUND_RATION_STABILITY_ENABLED', stability ? 'true' : undefined);
  r.setFixtureEnv('HARIMU_KORUND_STABILITY_RECOVERY_ENABLED', recovery ? 'true' : undefined);
  const epoch = Number((await r.db.prepare("SELECT epoch_seconds FROM world_clock WHERE id='main'").first()).epoch_seconds);
  return { r, epoch };
}
async function settle(r, at, shifts) {
  for (let i = 0; i < shifts; i++) {
    const id = randomUUID(), iso = new Date((at + i) * 1000).toISOString();
    await r.db.prepare('INSERT INTO work_shifts VALUES (?,?,?,?,?,?,?,?,?)').bind(id, 'bob', 'aurelle-food-estate', 'Korund fixture', '4 state food', 4, iso, iso, iso).run();
    await r.db.prepare('INSERT INTO korund_settlements(shift_id,clerk_user_id,wage_minor,food_output,settled_at) VALUES (?,?,800,4,?)').bind(id, 'bob', at + i).run();
  }
}
const plan = async r => (await r.call('citizen', 'alice')).data.korundPlan;
async function advanceTo(r, epoch, week) {
  const target = epoch + (week - 1) * korundWeekSeconds;
  r.setNow((target + 100) * 1000);
  for (let i = 0; i < 12; i++) {
    await r.call('world', null);
    const row = await r.db.prepare('SELECT COALESCE(MAX(scheduled_at),0) AS at FROM world_ticks').first();
    if (Number(row.at) >= target) return;
  }
  throw new Error(`did not reach week ${week}`);
}
async function spyAdvance(r, epoch, week) {
  const prepare = r.db.prepare.bind(r.db), seen = [];
  r.db.prepare = sql => { seen.push(sql); return prepare(sql); };
  try { await advanceTo(r, epoch, week); } finally { r.db.prepare = prepare; }
  return seen;
}
async function rows(r) {
  const all = await r.db.prepare("SELECT nation_id, tick, scheduled_at, stability, inputs_json, breakdown_json FROM nation_stability_scores ORDER BY tick").all();
  return all.results.map(row => ({ nation: row.nation_id, tick: Number(row.tick), at: Number(row.scheduled_at), stability: Number(row.stability), inputs: JSON.parse(row.inputs_json), breakdown: JSON.parse(row.breakdown_json) }));
}
const korundIn = (all, epoch, week) => all.filter(row => row.nation === 'korund' && weekOf(epoch, row.at) === week);

test('cut week steps down; the next met week recovers once; the second met week does not', async t => {
  const { r, epoch } = await setup(t);
  await settle(r, epoch + 100, 5); // week 1: 20 of 40
  await advanceTo(r, epoch, 2);
  for (const row of korundIn(await rows(r), epoch, 2)) {
    assert.equal(row.inputs.rationCuts, 1, 'cut week');
    assert.equal(row.inputs.rationRecovery, undefined);
    assert.equal(row.breakdown.stability.find(x => x.input === 'ration').points, -korundRationStabilityStep);
    assert.equal(recoveryTerm(row), undefined);
    assert.equal(sum(row.breakdown.stability), row.stability);
  }
  assert.equal((await plan(r)).rationRecovery, undefined, 'no notice during the cut');
  await settle(r, epoch + korundWeekSeconds + 100, 10); // week 2 meets
  const seen = await spyAdvance(r, epoch, 3);
  assert.ok(seen.filter(isRecoveryQuery).length > 0, 'the met week reads both closed weeks');
  const recovered = korundIn(await rows(r), epoch, 3);
  assert.ok(recovered.length > 0);
  for (const row of recovered) {
    assert.equal(row.inputs.rationRecovery, 1);
    assert.equal(row.inputs.rationCuts, undefined, 'the met week is not another cut');
    assert.equal(recoveryTerm(row).points, korundRationStabilityStep, 'one step, not two');
    assert.equal(recoveryTerm(row).detail, korundRationRecoveryCopy.notice);
    assert.equal(row.stability, computeStability({ ...row.inputs, rationRecovery: undefined }).stability + korundRationStabilityStep);
    assert.ok(row.stability <= 100);
    assert.equal(sum(row.breakdown.stability), row.stability);
  }
  const others = (await rows(r)).filter(row => row.nation !== 'korund' && weekOf(epoch, row.at) === 3);
  for (const row of others) { assert.equal(row.inputs.rationRecovery, undefined); assert.equal(recoveryTerm(row), undefined); }
  const book = await plan(r);
  assert.equal(book.rationRecovery, true);
  assert.equal(book.rationCut, null);
  const tick = recovered.at(-1).tick, before = recovered.at(-1).stability;
  await r.call('world', null);
  const again = (await rows(r)).filter(row => row.nation === 'korund' && row.tick === tick);
  assert.equal(again.length, 1);
  assert.equal(again[0].stability, before);
  assert.equal(again[0].inputs.rationRecovery, 1);
  await settle(r, epoch + 2 * korundWeekSeconds + 100, 10); // week 3 meets
  await advanceTo(r, epoch, 4);
  const all = await rows(r);
  for (const row of korundIn(all, epoch, 3)) assert.equal(recoveryTerm(row).points, korundRationStabilityStep, 'week 3 stays one step');
  for (const row of korundIn(all, epoch, 4)) {
    assert.equal(row.inputs.rationRecovery, undefined, 'second met week');
    assert.equal(recoveryTerm(row), undefined);
    assert.equal(row.inputs.rationCuts, undefined);
    assert.equal(row.stability, computeStability(row.inputs).stability);
  }
  assert.equal((await plan(r)).rationRecovery, undefined);
});

test('unmet week after a cut does not recover', async t => {
  const { r, epoch } = await setup(t);
  await settle(r, epoch + 100, 5);
  await settle(r, epoch + korundWeekSeconds + 100, 5); // week 2 also short
  await advanceTo(r, epoch, 3);
  const week = korundIn(await rows(r), epoch, 3);
  assert.ok(week.length > 0);
  for (const row of week) {
    assert.equal(row.inputs.rationRecovery, undefined);
    assert.equal(recoveryTerm(row), undefined);
    assert.equal(row.inputs.rationCuts, 1, 'the miss still cuts');
    assert.equal(row.stability, computeStability(row.inputs).stability);
  }
  const book = await plan(r);
  assert.equal(book.rationRecovery, undefined);
  assert.equal(book.rationCut.stability, true);
});

test('flag off: no recovery query, score or notice; the #967 cut is unchanged', async t => {
  const { r, epoch } = await setup(t, { recovery: false });
  await settle(r, epoch + 100, 5);
  await advanceTo(r, epoch, 2);
  const cut = korundIn(await rows(r), epoch, 2);
  assert.ok(cut.every(row => row.inputs.rationCuts === 1 && row.inputs.rationRecovery === undefined));
  await settle(r, epoch + korundWeekSeconds + 100, 10);
  const seen = await spyAdvance(r, epoch, 3);
  assert.equal(seen.filter(isRecoveryQuery).length, 0);
  for (const row of korundIn(await rows(r), epoch, 3)) {
    assert.equal(row.inputs.rationRecovery, undefined);
    assert.equal(recoveryTerm(row), undefined);
    assert.equal(row.inputs.rationCuts, undefined);
    assert.equal(row.stability, computeStability(row.inputs).stability);
  }
  const prepare = r.db.prepare.bind(r.db), planSeen = [];
  r.db.prepare = sql => { planSeen.push(sql); return prepare(sql); };
  let book;
  try { book = await plan(r); } finally { r.db.prepare = prepare; }
  assert.equal(planSeen.filter(isRecoveryQuery).length, 0);
  assert.equal('rationRecovery' in book, false);
  assert.equal(book.rationCut, null);
});

test('stability flag off: the recovery flag alone does not read or change the score', async t => {
  const { r, epoch } = await setup(t, { stability: false });
  await settle(r, epoch + 100, 5);
  await settle(r, epoch + korundWeekSeconds + 100, 10);
  const seen = await spyAdvance(r, epoch, 3);
  assert.equal(seen.filter(isRecoveryQuery).length, 0);
  for (const row of korundIn(await rows(r), epoch, 3)) {
    assert.equal(row.inputs.rationRecovery, undefined);
    assert.equal(row.inputs.rationCuts, undefined);
    assert.equal(recoveryTerm(row), undefined);
    assert.equal(row.stability, computeStability(row.inputs).stability);
  }
  assert.equal('rationRecovery' in await plan(r), false);
});

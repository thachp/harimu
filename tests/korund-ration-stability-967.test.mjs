/** #967: a #776 ration cut lowers Korund Stability one step (docs 12.11 step 4), behind HARIMU_KORUND_RATION_STABILITY_ENABLED.
 *  The step is the existing daily score (lib/stability.ts). One city-week counts once, so a replay does not add another step. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';
import { computeStability, korundRationStabilityStep } from '../lib/stability.ts';
import { korundRationCutCities, korundRationCutCopy, korundRationStabilityEnabled, korundWeekSeconds } from '../lib/korund-coupons.ts';

const sum = terms => terms.reduce((t, x) => t + x.points, 0);
const base = { citizens: 4, fed: 2, worked: 2, promisesKept: 0, promisesBroken: 0, petitionBacklog: 0 };
const isCutQuery = sql => /SUM\(food_output\),0\) AS n FROM korund_settlements WHERE settled_at>=\? AND settled_at<\?/.test(sql);

test('pure: one city-week is one step; a replay of the same inputs stays one step; the floor stays 0', async () => {
  assert.equal(korundRationStabilityStep, 3);
  assert.match(await readFile(new URL('../lib/korund.ts', import.meta.url), 'utf8'), /export const gameWeekSeconds = korundWeekSeconds/);
  assert.equal(korundRationStabilityEnabled({ HARIMU_KORUND_RATION_CUT_ENABLED: 'true', HARIMU_KORUND_RATION_STABILITY_ENABLED: 'true' }), true);
  for (const env of [null, {}, { HARIMU_KORUND_RATION_CUT_ENABLED: 'true' }, { HARIMU_KORUND_RATION_STABILITY_ENABLED: 'true' }, { HARIMU_KORUND_RATION_CUT_ENABLED: 'TRUE', HARIMU_KORUND_RATION_STABILITY_ENABLED: 'true' }]) assert.equal(korundRationStabilityEnabled(env), false);
  const off = computeStability(base);
  assert.ok(!off.breakdown.stability.some(x => x.input === 'ration'));
  const on = computeStability({ ...base, rationCuts: 1 }), term = on.breakdown.stability.find(x => x.input === 'ration');
  assert.equal(term.points, -korundRationStabilityStep);
  assert.equal(on.stability, off.stability - korundRationStabilityStep);
  assert.equal(sum(on.breakdown.stability), on.stability);
  assert.equal(computeStability({ ...base, rationCuts: 1 }).stability, on.stability, 'same inputs, still one step');
  assert.equal(computeStability({ ...base, rationCuts: 2 }).stability, off.stability - 2 * korundRationStabilityStep, 'one step per city');
  const floor = computeStability({ citizens: 10, fed: 0, worked: 0, promisesKept: 0, promisesBroken: 5, petitionBacklog: 20, rationCuts: 1 });
  assert.equal(floor.stability, 0);
  assert.equal(sum(floor.breakdown.stability), floor.stability);
});

test('copy: the Stability line lives on the ration-cut notice, and the panel appends it only when the cut carries the step', async () => {
  const src = await readFile(new URL('../lib/ration-copy.ts', import.meta.url), 'utf8');
  assert.ok(src.includes(`stability:L('${korundRationCutCopy.stability}')`));
  const panel = await readFile(new URL('../app/korund-plan-panel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /plan\.rationCut\.stability/);
  assert.match(panel, /korundRationCutCopy\.notice/);
  assert.match(panel, /korundRationCutCopy\.stability/);
});

async function setup(t, stability = true) {
  const r = await localRuntime(); t.after(() => r.close());
  await r.db.prepare("UPDATE citizens SET nation_id='korund'").run();
  await r.call('world', null);
  r.setFixtureEnv('HARIMU_KORUND_RATION_CUT_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_KORUND_RATION_STABILITY_ENABLED', stability ? 'true' : undefined);
  const epoch = Number((await r.db.prepare("SELECT epoch_seconds FROM world_clock WHERE id='main'").first()).epoch_seconds);
  return { r, epoch };
}
async function settle(r, user, at, shifts) {
  for (let i = 0; i < shifts; i++) {
    const id = randomUUID(), iso = new Date((at + i) * 1000).toISOString();
    await r.db.prepare('INSERT INTO work_shifts VALUES (?,?,?,?,?,?,?,?,?)').bind(id, user, 'aurelle-food-estate', 'Korund fixture', '4 state food', 4, iso, iso, iso).run();
    await r.db.prepare('INSERT INTO korund_settlements(shift_id,clerk_user_id,wage_minor,food_output,settled_at) VALUES (?,?,800,4,?)').bind(id, user, at + i).run();
  }
}
const plan = async (r, user = 'alice') => (await r.call('citizen', user)).data.korundPlan;
async function catchUp(r) { for (let i = 0; i < 4; i++) await r.call('world', null); }
async function latest(r) {
  const row = await r.db.prepare("SELECT tick, stability, inputs_json, breakdown_json FROM nation_stability_scores WHERE nation_id='korund' ORDER BY tick DESC LIMIT 1").first();
  return { tick: Number(row.tick), stability: Number(row.stability), inputs: JSON.parse(row.inputs_json), breakdown: JSON.parse(row.breakdown_json) };
}

test('met plan: no Stability change and no stability line on the notice', async t => {
  const { r, epoch } = await setup(t);
  await settle(r, 'bob', epoch + 100, 10); // 40 food, the quota
  r.setNow((epoch + korundWeekSeconds + 100) * 1000);
  await catchUp(r);
  const row = await latest(r);
  assert.equal(row.inputs.rationCuts, undefined);
  assert.ok(!row.breakdown.stability.some(x => x.input === 'ration'));
  assert.equal(row.stability, computeStability(row.inputs).stability);
  assert.equal((await plan(r)).rationCut, null);
  assert.equal(await korundRationCutCities(r.db, epoch, epoch + korundWeekSeconds), 0);
});

test('cut: one step; replay of the week is still one step; the notice names Stability', async t => {
  const { r, epoch } = await setup(t);
  await settle(r, 'bob', epoch + 100, 5); // 20 of 40
  r.setNow((epoch + korundWeekSeconds + 100) * 1000);
  await catchUp(r);
  const row = await latest(r);
  assert.equal(row.inputs.rationCuts, 1);
  const term = row.breakdown.stability.find(x => x.input === 'ration');
  assert.equal(term.points, -korundRationStabilityStep);
  assert.equal(row.stability, computeStability({ ...row.inputs, rationCuts: undefined }).stability - korundRationStabilityStep);
  assert.equal(sum(row.breakdown.stability), row.stability);
  assert.ok(row.stability >= 0);
  const earlier = await r.db.prepare("SELECT inputs_json FROM nation_stability_scores WHERE nation_id='korund' AND tick<?").bind(row.tick).all();
  for (const past of earlier.results) assert.equal(JSON.parse(past.inputs_json).rationCuts, undefined, 'week 1 is not a cut');
  const kindle = await r.db.prepare("SELECT inputs_json FROM nation_stability_scores WHERE nation_id='kindle' AND tick=?").bind(row.tick).first();
  assert.equal(JSON.parse(kindle.inputs_json).rationCuts, undefined);
  const book = await plan(r);
  assert.equal(book.rationCut.stability, true);
  assert.equal(book.rationCut.week, 2);
  await catchUp(r);
  const again = await latest(r);
  assert.equal(again.tick, row.tick);
  assert.equal(again.stability, row.stability);
  assert.equal(again.breakdown.stability.find(x => x.input === 'ration').points, -korundRationStabilityStep);
  assert.equal((await r.db.prepare("SELECT COUNT(*) AS n FROM nation_stability_scores WHERE nation_id='korund' AND tick=?").bind(row.tick).first()).n, 1);
});

test('flag off: coupons still cut, Stability and the notice stay as they were, and the tick does not read the cut', async t => {
  const { r, epoch } = await setup(t, false);
  await settle(r, 'bob', epoch + 100, 5);
  r.setNow((epoch + korundWeekSeconds + 100) * 1000);
  const prepare = r.db.prepare.bind(r.db), seen = [];
  r.db.prepare = sql => { seen.push(sql); return prepare(sql); };
  try { await catchUp(r); } finally { r.db.prepare = prepare; }
  assert.equal(seen.filter(isCutQuery).length, 0);
  const row = await latest(r);
  assert.equal(row.inputs.rationCuts, undefined);
  assert.ok(!row.breakdown.stability.some(x => x.input === 'ration'));
  assert.equal(row.stability, computeStability(row.inputs).stability);
  const book = await plan(r);
  assert.equal(book.rationCut.stability, undefined);
  assert.ok(book.rationCut.withdrawn.includes('goods'));
});

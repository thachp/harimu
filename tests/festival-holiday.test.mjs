/** #291: an endorsed festival is a real holiday: a Stability input computed in the world tick, and the work-turnout shortfall is excused. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';
import { computeStability, festivalHolidayStabilityPoints, workTerms } from '../lib/stability.ts';

const sum = terms => terms.reduce((t, x) => t + x.points, 0);
const daySec = 7200, year = 360;
const oathDay = 90, breadDay = 150;
const base = { citizens: 10, fed: 5, worked: 0, promisesKept: 0, promisesBroken: 0, petitionBacklog: 0 };

test('pure scoring: a holiday adds the festival term and excuses a work shortfall; breakdown still sums to the score', () => {
  const normal = computeStability(base); const holiday = computeStability({ ...base, festivalHoliday: 1 });
  assert.deepEqual(normal.breakdown.stability.map(t => t.input), ['baseline', 'food', 'work', 'promises', 'petitions'], 'no festival term on a normal day');
  assert.deepEqual(holiday.breakdown.stability.map(t => t.input), ['baseline', 'food', 'work', 'promises', 'petitions', 'festival']);
  assert.equal(festivalHolidayStabilityPoints, 3);
  const work = workTerms(0, 10); // -10 stability, +15 unrest on a normal day
  assert.equal(holiday.breakdown.stability.find(t => t.input === 'work').points, 0);
  assert.equal(holiday.breakdown.unrest.find(t => t.input === 'work').points, 0);
  assert.equal(holiday.stability, normal.stability - work.stability + festivalHolidayStabilityPoints);
  assert.equal(holiday.unrest, normal.unrest - work.unrest);
  for (const s of [normal, holiday]) { assert.equal(sum(s.breakdown.stability), s.stability); assert.equal(sum(s.breakdown.unrest), s.unrest); assert.ok(s.stability >= 0 && s.stability <= 100 && s.unrest >= 0 && s.unrest <= 100); }
  const busy = computeStability({ ...base, worked: 10, festivalHoliday: 1 });
  assert.equal(busy.breakdown.stability.find(t => t.input === 'work').points, 10, 'good turnout still counts on a holiday');
});

async function citizen(r, id, nation) {
  const at = new Date(r.now).toISOString();
  await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,?,?,18,0,'Good standing',?,?)").bind(id, nation, id, at, at).run();
}
/** Clock epoch is the world's first tick start; move it so tick 1 falls on `festivalDay`. */
async function scoreOnDay(t, festivalDay, flag) {
  const r = await localRuntime(); t.after(() => r.close()); r.setFaith(flag);
  await citizen(r, 'ava', 'aurelle'); await citizen(r, 'kai', 'korund'); await citizen(r, 'kim', 'kindle');
  const today = Math.floor(r.now / 1000 / daySec); let day = Math.floor(today / year) * year + festivalDay; if (day <= today + 1) day += year;
  await r.db.prepare("INSERT INTO world_clock (id,epoch_seconds) VALUES ('main',?) ON CONFLICT(id) DO UPDATE SET epoch_seconds=excluded.epoch_seconds").bind((day - 1) * daySec).run();
  r.setNow((day * daySec + 60) * 1000);
  const before = (await r.db.prepare('SELECT COUNT(*) AS n FROM world_ticks').first()).n;
  await r.call('world', null);
  const rows = (await r.db.prepare('SELECT nation_id,inputs_json,breakdown_json,stability,tick FROM nation_stability_scores WHERE tick=1').all()).results;
  return { r, before, byNation: Object.fromEntries(rows.map(x => [x.nation_id, { inputs: JSON.parse(x.inputs_json), breakdown: JSON.parse(x.breakdown_json), stability: x.stability }])) };
}

test('world tick: Aurelle gets the holiday input on its endorsed festival, Kindle and Korund do not', async t => {
  const { byNation } = await scoreOnDay(t, oathDay, true);
  assert.equal(byNation.aurelle.inputs.festivalHoliday, 1);
  assert.ok(byNation.aurelle.breakdown.stability.some(x => x.input === 'festival' && x.points === 3));
  for (const n of ['kindle', 'korund']) { assert.equal(byNation[n].inputs.festivalHoliday, undefined, n); assert.ok(!byNation[n].breakdown.stability.some(x => x.input === 'festival'), n); }
});

test('no holiday input on a tolerated festival day, or on a holiday while HARIMU_FAITH_ENABLED is off', async t => {
  const tolerated = await scoreOnDay(t, breadDay, true);
  assert.equal(tolerated.byNation.aurelle.inputs.festivalHoliday, undefined, 'Open Hand festival is tolerated in Aurelle');
  const off = await scoreOnDay(t, oathDay, false);
  assert.equal(off.byNation.aurelle.inputs.festivalHoliday, undefined, 'flag off');
});

test('GET /api/faith stays read-only and still reports the holiday', async t => {
  const r = await localRuntime(); t.after(() => r.close()); r.setFaith(true); await citizen(r, 'ava', 'aurelle');
  const today = Math.floor(r.now / 1000 / daySec); let day = Math.floor(today / year) * year + oathDay; if (day <= today) day += year;
  r.setNow((day * daySec + 60) * 1000);
  const writes = []; const prepare = r.db.prepare.bind(r.db);
  r.db.prepare = sql => { if (/^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i.test(sql)) writes.push(sql.slice(0, 60)); return prepare(sql); };
  const res = await r.call('faith', 'ava'); r.db.prepare = prepare;
  assert.equal(res.data.holiday.festivalId, 'oath-day'); assert.deepEqual(writes, []);
});

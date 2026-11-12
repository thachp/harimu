/** #1367 (docs §18.2, §18.3, follow-up to #1341): Korund poster slogans with {output_pct}/{city}/{brigade}
 *  are filled from the ledger at place and at read. Live figures; no invented numbers. SQLite + PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

const FLAG = 'HARIMU_SQUARE_POSTERS_ENABLED';
const korundPlanWeekSeconds = 50400; // lib/korund-plan-stats.ts
const own = (r, user, nation, x, y) => r.db.prepare('INSERT INTO world_square_purchases(request_id,clerk_user_id,nation_id,x,y,price_minor,purchased_at) VALUES (?,?,?,?,?,2500,1)').bind(`buy-${user}-${x}-${y}`, user, nation, x, y).run();
const place = (r, over = {}) => r.call('world/registry', 'bob', { action: 'place-poster', x: 3, y: 3, frameId: 'korund-frame-mosaic', sloganId: 'korund-slogan-02', requestId: 'poster-fill-0001', ...over });
const read = (r) => r.call('world/registry', 'alice', undefined, 'https://fixture.invalid', '?x=3&y=3');
const sec = (r) => Math.floor(r.now / 1000);
async function setup(t, backend) {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  r.setFixtureEnv(FLAG, 'true');
  await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='bob'").run();
  await own(r, 'bob', 'korund', 3, 3);
  return r;
}
async function settleFood(r, food, id = 'fill-shift-1') {
  const at = new Date(r.now).toISOString();
  await r.db.prepare('INSERT INTO work_shifts VALUES (?,?,?,?,?,?,?,?,?)').bind(id, 'bob', 'korund-food-production', 'Fixture brigade', 'fixture', 4, at, at, at).run();
  await r.db.prepare('INSERT INTO korund_settlements(shift_id,clerk_user_id,wage_minor,food_output,settled_at) VALUES (?,?,800,?,?)').bind(id, 'bob', food, sec(r)).run();
}

test('#1367: fillPosterText refuses a missing figure and leaves other text alone', async () => {
  const r = await localRuntime();
  try {
    const { fillPosterText } = await r.importModule('lib/square-posters.ts');
    assert.equal(fillPosterText('Output at {output_pct} of plan.', { '{output_pct}': '110%' }), 'Output at 110% of plan.');
    assert.equal(fillPosterText('Output at {output_pct} of plan.', {}), null);
    assert.equal(fillPosterText('One hammer, one heart.', {}), 'One hammer, one heart.');
  } finally { await r.close(); }
});

for (const backend of ['sqlite', 'postgres']) {
  test(`#1367 ${backend}: {output_pct} is this week's food percent and updates on the next read`, async t => {
    const r = await setup(t, backend);
    await settleFood(r, 44); // 44 / 40 weekly quota = 110%
    const placed = await place(r);
    assert.equal(placed.status, 200);
    assert.equal(placed.data.poster.text, 'Output at 110% of plan.');
    assert.equal((await read(r)).data.poster.text, 'Output at 110% of plan.');
    await settleFood(r, 4, 'fill-shift-2'); // 48 / 40 = 120%
    assert.equal((await read(r)).data.poster.text, 'Output at 120% of plan.', 'the stored slogan is filled live');
    const replay = await place(r);
    assert.equal(replay.data.replay, true);
    assert.equal(replay.data.poster.text, 'Output at 120% of plan.');
  });

  test(`#1367 ${backend}: an open week with no settlement refuses {output_pct} with 409 placeholder, never 0%`, async t => {
    const r = await setup(t, backend);
    const refused = await place(r, { requestId: 'poster-fill-empty1' });
    assert.equal(refused.status, 409);
    assert.equal(refused.data.reason, 'placeholder');
    assert.equal((await read(r)).data.poster ?? null, null, 'nothing was placed');
  });

  test(`#1367 ${backend}: last week's poster shows no figure once a new empty week opens`, async t => {
    const r = await setup(t, backend);
    await settleFood(r, 44);
    assert.equal((await place(r, { requestId: 'poster-fill-week1' })).data.poster.text, 'Output at 110% of plan.');
    r.setNow(r.now + korundPlanWeekSeconds * 1000); // next plan week, no settlements yet
    const text = (await read(r)).data.poster.text;
    assert.doesNotMatch(text, /\d+%/, 'no stand-in figure on read');
    assert.equal(text, 'Output at {output_pct} of plan.');
  });

  test(`#1367 ${backend}: {city} uses the owner's home city, or the capital when none is stored`, async t => {
    const r = await setup(t, backend);
    const def = await place(r, { sloganId: 'korund-slogan-03', requestId: 'poster-fill-city1' });
    assert.equal(def.status, 200);
    assert.equal(def.data.poster.text, 'Stonehearth advances the plan.');
    await r.db.prepare("INSERT INTO citizen_city_locations(user_id,nation_id,home_city_id,current_city_id,updated_at) VALUES ('bob','korund','strova-mines','strova-mines',1)").run();
    assert.equal((await read(r)).data.poster.text, 'Strova Mines advances the plan.', 'live home-city change');
    const moved = await place(r, { sloganId: 'korund-slogan-03', requestId: 'poster-fill-city2' });
    assert.equal(moved.data.poster.text, 'Strova Mines advances the plan.');
  });

  test(`#1367 ${backend}: {brigade} uses the held Labor Bureau post, otherwise the default brigade`, async t => {
    const r = await setup(t, backend);
    const def = await place(r, { sloganId: 'korund-slogan-04', requestId: 'poster-fill-brig1' });
    assert.equal(def.status, 200);
    assert.equal(def.data.poster.text, 'Brigade State food-production brigade: quota met.');
    await r.db.prepare("INSERT INTO korund_job_assignments(id,clerk_user_id,job_id,outcome,reasons,assigned_at) VALUES ('job-bob','bob','korund-rail-crew','first-choice','[]',?)").bind(sec(r)).run();
    assert.equal((await read(r)).data.poster.text, 'Brigade Rail maintenance crew: quota met.');
  });
}

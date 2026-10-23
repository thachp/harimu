/** #739 slice 2 (ARC): Stability's food and work denominators exclude citizens Dormant (30+ real days) at tick time, behind HARIMU_DORMANCY_ENABLED.
 *  (b) No retroactive repair: only the live tick excludes them; caught-up or repaired past ticks keep the old denominators. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

const day = 86400, iso = s => new Date(s * 1000).toISOString();
async function setup(backend) {
  const r = await localRuntime({ backend });
  await r.call('citizen', 'alice'); await r.call('citizen', 'bob');
  const t0 = Math.floor(r.now / 1000);
  await r.db.prepare("UPDATE citizens SET nation_id='kindle' WHERE clerk_user_id IN ('alice','bob')").run();
  await r.db.prepare("UPDATE citizens SET last_active_at=? WHERE clerk_user_id='alice'").bind(iso(t0 - 40 * day)).run(); // Dormant
  await r.db.prepare("UPDATE citizens SET last_active_at=? WHERE clerk_user_id='bob'").bind(iso(t0 - 29 * day)).run(); // Away, not Dormant: still counted
  return { r, t0, stab: await r.importModule('lib/stability.ts'), world: await r.importModule('lib/world-simulation.ts') };
}
const kindleScores = async r => (await r.db.prepare("SELECT tick, inputs_json FROM nation_stability_scores WHERE nation_id='kindle' ORDER BY tick").all()).results.map(x => ({ tick: Number(x.tick), citizens: JSON.parse(x.inputs_json).citizens }));

for (const backend of ['sqlite', 'postgres']) {
  test(`readStabilityInputs (${backend}): excludeDormant drops only well-formed last_active_at at least 30 days old; NULL and malformed stay counted`, async t => {
    const { r, t0, stab } = await setup(backend); t.after(() => r.close());
    const base = (await stab.readStabilityInputs(r.db, 'kindle', t0)).citizens;
    assert.equal((await stab.readStabilityInputs(r.db, 'kindle', t0, { excludeDormant: true })).citizens, base - 1, 'alice (40 days) excluded, bob (29 days) kept');
    await r.db.prepare("UPDATE citizens SET last_active_at='not-a-date' WHERE clerk_user_id='alice'").run();
    assert.equal((await stab.readStabilityInputs(r.db, 'kindle', t0, { excludeDormant: true })).citizens, base, 'malformed counts as active');
    await r.db.prepare("UPDATE citizens SET last_active_at=NULL WHERE clerk_user_id='alice'").run();
    assert.equal((await stab.readStabilityInputs(r.db, 'kindle', t0, { excludeDormant: true })).citizens, base, 'NULL counts as active');
    await r.db.prepare("UPDATE citizens SET last_active_at=? WHERE clerk_user_id='alice'").bind(iso(t0 - 30 * day)).run();
    assert.equal((await stab.readStabilityInputs(r.db, 'kindle', t0, { excludeDormant: true })).citizens, base - 1, 'exactly 30 days is Dormant');
    const off = await stab.readStabilityInputs(r.db, 'kindle', t0);
    assert.equal(off.citizens, base, 'option off: unchanged');
  });

  for (const dormancy of [false, true]) test(`advanceWorld (${backend}, dormancy ${dormancy}): ${dormancy ? 'only the live tick excludes Dormant citizens; caught-up and repaired past ticks keep the old denominator' : 'flag off: every tick keeps the old denominator'}`, async t => {
    const { r, t0, world, stab } = await setup(backend); t.after(() => r.close());
    const base = (await stab.readStabilityInputs(r.db, 'kindle', t0)).citizens;
    await world.advanceWorld(r.db, t0, { dormancy }); // sets the world clock epoch at t0
    const before = (await kindleScores(r)).length;
    const now = t0 + 3 * 7200 + 10;
    await world.advanceWorld(r.db, now, { dormancy });
    const scores = (await kindleScores(r)).slice(before);
    assert.ok(scores.length >= 3, 'catch-up scored several ticks');
    const live = scores.at(-1), past = scores.slice(0, -1);
    assert.equal(live.citizens, dormancy ? base - 1 : base);
    for (const p of past) assert.equal(p.citizens, base, `past tick ${p.tick} keeps the old denominator`);
    // #679 repair of a past tick: delete its scores and advance again (same tick window): it is rescored with the old denominator.
    await r.db.prepare('DELETE FROM nation_stability_scores WHERE tick=?').bind(past[0].tick).run();
    await world.advanceWorld(r.db, now, { dormancy });
    assert.equal((await kindleScores(r)).find(s => s.tick === past[0].tick).citizens, base, 'repaired past tick unchanged');
  });
}

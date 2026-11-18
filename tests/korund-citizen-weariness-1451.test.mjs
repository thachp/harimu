/** #1451: a signed-in Korund viewer of GET /api/citizen and GET /api/world keeps only Korund's war-weariness level. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WEARINESS_WEEK_SECONDS as WEEK } from '../lib/war-rules.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const levels = (weariness) => Object.keys(weariness ?? {}).sort();

async function seedWar(r, id, attacker, defender, now, weeks = 2) {
  const pair = [attacker, defender].sort().join(':');
  const mobEnd = now - weeks * WEEK - 100;
  await r.db.prepare("INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,casus_belli,declared_by,declared_at,mobilization_ends_at,ended_at,end_kind) VALUES (?,?,?,?,?,'','AI',?,?,NULL,NULL)")
    .bind(id, `r-${id}`, pair, attacker, defender, mobEnd - 48 * 3_600, mobEnd).run();
}

for (const backend of ['sqlite', 'postgres']) {
  test(`#1451 a Korund viewer keeps only Korund's weariness when all three nations have a level (${backend})`, async () => {
    const r = await localRuntime({ backend });
    try {
      r.setFixtureEnv('HARIMU_WAR_ENABLED', 'true');
      r.setFixtureEnv('HARIMU_WAR_WEARINESS_ENABLED', 'true');
      await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='alice'").run();
      const now = Math.floor(r.now / 1000);
      await seedWar(r, 'w-korund', 'kindle', 'korund', now);
      await seedWar(r, 'w-foreign', 'kindle', 'aurelle', now);

      const aliceCitizen = await r.call('citizen', 'alice');
      assert.equal(aliceCitizen.status, 200, 'a Korund viewer can read GET /api/citizen');
      assert.equal(aliceCitizen.cache, 'private, no-store');
      assert.ok(aliceCitizen.data.simulation.weariness, 'weariness is present when the flag is on');
      assert.ok(!('kindle' in aliceCitizen.data.simulation.weariness) && !('aurelle' in aliceCitizen.data.simulation.weariness), 'a Korund viewer does not receive a non-Korund weariness level');
      assert.equal(aliceCitizen.data.simulation.weariness.korund, 'rising', 'a Korund viewer of GET /api/citizen keeps Korund\'s weariness level');
      assert.deepEqual(levels(aliceCitizen.data.simulation.weariness), ['korund'], 'a Korund viewer of GET /api/citizen has only the korund weariness key');

      const aliceWorld = await r.call('world', 'alice');
      assert.equal(aliceWorld.status, 200, 'a Korund viewer can read GET /api/world');
      assert.equal(aliceWorld.cache, 'private, no-store');
      assert.ok(!('kindle' in aliceWorld.data.simulation.weariness) && !('aurelle' in aliceWorld.data.simulation.weariness), 'a Korund viewer does not receive a non-Korund weariness level');
      assert.equal(aliceWorld.data.simulation.weariness.korund, 'rising', 'a Korund viewer of GET /api/world keeps Korund\'s weariness level');
      assert.deepEqual(levels(aliceWorld.data.simulation.weariness), ['korund'], 'a Korund viewer of GET /api/world has only the korund weariness key');

      const bobCitizen = await r.call('citizen', 'bob');
      assert.equal(bobCitizen.status, 200);
      assert.deepEqual(levels(bobCitizen.data.simulation.weariness), ['aurelle', 'kindle', 'korund'], 'a Kindle viewer of GET /api/citizen still receives all three weariness levels');
      assert.ok(bobCitizen.data.simulation.weariness.kindle, 'a Kindle viewer still receives Kindle\'s non-null weariness level');
      assert.ok(bobCitizen.data.simulation.weariness.aurelle, 'a Kindle viewer still receives Aurelle\'s non-null weariness level');
      assert.equal(bobCitizen.data.simulation.weariness.korund, 'rising', 'a Kindle viewer still receives Korund\'s weariness level');
    } finally {
      await r.close();
    }
  });

  test(`#1451 a Korund viewer with no Korund weariness level receives an empty weariness object (${backend})`, async () => {
    const r = await localRuntime({ backend });
    try {
      r.setFixtureEnv('HARIMU_WAR_ENABLED', 'true');
      r.setFixtureEnv('HARIMU_WAR_WEARINESS_ENABLED', 'true');
      await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='alice'").run();
      const now = Math.floor(r.now / 1000);
      await seedWar(r, 'w-foreign', 'kindle', 'aurelle', now);

      const aliceCitizen = await r.call('citizen', 'alice');
      assert.equal(aliceCitizen.status, 200);
      assert.ok('weariness' in aliceCitizen.data.simulation, 'the weariness key stays when the flag is on');
      assert.deepEqual(aliceCitizen.data.simulation.weariness, {}, 'a Korund viewer with no Korund weariness level receives weariness: {}');
      assert.ok(!('kindle' in aliceCitizen.data.simulation.weariness) && !('aurelle' in aliceCitizen.data.simulation.weariness), 'a Korund viewer does not receive a non-Korund weariness level');

      const aliceWorld = await r.call('world', 'alice');
      assert.equal(aliceWorld.status, 200);
      assert.deepEqual(aliceWorld.data.simulation.weariness, {}, 'a Korund viewer of GET /api/world with no Korund weariness level receives weariness: {}');

      const bobCitizen = await r.call('citizen', 'bob');
      assert.deepEqual(levels(bobCitizen.data.simulation.weariness), ['aurelle', 'kindle'], 'a Kindle viewer still receives the other nations\' levels');
    } finally {
      await r.close();
    }
  });
}

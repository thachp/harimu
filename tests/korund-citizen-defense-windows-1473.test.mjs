/** #1473: a signed-in Korund viewer of GET /api/citizen and GET /api/world keeps only Korund's defense window. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

const nations = (windows) => Object.keys(windows ?? {}).sort();

async function seedWar(r, id, attacker, defender, now) {
  const pair = [attacker, defender].sort().join(':');
  const mobEnd = now - 100;
  await r.db.prepare("INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,casus_belli,declared_by,declared_at,mobilization_ends_at,ended_at,end_kind) VALUES (?,?,?,?,?,'','AI',?,?,NULL,NULL)")
    .bind(id, `r-${id}`, pair, attacker, defender, mobEnd - 48 * 3_600, mobEnd).run();
}

for (const backend of ['sqlite', 'postgres']) {
  test(`#1473 a Korund viewer keeps only Korund's defense window when all three nations have one (${backend})`, async () => {
    const r = await localRuntime({ backend });
    try {
      r.setFixtureEnv('HARIMU_WAR_ENABLED', 'true');
      await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='alice'").run();
      const now = Math.floor(r.now / 1000);
      const war = await r.importModule('lib/war.ts');
      assert.equal((await war.setDefenseWindow(r.db, { nation: 'korund', startHourUtc: 3, setBy: 'AI' }, now, true)).ok, true);
      assert.equal((await war.setDefenseWindow(r.db, { nation: 'kindle', startHourUtc: 9, setBy: 'AI' }, now, true)).ok, true);
      assert.equal((await war.setDefenseWindow(r.db, { nation: 'aurelle', startHourUtc: 15, setBy: 'AI' }, now, true)).ok, true);
      await seedWar(r, 'w-korund', 'kindle', 'korund', now);
      await seedWar(r, 'w-foreign', 'kindle', 'aurelle', now);

      const aliceCitizen = await r.call('citizen', 'alice');
      assert.equal(aliceCitizen.status, 200, 'a Korund viewer can read GET /api/citizen');
      assert.equal(aliceCitizen.cache, 'private, no-store');
      const aliceCitizenWindows = aliceCitizen.data.simulation.wars.defenseWindows;
      assert.ok(aliceCitizenWindows, 'defenseWindows is present when the war flag is on');
      assert.equal(aliceCitizenWindows.korund?.startHourUtc, 3, "a Korund viewer of GET /api/citizen keeps Korund's defense window");
      assert.ok(!('kindle' in aliceCitizenWindows) && !('aurelle' in aliceCitizenWindows), 'a Korund viewer does not receive a non-Korund defense window');
      assert.deepEqual(nations(aliceCitizenWindows), ['korund'], 'a Korund viewer of GET /api/citizen has only the korund defense-window key');

      const aliceWorld = await r.call('world', 'alice');
      assert.equal(aliceWorld.status, 200, 'a Korund viewer can read GET /api/world');
      assert.equal(aliceWorld.cache, 'private, no-store');
      const aliceWorldWindows = aliceWorld.data.simulation.wars.defenseWindows;
      assert.equal(aliceWorldWindows.korund?.startHourUtc, 3, "a Korund viewer of GET /api/world keeps Korund's defense window");
      assert.ok(!('kindle' in aliceWorldWindows) && !('aurelle' in aliceWorldWindows), 'a Korund viewer does not receive a non-Korund defense window');
      assert.deepEqual(nations(aliceWorldWindows), ['korund'], 'a Korund viewer of GET /api/world has only the korund defense-window key');

      const bobCitizen = await r.call('citizen', 'bob');
      assert.equal(bobCitizen.status, 200);
      const bobWindows = bobCitizen.data.simulation.wars.defenseWindows;
      assert.deepEqual(nations(bobWindows), ['aurelle', 'kindle', 'korund'], 'a Kindle viewer of GET /api/citizen still receives all three defense windows');
      assert.equal(bobWindows.kindle.startHourUtc, 9, "a Kindle viewer still receives Kindle's defense window");
      assert.equal(bobWindows.aurelle.startHourUtc, 15, "a Kindle viewer still receives Aurelle's defense window");
      assert.equal(bobWindows.korund.startHourUtc, 3, "a Kindle viewer still receives Korund's defense window");

      const signedOut = await r.call('world', null);
      assert.equal(signedOut.status, 200);
      assert.equal(signedOut.cache, 'private, no-store');
      assert.deepEqual(nations(signedOut.data.simulation.wars.defenseWindows), ['aurelle', 'kindle', 'korund'], 'a signed-out GET /api/world still receives all three defense windows');
    } finally {
      await r.close();
    }
  });
}

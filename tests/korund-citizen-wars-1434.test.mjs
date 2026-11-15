/** #1434: a signed-in Korund viewer of GET /api/citizen and GET /api/world does not receive a war Korund is not in, or its sieges. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

const H = 3_600;
const PRIVATE_WORLD = 'private, no-store'; // QA1 review 5908590507: the body depends on the viewer, so every response is private

const ids = (list) => [...(list ?? [])].map((row) => row.id).sort();

for (const backend of ['sqlite', 'postgres']) {
  test(`#1434 a Korund viewer omits a foreign war and its siege (${backend})`, async () => {
    const r = await localRuntime({ backend });
    try {
      r.setFixtureEnv('HARIMU_WAR_ENABLED', 'true');
      await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='alice'").run();
      const now = Math.floor(r.now / 1000);
      await r.db.prepare("INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,casus_belli,declared_by,declared_at,mobilization_ends_at,ended_at,end_kind) VALUES ('w-korund','r-korund','kindle:korund','kindle','korund','','AI',?,?,NULL,NULL)").bind(now, now + 48 * H).run();
      await r.db.prepare("INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,casus_belli,declared_by,declared_at,mobilization_ends_at,ended_at,end_kind) VALUES ('w-foreign','r-foreign','aurelle:kindle','kindle','aurelle','','AI',?,?,NULL,NULL)").bind(now, now + 48 * H).run();
      await r.db.prepare("INSERT INTO city_sieges (id,war_id,city_key,city_kind,center_x,center_y,attacker_nation,defender_nation,created_at) VALUES ('s-korund','w-korund','outpost:korund','outpost',15,7,'kindle','korund',?)").bind(now).run();
      await r.db.prepare("INSERT INTO city_sieges (id,war_id,city_key,city_kind,center_x,center_y,attacker_nation,defender_nation,created_at) VALUES ('s-foreign','w-foreign','outpost:aurelle','outpost',12,14,'kindle','aurelle',?)").bind(now).run();

      const aliceCitizen = await r.call('citizen', 'alice');
      assert.equal(aliceCitizen.status, 200, 'a Korund viewer can read GET /api/citizen');
      assert.ok(!ids(aliceCitizen.data.simulation.wars?.wars).includes('w-foreign'), 'a Korund viewer does not receive a war Korund is not in');
      assert.ok(!ids(aliceCitizen.data.simulation.sieges).includes('s-foreign'), 'a Korund viewer does not receive a siege of a war Korund is not in');
      assert.deepEqual(ids(aliceCitizen.data.simulation.wars?.wars), ['w-korund'], 'a Korund viewer of GET /api/citizen keeps the war Korund is in');
      assert.deepEqual(ids(aliceCitizen.data.simulation.sieges), ['s-korund'], 'a Korund viewer of GET /api/citizen keeps the siege of a war Korund is in');

      const bobCitizen = await r.call('citizen', 'bob');
      assert.equal(bobCitizen.status, 200);
      assert.deepEqual(ids(bobCitizen.data.simulation.wars?.wars), ['w-foreign', 'w-korund'], 'a Kindle viewer of GET /api/citizen still receives both wars');
      assert.deepEqual(ids(bobCitizen.data.simulation.sieges), ['s-foreign', 's-korund'], 'a Kindle viewer of GET /api/citizen still receives both sieges');

      const aliceWorld = await r.call('world', 'alice');
      assert.equal(aliceWorld.status, 200, 'a Korund viewer can read GET /api/world');
      assert.equal(aliceWorld.cache, 'private, no-store', 'a filtered GET /api/world for a Korund viewer is not publicly cacheable');
      assert.ok(!ids(aliceWorld.data.simulation.wars?.wars).includes('w-foreign'), 'a Korund viewer does not receive a war Korund is not in');
      assert.deepEqual(ids(aliceWorld.data.simulation.wars?.wars), ['w-korund'], 'a Korund viewer of GET /api/world keeps the war Korund is in');
      assert.deepEqual(ids(aliceWorld.data.simulation.sieges), ['s-korund'], 'a Korund viewer of GET /api/world keeps the siege of a war Korund is in');

      const bobWorld = await r.call('world', 'bob');
      assert.equal(bobWorld.status, 200);
      assert.equal(bobWorld.cache, PRIVATE_WORLD, 'a Kindle GET /api/world is private too, so a shared cache cannot serve it to a Korund session');
      assert.deepEqual(ids(bobWorld.data.simulation.wars?.wars), ['w-foreign', 'w-korund'], 'a Kindle viewer of GET /api/world still receives both wars');
      assert.deepEqual(ids(bobWorld.data.simulation.sieges), ['s-foreign', 's-korund'], 'a Kindle viewer of GET /api/world still receives both sieges');

      const signedOut = await r.call('world', null);
      assert.equal(signedOut.status, 200);
      assert.equal(signedOut.cache, PRIVATE_WORLD, 'a signed-out GET /api/world is private too, so a shared cache cannot serve it to a Korund session');
      assert.deepEqual(ids(signedOut.data.simulation.wars?.wars), ['w-foreign', 'w-korund'], 'a signed-out viewer of GET /api/world still receives both wars');
      assert.deepEqual(ids(signedOut.data.simulation.sieges), ['s-foreign', 's-korund'], 'a signed-out viewer of GET /api/world still receives both sieges');
    } finally {
      await r.close();
    }
  });
}

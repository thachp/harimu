/** #1439: a signed-in Korund viewer of GET /api/citizen and GET /api/world does not receive a treaty or embargo Korund is not in. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

const D = 86_400;
const PRIVATE_WORLD = 'private, no-store'; // QA1 review 5908590507: the body depends on the viewer, so every response is private
const ids = (list) => [...(list ?? [])].map((row) => row.id).sort();

for (const backend of ['sqlite', 'postgres']) {
  test(`#1439 a Korund viewer omits a foreign treaty and embargo (${backend})`, async () => {
    const r = await localRuntime({ backend });
    try {
      r.setFixtureEnv('HARIMU_DIPLOMACY_ENABLED', 'true');
      r.setFixtureEnv('HARIMU_EMBARGO_ENABLED', 'true');
      await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='alice'").run();
      const now = Math.floor(r.now / 1000);
      const ends = now + 90 * D;
      await r.db.prepare("INSERT INTO treaties (id,request_id,pair_key,kind,proposer_nation,other_nation,proposed_by,proposed_at,status,decided_at,ratified_at,ends_at) VALUES ('t-korund','req-tkorund','kindle:korund','non-aggression','kindle','korund','AI',?,'in_force',?,?,?)").bind(now - 10, now - 5, now - 5, ends).run();
      // QA1 review 5956314775: Korund also appears as the proposer and the embargo actor, so a one-sided filter fails.
      await r.db.prepare("INSERT INTO treaties (id,request_id,pair_key,kind,proposer_nation,other_nation,proposed_by,proposed_at,status,decided_at,ratified_at,ends_at) VALUES ('t-korund-proposer','req-tkorundp','aurelle:korund','non-aggression','korund','aurelle','AI',?,'in_force',?,?,?)").bind(now - 10, now - 5, now - 5, ends).run();
      await r.db.prepare("INSERT INTO treaties (id,request_id,pair_key,kind,proposer_nation,other_nation,proposed_by,proposed_at,status,decided_at,ratified_at,ends_at) VALUES ('t-foreign','req-tforeign','aurelle:kindle','non-aggression','kindle','aurelle','AI',?,'in_force',?,?,?)").bind(now - 10, now - 5, now - 5, ends).run();
      await r.db.prepare("INSERT INTO embargoes (id,request_id,pair_key,actor_nation,target_nation,proposed_by,proposed_at,status,decided_at,imposed_at,lifted_at) VALUES ('e-korund','req-ekorund','kindle:korund','kindle','korund','AI',?,'in_force',?,?,NULL)").bind(now - 10, now - 5, now - 5).run();
      await r.db.prepare("INSERT INTO embargoes (id,request_id,pair_key,actor_nation,target_nation,proposed_by,proposed_at,status,decided_at,imposed_at,lifted_at) VALUES ('e-korund-actor','req-ekorunda','aurelle:korund','korund','aurelle','AI',?,'in_force',?,?,NULL)").bind(now - 10, now - 5, now - 5).run();
      await r.db.prepare("INSERT INTO embargoes (id,request_id,pair_key,actor_nation,target_nation,proposed_by,proposed_at,status,decided_at,imposed_at,lifted_at) VALUES ('e-foreign','req-eforeign','aurelle:kindle','kindle','aurelle','AI',?,'in_force',?,?,NULL)").bind(now - 10, now - 5, now - 5).run();

      const aliceCitizen = await r.call('citizen', 'alice');
      assert.equal(aliceCitizen.status, 200, 'a Korund viewer can read GET /api/citizen');
      assert.ok(!ids(aliceCitizen.data.simulation.treaties?.treaties).includes('t-foreign'), 'a Korund viewer does not receive a treaty Korund is not in');
      assert.ok(!ids(aliceCitizen.data.simulation.embargoes?.embargoes).includes('e-foreign'), 'a Korund viewer does not receive an embargo Korund is not in');
      assert.deepEqual(ids(aliceCitizen.data.simulation.treaties?.treaties), ['t-korund', 't-korund-proposer'], 'a Korund viewer of GET /api/citizen keeps both treaties Korund is in (as proposer and as other)');
      assert.deepEqual(ids(aliceCitizen.data.simulation.embargoes?.embargoes), ['e-korund', 'e-korund-actor'], 'a Korund viewer of GET /api/citizen keeps both embargoes Korund is in (as actor and as target)');

      const bobCitizen = await r.call('citizen', 'bob');
      assert.equal(bobCitizen.status, 200);
      assert.deepEqual(ids(bobCitizen.data.simulation.treaties?.treaties), ['t-foreign', 't-korund', 't-korund-proposer'], 'a Kindle viewer of GET /api/citizen still receives every treaty');
      assert.deepEqual(ids(bobCitizen.data.simulation.embargoes?.embargoes), ['e-foreign', 'e-korund', 'e-korund-actor'], 'a Kindle viewer of GET /api/citizen still receives every embargo');

      const aliceWorld = await r.call('world', 'alice');
      assert.equal(aliceWorld.status, 200, 'a Korund viewer can read GET /api/world');
      assert.equal(aliceWorld.cache, 'private, no-store', 'a filtered GET /api/world for a Korund viewer is not publicly cacheable');
      assert.ok(!ids(aliceWorld.data.simulation.treaties?.treaties).includes('t-foreign'), 'a Korund viewer does not receive a treaty Korund is not in');
      assert.ok(!ids(aliceWorld.data.simulation.embargoes?.embargoes).includes('e-foreign'), 'a Korund viewer does not receive an embargo Korund is not in');
      assert.deepEqual(ids(aliceWorld.data.simulation.treaties?.treaties), ['t-korund', 't-korund-proposer'], 'a Korund viewer of GET /api/world keeps both treaties Korund is in (as proposer and as other)');
      assert.deepEqual(ids(aliceWorld.data.simulation.embargoes?.embargoes), ['e-korund', 'e-korund-actor'], 'a Korund viewer of GET /api/world keeps both embargoes Korund is in (as actor and as target)');

      const bobWorld = await r.call('world', 'bob');
      assert.equal(bobWorld.status, 200);
      assert.equal(bobWorld.cache, PRIVATE_WORLD, 'a Kindle GET /api/world is private too, so a shared cache cannot serve it to a Korund session');
      assert.deepEqual(ids(bobWorld.data.simulation.treaties?.treaties), ['t-foreign', 't-korund', 't-korund-proposer'], 'a Kindle viewer of GET /api/world still receives every treaty');
      assert.deepEqual(ids(bobWorld.data.simulation.embargoes?.embargoes), ['e-foreign', 'e-korund', 'e-korund-actor'], 'a Kindle viewer of GET /api/world still receives every embargo');

      const signedOut = await r.call('world', null);
      assert.equal(signedOut.status, 200);
      assert.equal(signedOut.cache, PRIVATE_WORLD, 'a signed-out GET /api/world is private too, so a shared cache cannot serve it to a Korund session');
      assert.deepEqual(ids(signedOut.data.simulation.treaties?.treaties), ['t-foreign', 't-korund', 't-korund-proposer'], 'a signed-out viewer of GET /api/world still receives every treaty');
      assert.deepEqual(ids(signedOut.data.simulation.embargoes?.embargoes), ['e-foreign', 'e-korund', 'e-korund-actor'], 'a signed-out viewer of GET /api/world still receives every embargo');
    } finally {
      await r.close();
    }
  });
}

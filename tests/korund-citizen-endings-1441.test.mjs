/** #1441: a signed-in Korund viewer of GET /api/citizen does not receive a war proposal or ending Korund is not in. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

const H = 3_600;
const ids = (list) => [...(list ?? [])].map((row) => row.id).sort();

for (const backend of ['sqlite', 'postgres']) {
  test(`#1441 a Korund viewer omits a foreign war proposal and ending (${backend})`, async () => {
    const r = await localRuntime({ backend });
    try {
      r.setFixtureEnv('HARIMU_WAR_ENABLED', 'true');
      r.setFixtureEnv('HARIMU_WAR_ASSEMBLY_ENABLED', 'true');
      r.setFixtureEnv('HARIMU_WAR_ENDINGS_ENABLED', 'true');
      await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='alice'").run();
      const now = Math.floor(r.now / 1000);
      await r.db.prepare("INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,casus_belli,declared_by,declared_at,mobilization_ends_at,ended_at,end_kind) VALUES ('w-korund','r-korund','kindle:korund','kindle','korund','','AI',?,?,NULL,NULL)").bind(now, now + 48 * H).run();
      await r.db.prepare("INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,casus_belli,declared_by,declared_at,mobilization_ends_at,ended_at,end_kind) VALUES ('w-foreign','r-foreign','aurelle:kindle','kindle','aurelle','','AI',?,?,NULL,NULL)").bind(now, now + 48 * H).run();
      await r.db.prepare("INSERT INTO war_proposals (id,request_id,defender_nation,casus_belli,declared_by,proposed_at) VALUES ('p-korund','req-pkorund','korund','','AI',?)").bind(now).run();
      await r.db.prepare("INSERT INTO war_proposals (id,request_id,defender_nation,casus_belli,declared_by,proposed_at) VALUES ('p-foreign','req-pforeign','aurelle','','AI',?)").bind(now).run();
      await r.db.prepare("INSERT INTO war_end_terms (id,request_id,war_id,kind,proposer_nation,other_nation,squares_json,proposed_at) VALUES ('e-korund','req-ekorund','w-korund','surrender','kindle','korund',NULL,?)").bind(now).run();
      await r.db.prepare("INSERT INTO war_end_terms (id,request_id,war_id,kind,proposer_nation,other_nation,squares_json,proposed_at) VALUES ('e-foreign','req-eforeign','w-foreign','surrender','kindle','aurelle',NULL,?)").bind(now).run();

      const aliceCitizen = await r.call('citizen', 'alice');
      assert.equal(aliceCitizen.status, 200, 'a Korund viewer can read GET /api/citizen');
      assert.ok(!ids(aliceCitizen.data.simulation.warProposals).includes('p-foreign'), 'a Korund viewer does not receive a war proposal Korund is not in');
      assert.ok(!ids(aliceCitizen.data.simulation.warEndings).includes('e-foreign'), 'a Korund viewer does not receive a war ending Korund is not in');
      assert.deepEqual(ids(aliceCitizen.data.simulation.warProposals), ['p-korund'], 'a Korund viewer of GET /api/citizen keeps the proposal to declare on Korund');
      assert.deepEqual(ids(aliceCitizen.data.simulation.warEndings), ['e-korund'], 'a Korund viewer of GET /api/citizen keeps the ending of a war Korund is in');

      const bobCitizen = await r.call('citizen', 'bob');
      assert.equal(bobCitizen.status, 200);
      assert.deepEqual(ids(bobCitizen.data.simulation.warProposals), ['p-foreign', 'p-korund'], 'a Kindle viewer of GET /api/citizen still receives both proposals');
      assert.deepEqual(ids(bobCitizen.data.simulation.warEndings), ['e-foreign', 'e-korund'], 'a Kindle viewer of GET /api/citizen still receives both endings');
    } finally {
      await r.close();
    }
  });
}

/** #1449: a Korund enroll response does not receive a war Korund is not in. Fixtures put Korund on each side of the pair. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

const H = 3_600;
const ids = (list) => [...(list ?? [])].map((row) => row.id).sort();

for (const backend of ['sqlite', 'postgres']) {
  test(`#1449 a Korund enroll response omits a foreign war and keeps wars on each side (${backend})`, async () => {
    const r = await localRuntime({ backend });
    try {
      r.setFixtureEnv('HARIMU_WAR_ENABLED', 'true');
      await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='alice'").run();
      const now = Math.floor(r.now / 1000);
      await r.db.prepare("INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,casus_belli,declared_by,declared_at,mobilization_ends_at,ended_at,end_kind) VALUES ('w-defender','r-defender','kindle:korund','kindle','korund','','AI',?,?,NULL,NULL)").bind(now, now + 48 * H).run();
      await r.db.prepare("INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,casus_belli,declared_by,declared_at,mobilization_ends_at,ended_at,end_kind) VALUES ('w-attacker','r-attacker','aurelle:korund','korund','aurelle','','AI',?,?,NULL,NULL)").bind(now, now + 48 * H).run();
      await r.db.prepare("INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,casus_belli,declared_by,declared_at,mobilization_ends_at,ended_at,end_kind) VALUES ('w-foreign','r-foreign','aurelle:kindle','kindle','aurelle','','AI',?,?,NULL,NULL)").bind(now, now + 48 * H).run();

      const alice = await r.call('citizen', 'alice', { action: 'enroll', nationId: 'korund', expectedNationId: 'korund' });
      assert.equal(alice.status, 200, 'a Korund viewer can submit the same-nation enroll');
      assert.equal(alice.cache, 'private, no-store', 'an enroll response stays private, no-store');
      assert.ok(!ids(alice.data.simulation.wars?.wars).includes('w-foreign'), 'a Korund enroll response does not receive a war Korund is not in');
      assert.ok(ids(alice.data.simulation.wars?.wars).includes('w-defender'), 'a Korund enroll response keeps the war where Korund is the defender');
      assert.ok(ids(alice.data.simulation.wars?.wars).includes('w-attacker'), 'a Korund enroll response keeps the war where Korund is the attacker');
      assert.deepEqual(ids(alice.data.simulation.wars?.wars), ['w-attacker', 'w-defender'], 'a Korund enroll response keeps both wars Korund is in and only those wars');

      const bob = await r.call('citizen', 'bob', { action: 'enroll', nationId: 'kindle', expectedNationId: 'kindle' });
      assert.equal(bob.status, 200);
      assert.equal(bob.cache, 'private, no-store');
      assert.deepEqual(ids(bob.data.simulation.wars?.wars), ['w-attacker', 'w-defender', 'w-foreign'], 'a Kindle enroll response still receives every war');
    } finally {
      await r.close();
    }
  });
}

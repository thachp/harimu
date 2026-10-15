/** #617: two concurrent leave-Kinward requests with different request ids must charge Royal Favor once. The race: an Aurelle citizen on the default Kinward Rite has no
 *  citizen_faith row (or a default one), so the leave is a "first pick" with changed_at NULL and the cooldown guard cannot stop the second request. SQLite and PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { localRuntime } from './helpers/local-runtime.mjs';

const choose = (r, user, faithId, requestId = randomUUID()) => r.call('faith', user, { action: 'choose-faith', faithId, requestId });
async function scene(t, backend, favorShifts = 10) {
  const r = await localRuntime(backend ? { backend } : {}); t.after(() => r.close()); r.setFaith(true);
  const at = new Date(r.now).toISOString(), iso = new Date(r.now - 86400000).toISOString();
  await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES ('ava','aurelle','ava',18,0,'Good standing',?,?)").bind(at, at).run();
  for (let n = 0; n < favorShifts; n++) {
    const id = randomUUID();
    await r.db.batch([
      r.db.prepare('INSERT INTO work_shifts VALUES (?,?,?,?,?,?,?,?,?)').bind(id, 'ava', 'aurelle-food-estate', 'Estate fixture', '4 state food', 4, iso, iso, iso),
      r.db.prepare('INSERT INTO aurelle_settlements VALUES (?,?,?,?,?,?)').bind(id, 'ava', 800, 4, 2, Math.floor(r.now / 1000)),
    ]);
  }
  return r;
}
const spends = async r => (await r.db.prepare("SELECT request_id,amount FROM aurelle_favor_spends WHERE clerk_user_id='ava'").all()).results.map(x => ({ ...x }));
const favor = async r => (await r.call('citizen', 'ava')).data.aurellePlan.favor;
const faithRow = async r => { const x = await r.db.prepare("SELECT faith_id,changed_at,request_id FROM citizen_faith WHERE user_id='ava'").first(); return x && { ...x }; };

for (const backend of ['sqlite', 'postgres']) {
  test(`concurrent leave-Kinward with different request ids charges Favor once (${backend})`, async t => {
    const r = await scene(t, backend);
    assert.equal(await favor(r), 20);
    const a = randomUUID(), b = randomUUID();
    const [one, two] = await Promise.all([choose(r, 'ava', 'open-hand', a), choose(r, 'ava', 'fair-wind-vow', b)]);
    const won = [one, two].filter(x => x.status === 200), lost = [one, two].filter(x => x.status !== 200);
    assert.equal(won.length, 1, JSON.stringify([one.data, two.data]));
    assert.equal(lost.length, 1); assert.equal(lost[0].status, 409); assert.equal(lost[0].data.reason, 'already_left'); assert.match(lost[0].data.error, /already left the Kinward Rite/);
    const spent = await spends(r);
    assert.equal(spent.length, 1, 'one spend row'); assert.equal(spent[0].amount, 10);
    assert.equal(await favor(r), 10, 'one charge of 10 from 20');
    const row = await faithRow(r); assert.equal(row.request_id, spent[0].request_id, 'the winner owns both the spend and the faith change');
  });

  test(`same request id still replays, and a later change is not charged again (${backend})`, async t => {
    const r = await scene(t, backend);
    const a = randomUUID();
    const both = await Promise.all([choose(r, 'ava', 'open-hand', a), choose(r, 'ava', 'open-hand', a)]);
    assert.deepEqual(both.map(x => x.status), [200, 200], JSON.stringify(both.map(x => x.data)));
    assert.equal((await spends(r)).length, 1); assert.equal(await favor(r), 10);
    assert.equal((await choose(r, 'ava', 'open-hand', a)).data.replay, true);
    assert.equal((await choose(r, 'ava', 'fair-wind-vow', randomUUID())).status, 200, 'a later change is not a Kinward leave (existing first-pick rule, unchanged)');
    assert.equal((await spends(r)).length, 1); assert.equal(await favor(r), 10, 'and it is not charged');
  });

  test(`a leave from an explicit Kinward pick (changed_at NULL) is also charged once under concurrency (${backend})`, async t => {
    const r = await scene(t, backend);
    assert.equal((await choose(r, 'ava', 'kinward-rite')).status, 200, 'first pick: stay on Kinward, free');
    const [one, two] = await Promise.all([choose(r, 'ava', 'open-hand'), choose(r, 'ava', 'unaffiliated')]);
    assert.equal([one, two].filter(x => x.status === 200).length, 1, JSON.stringify([one.data, two.data]));
    assert.equal((await spends(r)).length, 1); assert.equal(await favor(r), 10);
  });
}

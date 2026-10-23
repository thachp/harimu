/** #831: Kindle platform plank up-votes (docs §9.4). Flag-off 404 with no DB, membership gate, cap of 3 in SQL, idempotent repeat, withdraw, party switch, ranking. SQLite + PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { plankVotesFlagOn, plankVotesPerMember } from '../lib/plank-votes-rules.ts';
import { pledgeCatalog } from '../lib/kindle-parties.ts';

test('rules: flag is exactly "true"; cap is 3 (ARC-confirmed)', () => {
  for (const e of [{}, { HARIMU_PLANK_VOTES_ENABLED: 'TRUE' }, { HARIMU_PLANK_VOTES_ENABLED: 'false' }, null]) assert.equal(plankVotesFlagOn(e), false);
  assert.equal(plankVotesFlagOn({ HARIMU_PLANK_VOTES_ENABLED: 'true' }), true); assert.equal(plankVotesPerMember, 3);
});
async function spy(r, fn) { const prepare = r.db.prepare.bind(r.db), seen = { sql: [] }; r.db.prepare = q => { seen.sql.push(q); return prepare(q); }; try { seen.result = await fn(); } finally { r.db.prepare = prepare; } return seen; }
async function setup(t, backend) {
  const { localRuntime } = await import('./helpers/local-runtime.mjs');
  const r = await localRuntime({ backend, accountElection: true }); t.after(() => r.close());
  const iso = new Date(r.now).toISOString();
  await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES ('cara','kindle','Cara',18,0,'Good standing',?,?)").bind(iso, iso).run();
  r.setFixtureEnv('HARIMU_PLANK_VOTES_ENABLED', 'true');
  const join = (u, party) => r.db.prepare('INSERT INTO party_members (clerk_user_id,party_id,joined_at) VALUES (?,?,1) ON CONFLICT(clerk_user_id) DO UPDATE SET party_id=excluded.party_id').bind(u, party).run();
  return { r, join };
}
const rows = async r => Number((await r.db.prepare('SELECT COUNT(*) AS n FROM party_plank_votes').first()).n);
const [k1, k2, k3, k4] = pledgeCatalog.map(p => p.key);

for (const backend of ['sqlite', 'postgres']) {
  test(`/api/planks (${backend}): flag off is 404 for GET and POST before auth, with zero DB statements`, async t => {
    const { r } = await setup(t, backend);
    for (const flag of [undefined, 'false', 'TRUE']) {
      r.setFixtureEnv('HARIMU_PLANK_VOTES_ENABLED', flag);
      const off = await spy(r, async () => [await r.call('planks', 'alice'), await r.call('planks', null), await r.call('planks', 'alice', { action: 'upvote', pledgeKey: k1 }), await r.call('planks', 'alice', { action: 'upvote', pledgeKey: k1 }, 'https://evil.invalid')]);
      assert.deepEqual(off.result.map(x => x.status), [404, 404, 404, 404]); assert.deepEqual(off.sql, [], `flag ${flag}: no database access`);
    }
    assert.equal(await rows(r), 0);
  });

  test(`/api/planks (${backend}): members only, cap of 3, idempotent, withdraw, ranking, party switch`, async t => {
    const { r, join } = await setup(t, backend);
    const post = (u, action, pledgeKey) => r.call('planks', u, { action, pledgeKey });
    assert.equal((await r.call('planks', null)).status, 401);
    assert.equal((await r.call('planks', 'alice')).data.planks.party, null, 'not a member');
    assert.equal((await post('alice', 'upvote', k1)).data.reason, 'not_member');
    await join('alice', 'open-ledger'); await join('bob', 'open-ledger'); await join('cara', 'steady-hand');
    for (const body of [{ action: 'upvote', pledgeKey: 'nope' }, { action: 'boost', pledgeKey: k1 }, { action: 'upvote' }]) assert.equal((await r.call('planks', 'alice', body)).status, 400, JSON.stringify(body));
    assert.equal((await r.call('planks', 'alice', { action: 'upvote', pledgeKey: k1 }, 'https://evil.invalid')).status, 403, 'same origin');
    for (const k of [k1, k2, k3]) assert.equal((await post('alice', 'upvote', k)).status, 200);
    assert.equal((await post('alice', 'upvote', k1)).status, 200, 'repeat is idempotent'); assert.equal(await rows(r), 3);
    const capped = await post('alice', 'upvote', k4); assert.deepEqual([capped.status, capped.data.reason], [409, 'cap_reached']); assert.equal(await rows(r), 3);
    await post('bob', 'upvote', k3);
    const view = (await r.call('planks', 'bob')).data.planks;
    assert.deepEqual([view.party.id, view.mine, view.planks.length], ['open-ledger', [k3], pledgeCatalog.length]);
    assert.deepEqual(view.planks.slice(0, 4).map(p => [p.key, p.votes]), [[k3, 2], [k1, 1], [k2, 1], [k4, 0]], 'votes desc, then catalog order');
    assert.ok((await r.call('planks', 'cara')).data.planks.planks.every(p => p.votes === 0), 'other party sees only its own members');
    assert.equal((await post('alice', 'withdraw', k1)).status, 200); assert.equal((await post('alice', 'upvote', k4)).status, 200, 'slot freed');
    await join('alice', 'steady-hand');
    const after = (await r.call('planks', 'bob')).data.planks; assert.equal(after.planks.find(p => p.key === k3).votes, 1, 'switched member stops counting');
    assert.deepEqual((await r.call('planks', 'alice')).data.planks.mine, [], 'fresh cap in the new party');
    for (const k of [k1, k2, k3]) assert.equal((await post('alice', 'upvote', k)).status, 200);
    assert.equal((await r.call('planks', 'cara')).data.planks.planks.find(p => p.key === k1).votes, 1);
    r.setFixtureEnv('HARIMU_ACCOUNT_ELECTION_POC_ENABLED', 'false');
    assert.equal((await r.call('planks', 'bob')).data.eligible, false); assert.equal((await post('bob', 'upvote', k1)).data.reason, 'not_eligible');
  });

  test(`/api/planks (${backend}): non-Kindle caller is 403 even when listed in party_members; withdraw removes only that plank`, async t => {
    const { r, join } = await setup(t, backend);
    const iso = new Date(r.now).toISOString();
    await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES ('aure','aurelle','Aure',18,0,'Good standing',?,?)").bind(iso, iso).run();
    await join('aure', 'open-ledger');
    for (const res of [await r.call('planks', 'aure'), await r.call('planks', 'aure', { action: 'upvote', pledgeKey: k1 })]) assert.deepEqual([res.status, res.data.reason], [403, 'not_kindle']);
    assert.equal(await rows(r), 0);
    await join('alice', 'open-ledger');
    for (const k of [k1, k2, k3]) assert.equal((await r.call('planks', 'alice', { action: 'upvote', pledgeKey: k })).status, 200);
    const w = await r.call('planks', 'alice', { action: 'withdraw', pledgeKey: k2 });
    assert.deepEqual(w.data.planks.mine, [k1, k3].sort(), 'the other votes stay');
    assert.equal(await rows(r), 2);
    assert.equal((await r.call('planks', 'alice', { action: 'upvote', pledgeKey: k4 })).status, 200, 'freed slot is reused');
    const slots = (await r.db.prepare("SELECT slot FROM party_plank_votes WHERE clerk_user_id='alice' ORDER BY slot").all()).results.map(x => Number(x.slot));
    assert.deepEqual(slots, [1, 2, 3]);
  });

  test(`/api/planks (${backend}): a parallel burst of up-votes stores at most 3 (slot uniqueness)`, async t => {
    const { r, join } = await setup(t, backend);
    await join('alice', 'open-ledger');
    const keys = pledgeCatalog.slice(0, 8).map(p => p.key);
    const res = await Promise.all([...keys, ...keys].map(k => r.call('planks', 'alice', { action: 'upvote', pledgeKey: k })));
    assert.equal(await rows(r), 3); assert.ok(res.every(x => x.status === 200 || x.data.reason === 'cap_reached'));
  });
}

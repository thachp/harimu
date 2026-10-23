/** #825 (docs §9.5; ARC on #834): Kindle vote-buying watch. A DIRECT transfer or gift (never a market purchase) to a voter within 48h of their vote, from a party member or
 *  a canvasser, records one investigation event; outside the window none; plain sender none; never a ballot choice; idempotent; flag off = no reads, no writes. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

const H = 3600;
async function setup(backend) {
  const r = await localRuntime({ backend });
  const users = ['v1', 'v2', 'v3', 'v4', 'boss', 'canvasser', 'plain'];
  for (const u of users) await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,'kindle',?,18,0,'Good standing','2026-10-14T00:00:00Z','2026-10-14T00:00:00Z')").bind(u, u).run();
  const now = Math.floor(r.now / 1000), vote = now - 10 * H;
  await r.db.prepare("INSERT INTO civic_elections (id,nation_id,candidates_json,opens_at,closes_at) VALUES ('e825','kindle','[\"a\",\"b\",\"c\"]',?,?)").bind(vote - H, vote - H + 259200).run();
  for (const v of ['v1', 'v2', 'v3', 'v4']) await r.db.prepare("INSERT INTO civic_voter_receipts (election_id,clerk_user_id,request_id,checked_at,ballot_written,policy) VALUES ('e825',?,?,?,1,'tier1-human-v1')").bind(v, `rq-${v}`, vote).run();
  const { partyIds } = await r.importModule('lib/primaries-rules.ts');
  await r.db.prepare('INSERT INTO party_members (clerk_user_id,party_id,joined_at) VALUES (?,?,?)').bind('boss', partyIds[0], vote - 100 * H).run();
  await r.db.prepare("INSERT INTO canvass_quests (id,clerk_user_id,party_id,candidate_id,district_id,utc_day,request_id,capacity_spent,started_at,completes_at) VALUES ('cq825','canvasser',?,'cand','d1','2026-01-01','rq825',1,?,?)")
    .bind(partyIds[0], vote - 10 * H, vote - 9 * H).run();
  // A fixture direct-transfer source (Kindle has none yet): literal rows, so no runtime DDL. Column names are the source contract (id, sender, recipient, at).
  const gifts = list => [{ name: 'gift', sql: list.map(([id, s, t, at]) => `SELECT '${id}' AS id, '${s}' AS sender, '${t}' AS recipient, ${at} AS at`).join(' UNION ALL ') }];
  let n = 0;
  const fill = async (buyer, seller, at) => { const id = `f825-${++n}`;
    await r.db.prepare("INSERT INTO player_listings (id,seller_id,item,quantity,unit_minor,created_at) VALUES (?,?,'food',1,500,?)").bind(id, seller, at - 60).run();
    await r.db.prepare("INSERT INTO player_fills (request_id,listing_id,buyer_id,seller_id,item,quantity,amount_minor,filled_at) VALUES (?,?,?,?,'food',1,500,?)").bind(id, id, buyer, seller, at).run(); return id; };
  return { r, now, vote, fill, gifts, w: await r.importModule('lib/vote-buying-watch.ts'), sim: await r.importModule('lib/world-simulation.ts') };
}
const events = async r => (await r.db.prepare('SELECT election_key,voter_id,sender_id,transfer_id,reason FROM vote_buying_events ORDER BY reason,voter_id,transfer_id').all()).results.map(x => ({ ...x }));

for (const backend of ['sqlite', 'postgres']) {
  test(`sweep (${backend}): direct gift from a party member or canvasser inside 48h = one event each; outside the window, plain sender = none; idempotent; no ballot data`, async t => {
    const { r, now, vote, gifts, w } = await setup(backend); t.after(() => r.close());
    const src = gifts([['g1', 'boss', 'v1', vote + 47 * H], ['g2', 'boss', 'v2', vote - 49 * H], ['g3', 'plain', 'v3', vote - H], ['g4', 'canvasser', 'v4', vote + H]]);
    await w.runVoteBuyingWatch(r.db, now + 40 * H, src);
    const got = await events(r);
    assert.deepEqual(got, [{ election_key: 'civic:e825', voter_id: 'v4', sender_id: 'canvasser', transfer_id: 'gift:g4', reason: 'campaign' },
      { election_key: 'civic:e825', voter_id: 'v1', sender_id: 'boss', transfer_id: 'gift:g1', reason: 'party-member' }]);
    await w.runVoteBuyingWatch(r.db, now + 41 * H, src);
    assert.deepEqual(await events(r), got, 're-running is idempotent');
    const cols = (await r.db.prepare('SELECT * FROM vote_buying_events LIMIT 1').all()).results[0];
    assert.deepEqual(Object.keys(cols).sort(), ['created_at', 'election_key', 'reason', 'sender_id', 'transfer_id', 'voter_id'], 'no ballot choice is stored');
  });

  test(`sweep (${backend}): an ordinary market purchase at the listed price by a party member records no event (and with no direct sources there is no query)`, async t => {
    const { r, now, vote, fill, w } = await setup(backend); t.after(() => r.close());
    await fill('boss', 'v1', vote + H); await fill('canvasser', 'v2', vote - H);
    const prepare = r.db.prepare.bind(r.db), seen = []; r.db.prepare = q => { seen.push(q); return prepare(q); };
    try { await w.runVoteBuyingWatch(r.db, now); } finally { r.db.prepare = prepare; }
    assert.deepEqual(seen, [], 'no direct transfer sources: nothing read');
    assert.equal(w.directTransferSources.length, 0); assert.doesNotMatch(w.voteBuyingSweepSql([{ name: 'x', sql: 'SELECT 1' }]), /player_fills/);
    assert.equal((await events(r)).length, 0);
  });

  test(`advanceWorld (${backend}): flag off reads no transfers and writes nothing; on, a market purchase records nothing`, async t => {
    const { r, now, vote, fill, sim } = await setup(backend); t.after(() => r.close());
    await fill('boss', 'v1', vote + H);
    const prepare = r.db.prepare.bind(r.db), seen = []; r.db.prepare = q => { seen.push(q); return prepare(q); };
    try { await sim.advanceWorld(r.db, now, {}); } finally { r.db.prepare = prepare; }
    assert.equal(seen.filter(q => /player_fills|vote_buying_events/.test(q)).length, 0, 'flag off: no ledger read, no event write');
    assert.equal((await events(r)).length, 0);
    await sim.advanceWorld(r.db, now, { voteBuyingWatch: true });
    assert.equal((await events(r)).length, 0, 'flag on: a market purchase never flags');
  });
}

test('admin route: flag off or short token = 404, wrong bearer = 401, right bearer lists events', async t => {
  const { r, now, vote, gifts, w } = await setup('sqlite'); t.after(() => r.close());
  await w.runVoteBuyingWatch(r.db, now, gifts([['g1', 'boss', 'v1', vote + H]]));
  const route = await r.importModule('app/api/admin/vote-buying/route.ts'), token = 'fixture-admin-token-825';
  const get = auth => route.GET(new Request('https://fixture.invalid/api/admin/vote-buying', { headers: auth ? { Authorization: auth } : {} }));
  r.setFixtureEnv('HARIMU_VOTE_BUYING_WATCH_ENABLED', 'false'); r.setFixtureEnv('HARIMU_ADMIN_TOKEN', token);
  assert.equal((await get(`Bearer ${token}`)).status, 404);
  r.setFixtureEnv('HARIMU_VOTE_BUYING_WATCH_ENABLED', 'true'); r.setFixtureEnv('HARIMU_ADMIN_TOKEN', 'short');
  assert.equal((await get('Bearer short')).status, 404);
  r.setFixtureEnv('HARIMU_ADMIN_TOKEN', token);
  assert.equal((await get('Bearer wrong-token-wrong-token')).status, 401);
  const ok = await get(`Bearer ${token}`); assert.equal(ok.status, 200);
  assert.deepEqual((await ok.json()).events.map(e => [e.voterId, e.senderId, e.reason]), [['v1', 'boss', 'party-member']]);
});

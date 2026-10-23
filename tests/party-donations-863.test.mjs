/** #863: Kindle campaign donations (docs §9.4). Flag-off 404 with no DB, balanced ledger (wallet debit = party credit), weekly cap, balance refusal,
 *  idempotent replay, public disclosure, and the invariant that donations add NO ballot or primary weight. SQLite + PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { partyDonationsFlagOn, donationWeeklyCapMinor, donationWeek } from '../lib/party-donations-rules.ts';

test('rules: flag is exactly "true"; cap is 500.00 SPK per party per real week', () => {
  for (const e of [{}, { HARIMU_PARTY_DONATIONS_ENABLED: 'TRUE' }, { HARIMU_PARTY_DONATIONS_ENABLED: 'false' }, null]) assert.equal(partyDonationsFlagOn(e), false);
  assert.equal(partyDonationsFlagOn({ HARIMU_PARTY_DONATIONS_ENABLED: 'true' }), true);
  assert.equal(donationWeeklyCapMinor, 50000); assert.equal(donationWeek(604799), 0); assert.equal(donationWeek(604800), 1);
});
test('invariant (static): no vote, ballot or primary code reads donations', () => {
  for (const f of ['lib/elections.ts', 'lib/primaries.ts', 'lib/primaries-rules.ts', 'lib/instant-runoff.ts', 'lib/preview-election.ts', 'app/api/election/route.ts', 'app/api/primaries/route.ts'])
    assert.doesNotMatch(readFileSync(f, 'utf8'), /donation/i, f);
});
async function spy(r, fn) { const prepare = r.db.prepare.bind(r.db), seen = { sql: [] }; r.db.prepare = q => { seen.sql.push(q); return prepare(q); }; try { seen.result = await fn(); } finally { r.db.prepare = prepare; } return seen; }
async function setup(t, backend) {
  const { localRuntime } = await import('./helpers/local-runtime.mjs');
  const r = await localRuntime({ backend, accountElection: true }); t.after(() => r.close());
  const iso = new Date(r.now).toISOString();
  await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES ('cara','aurelle','Cara',18,0,'Good standing',?,?)").bind(iso, iso).run();
  r.setFixtureEnv('HARIMU_PARTY_DONATIONS_ENABLED', 'true');
  return r;
}
const wallet = async (r, u) => Number((await r.db.prepare('SELECT balance FROM citizen_wallet_balances WHERE clerk_user_id=?').bind(u).first())?.balance ?? 0);
const fund = (r, u, minor) => r.db.prepare("INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES (?,?,'sell','fixture-cash',-1,?,1)").bind(randomUUID(), u, minor).run();
const rows = async r => Number((await r.db.prepare('SELECT COUNT(*) AS n FROM party_donations').first()).n);
const give = (r, u, partyId, amountMinor, requestId = randomUUID(), origin) => r.call('party-donations', u, { partyId, amountMinor, requestId }, origin);

for (const backend of ['sqlite', 'postgres']) {
  test(`/api/party-donations (${backend}): flag off is 404 for GET and POST before auth, with zero DB statements`, async t => {
    const r = await setup(t, backend);
    for (const flag of [undefined, 'false', 'TRUE']) {
      r.setFixtureEnv('HARIMU_PARTY_DONATIONS_ENABLED', flag);
      const off = await spy(r, async () => [await r.call('party-donations', 'alice'), await r.call('party-donations', null), await give(r, 'alice', 'open-ledger', 100), await give(r, 'alice', 'open-ledger', 100, undefined, 'https://evil.invalid')]);
      assert.deepEqual(off.result.map(x => x.status), [404, 404, 404, 404]); assert.deepEqual(off.sql, [], `flag ${flag}: no database access`);
    }
    assert.equal(await rows(r), 0);
  });

  test(`/api/party-donations (${backend}): balanced transfer, cap, balance refusal, replay, disclosure`, async t => {
    const r = await setup(t, backend);
    assert.equal((await give(r, null, 'open-ledger', 100)).status, 401);
    assert.equal((await give(r, 'cara', 'open-ledger', 100)).data.reason, 'not_kindle');
    assert.equal((await give(r, 'alice', 'open-ledger', 100, randomUUID(), 'https://evil.invalid')).status, 403, 'same origin');
    for (const body of [{ partyId: 'nope', amountMinor: 100, requestId: randomUUID() }, { partyId: 'open-ledger', amountMinor: 0, requestId: randomUUID() }, { partyId: 'open-ledger', amountMinor: 1.5, requestId: randomUUID() }, { partyId: 'open-ledger', amountMinor: 100 }])
      assert.equal((await r.call('party-donations', 'alice', body)).status, 400, JSON.stringify(body));
    await fund(r, 'alice', 80000); await fund(r, 'bob', 1000);
    const before = await wallet(r, 'alice');
    const id = randomUUID(), ok = await give(r, 'alice', 'open-ledger', 30000, id);
    assert.equal(ok.status, 200);
    assert.equal(await wallet(r, 'alice'), before - 30000, 'wallet debit');
    const party = ok.data.donations.parties.find(p => p.id === 'open-ledger');
    assert.equal(party.raisedMinor, 30000, 'party credit equals the debit: no Spark created');
    assert.deepEqual(party.recent.map(d => [d.donor, d.amountMinor]), [['Private alice', 30000]]);
    assert.equal((await give(r, 'alice', 'open-ledger', 30000, id)).status, 200, 'replay is idempotent'); assert.equal(await rows(r), 1);
    assert.equal((await give(r, 'bob', 'open-ledger', 30000, id)).data.reason, 'request_reused');
    const cap = await give(r, 'alice', 'open-ledger', 20001); assert.deepEqual([cap.status, cap.data.reason], [409, 'cap_reached']);
    assert.equal((await give(r, 'alice', 'open-ledger', 20000)).status, 200, 'exactly at the cap');
    assert.equal((await give(r, 'alice', 'open-ledger', 1)).data.reason, 'cap_reached');
    assert.equal((await give(r, 'alice', 'steady-hand', 20000)).status, 200, 'cap is per party');
    const poor = await give(r, 'bob', 'steady-hand', 1001); assert.deepEqual([poor.status, poor.data.reason], [409, 'insufficient_balance']);
    assert.equal(await wallet(r, 'alice'), before - 70000); assert.equal(await wallet(r, 'bob'), 1000);
    const pub = await r.call('party-donations', null);
    assert.equal(pub.status, 200, 'disclosure is public');
    assert.deepEqual(pub.data.donations.parties.map(p => [p.id, p.raisedMinor, p.recent.length]), [['steady-hand', 20000, 1], ['open-ledger', 50000, 2], ['dockside-builders', 0, 0]]);
    const total = await r.db.prepare('SELECT SUM(amount_minor) AS n FROM party_donations').first();
    assert.equal(Number(total.n), before - await wallet(r, 'alice'), 'party accounts sum to the wallet debits');
  });

  test(`/api/party-donations (${backend}): donations add no votes, ballot weight or primary weight`, async t => {
    const r = await setup(t, backend);
    const { readPrimaries } = await r.importModule('lib/primaries.ts');
    await r.db.prepare("INSERT INTO party_members (clerk_user_id,party_id,joined_at) VALUES ('bob','steady-hand',1)").run();
    const tally = async () => {
      const out = {};
      for (const table of ['party_members', 'primary_elections', 'primary_voter_receipts', 'primary_anonymous_ballots', 'civic_elections', 'civic_voter_receipts', 'civic_anonymous_ballots', 'party_plank_votes'])
        out[table] = Number((await r.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n);
      out.primaries = (await readPrimaries(r.db, 'alice', 1, null, null)).parties.map(p => [p.id, p.members]);
      out.election = (await r.call('election', 'alice')).data;
      return out;
    };
    const baseline = await tally();
    await fund(r, 'alice', 60000);
    assert.equal((await give(r, 'alice', 'open-ledger', 50000)).status, 200);
    assert.equal((await give(r, 'alice', 'steady-hand', 10000)).status, 200);
    assert.deepEqual(await tally(), baseline, 'ballot, primary, membership and plank tallies are unchanged by donations');
  });
}

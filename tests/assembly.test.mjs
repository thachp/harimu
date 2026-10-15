/** #283: Kindle mid-term Assembly (party list, D'Hondt per district, fixed AI bloc). HARIMU_TEST_STORAGE=postgres runs the runtime tests on PGlite. */
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';
import { postgresMigrations, isDestructive, transactionProblem } from '../scripts/postgres-migrations.mjs';

// The lib modules use extensionless imports, so load them through the runtime's transpiled copies.
const rt = await localRuntime(); after(() => rt.close());
const { dHondt, districtResult, assemblyResult, assemblyHeadlines, assemblyDistricts, assemblyPartyIds, assemblyIncumbents, assemblyBlocShares, assemblySeatsUp, assemblySeatsPerDistrict } = await rt.importModule('lib/assembly-rules.ts');
const { kindleParties } = await rt.importModule('lib/kindle-parties.ts');
const { ASSEMBLY_NAME_MAX } = await rt.importModule('lib/assembly-copy.ts');

const backend = process.env.HARIMU_TEST_STORAGE === 'postgres' ? 'postgres' : 'd1';
const S = 'steady-hand', O = 'open-ledger', D = 'dockside-builders';
const sumOf = v => Object.values(v).reduce((a, b) => a + b, 0);

test('#283 rules: D\'Hondt matches the hand-computed quotient table', () => {
  // 100, 80, 30 over 8 seats: quotients 100 80 50 40 33.3 30 26.7 25 -> A 4, B 3, C 1.
  assert.deepEqual(dHondt({ a: 100, b: 80, c: 30 }, 8, ['a', 'b', 'c']), { a: 4, b: 3, c: 1 });
  assert.deepEqual(dHondt({ a: 100, b: 100, c: 0 }, 1, ['a', 'b', 'c']), { a: 1, b: 0, c: 0 }, 'a tie goes to the declared party order');
  assert.deepEqual(dHondt({ a: 100, b: 100, c: 0 }, 3, ['a', 'b', 'c']), { a: 2, b: 1, c: 0 });
  assert.deepEqual(dHondt({ a: 0, b: 0, c: 0 }, 3, ['a', 'b', 'c']), { a: 0, b: 0, c: 0 }, 'no weight, no award');
});

test('#283 rules: two districts against hand-computed tables; half the seats up, the other half untouched', () => {
  // Forgehaven: humans S3 O1 D2 (N=6). AI bloc = 6 x shares 40/35/25 = S240 O210 D150. Weighted S 300+240=540, O 100+210=310, D 200+150=350.
  // Quotients: S 540 270 180 | D 350 175 | O 310 155. Top three: 540 (S), 350 (D), 310 (O) -> S1 D1 O1.
  const f = districtResult('forgehaven', { [S]: 3, [O]: 1, [D]: 2 });
  assert.deepEqual(f.weighted, { [S]: 540, [O]: 310, [D]: 350 }); assert.deepEqual(f.bloc, { [S]: 240, [O]: 210, [D]: 150 });
  assert.deepEqual(f.seatsWon, { [S]: 1, [O]: 1, [D]: 1 });
  assert.deepEqual(f.seatsUp, { [S]: 2, [O]: 1, [D]: 0 }); assert.deepEqual(f.seatsHeld, { [S]: 1, [O]: 1, [D]: 1 });
  assert.deepEqual(f.seatsAfter, { [S]: 2, [O]: 2, [D]: 2 }); // held + won
  // Tarrek Foundry: humans S0 O1 D1 (N=2). Bloc = 2 x 25/20/55 = S50 O40 D110. Weighted S 50, O 100+40=140, D 100+110=210.
  // Quotients: D 210 105 70 | O 140 70 | S 50. Top three: 210 (D), 140 (O), 105 (D) -> D2 O1 S0.
  const t = districtResult('tarrek-foundry', { [O]: 1, [D]: 1 });
  assert.deepEqual(t.weighted, { [S]: 0, [O]: 140, [D]: 210 }, '#351: Steady Hand has no human ballot here, under the 5% share, so its bloc weight (50) takes no part'); assert.deepEqual(t.belowThreshold, [S]); assert.deepEqual(t.seatsWon, { [S]: 0, [O]: 1, [D]: 2 });
  assert.deepEqual(t.seatsAfter, { [S]: 1, [O]: 2, [D]: 3 });
  // A district nobody voted in contests nothing: the seats up stay with their incumbents.
  const k = districtResult('kolt-savanna', {});
  assert.equal(k.contested, false); assert.deepEqual(k.seatsWon, k.seatsUp); assert.deepEqual(k.bloc, { [S]: 0, [O]: 0, [D]: 0 });
  const all = assemblyResult({ forgehaven: { [S]: 3, [O]: 1, [D]: 2 }, 'tarrek-foundry': { [O]: 1, [D]: 1 } });
  assert.equal(all.humanBallots, 8); assert.deepEqual(all.districts.map(d => d.districtId), assemblyDistricts.map(d => d.id));
  assert.equal(sumOf(all.totals.before), 18); assert.equal(sumOf(all.totals.after), 18);
});

test('#283 rules: invariants hold for every ballot mix', () => {
  assert.equal(assemblySeatsPerDistrict, 6); assert.equal(assemblySeatsUp, 3);
  for (const d of assemblyDistricts) { assert.equal(sumOf(assemblyIncumbents[d.id].up), 3, d.id); assert.equal(sumOf(assemblyIncumbents[d.id].held), 3, d.id); assert.equal(sumOf(assemblyBlocShares[d.id]), 100, d.id); }
  let seed = 7; const next = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let i = 0; i < 300; i++) for (const d of assemblyDistricts) {
    const r = districtResult(d.id, { [S]: next(9), [O]: next(9), [D]: next(9) });
    assert.equal(sumOf(r.seatsWon), 3); assert.equal(sumOf(r.seatsAfter), 6); assert.deepEqual(r.seatsHeld, assemblyIncumbents[d.id].held);
    assert.equal(sumOf(r.bloc), r.humanBallots * 100, 'the AI bloc totals exactly the human ballots, as 100 units each');
  }
  assert.throws(() => districtResult('nowhere', {}), RangeError); assert.throws(() => districtResult('forgehaven', { [S]: -1 }), RangeError);
});

test('#283 rules: Content #299 headlines are filled, capped and follow the seat change', () => {
  for (const p of kindleParties) assert.ok(p.name.length <= ASSEMBLY_NAME_MAX, p.name);
  for (const d of assemblyDistricts) assert.ok(d.name.length <= ASSEMBLY_NAME_MAX, d.name);
  const res = assemblyResult({ forgehaven: { [S]: 3, [O]: 1, [D]: 2 }, 'tarrek-foundry': { [O]: 1, [D]: 1 } });
  const lines = assemblyHeadlines(res), pick = (district, party) => lines.find(l => l.districtId === district && l.partyId === party);
  assert.equal(pick('forgehaven', S).stage, 'results-loss'); assert.equal(pick('forgehaven', O).stage, 'results-hold'); assert.equal(pick('forgehaven', D).stage, 'results-gain');
  assert.equal(pick('tarrek-foundry', D).stage, 'results-hold'); assert.equal(pick('tarrek-foundry', O).stage, 'results-gain'); assert.equal(pick('tarrek-foundry', S).stage, 'results-loss');
  assert.equal(pick('kolt-savanna', S).stage, 'results-hold', 'seats up with no ballots are held');
  assert.equal(pick('forgehaven', D).body.includes('Dockside Builders') || pick('forgehaven', D).headline.includes('Dockside Builders'), true);
  for (const l of lines) assert.doesNotMatch(l.headline + l.body, /\{(party|district|seats)\}/);
  assert.equal(lines.some(l => l.districtId === 'forgehaven' && l.partyId === D && /\b2\b/.test(l.body + l.headline)), true, 'seats held now are filled in');
});

const previewEnv = { NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW: 'true', HARIMU_ACCOUNT_ELECTION_POC_ENABLED: 'true' };
const W = 72 * 3600;
const writePattern = /^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i;
function recordWrites(r) {
  const writes = []; const prepare = r.db.prepare.bind(r.db); const batch = r.db.batch.bind(r.db);
  r.db.prepare = sql => { if (writePattern.test(sql)) writes.push(sql.replace(/\s+/g, ' ').slice(0, 90)); return prepare(sql); };
  r.db.batch = statements => { writes.push(`batch(${statements.length})`); return batch(statements); };
  return { writes, restore() { r.db.prepare = prepare; r.db.batch = batch; } };
}
async function setup(t, { flag = true, preview = true, openAtOffset = 0 } = {}) {
  const r = await localRuntime(preview ? { accountElectionBindings: previewEnv } : {}); t.after(() => r.close());
  const open = Math.floor(r.now / 1000) + openAtOffset;
  if (flag) r.setFixtureEnv('HARIMU_KINDLE_ASSEMBLY_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_KINDLE_ASSEMBLY_OPEN_AT', String(open));
  const iso = new Date(r.now).toISOString();
  const citizen = async (user, home) => {
    if (!['alice', 'bob'].includes(user)) await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,'kindle',?,18,0,'Good standing',?,?)").bind(user, `Private ${user}`, iso, iso).run();
    if (home) await r.db.prepare("INSERT INTO citizen_city_locations (user_id,nation_id,home_city_id,current_city_id,updated_at) VALUES (?,'kindle',?,?,?)").bind(user, home, home, Math.floor(r.now / 1000)).run();
  };
  const vote = (user, partyId, extra = {}) => r.call('assembly', user, { action: 'vote', electionId: 'kindle-assembly-account-poc-1', requestId: randomUUID(), partyId, ...extra });
  const count = async table => Number((await r.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n);
  const tick = async () => { await r.call('world', null); await r.call('world', null); };
  return { r, open, citizen, vote, count, tick };
}
const assemblyTables = ['assembly_elections', 'assembly_voter_receipts', 'assembly_anonymous_ballots'];

test(`#283 ${backend}: flag off is a complete no-op (even with the privacy preview on and an open time set)`, async t => {
  const c = await setup(t, { flag: false }); const { r } = c;
  const probe = recordWrites(r);
  try {
    const got = await r.call('assembly', 'alice'); assert.equal(got.status, 404); assert.deepEqual(got.data, { enabled: false });
    const posted = await c.vote('alice', S); assert.equal(posted.status, 404);
    await c.tick(); assert.deepEqual(probe.writes.filter(w => /assembly/i.test(w)), [], 'no assembly write');
  } finally { probe.restore(); }
  for (const table of assemblyTables) assert.equal(await c.count(table), 0, table);
  assert.equal((await r.call('citizen', 'alice')).status, 200);
});

test(`#283 ${backend}: flag on but the privacy gate closed: shows why, refuses ballots, the tick opens nothing`, async t => {
  const c = await setup(t, { preview: false }); const { r } = c;
  const got = await r.call('assembly', 'alice'); assert.equal(got.status, 200); assert.equal(got.data.privacyReady, false); assert.equal(got.data.status, 'waiting'); assert.match(got.data.privacyReason, /privacy/i);
  const posted = await r.call('assembly', 'alice', { action: 'vote', electionId: 'kindle-assembly-midterm-1', requestId: randomUUID(), partyId: S });
  assert.equal(posted.status, 403); assert.equal(posted.data.privacyReady, false);
  await c.tick(); for (const table of assemblyTables) assert.equal(await c.count(table), 0, table);
});

test(`#283 ${backend}: GET writes nothing: waiting, projected open and a due close and count`, async t => {
  const c = await setup(t, { openAtOffset: 3600 }); const { r } = c;
  const read = async () => { const probe = recordWrites(r); try { const res = await r.call('assembly', 'alice'); assert.equal(res.status, 200, JSON.stringify(res.data)); assert.deepEqual(probe.writes, []); return res.data; } finally { probe.restore(); } };
  const waiting = await read(); assert.equal(waiting.status, 'waiting'); assert.equal(waiting.opensAt, c.open);
  r.setNow((c.open + 60) * 1000); const projected = await read(); assert.equal(projected.status, 'open'); assert.equal(projected.closesAt, c.open + W);
  assert.equal(await c.count('assembly_elections'), 0, 'GET did not open the election');
  assert.equal((await c.vote('alice', S)).status, 200); assert.equal(await c.count('assembly_elections'), 1, 'POST opens it');
  r.setNow((c.open + W + 5) * 1000); const closed = await read(); assert.equal(closed.status, 'closed'); assert.equal(closed.result.humanBallots, 1);
  assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM assembly_elections WHERE closed_at IS NOT NULL OR result_json IS NOT NULL').first()).n), 0, 'GET did not close or record it');
  await c.tick();
  assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM assembly_elections WHERE closed_at IS NOT NULL AND result_json IS NOT NULL').first()).n), 1);
  assert.deepEqual((await read()).result, closed.result);
});

test(`#283 ${backend}: one ballot per voter, in their own district; the request cannot choose a district or edit a ballot`, async t => {
  const c = await setup(t); const { r } = c;
  await c.citizen('alice'); await c.citizen('bob', 'tarrek-foundry'); await c.citizen('carol', 'kolt-savanna'); await c.citizen('mallory', 'atlantis');
  const before = (await c.vote('alice', S, { districtId: 'kolt-savanna' })); assert.equal(before.status, 200, JSON.stringify(before.data));
  assert.equal(before.data.voted, true); assert.equal(before.data.yourDistrict.id, 'forgehaven'); assert.equal(before.data.result, null, 'no counts while voting is open');
  const ballots = async () => (await r.db.prepare('SELECT * FROM assembly_anonymous_ballots').all()).results;
  assert.deepEqual((await ballots()).map(b => [b.district_id, b.party_id]), [['forgehaven', S]], 'the district is derived server-side');
  // A retried request is recognised, and never edits the original ballot.
  const requestId = randomUUID();
  const first = await c.vote('bob', O, { requestId }); assert.equal(first.status, 200);
  const retry = await c.vote('bob', D, { requestId }); assert.equal(retry.status, 200); assert.equal(retry.data.alreadyRecorded, true);
  assert.deepEqual((await ballots()).filter(b => b.district_id === 'tarrek-foundry').map(b => b.party_id), [O]);
  // A second ballot under a new receipt is refused, as are a stolen receipt and malformed commands.
  assert.equal((await c.vote('bob', D)).status, 409); assert.equal((await r.call('assembly', 'carol', { action: 'vote', electionId: 'kindle-assembly-account-poc-1', requestId, partyId: S })).status, 409);
  assert.equal((await c.vote('carol', 'nobody')).status, 400); assert.equal((await c.vote('carol', S, { electionId: 'kindle-presidential-poc-1' })).status, 400);
  assert.equal((await r.call('assembly', 'carol', { action: 'vote', electionId: 'kindle-assembly-account-poc-1', requestId: 'not-a-uuid', partyId: S })).status, 400);
  assert.equal((await r.call('assembly', 'carol', { action: 'vote', electionId: 'kindle-assembly-account-poc-1', requestId: randomUUID(), partyId: [S, O] })).status, 400, 'exactly one list');
  assert.equal((await c.vote('carol', D)).status, 200); assert.equal((await c.vote('mallory', S)).status, 200);
  assert.deepEqual((await ballots()).map(b => b.district_id).sort(), ['forgehaven', 'forgehaven', 'kolt-savanna', 'tarrek-foundry'], 'an unknown home city falls back to the capital district');
  const anon = { action: 'vote', electionId: 'kindle-assembly-account-poc-1', requestId: randomUUID(), partyId: S };
  assert.equal((await r.call('assembly', null, anon)).status, 401); assert.equal((await r.call('assembly', 'nobody-here', anon)).status, 403, 'no citizen record, no ballot');
  await r.db.prepare("UPDATE citizens SET nation_id='aurelle' WHERE clerk_user_id='alice'").run();
  assert.equal((await r.call('assembly', 'alice')).status, 403, 'Kindle citizens only');
  // Voting outside the window is refused.
  await c.citizen('late', 'forgehaven'); r.setNow((c.open + W + 1) * 1000);
  assert.equal((await c.vote('late', S)).status, 409);
  assert.equal(await c.count('assembly_anonymous_ballots'), 4); assert.equal(await c.count('civic_voter_receipts'), 0); assert.equal(await c.count('civic_anonymous_ballots'), 0, 'the presidential tables are untouched');
});

test(`#283 ${backend}: a ballot carries no citizen, receipt id or time; the stored shape is minimal`, async t => {
  const c = await setup(t); const { r } = c;
  const requestId = randomUUID();
  assert.equal((await c.vote('alice', S, { requestId })).status, 200);
  const [ballot] = (await r.db.prepare('SELECT * FROM assembly_anonymous_ballots').all()).results;
  assert.deepEqual(Object.keys(ballot).sort(), ['district_id', 'election_id', 'id', 'party_id', 'policy']);
  assert.notEqual(ballot.id, requestId); assert.equal(ballot.policy, 'preview-citizen-v1');
  const receipt = (await r.db.prepare('SELECT * FROM assembly_voter_receipts').all()).results[0];
  assert.equal(receipt.request_id, requestId); assert.equal(receipt.ballot_written, 1); assert.equal('party_id' in receipt, false, 'the receipt never names the list');
  const view = await r.call('assembly', 'alice'); assert.equal(JSON.stringify(view.data).includes(requestId), false); assert.equal(view.data.voted, true);
});

test(`#283 ${backend}: the closed count is recorded once by the tick and matches the hand-computed table; seats up only`, async t => {
  const c = await setup(t); const { r } = c;
  const plan = [['forgehaven', S, 3], ['forgehaven', O, 1], ['forgehaven', D, 2], ['tarrek-foundry', O, 1], ['tarrek-foundry', D, 1]];
  let n = 0; for (const [district, party, votes] of plan) for (let i = 0; i < votes; i++) { const user = `v${n++}`; await c.citizen(user, district); assert.equal((await c.vote(user, party)).status, 200, user); }
  assert.equal((await r.call('assembly', 'v0')).data.result, null, 'results stay hidden until close');
  r.setNow((c.open + W + 1) * 1000); await c.tick(); await c.tick();
  const { data } = await r.call('assembly', 'v0'); assert.equal(data.status, 'closed');
  const byId = Object.fromEntries(data.result.districts.map(d => [d.districtId, d]));
  assert.deepEqual(byId.forgehaven.seatsWon, { [S]: 1, [O]: 1, [D]: 1 }); assert.deepEqual(byId.forgehaven.seatsAfter, { [S]: 2, [O]: 2, [D]: 2 });
  assert.deepEqual(byId['tarrek-foundry'].seatsWon, { [S]: 0, [O]: 1, [D]: 2 }); assert.deepEqual(byId['kolt-savanna'].seatsWon, byId['kolt-savanna'].seatsUp);
  for (const d of data.result.districts) { assert.equal(sumOf(d.seatsAfter), 6); assert.deepEqual(d.seatsHeld, assemblyIncumbents[d.districtId].held, 'the held half never changes'); }
  assert.deepEqual(byId.forgehaven.human, { [S]: 3, [O]: 1, [D]: 2 }); assert.deepEqual(byId.forgehaven.bloc, { [S]: 240, [O]: 210, [D]: 150 }, 'the AI bloc is its own block');
  assert.ok(data.headlines.length >= 7); const stored = (await r.db.prepare('SELECT closed_at,result_json FROM assembly_elections').all()).results;
  assert.equal(stored.length, 1); assert.equal(stored[0].result_json, JSON.stringify(data.result));
  await c.tick(); assert.equal((await r.db.prepare('SELECT result_json FROM assembly_elections').first()).result_json, stored[0].result_json, 'recorded once');
  // A tampered ballot count is caught, not published.
  await r.db.prepare('DELETE FROM assembly_anonymous_ballots WHERE id=(SELECT id FROM assembly_anonymous_ballots LIMIT 1)').run();
  await assert.rejects(r.call('assembly', 'v0'), /could not be confirmed|does not match/);
});

test(`#283 ${backend}: Tier-1 scope needs the certified privacy gate and a verified human`, async t => {
  const r = await localRuntime({ ballotPrivacyReady: true }); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_KINDLE_ASSEMBLY_ENABLED', 'true'); r.setFixtureEnv('HARIMU_KINDLE_ASSEMBLY_OPEN_AT', String(Math.floor(r.now / 1000)));
  const cmd = { action: 'vote', electionId: 'kindle-assembly-midterm-1', requestId: randomUUID(), partyId: O };
  const unverified = await r.call('assembly', 'alice', cmd); assert.equal(unverified.status, 403);
  r.setVerification('alice', { userId: 'alice', emailVerified: true, phoneVerified: true, phoneUnique: true, revoked: false, checkedAt: r.now, expiresAt: r.now + 60000 });
  const ok = await r.call('assembly', 'alice', { ...cmd, requestId: randomUUID() }); assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.scope, 'tier1'); assert.equal((await r.db.prepare('SELECT policy FROM assembly_anonymous_ballots').first()).policy, 'tier1-human-v1');
});

test('#283 migration 0034 is additive, matches the runtime schema and passes the guard', async () => {
  const d1 = await readFile('drizzle/0034_kindle_assembly.sql', 'utf8'), pg = await readFile('db/postgres/0034_kindle_assembly.sql', 'utf8'), src = await readFile('lib/assembly.ts', 'utf8');
  for (const name of ['assemblyElectionSchema', 'assemblyReceiptSchema', 'assemblyBallotSchema']) {
    const schema = src.match(new RegExp(`export const ${name} = \`([\\s\\S]*?)\`;`))[1].replace(/\s*\n\s*/g, ' ').trim()
      .replace('${districtList}', "'forgehaven','tarrek-foundry','kolt-savanna'").replace('${partyList}', assemblyPartyIds.map(id => `'${id}'`).join(','));
    assert.ok(d1.includes(schema), `${name} matches the D1 migration`);
  }
  assert.deepEqual(assemblyDistricts.map(d => d.id), ['forgehaven', 'tarrek-foundry', 'kolt-savanna']);
  const m = postgresMigrations().find(x => x.file === '0034_kindle_assembly.sql'); assert.ok(m);
  assert.deepEqual([...m.tables].sort(), ['assembly_anonymous_ballots', 'assembly_elections', 'assembly_voter_receipts']);
  assert.ok(!isDestructive(pg) && !isDestructive(d1)); assert.equal(transactionProblem(pg), null);
  assert.doesNotMatch(src.match(/export const assemblyBallotSchema = `([\s\S]*?)`;/)[1], /(_at|time|clerk|request)/i, 'the ballot table has no time, citizen or receipt column');
});

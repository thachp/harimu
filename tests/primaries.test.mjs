/** #307: Kindle party membership and human primaries (members rank their own party's AI hopefuls, instant-runoff, no AI votes).
 *  HARIMU_TEST_STORAGE=postgres runs the runtime tests on PGlite. */
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { localRuntime as fixtureRuntime } from './helpers/local-runtime.mjs';
const localRuntime = (options = {}) => fixtureRuntime({ presidentialCalendar: true, ...options }); // #918: the presidential vote opens only inside the calendar window
import { postgresMigrations, isDestructive, transactionProblem } from '../scripts/postgres-migrations.mjs';
import { instantRunoffCounts } from '../lib/instant-runoff.ts';

// The lib modules use extensionless imports, so load them through the runtime's transpiled copies.
const rt = await localRuntime(); after(() => rt.close());
const { hopefuls, hopefulsOf, countPrimary, primaryResult, generalSlate, nomineeAnnouncements, partyIds } = await rt.importModule('lib/primaries-rules.ts');
const { electionCandidates } = await rt.importModule('lib/elections.ts');
const { pledge, kindleParties } = await rt.importModule('lib/kindle-parties.ts');
const { CAMPAIGN_NAME_MAX } = await rt.importModule('lib/campaign-copy.ts');

const backend = process.env.HARIMU_TEST_STORAGE === 'postgres' ? 'postgres' : 'd1';
const S = 'steady-hand', O = 'open-ledger', D = 'dockside-builders';
const ids = party => hopefulsOf(party).map(h => h.id);

test('#307 roster: three AI hopefuls per party, the presidential candidate is each party\'s incumbent hopeful', () => {
  for (const party of partyIds) {
    const list = hopefulsOf(party); assert.equal(list.length, 3, party); assert.equal(list.filter(h => h.incumbent).length, 1);
    for (const h of list) { assert.equal(h.ai, true); assert.ok(h.name.length <= CAMPAIGN_NAME_MAX, h.name); assert.ok(h.pledges.length >= 3 && h.pledges.length <= 5); for (const k of h.pledges) assert.ok(pledge(k), `${h.id} pledge ${k}`); }
  }
  assert.deepEqual(hopefuls.filter(h => h.incumbent).map(h => h.id), electionCandidates.map(c => c.id));
  assert.equal(new Set(hopefuls.map(h => h.id)).size, 9);
});

test('#307 count: the instant-runoff result matches lib/instant-runoff.ts on a fixture with an elimination round; the AI bloc is empty', () => {
  const [ines, corin, yelena] = ids(S);
  // 10 members: 4 ines>yelena>corin, 3 corin>yelena>ines, 3 yelena>corin>ines. Round 1: 4/3/3 of 40 units, nobody above 20.
  // Corin and Yelena tie on 12; the declared order eliminates corin. Corin's 3 go to yelena: round 2 yelena 6 (24 units) beats ines 4.
  const groups = [{ ranking: [ines, yelena, corin], count: 4 }, { ranking: [corin, yelena, ines], count: 3 }, { ranking: [yelena, corin, ines], count: 3 }];
  const out = countPrimary(S, groups, 12);
  assert.deepEqual(out.runoff, instantRunoffCounts(ids(S), groups, []), 'the shared library, no bloc');
  assert.equal(out.runoff.rounds[0].eliminated, corin); assert.deepEqual(out.runoff.rounds[0].human, { [ines]: 4, [corin]: 3, [yelena]: 3 });
  assert.equal(out.nominee, yelena); assert.equal(out.decided, true); assert.equal(out.ballots, 10); assert.equal(out.members, 12);
  assert.equal(out.runoff.simulatedPublicUnits, 0, 'AI citizens contribute nothing');
  for (const round of out.runoff.rounds) assert.ok(Object.values(round.simulatedUnits).every(n => n === 0));
  // The presidential count (with its bloc) is unchanged by the empty-bloc path.
  const withBloc = instantRunoffCounts(ids(S), groups, ids(S));
  assert.equal(withBloc.simulatedPublicUnits, 10); assert.ok(withBloc.rounds.some(r => Object.values(r.simulatedUnits).some(n => n > 0)));
});

test('#307 count: no ballots keeps the incumbent hopeful as nominee; a foreign hopeful on a ballot is refused', () => {
  const none = countPrimary(D, [], 3); assert.equal(none.decided, false); assert.equal(none.nominee, 'mara-quell'); assert.equal(none.ballots, 0);
  assert.throws(() => countPrimary(S, [{ ranking: ids(O), count: 1 }], 1), RangeError);
  const all = primaryResult({ [S]: { groups: [{ ranking: ids(S), count: 2 }], members: 2 } });
  assert.deepEqual(Object.keys(all.nominees), partyIds); assert.equal(all.nominees[S], ids(S)[0]);
});

test('#307 general slate: one nominee per party in the same three slots; no primary means today\'s candidates', () => {
  assert.deepEqual(generalSlate(null), electionCandidates.map(c => ({ id: c.id, name: c.name, platform: c.platform })));
  const slate = generalSlate({ [S]: 'yelena-brask', [O]: 'marek-voss', [D]: 'mara-quell' });
  assert.deepEqual(slate.map(c => c.id), electionCandidates.map(c => c.id)); assert.deepEqual(slate.map(c => c.name), ['Yelena Brask', 'Marek Voss', 'Mara Quell']);
  assert.deepEqual(generalSlate({ [S]: 'marek-voss' })[0].name, 'Ines Varro', 'a nominee from another party is never used');
  const lines = nomineeAnnouncements(primaryResult({})); assert.equal(lines.length, 3);
  for (const l of lines) assert.doesNotMatch(l.text, /\{(hopeful|party)\}/);
  assert.ok(lines[0].text.includes('Ines Varro') && lines[0].text.includes(kindleParties[0].name));
});

const previewEnv = { NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW: 'true', HARIMU_ACCOUNT_ELECTION_POC_ENABLED: 'true' };
const W = 72 * 3600;
const writePattern = /^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i;
function recordSql(r, pattern) {
  const seen = []; const prepare = r.db.prepare.bind(r.db); const batch = r.db.batch.bind(r.db);
  r.db.prepare = sql => { if (pattern.test(sql)) seen.push(sql.replace(/\s+/g, ' ').slice(0, 90)); return prepare(sql); };
  r.db.batch = statements => { if (statements.some(x => pattern.test(x.sql ?? ''))) seen.push(`batch(${statements.length})`); return batch(statements); };
  return { seen, restore() { r.db.prepare = prepare; r.db.batch = batch; } };
}
async function setup(t, { flag = true, preview = true, openAtOffset = 3600 } = {}) {
  const r = await localRuntime(preview ? { accountElectionBindings: previewEnv } : {}); t.after(() => r.close());
  const open = Math.floor(r.now / 1000) + openAtOffset, iso = new Date(r.now).toISOString();
  if (flag) r.setFixtureEnv('HARIMU_PRIMARIES_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_PRIMARIES_OPEN_AT', String(open));
  const citizen = async user => { if (!['alice', 'bob'].includes(user)) await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,'kindle',?,18,0,'Good standing',?,?)").bind(user, `Private ${user}`, iso, iso).run(); };
  const join = (user, partyId) => r.call('primaries', user, { action: 'join', partyId });
  const vote = (user, ranking, extra = {}) => r.call('primaries', user, { action: 'vote', electionId: 'kindle-primary-account-poc-1', requestId: randomUUID(), ranking, ...extra });
  const count = async table => Number((await r.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n);
  const tick = async () => { await r.call('world', null); await r.call('world', null); };
  const start = () => r.setNow((open + 60) * 1000); // the primary window is open from here
  return { r, open, citizen, join, vote, count, tick, start };
}
const primaryTables = ['party_members', 'primary_elections', 'primary_voter_receipts', 'primary_anonymous_ballots'];

test(`#307 ${backend}: flag off is a complete no-op, including today's general election flow`, async t => {
  const c = await setup(t, { flag: false }); const { r } = c;
  const probe = recordSql(r, /primary_|party_members/i);
  let plain;
  try {
    assert.equal((await r.call('primaries', 'alice')).status, 404); assert.equal((await c.join('alice', S)).status, 404); assert.equal((await c.vote('alice', ids(S))).status, 404);
    await c.tick();
    plain = await r.call('election', 'alice'); assert.equal(plain.status, 200);
    const { candidateIds } = await r.importModule('lib/elections.ts');
    assert.equal((await r.call('election', 'alice', { action: 'vote', electionId: plain.data.id, requestId: randomUUID(), ranking: [...candidateIds] })).status, 200);
    assert.deepEqual(probe.seen, [], 'no primaries or membership table was read or written');
  } finally { probe.restore(); }
  assert.deepEqual(plain.data.candidates.map(x => x.name), electionCandidates.map(x => x.name));
  for (const table of primaryTables) assert.equal(await c.count(table), 0, table);
});

test(`#307 ${backend}: membership is one party at a time, for Kindle citizens, and can be left`, async t => {
  const c = await setup(t); const { r } = c;
  assert.equal((await c.join('alice', 'nobody')).status, 400); assert.equal((await r.call('primaries', null, { action: 'join', partyId: S })).status, 401);
  assert.equal((await r.call('primaries', 'alice', { action: 'wave' })).status, 400);
  const first = await c.join('alice', S); assert.equal(first.status, 200, JSON.stringify(first.data)); assert.equal(first.data.yourParty, S);
  assert.equal((await c.join('alice', O)).data.yourParty, O, 'switching replaces, never adds'); assert.equal(await c.count('party_members'), 1);
  assert.equal((await c.join('bob', O)).data.parties.find(p => p.id === O).members, 2);
  const left = await r.call('primaries', 'alice', { action: 'leave' }); assert.equal(left.status, 200); assert.equal(left.data.yourParty, null); assert.equal(await c.count('party_members'), 1);
  await r.db.prepare("UPDATE citizens SET nation_id='aurelle' WHERE clerk_user_id='bob'").run();
  assert.equal((await c.join('bob', S)).status, 403, 'Kindle citizens only'); assert.equal((await r.call('primaries', 'bob')).status, 403);
  assert.equal(JSON.stringify((await r.call('primaries', 'alice')).data).includes('bob'), false, 'other members are never named');
});

test(`#307 ${backend}: GET writes nothing: waiting, projected open, and a due close and count`, async t => {
  const c = await setup(t, { openAtOffset: 3600 }); const { r } = c;
  const read = async () => { const probe = recordSql(r, writePattern); try { const res = await r.call('primaries', 'alice'); assert.equal(res.status, 200, JSON.stringify(res.data)); assert.deepEqual(probe.seen, []); return res.data; } finally { probe.restore(); } };
  const waiting = await read(); assert.equal(waiting.status, 'waiting'); assert.equal(waiting.opensAt, c.open); assert.equal(waiting.hopefuls.length, 9);
  await c.join('alice', S); r.setNow((c.open + 60) * 1000); const projected = await read(); assert.equal(projected.status, 'open'); assert.equal(projected.canChangeParty, false);
  assert.equal(await c.count('primary_elections'), 0, 'GET did not open it');
  assert.equal((await c.vote('alice', ids(S))).status, 200); assert.equal(await c.count('primary_elections'), 1, 'POST opens it');
  r.setNow((c.open + W + 5) * 1000); const closed = await read(); assert.equal(closed.status, 'closed'); assert.equal(closed.result.parties[0].ballots, 1);
  assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM primary_elections WHERE closed_at IS NOT NULL OR result_json IS NOT NULL').first()).n), 0);
  await c.tick(); assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM primary_elections WHERE closed_at IS NOT NULL AND result_json IS NOT NULL').first()).n), 1);
  assert.deepEqual((await read()).result, closed.result);
});

test(`#307 ${backend}: only members vote, only in their own party's primary, once; membership is frozen while it is open`, async t => {
  const c = await setup(t); const { r } = c;
  await c.citizen('carol'); await c.citizen('dave');
  assert.equal((await c.vote('alice', ids(S))).status, 403, 'a non-member cannot cast a primary ballot');
  await c.join('alice', S); await c.join('bob', O); await c.join('carol', S); c.start();
  const first = await c.vote('alice', ids(S)); assert.equal(first.status, 200, JSON.stringify(first.data)); assert.equal(first.data.voted, true); assert.equal(first.data.result, null, 'no counts while open');
  // A member of one party cannot vote in another's primary: the party is her membership, and her ranking must be exactly her own hopefuls.
  assert.equal((await c.vote('bob', ids(S))).status, 400); assert.equal((await c.vote('bob', ids(S), { partyId: S })).status, 400);
  assert.equal((await c.vote('bob', [...ids(O).slice(0, 2), ids(S)[0]])).status, 400); assert.equal((await c.vote('bob', ids(O).slice(0, 2))).status, 400, 'all hopefuls, once each');
  assert.equal((await c.vote('bob', [ids(O)[0], ids(O)[0], ids(O)[1]])).status, 400);
  assert.equal((await r.call('primaries', 'bob', { action: 'vote', electionId: 'kindle-primary-1', requestId: randomUUID(), ranking: ids(O) })).status, 400, 'wrong election id');
  assert.equal((await r.call('primaries', 'bob', { action: 'vote', electionId: 'kindle-primary-account-poc-1', requestId: 'nope', ranking: ids(O) })).status, 400);
  const requestId = randomUUID(); assert.equal((await c.vote('bob', ids(O), { requestId })).status, 200);
  const retry = await c.vote('bob', [...ids(O)].reverse(), { requestId }); assert.equal(retry.status, 200); assert.equal(retry.data.alreadyRecorded, true);
  assert.equal((await c.vote('bob', ids(O))).status, 409, 'one ballot per voter'); assert.equal((await r.call('primaries', 'carol', { action: 'vote', electionId: 'kindle-primary-account-poc-1', requestId, ranking: ids(S) })).status, 409, 'a stolen receipt');
  assert.equal((await c.vote('dave', ids(S))).status, 403);
  // Membership is frozen while the window is open: no switching to vote twice, and no leaving.
  assert.equal((await c.join('alice', O)).status, 409); assert.equal((await r.call('primaries', 'alice', { action: 'leave' })).status, 409); assert.equal((await c.join('dave', D)).status, 409);
  assert.equal(await c.count('party_members'), 3);
  const ballots = (await r.db.prepare('SELECT * FROM primary_anonymous_ballots').all()).results;
  assert.equal(ballots.length, 2); assert.deepEqual(ballots.map(b => b.party_id).sort(), [O, S]); assert.deepEqual(JSON.parse(ballots.find(b => b.party_id === O).ranking), ids(O), 'the retry never edited it');
  assert.deepEqual(Object.keys(ballots[0]).sort(), ['election_id', 'id', 'party_id', 'policy', 'ranking'], 'no citizen, receipt id or time on a ballot');
  r.setNow((c.open + W + 1) * 1000); assert.equal((await c.vote('carol', ids(S))).status, 409, 'voting closed');
  assert.equal(await c.count('civic_voter_receipts'), 0); assert.equal(await c.count('civic_anonymous_ballots'), 0);
});

test(`#307 ${backend}: the closed count is recorded once; each party gets one nominee; the general ballot shows exactly those`, async t => {
  const c = await setup(t); const { r } = c;
  const [ines, corin, yelena] = ids(S);
  const plan = [[S, [ines, yelena, corin], 4], [S, [corin, yelena, ines], 3], [S, [yelena, corin, ines], 3], [O, ids(O), 2]];
  let n = 0; for (const [party, , votes] of plan) for (let i = 0; i < votes; i++) { const user = `m${n++}`; await c.citizen(user); assert.equal((await c.join(user, party)).status, 200); }
  await c.citizen('lurker'); await c.join('lurker', D); c.start();
  // The general ballot waits for the primary once it is due.
  assert.equal((await r.call('election', 'alice')).data.status, 'waiting');
  const blocked = await r.call('election', 'alice', { action: 'vote', electionId: (await r.call('election', 'alice')).data.id, requestId: randomUUID(), ranking: electionCandidates.map(x => x.id) });
  assert.equal(blocked.status, 409);
  n = 0; for (const [, ranking, votes] of plan) for (let i = 0; i < votes; i++) { const user = `m${n++}`; assert.equal((await c.vote(user, ranking)).status, 200, user); }
  assert.equal((await r.call('primaries', 'm0')).data.result, null);
  assert.equal((await r.call('election', 'alice')).data.status, 'waiting', 'still waiting while the primary is open');
  r.setNow((c.open + W + 1) * 1000); await c.tick(); await c.tick();
  const { data } = await r.call('primaries', 'm0'); assert.equal(data.status, 'closed');
  const by = Object.fromEntries(data.result.parties.map(p => [p.partyId, p]));
  assert.equal(by[S].nominee, yelena); assert.equal(by[S].ballots, 10); assert.equal(by[S].members, 10); assert.equal(by[S].runoff.rounds[0].eliminated, corin);
  assert.equal(by[O].ballots, 2); assert.equal(by[D].ballots, 0); assert.equal(by[D].members, 1); assert.equal(by[D].nominee, 'mara-quell'); assert.equal(by[D].decided, false);
  assert.equal(by[S].runoff.simulatedPublicUnits, 0); assert.equal(data.announcements.length, 3); assert.ok(data.announcements[0].text.includes('Yelena Brask'));
  const stored = (await r.db.prepare('SELECT result_json FROM primary_elections').all()).results; assert.equal(stored.length, 1); assert.equal(stored[0].result_json, JSON.stringify(data.result));
  await c.tick(); assert.equal((await r.db.prepare('SELECT result_json FROM primary_elections').first()).result_json, stored[0].result_json, 'recorded once');
  // The general ballot: exactly one nominee per party, same three slots.
  const general = await r.call('election', 'alice'); assert.equal(general.status, 200); assert.equal(general.data.status, 'open');
  assert.deepEqual(general.data.candidates.map(x => x.id), electionCandidates.map(x => x.id));
  assert.equal(general.data.candidates[0].name, 'Yelena Brask'); assert.equal(general.data.candidates[1].name, by[O].nominee === 'tobin-achterberg' ? 'Tobin Achterberg' : hopefuls.find(h => h.id === by[O].nominee).name); assert.equal(general.data.candidates[2].name, 'Mara Quell');
  r.setFixtureEnv('HARIMU_KINDLE_CYCLE_START_AT', String(Math.floor(r.now / 1000) - 30 * 86400)); // #918: this vote's calendar window opens now
  const voted = await r.call('election', 'alice', { action: 'vote', electionId: general.data.id, requestId: randomUUID(), ranking: general.data.candidates.map(x => x.id) });
  assert.equal(voted.status, 200, JSON.stringify(voted.data)); assert.equal(voted.data.candidates[0].name, 'Yelena Brask');
  assert.equal(JSON.parse((await r.db.prepare('SELECT candidates_json FROM poc_elections').first()).candidates_json)[0].name, 'Yelena Brask', 'the stored slate carries the nominee');
  // Turning the flag off puts today's flow straight back.
  r.setFixtureEnv('HARIMU_PRIMARIES_ENABLED', undefined);
  assert.equal((await r.call('primaries', 'alice')).status, 404);
});

test(`#307 ${backend}: flag on but the privacy gate closed: members can join, ballots are refused, nothing opens`, async t => {
  const c = await setup(t, { preview: false }); const { r } = c;
  const got = await r.call('primaries', 'alice'); assert.equal(got.status, 200); assert.equal(got.data.privacyReady, false); assert.equal(got.data.status, 'waiting');
  assert.equal((await c.join('alice', S)).status, 200);
  const posted = await r.call('primaries', 'alice', { action: 'vote', electionId: 'kindle-primary-1', requestId: randomUUID(), ranking: ids(S) }); assert.equal(posted.status, 403); assert.equal(posted.data.privacyReady, false);
  await c.tick(); assert.equal(await c.count('primary_elections'), 0);
  assert.equal((await r.call('election', 'alice')).data.status, 'waiting');
});

test(`#307 ${backend}: Tier-1 scope needs the certified privacy gate and a verified human; a tampered count is refused`, async t => {
  const r = await localRuntime({ ballotPrivacyReady: true }); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_PRIMARIES_ENABLED', 'true'); const open = Math.floor(r.now / 1000) + 3600; r.setFixtureEnv('HARIMU_PRIMARIES_OPEN_AT', String(open));
  assert.equal((await r.call('primaries', 'alice', { action: 'join', partyId: O })).status, 200); r.setNow((open + 60) * 1000);
  const cmd = () => ({ action: 'vote', electionId: 'kindle-primary-1', requestId: randomUUID(), ranking: ids(O) });
  assert.equal((await r.call('primaries', 'alice', cmd())).status, 403);
  r.setVerification('alice', { userId: 'alice', emailVerified: true, phoneVerified: true, phoneUnique: true, revoked: false, checkedAt: r.now, expiresAt: r.now + 60000 });
  const ok = await r.call('primaries', 'alice', cmd()); assert.equal(ok.status, 200, JSON.stringify(ok.data)); assert.equal(ok.data.scope, 'tier1');
  assert.equal((await r.db.prepare('SELECT policy FROM primary_anonymous_ballots').first()).policy, 'tier1-human-v1');
  // #356: the Tier-1 scope never shows the account-preview wording (operators may correlate submissions).
  const tier1 = await r.call('primaries', 'alice'); assert.equal(tier1.data.privacyReady, true); assert.equal(tier1.data.privacyReason, ''); assert.doesNotMatch(JSON.stringify(tier1.data), /correlate/i);
  r.setNow((open + W + 1) * 1000); assert.equal((await r.call('primaries', 'alice')).data.result.parties[1].ballots, 1);
  await r.db.prepare('DELETE FROM primary_anonymous_ballots').run();
  await assert.rejects(r.call('primaries', 'alice'), /could not be confirmed/);
});

test('#307 migration 0036 is additive, matches the runtime schema and passes the guard', async () => {
  const d1 = await readFile('drizzle/0036_kindle_primaries.sql', 'utf8'), pg = await readFile('db/postgres/0036_kindle_primaries.sql', 'utf8'), src = await readFile('lib/primaries.ts', 'utf8');
  for (const name of ['partyMemberSchema', 'primaryElectionSchema', 'primaryReceiptSchema', 'primaryBallotSchema']) {
    const schema = src.match(new RegExp(`export const ${name} = \`([\\s\\S]*?)\`;`))[1].replace(/\s*\n\s*/g, ' ').trim().replace('${partyList}', partyIds.map(id => `'${id}'`).join(','));
    assert.ok(d1.includes(schema), `${name} matches the D1 migration`);
  }
  const m = postgresMigrations().find(x => x.file === '0036_kindle_primaries.sql'); assert.ok(m);
  assert.deepEqual([...m.tables].sort(), ['party_members', 'primary_anonymous_ballots', 'primary_elections', 'primary_voter_receipts']);
  assert.ok(!isDestructive(pg) && !isDestructive(d1)); assert.equal(transactionProblem(pg), null);
  assert.doesNotMatch(src.match(/export const primaryBallotSchema = `([\s\S]*?)`;/)[1], /(_at|time|clerk|request)/i, 'the ballot table has no time, citizen or receipt column');
});

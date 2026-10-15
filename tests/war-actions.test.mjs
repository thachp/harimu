/** #350: server-only declare / propose-end / accept-end commands behind HARIMU_WAR_ENABLED. Authority table per nation, both-sides ending, reuse of #309/#402 checks. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';
import { authorizeWarRole, bearerMatches, warAuthority } from '../lib/war-authority.ts';

const D = 86400, SECRET = 'a-very-long-server-only-secret';
const bearer = `Bearer ${SECRET}`;
async function setup(t, { flag = true, backend, shardDaysAgo = 31 } = {}) {
  const r = await localRuntime(backend ? { backend } : {}); t.after(() => r.close());
  const nowS = () => Math.floor(r.now / 1000);
  if (shardDaysAgo !== null) r.setFixtureEnv('HARIMU_SHARD_STARTED_AT', String(nowS() - shardDaysAgo * D));
  const actions = await r.importModule('lib/war-actions.ts'), war = await r.importModule('lib/war.ts');
  const cmd = (body, { authorization = bearer, secret = SECRET, enabled = flag, now = nowS() } = {}) => actions.handleWarCommand(r.db, { enabled, secret, authorization, body: { requestId: randomUUID(), ...body }, now });
  const declare = (over = {}, opts) => cmd({ action: 'declare', nation: 'korund', role: 'Chairman', defender: 'kindle', casusBelli: 'Border incidents', ...over }, opts);
  const actionRows = async () => (await r.db.prepare('SELECT * FROM war_actions ORDER BY acted_at,id').all()).results.map(x => ({ ...x }));
  const wars = async () => (await r.db.prepare('SELECT * FROM wars').all()).results.map(x => ({ ...x }));
  return { r, nowS, actions, war, cmd, declare, actionRows, wars };
}
async function writesDuring(r, fn) {
  const writes = [], prepare = r.db.prepare.bind(r.db), batch = r.db.batch.bind(r.db);
  r.db.prepare = sql => { if (/^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i.test(sql)) writes.push(sql.replace(/\s+/g, ' ').slice(0, 50)); return prepare(sql); };
  r.db.batch = s => { writes.push('batch'); return batch(s); };
  try { await fn(); } finally { r.db.prepare = prepare; r.db.batch = batch; }
  return writes;
}
async function treaty(r, at) {
  const id = randomUUID();
  await r.db.prepare("INSERT INTO treaties (id,request_id,pair_key,kind,proposer_nation,other_nation,proposed_by,proposed_at,status,decided_at,ratified_at,ends_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(id, id, 'kindle:korund', 'non-aggression', 'kindle', 'korund', 'AI', at - 110, 'in_force', at - 100, at - 100, at + 1000).run();
}

test('pure authority table: Kindle President (proposal, assembly majority as data), Korund Chairman alone, Aurelle Monarch by decree', async () => {
  assert.deepEqual(warAuthority.kindle, { office: 'President', mode: 'proposal', ratifier: 'assembly majority' });
  assert.deepEqual(warAuthority.korund, { office: 'Chairman', mode: 'decree', ratifier: 'chairman alone' });
  assert.deepEqual(warAuthority.aurelle, { office: 'Monarch', mode: 'decree', ratifier: 'royal decree' });
  assert.deepEqual(authorizeWarRole('korund', ' chairman '), { ok: true, office: 'Chairman', mode: 'decree', ratifier: 'chairman alone' }, 'case and spaces ignored');
  for (const [nation, role] of [['kindle', 'Chairman'], ['korund', 'President'], ['aurelle', 'President'], ['kindle', ''], ['kindle', 'Secretary of State'], ['korund', 7], ['aurelle', undefined]]) assert.deepEqual(authorizeWarRole(nation, role), { ok: false, reason: 'wrong_role' }, `${nation}/${role}`);
  assert.deepEqual(authorizeWarRole('varkand', 'President'), { ok: false, reason: 'unknown_nation' }); assert.deepEqual(authorizeWarRole(null, 'x'), { ok: false, reason: 'unknown_nation' });
  assert.equal(await bearerMatches(bearer, SECRET), true); assert.equal(await bearerMatches('Bearer nope-nope-nope-nope', SECRET), false);
  assert.equal(await bearerMatches(SECRET, SECRET), false, 'needs the Bearer scheme'); assert.equal(await bearerMatches(null, SECRET), false);
  assert.equal(await bearerMatches('Bearer short', 'short'), false, 'a short secret never authorizes'); assert.equal(await bearerMatches(bearer, undefined), false); assert.equal(await bearerMatches('Bearer ', SECRET), false);
});

test('flag off: 403 before the credential is even read, nothing is written; a wrong or missing credential is 401 and writes nothing', async t => {
  const off = await setup(t, { flag: false });
  const writes = await writesDuring(off.r, async () => {
    for (const body of [{ action: 'declare', nation: 'korund', role: 'Chairman', defender: 'kindle' }, { action: 'propose-end', warId: 'war-x', kind: 'peace', nation: 'korund', role: 'Chairman' }, { action: 'accept-end', warId: 'war-x', nation: 'korund', role: 'Chairman' }, { action: 'nope' }]) {
      for (const authorization of [bearer, null, 'Bearer wrong']) { const res = await off.cmd(body, { authorization }); assert.equal(res.status, 403); assert.equal(res.reason, 'disabled'); }
    }
  });
  assert.deepEqual(writes, []); assert.deepEqual(await off.wars(), []);
  const on = await setup(t);
  const bad = await writesDuring(on.r, async () => {
    assert.equal((await on.declare({}, { authorization: null })).status, 401); assert.equal((await on.declare({}, { authorization: 'Bearer wrong-wrong-wrong-wrong' })).reason, 'unauthorized');
    assert.equal((await on.declare({}, { secret: '' })).status, 401, 'no server secret configured: fail closed'); assert.equal((await on.declare({}, { secret: 'short' , authorization: 'Bearer short' })).status, 401);
  });
  assert.deepEqual(bad, []); assert.deepEqual(await on.wars(), []);
  assert.equal((await on.cmd({ action: 'bogus' })).status, 400);
});

test('declare: each nation\'s own office may; any other role or a missing role may not; the authority is recorded (Kindle as a President proposal)', async t => {
  const { declare, actionRows, wars, war, nowS } = await setup(t);
  const ko = await declare(); assert.equal(ko.ok, true, JSON.stringify(ko)); assert.deepEqual(ko.authority, { office: 'Chairman', mode: 'decree', ratifier: 'chairman alone' });
  assert.equal(ko.war.attacker, 'korund'); assert.equal(ko.war.defender, 'kindle'); assert.equal(ko.war.status, 'mobilizing'); assert.equal(ko.war.declaredBy, 'Neral Voss', 'the named AI leader of the nation');
  const au = await declare({ nation: 'aurelle', role: 'Monarch', defender: 'korund' }); assert.equal(au.ok, true, JSON.stringify(au)); assert.equal(au.authority.mode, 'decree'); assert.equal(au.war.declaredBy, 'Maera Solenne');
  const rows = await actionRows(); assert.deepEqual(rows.map(x => [x.action, x.nation, x.role, x.authority, x.ratifier]).sort(), [['declare', 'aurelle', 'Monarch', 'decree', 'royal decree'], ['declare', 'korund', 'Chairman', 'decree', 'chairman alone']]);
  // Kindle: recorded as a President proposal; the Assembly majority is data only (no vote is built), and the declaration is made.
  const { r: r2, declare: d2, actionRows: rows2 } = await setup(t);
  const ki = await d2({ nation: 'kindle', role: 'President', defender: 'aurelle', declaredBy: '  AI <b>President</b>  ' });
  assert.equal(ki.ok, true, JSON.stringify(ki)); assert.deepEqual(ki.authority, { office: 'President', mode: 'proposal', ratifier: 'assembly majority' }); assert.equal(ki.war.declaredBy, 'AI b President /b');
  assert.deepEqual((await rows2()).map(x => [x.action, x.authority, x.ratifier]), [['declare', 'proposal', 'assembly majority']]);
  // Refusals write nothing.
  const writes = await writesDuring(r2, async () => {
    for (const [nation, role] of [['kindle', 'Chairman'], ['korund', 'President'], ['aurelle', 'Chairman'], ['kindle', 'Secretary of State'], ['korund', '']]) { const res = await d2({ nation, role, defender: 'korund', requestId: randomUUID() }); assert.equal(res.status, 403, `${nation}/${role}`); assert.equal(res.reason, 'not_authorized'); }
    assert.equal((await d2({ nation: 'varkand', role: 'President' })).reason, 'bad_nations'); assert.equal((await d2({ defender: 'korund', nation: 'korund', role: 'Chairman' })).reason, 'bad_nations', 'a nation cannot declare on itself');
    assert.equal((await d2({ requestId: 'short' })).reason, 'bad_request');
  });
  assert.deepEqual(writes, []);
  assert.equal((await wars()).length, 2); assert.equal(nowS() > 0, true); assert.equal(typeof war.declareWar, 'function');
});

test('declare reuses the #309/#402 checks: Founding Period, a non-aggression pact in force and the peace lock refuse, and no authority row is written', async t => {
  const young = await setup(t, { shardDaysAgo: 5 }); const early = await young.declare(); assert.equal(early.status, 409); assert.equal(early.reason, 'founding_period'); assert.deepEqual(await young.actionRows(), []);
  const { r, declare, actionRows, nowS } = await setup(t); await treaty(r, nowS());
  const pact = await declare(); assert.equal(pact.status, 409); assert.equal(pact.reason, 'non_aggression'); assert.deepEqual(await actionRows(), []);
  assert.equal((await declare({ nation: 'kindle', role: 'President', defender: 'korund' })).reason, 'non_aggression', 'either direction');
  assert.equal((await declare({ nation: 'aurelle', role: 'Monarch', defender: 'kindle' })).ok, true, 'a pact only covers its own pair');
});

test('declare is idempotent by request id; the authority row is repaired on a retry; a different request cannot reuse the id', async t => {
  const { declare, actionRows, wars, r } = await setup(t); const requestId = randomUUID();
  const one = await declare({ requestId }); assert.equal(one.ok, true); const two = await declare({ requestId });
  assert.equal(two.ok, true); assert.equal(two.replay, true); assert.equal(two.war.id, one.war.id); assert.equal((await wars()).length, 1); assert.equal((await actionRows()).length, 1);
  await r.db.prepare('DELETE FROM war_actions').run(); assert.equal((await declare({ requestId })).replay, true); assert.equal((await actionRows()).length, 1, 'a retry rewrites the authority record');
  assert.equal((await declare({ requestId, defender: 'aurelle' })).reason, 'request_reused');
  assert.equal((await declare({ requestId: randomUUID() })).reason, 'war_exists', 'one open war per pair');
});

test('ending a war needs both sides: either side proposes, the other side\'s office accepts; the peace lock then starts', async t => {
  const { r, cmd, declare, actionRows, wars, nowS } = await setup(t);
  const made = await declare({ nation: 'korund', role: 'Chairman', defender: 'aurelle' }); const warId = made.war.id;
  const propose = (over = {}) => cmd({ action: 'propose-end', warId, kind: 'ceasefire', nation: 'aurelle', role: 'Monarch', ...over });
  const accept = (over = {}) => cmd({ action: 'accept-end', warId, nation: 'korund', role: 'Chairman', ...over });
  assert.equal((await accept()).reason, 'no_proposal');
  assert.equal((await propose({ role: 'Chairman' })).reason, 'not_authorized'); assert.equal((await propose({ kind: 'surrender' })).reason, 'bad_request'); assert.equal((await propose({ nation: 'kindle', role: 'President' })).reason, 'not_a_party');
  assert.equal((await propose({ warId: 'war-nope' })).reason, 'not_found');
  const rid = randomUUID(); const p = await propose({ requestId: rid }); assert.equal(p.ok, true, JSON.stringify(p)); assert.equal(p.kind, 'ceasefire'); assert.equal(p.awaiting, 'korund'); assert.equal(p.authority.office, 'Monarch');
  assert.equal((await propose({ requestId: rid })).replay, true, 'a retry returns the saved proposal');
  assert.equal((await propose({ nation: 'korund', role: 'Chairman', kind: 'peace' })).reason, 'proposal_pending', 'one proposal per war');
  assert.equal((await wars())[0].ended_at, null, 'a proposal alone does not end the war');
  assert.equal((await accept({ nation: 'aurelle', role: 'Monarch' })).reason, 'own_proposal', 'the proposing side cannot accept its own proposal');
  assert.equal((await accept({ role: 'Monarch' })).reason, 'not_authorized'); assert.equal((await accept({ nation: 'kindle', role: 'President' })).reason, 'not_a_party');
  const at = nowS() + 100; const done = await cmd({ action: 'accept-end', warId, nation: 'korund', role: 'Chairman', requestId: randomUUID() }, { now: at });
  assert.equal(done.ok, true, JSON.stringify(done)); assert.equal(done.kind, 'ceasefire'); assert.equal(done.war.status, 'ended'); assert.equal(done.war.endKind, 'treaty'); assert.equal(done.war.peaceLockEndsAt, at + 10 * D);
  assert.deepEqual((await actionRows()).map(x => [x.action, x.nation, x.end_kind]).sort(), [['accept-end', 'korund', null], ['declare', 'korund', null], ['propose-end', 'aurelle', 'ceasefire']]);
  assert.equal((await accept({ requestId: randomUUID() })).reason, 'war_ended'); assert.equal((await propose({ requestId: randomUUID() })).reason, 'war_ended');
  const lock = await declare({ nation: 'korund', role: 'Chairman', defender: 'aurelle' }, { now: at + 10 * D - 1 }); assert.equal(lock.reason, 'peace_lock', 'the peace lock from #309 applies');
  assert.equal((await declare({ nation: 'korund', role: 'Chairman', defender: 'aurelle' }, { now: at + 10 * D })).ok, true);
  assert.equal(typeof r.now, 'number');
});

test('accept is idempotent and finishes an accepted end that did not complete; two concurrent accepts end the war once', async t => {
  const a = await setup(t); const warId = (await a.declare({ nation: 'kindle', role: 'President', defender: 'korund' })).war.id;
  assert.equal((await a.cmd({ action: 'propose-end', warId, kind: 'peace', nation: 'korund', role: 'Chairman' })).ok, true);
  const rid = randomUUID(); const accept = (requestId = rid) => a.cmd({ action: 'accept-end', warId, nation: 'kindle', role: 'President', requestId });
  assert.equal((await accept()).ok, true); assert.equal((await accept()).replay, true);
  await a.r.db.prepare('UPDATE wars SET ended_at=NULL,end_kind=NULL').run(); // simulate a crash between the accept row and the end
  const fixed = await accept(); assert.equal(fixed.replay, true); assert.equal(fixed.war.status, 'ended', 'the retry completes the end');
  const b = await setup(t); const w2 = (await b.declare()).war.id;
  assert.equal((await b.cmd({ action: 'propose-end', warId: w2, kind: 'ceasefire', nation: 'kindle', role: 'President' })).ok, true);
  const both = await Promise.all([randomUUID(), randomUUID()].map(requestId => b.cmd({ action: 'accept-end', warId: w2, nation: 'korund', role: 'Chairman', requestId })));
  assert.deepEqual(both.map(x => x.status ?? 200).sort(), [200, 409]); assert.ok(['already_accepted', 'war_ended'].includes(both.find(x => !x.ok).reason), 'the loser sees the claim or the ended war');
  assert.equal((await b.actionRows()).filter(x => x.action === 'accept-end').length, 1);
});

test('credential before body: a bad body without credentials is 401 (flag off still 403 first), with credentials it is 400', async t => {
  const { r, actions, cmd } = await setup(t);
  const call = (input) => actions.authorizeWarCaller({ enabled: true, secret: SECRET, ...input });
  assert.equal((await call({ authorization: null }))?.status, 401);
  assert.equal((await call({ authorization: 'Bearer wrong-wrong-wrong-wrong' }))?.status, 401);
  assert.equal((await actions.authorizeWarCaller({ enabled: false, secret: SECRET, authorization: null })).status, 403, 'flag off is 403 even without credentials');
  assert.equal(await call({ authorization: bearer }), null);
  for (const body of [{}, { action: 'nope' }, { action: 5 }]) {
    assert.equal((await actions.handleWarCommand(r.db, { enabled: true, secret: SECRET, authorization: null, body, now: 1 })).status, 401, 'bad body without credentials');
    assert.equal((await cmd(body)).status, 400, 'bad body with credentials');
  }
});

test('GETs write nothing: war reads and the world snapshot are read-only; the route has no GET and no citizen session, and checks the flag first', async t => {
  const { r, war, declare, nowS } = await setup(t); await declare();
  const writes = await writesDuring(r, async () => { await war.readWars(r.db, nowS()); await r.call('world', 'alice'); });
  assert.deepEqual(writes.filter(w => /war_actions|wars/.test(w)), []);
  const route = await readFile(new URL('../app/api/war/route.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(route, /export (async )?function GET/); assert.doesNotMatch(route, /authenticatedUserId|@clerk/); assert.match(route, /export async function POST/);
  assert.ok(route.indexOf("HARIMU_WAR_ENABLED !== 'true'") < route.indexOf('readCommandObject('), 'the flag is checked before the body is read');
  assert.ok(route.indexOf("HARIMU_WAR_ENABLED !== 'true'") < route.indexOf('authorizeWarCaller(') && route.indexOf('authorizeWarCaller(') < route.indexOf('readCommandObject('), 'flag first, then the credential, then the body is read');
  assert.doesNotMatch(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'), /HARIMU_WAR_ADMIN_SECRET/, 'the secret never goes in the repo config');
});

test('migration 0041 is additive in both dialects, and the flag is still default "false"', async () => {
  const cfg = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.deepEqual([...cfg.matchAll(/"HARIMU_WAR_ENABLED"\s*:\s*"([^"]*)"/g)].map(m => m[1]), ['false']);
  for (const file of ['../drizzle/0041_war_actions.sql', '../db/postgres/0041_war_actions.sql']) {
    const sql = (await readFile(new URL(file, import.meta.url), 'utf8')).replace(/^--.*$/gm, '').replace(/ON DELETE CASCADE/g, '');
    assert.doesNotMatch(sql, /\b(DROP|ALTER|RENAME|DELETE|UPDATE)\b/i, file); assert.match(sql, /CREATE TABLE IF NOT EXISTS war_actions/);
  }
  const walk = async dir => (await Promise.all((await readdir(dir, { withFileTypes: true })).map(e => e.isDirectory() ? walk(new URL(`${e.name}/`, dir)) : [new URL(e.name, dir)]))).flat();
  for (const file of await walk(new URL('../app/', import.meta.url))) if (/\.(ts|tsx)$/.test(file.pathname) && !file.pathname.endsWith('/api/war/route.ts')) assert.doesNotMatch(await readFile(file, 'utf8'), /war-actions|declareByAuthority|proposeEnd|acceptEnd|HARIMU_WAR_ADMIN_SECRET/, file.pathname);
});

test('the same commands work on PostgreSQL (PGlite): declare, propose, accept', async t => {
  const { cmd, declare, actionRows } = await setup(t, { backend: 'postgres' });
  const made = await declare({ nation: 'aurelle', role: 'Monarch', defender: 'korund' }); assert.equal(made.ok, true, JSON.stringify(made)); const warId = made.war.id;
  assert.equal((await cmd({ action: 'propose-end', warId, kind: 'peace', nation: 'korund', role: 'Chairman' })).ok, true);
  assert.equal((await cmd({ action: 'accept-end', warId, nation: 'aurelle', role: 'Monarch' })).war.status, 'ended');
  assert.equal((await actionRows()).length, 3);
});

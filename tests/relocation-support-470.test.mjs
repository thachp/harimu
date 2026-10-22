/** #470 slice 2 (Decision 109): relocation support claims, on SQLite and PGlite. Flag off (no DB calls), eligibility, flat split and caps, weekly cap, idempotency, replay, pot never overpaid, lapse, empty pot,
 *  the shared TSR balance and reconciliation legs, the Postgres 0058 migration, and the flag in both wrangler files. Numbers are the [ASSUMPTION]s in lib/relocation-support-rules.ts. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { localRuntime } from './helpers/local-runtime.mjs';
import * as rules from '../lib/relocation-support-rules.ts';

const D = 86400;
const evidence = (r, id) => ({ userId: id, emailVerified: true, phoneVerified: true, phoneUnique: true, revoked: false, checkedAt: r.now, expiresAt: r.now + 60000 });
async function scene(t, backend, { enabled = true, citizens = ['ava', 'ben'], defender = 'kindle', captures = 1 } = {}) {
  const r = await localRuntime(backend ? { backend } : {}); t.after(() => r.close());
  if (enabled) r.setFixtureEnv('HARIMU_RELOCATION_SUPPORT_ENABLED', 'true');
  const lib = await r.importModule('lib/relocation-support.ts'), now = Math.floor(r.now / 1000), attacker = defender === 'kindle' ? 'korund' : 'kindle';
  const run = (sql, ...b) => r.db.prepare(sql).bind(...b).run();
  await run('INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,declared_by,declared_at,mobilization_ends_at) VALUES (?,?,?,?,?,?,?,?)', 'w1', 'rq-w1', `${defender}:${attacker}`, attacker, defender, 'test', now - 9 * D, now - 7 * D);
  for (let i = 1; i <= captures; i++) {
    await run('INSERT INTO city_sieges (id,war_id,city_key,city_kind,center_x,center_y,attacker_nation,defender_nation,created_at,captured_at) VALUES (?,?,?,?,?,?,?,?,?,?)', `s${i}`, 'w1', i === 1 ? `outpost:${defender}` : `city:founded-${i}`, i === 1 ? 'outpost' : 'founded', i, i, attacker, defender, now - 5 * D, now - D);
    await run('INSERT INTO city_captures (id,siege_id,war_id,request_id,attacker_nation,defender_nation,squares_transferred,squares_kept_private,captured_at) VALUES (?,?,?,?,?,?,?,?,?)', `cap${i}`, `s${i}`, 'w1', `rq-cap${i}`, attacker, defender, 1, 0, now - D);
  }
  const home = defender === 'kindle' ? 'ashby-crossing' : 'krel-arsenal';
  const citizen = async (id, { nation = defender, homeCity = home, created = now - 10 * D } = {}) => {
    const at = new Date(created * 1000).toISOString();
    await run("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,?,?,18,0,'Good standing',?,?)", id, nation, id, at, at);
    await run('INSERT INTO citizen_city_locations (user_id,nation_id,home_city_id,current_city_id,updated_at) VALUES (?,?,?,?,?)', id, nation, homeCity, homeCity, created);
    r.setVerification(id, evidence(r, id));
  };
  for (const id of citizens) await citizen(id);
  let n = 0;
  const claim = (user, captureId = 'cap1', requestId = `req-relief-${++n}`) => r.call('relocation/claim', user, { action: 'claim', captureId, requestId });
  const count = async (table, where = '1=1') => Number((await r.db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).first()).n);
  return { r, lib, now, run, citizen, claim, count };
}
const body = async res => ({ status: res.status, ...res.data });

test('rules: flat floor split, per-citizen cap, pot cap, weekly cap, top-up off', () => {
  assert.equal(rules.perCitizenMinor(10000, 100), 100); assert.equal(rules.perCitizenMinor(10000, 3), 500); assert.equal(rules.perCitizenMinor(10000, 0), 0); assert.equal(rules.perCitizenMinor(0, 5), 0);
  assert.equal(rules.perCitizenMinor(10000, 30001), 0, 'a pot smaller than its citizens pays nothing rather than a fraction');
  assert.equal(rules.protocolPotMinor(0), 10000); assert.equal(rules.protocolPotMinor(25000), 5000); assert.equal(rules.protocolPotMinor(30000), 0); assert.equal(rules.protocolPotMinor(40000), 0);
  assert.equal(rules.reliefTreasuryTopupCapMinor, 0); assert.deepEqual([...rules.reliefNations], ['kindle']);
});

for (const backend of ['sqlite', 'postgres']) {
  test(`flag off: 404 before auth and zero prepare/batch calls; flag on makes calls (${backend})`, async t => {
    const c = await scene(t, backend, { enabled: false });
    let calls = 0; const prepare = c.r.db.prepare.bind(c.r.db), batch = c.r.db.batch.bind(c.r.db);
    c.r.db.prepare = sql => { calls++; return prepare(sql); }; c.r.db.batch = x => { calls++; return batch(x); };
    const results = [await c.claim('ava'), await c.claim(undefined), await c.r.call('relocation/claim', 'ava', { action: 'bogus' })];
    c.r.db.prepare = prepare; c.r.db.batch = batch;
    for (const res of results) assert.equal(res.status, 404);
    assert.equal(calls, 0, 'flag off reads nothing');
    c.r.setFixtureEnv('HARIMU_RELOCATION_SUPPORT_ENABLED', 'TRUE'); assert.equal((await c.claim('ava')).status, 404, 'only exactly "true" enables it');
    c.r.setFixtureEnv('HARIMU_RELOCATION_SUPPORT_ENABLED', 'true'); let on = 0; c.r.db.prepare = sql => { on++; return prepare(sql); };
    await c.claim('ava'); c.r.db.prepare = prepare; assert.ok(on > 0, 'the spy sees calls when on');
  });

  test(`claim: flat payout from the capped pot, one per citizen, replay, request reuse, balance + reconciliation legs (${backend})`, async t => {
    const c = await scene(t, backend);
    const a = await body(await c.claim('ava', 'cap1', 'req-ava-00001'));
    assert.deepEqual([a.status, a.ok, a.amountMinor, a.currency], [200, true, 500, 'TSR'], JSON.stringify(a)); // 10000 / 2 eligible = 5000, capped at 500
    const replay = await body(await c.claim('ava', 'cap1', 'req-ava-00001')); assert.deepEqual([replay.status, replay.replay, replay.amountMinor], [200, true, 500]);
    assert.equal((await body(await c.claim('ava', 'cap1', 'req-ava-00002'))).reason, 'already_claimed');
    assert.equal((await body(await c.claim('ben', 'cap1', 'req-ava-00001'))).reason, 'request_reused');
    assert.equal((await body(await c.claim('ben'))).amountMinor, 500);
    assert.equal(await c.count('relocation_support_claims'), 2); assert.equal(await c.count('relocation_support_pots'), 1);
    const pot = await c.r.db.prepare('SELECT protocol_minor,treasury_topup_minor,eligible_count,per_citizen_minor FROM relocation_support_pots').first();
    assert.deepEqual([pot.protocol_minor, pot.treasury_topup_minor, pot.eligible_count, pot.per_citizen_minor].map(Number), [10000, 0, 2, 500]);
    const ex = await c.r.importModule('lib/tessera-exchange.ts'), registry = await c.r.importModule('lib/world-registry.ts');
    assert.equal(Number((await c.r.db.prepare(`SELECT ${ex.tesseraBalanceSql} AS b`).bind(...ex.tesseraBalanceBinds('ava')).first()).b), 500);
    assert.equal(await registry.readTessera(c.r.db, 'ava'), 500, 'support counts in the spendable balance');
    const recon = await c.r.importModule('lib/ledger-reconciliation.ts'); const src = await readFile(new URL('../lib/ledger-reconciliation.ts', import.meta.url), 'utf8');
    assert.match(src, /FROM relocation_support_claims`/); assert.match(src, /relocation_claims_over_pot/); assert.ok(recon);
    const over = await c.r.db.prepare(`SELECT p.capture_id AS acct FROM relocation_support_pots p WHERE COALESCE((SELECT SUM(c.amount_minor) FROM relocation_support_claims c WHERE c.capture_id = p.capture_id), 0) > p.protocol_minor + p.treasury_topup_minor`).all();
    assert.equal(over.results.length, 0);
  });

  test(`eligibility: wrong home, wrong nation, joined after the siege, unverified, non-Kindle defender, lapsed, unknown capture (${backend})`, async t => {
    const c = await scene(t, backend, { citizens: ['ava'] });
    await c.citizen('far', { homeCity: 'forgehaven' }); await c.citizen('late', { created: c.now - 2 * D }); await c.citizen('kor', { nation: 'korund' });
    await c.citizen('bot'); c.r.setVerification('bot', { ...evidence(c.r, 'bot'), phoneVerified: false });
    for (const [user, reason] of [['far', 'not_eligible'], ['late', 'not_eligible'], ['kor', 'not_eligible'], ['bot', 'not_verified']]) assert.equal((await body(await c.claim(user))).reason, reason, user);
    assert.equal((await body(await c.claim('ava', 'cap-none'))).reason, 'no_capture');
    assert.equal(await c.count('relocation_support_claims'), 0); assert.equal(await c.count('relocation_support_pots'), 0, 'a refused claim writes no pot');
    c.r.setNow(c.r.now + (rules.reliefLapseSeconds + 1) * 1000); assert.equal((await body(await c.claim('ava'))).reason, 'lapsed');
    const k = await scene(t, backend, { defender: 'korund', citizens: ['kim'] }); assert.equal((await body(await k.claim('kim'))).reason, 'nation_not_supported');
  });

  test(`weekly cap: the third pot in a week is empty and says so; a pot never pays more than it holds (${backend})`, async t => {
    const c = await scene(t, backend, { citizens: [], captures: 4 });
    for (let i = 1; i <= 4; i++) { const id = `u${i}`; await c.citizen(id, { homeCity: i === 1 ? 'ashby-crossing' : `founded-${i}` }); }
    await c.run('INSERT INTO relocation_support_pots (capture_id,protocol_minor,treasury_topup_minor,eligible_count,per_citizen_minor,created_at) VALUES (?,?,?,?,?,?)', 'cap4', 20000, 0, 1, 500, c.now - 3600); // an earlier pot used 200.00 of the 300.00
    assert.equal((await body(await c.claim('u1', 'cap1'))).amountMinor, 500); // gets the last 100.00
    const empty = await body(await c.claim('u2', 'cap2')); assert.deepEqual([empty.status, empty.reason], [409, 'pot_empty']); assert.match(empty.error, /No funds/);
    const used = Number((await c.r.db.prepare('SELECT SUM(protocol_minor) AS n FROM relocation_support_pots').first()).n); assert.equal(used, rules.reliefWeeklyCapMinor);
    // A pot sized for one citizen never pays a second, even if a second becomes eligible later.
    await c.run('INSERT INTO relocation_support_pots (capture_id,protocol_minor,treasury_topup_minor,eligible_count,per_citizen_minor,created_at) VALUES (?,?,?,?,?,?)', 'cap3', 500, 0, 1, 500, c.now - 8 * D);
    await c.citizen('u5', { homeCity: 'founded-3' });
    assert.equal((await body(await c.claim('u3', 'cap3'))).amountMinor, 500); assert.equal((await body(await c.claim('u5', 'cap3'))).reason, 'pot_empty');
  });

  test(`two simultaneous claims never overpay and each citizen is paid once (${backend})`, async t => {
    const c = await scene(t, backend, { citizens: ['ava', 'ben', 'cyn'] });
    const res = await Promise.all([c.claim('ava'), c.claim('ben'), c.claim('cyn'), c.claim('ava')].map(p => p.then(body)));
    assert.equal(res.filter(x => x.ok && !x.replay).length, 3, JSON.stringify(res));
    assert.equal(Number((await c.r.db.prepare('SELECT SUM(amount_minor) AS n FROM relocation_support_claims').first()).n), 1500);
    assert.equal(await c.count('relocation_support_pots'), 1);
  });
}

test('the capture code is untouched and the module stays Tessera-only', async () => {
  for (const f of ['lib/siege-actions.ts', 'lib/siege.ts']) assert.doesNotMatch(await readFile(new URL(`../${f}`, import.meta.url), 'utf8'), /relocation/i, f);
  const src = await readFile(new URL('../lib/relocation-support.ts', import.meta.url), 'utf8') + await readFile(new URL('../lib/relocation-support-rules.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src.replace(/no Spark|Spark or Kindle exchange link/g, ''), /spark|citizen_tessera_exchanges|economy_funds|wallet/i);
  assert.doesNotMatch(src, /citizen_tessera_ledger/, 'no ledger rows: the reason CHECK is untouched');
  assert.doesNotMatch(await readFile(new URL('../lib/relocation-support-rules.ts', import.meta.url), 'utf8'), /^import /m, 'rules stay import-free');
});

test('flag: preview "true", production "false", comment on its own line', async () => {
  for (const [file, value] of [['wrangler.jsonc', 'true'], ['wrangler.prod.jsonc', 'false']]) {
    const text = await readFile(new URL(`../${file}`, import.meta.url), 'utf8'), line = text.split('\n').find(l => l.includes('"HARIMU_RELOCATION_SUPPORT_ENABLED"'));
    assert.equal(line.trim(), `"HARIMU_RELOCATION_SUPPORT_ENABLED": "${value}",`, file);
  }
});

test('Postgres 0058 is additive, re-runnable, matches SQLite, and enforces the guards', async () => {
  const pg = await readFile(new URL('../db/postgres/0058_relocation_support.sql', import.meta.url), 'utf8'), lite = await readFile(new URL('../drizzle/0058_relocation_support.sql', import.meta.url), 'utf8');
  assert.equal(pg.replace(/ COLLATE "C"/g, '').replace(/BIGINT/g, 'INTEGER'), lite);
  assert.doesNotMatch(pg + lite, /ALTER|DROP|citizen_tessera_ledger/i);
  const db = new PGlite();
  await db.exec(`CREATE TABLE citizens (clerk_user_id TEXT COLLATE "C" PRIMARY KEY); CREATE TABLE city_captures (id TEXT COLLATE "C" PRIMARY KEY); INSERT INTO citizens VALUES ('ava'); INSERT INTO city_captures VALUES ('c1');`);
  await db.exec(pg); await db.exec(pg);
  await db.exec("INSERT INTO relocation_support_pots VALUES ('c1',100,0,1,100,1)");
  await assert.rejects(db.exec("INSERT INTO relocation_support_pots VALUES ('c1',100,0,1,100,1)"));
  await assert.rejects(db.exec("INSERT INTO relocation_support_claims VALUES ('c1','ava','r1',0,1)"), /check/i);
  await db.exec("INSERT INTO relocation_support_claims VALUES ('c1','ava','r1',100,1)");
  await assert.rejects(db.exec("INSERT INTO relocation_support_claims VALUES ('c1','ava','r2',100,1)"));
  await db.close();
});

// QA1 follow-ups on #667: each test below fails under its mutation (weekly-cap re-check removed from the pot insert; lapse `>` to `>=`; before-siege `<` to `<=`).
for (const backend of ['sqlite', 'postgres']) {
  test(`weekly cap: two simultaneous first claims on different captures never overrun the cap (${backend})`, async t => {
    const c = await scene(t, backend, { citizens: [], captures: 4 });
    for (let i = 1; i <= 3; i++) await c.citizen(`u${i}`, { homeCity: i === 1 ? 'ashby-crossing' : `founded-${i}` });
    await c.run('INSERT INTO relocation_support_pots (capture_id,protocol_minor,treasury_topup_minor,eligible_count,per_citizen_minor,created_at) VALUES (?,?,?,?,?,?)', 'cap4', 20000, 0, 1, 500, c.now - 3600); // 100.00 left this week
    const res = await Promise.all([c.claim('u1', 'cap1'), c.claim('u2', 'cap2'), c.claim('u3', 'cap3')].map(p => p.then(body)));
    const used = Number((await c.r.db.prepare('SELECT SUM(protocol_minor) AS n FROM relocation_support_pots').first()).n);
    assert.equal(used, rules.reliefWeeklyCapMinor, `the re-check inside the insert holds the weekly cap: ${JSON.stringify(res)}`);
    assert.equal(res.filter(x => x.ok).length, 1, JSON.stringify(res));
    assert.equal(res.filter(x => x.reason === 'pot_empty').length, 2, JSON.stringify(res));
  });

  test(`lapse edge: exactly 30 days after capture still pays; one second later is lapsed (${backend})`, async t => {
    const c = await scene(t, backend);
    const capturedAt = Number((await c.r.db.prepare("SELECT captured_at FROM city_captures WHERE id='cap1'").first()).captured_at);
    c.r.setNow((capturedAt + rules.reliefLapseSeconds) * 1000);
    for (const id of ['ava', 'ben']) c.r.setVerification(id, evidence(c.r, id)); // fresh evidence at the new clock
    const atEdge = await body(await c.claim('ava'));
    assert.equal(atEdge.amountMinor, 500, `exactly at the lapse is still open: ${JSON.stringify(atEdge)}`);
    c.r.setNow((capturedAt + rules.reliefLapseSeconds + 1) * 1000);
    assert.equal((await body(await c.claim('ben'))).reason, 'lapsed');
  });

  test(`siege-start edge: a citizen created exactly at siege start is not eligible; one second before is (${backend})`, async t => {
    const c = await scene(t, backend, { citizens: [] });
    const start = Number((await c.r.db.prepare("SELECT created_at FROM city_sieges WHERE id='s1'").first()).created_at);
    await c.citizen('at', { created: start }); await c.citizen('pre', { created: start - 1 });
    assert.equal((await body(await c.claim('at'))).reason, 'not_eligible');
    assert.equal((await body(await c.claim('pre'))).amountMinor, 500);
  });
}

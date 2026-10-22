/** #426: war declaration rate limits (1 per nation per 14 real days, 2 active offensive wars) and the casus belli gate (grievance score >= 40), ARC's final ruling.
 *  Behind HARIMU_WAR_DECLARATION_LIMITS_ENABLED (default "false") on top of HARIMU_WAR_ENABLED. Fixed clocks only. SQLite and PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';
import { declarationLimitBlock, declarationLimits, declarationNextAt, declarationNextDay, grievanceConfig, grievanceScore, pairKey } from '../lib/war-rules.ts';

const D = 86400, SECRET = 'a-very-long-server-only-secret';
const none = { napBrokenByTarget: false, embargoAgainstUs: false, tradeTreatyBrokenByTarget: false, borderIncidents: 0, openCommonsDispute: false };

test('pure rules: the ruling\'s weights, the 40 threshold, the border-incident cap and the exact 14-day boundary', () => {
  assert.equal(grievanceConfig.threshold, 40);
  assert.equal(grievanceScore(none), 0);
  assert.equal(grievanceScore({ ...none, napBrokenByTarget: true }), 40, 'a broken pact alone clears the gate');
  assert.equal(grievanceScore({ ...none, embargoAgainstUs: true }), 20); assert.equal(grievanceScore({ ...none, tradeTreatyBrokenByTarget: true }), 15);
  assert.equal(grievanceScore({ ...none, openCommonsDispute: true }), 10);
  assert.equal(grievanceScore({ ...none, borderIncidents: 2 }), 20); assert.equal(grievanceScore({ ...none, borderIncidents: 3 }), 30); assert.equal(grievanceScore({ ...none, borderIncidents: 99 }), 30, 'border incidents cap at +30');
  assert.equal(grievanceScore({ napBrokenByTarget: true, embargoAgainstUs: true, tradeTreatyBrokenByTarget: true, borderIncidents: 9, openCommonsDispute: true }), 40 + 20 + 15 + 30 + 10, 'everything stacks');
  assert.equal(grievanceScore({ ...none, embargoAgainstUs: true, tradeTreatyBrokenByTarget: true, openCommonsDispute: true }), 45, '20+15+10 reaches the threshold without a pact');
  for (const bad of [-5, NaN, Infinity, '3', null, undefined]) assert.equal(grievanceScore({ ...none, borderIncidents: bad }), 0, `a bad incident count (${String(bad)}) adds nothing`);
  assert.equal(grievanceScore({ ...none, napBrokenByTarget: 'yes' }), 0, 'only a real true counts');
  const open = { now: 100 * D, lastDeclaredAt: null, activeOffensiveWars: 0, grievance: 40 };
  assert.equal(declarationLimitBlock(open), null);
  assert.equal(declarationLimitBlock({ ...open, grievance: 39 }), 'casus_belli_insufficient');
  assert.equal(declarationLimits.intervalSeconds, 14 * D); assert.equal(declarationLimits.activeOffensiveMax, 2);
  assert.equal(declarationLimitBlock({ ...open, lastDeclaredAt: open.now - 14 * D + 1 }), 'rate_limit_declarations', 'one second early');
  assert.equal(declarationLimitBlock({ ...open, lastDeclaredAt: open.now - 14 * D }), null, '14 real days exactly');
  assert.equal(declarationLimitBlock({ ...open, activeOffensiveWars: 1 }), null); assert.equal(declarationLimitBlock({ ...open, activeOffensiveWars: 2 }), 'rate_limit_active_wars');
  assert.equal(declarationLimitBlock({ now: 100 * D, lastDeclaredAt: 99 * D, activeOffensiveWars: 2, grievance: 0 }), 'rate_limit_declarations', 'declaration interval, then active wars, then grievance');
  assert.equal(declarationLimitBlock({ ...open, activeOffensiveWars: 2, grievance: 0 }), 'rate_limit_active_wars');
  assert.equal(declarationLimitBlock({ ...open, activeOffensiveWars: NaN }), 'rate_limit_active_wars', 'an unreadable count fails closed'); assert.equal(declarationLimitBlock({ ...open, grievance: NaN }), 'casus_belli_insufficient');
  assert.equal(declarationNextAt(1000), 1000 + 14 * D);
  // The refusal date is the first UTC midnight at or after the moment the nation can declare again, so "on {date}" is never a day it still cannot declare.
  assert.equal(declarationNextDay(1000), 15 * D, 'a few seconds into a day rounds up to the next midnight');
  assert.equal(declarationNextDay(D), 15 * D, 'exactly midnight stays on that day');
  assert.equal(declarationNextDay(D + 1), 16 * D, 'one second after midnight rounds up');
  assert.equal(declarationNextDay(0), 14 * D);
});

test('the limits flag is "true" in preview wrangler.jsonc and the route passes it through (no migration)', async () => {
  const cfg = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.deepEqual([...cfg.matchAll(/"HARIMU_WAR_DECLARATION_LIMITS_ENABLED"\s*:\s*"([^"]*)"/g)].map(m => m[1]), ['true']);
  const route = await readFile(new URL('../app/api/war/route.ts', import.meta.url), 'utf8');
  assert.match(route, /limits: bindings\.HARIMU_WAR_DECLARATION_LIMITS_ENABLED === 'true'/);
  assert.ok(route.indexOf("HARIMU_WAR_ENABLED !== 'true'") < route.indexOf('HARIMU_WAR_DECLARATION_LIMITS_ENABLED ==='), 'the war flag is still checked first');
});

async function setup(t, { backend } = {}) {
  const r = await localRuntime(backend ? { backend } : {}); t.after(() => r.close());
  const nowS = () => Math.floor(r.now / 1000);
  r.setFixtureEnv('HARIMU_SHARD_STARTED_AT', String(nowS() - 60 * D));
  const war = await r.importModule('lib/war.ts'), actions = await r.importModule('lib/war-actions.ts');
  const declare = (over = {}, now = nowS(), options = {}) => war.declareWar(r.db, { attacker: 'kindle', defender: 'korund', casusBelli: 'Border incidents', declaredBy: 'AI President', requestId: randomUUID(), ...over }, now, { enabled: true, ...options });
  const limited = (over = {}, now = nowS(), options = {}) => declare(over, now, { limits: true, ...options });
  const treaty = async ({ a = 'kindle', b = 'korund', kind = 'non-aggression', status = 'broken', brokenBy = b, at = nowS() - 5 * D } = {}) => {
    const id = randomUUID();
    await r.db.prepare('INSERT INTO treaties (id,request_id,pair_key,kind,proposer_nation,other_nation,proposed_by,proposed_at,status,decided_at,ratified_at,ends_at,ended_at,broken_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(id, id, pairKey(a, b), kind, a, b, 'AI Chair', at - 10, status, at, at, at + 90 * D, status === 'broken' ? at + 5 : null, status === 'broken' ? brokenBy : null).run();
  };
  const embargo = async ({ actor = 'korund', target = 'kindle', status = 'in_force' } = {}) => {
    const id = randomUUID(), at = nowS() - 3 * D;
    await r.db.prepare('INSERT INTO embargoes (id,request_id,pair_key,actor_nation,target_nation,proposed_by,proposed_at,status,decided_at,imposed_at,lifted_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .bind(id, id, pairKey(actor, target), actor, target, 'AI Chair', at - 10, status, at, at, status === 'lifted' ? at + 1 : null).run();
  };
  const openWar = (attacker, defender, declaredAt) => r.db.prepare('INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,casus_belli,declared_by,declared_at,mobilization_ends_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(`war-${randomUUID()}`, randomUUID(), pairKey(attacker, defender), attacker, defender, '', 'AI', declaredAt, declaredAt + 172800).run();
  const rows = async () => (await r.db.prepare('SELECT * FROM wars ORDER BY declared_at,id').all()).results.map(x => ({ ...x }));
  const cmd = (body, { limits = true, now = nowS() } = {}) => actions.handleWarCommand(r.db, { enabled: true, limits, secret: SECRET, authorization: `Bearer ${SECRET}`, body: { requestId: randomUUID(), action: 'declare', nation: 'kindle', role: 'President', defender: 'korund', ...body }, now });
  return { r, war, declare, limited, treaty, embargo, openWar, rows, cmd, nowS };
}

for (const backend of [undefined, 'postgres']) {
  const label = backend ? ' (PostgreSQL via PGlite)' : '';

  test(`limits off (the default): declarations behave as before, with no grievance and back to back${label}`, async t => {
    const { declare, rows, war, r } = await setup(t, { backend });
    const first = await declare(); assert.equal(first.ok, true);
    await war.endWar(r.db, first.war.id, 'other', Math.floor(r.now / 1000), true);
    assert.equal((await declare({ defender: 'aurelle' })).ok, true, 'no interval, no casus belli check while the flag is off');
    assert.equal((await rows()).length, 2);
  });

  test(`casus belli gate: no grievance is refused; a pact broken by the target alone clears it; ours, a lifted embargo and a below-threshold stack do not${label}`, async t => {
    const { limited, treaty, embargo, rows } = await setup(t, { backend });
    const none = await limited(); assert.equal(none.ok, false); assert.equal(none.status, 409); assert.equal(none.reason, 'casus_belli_insufficient'); assert.match(none.error, /declaration was not made/i);
    await treaty({ brokenBy: 'kindle' }); await embargo({ status: 'lifted' }); await embargo({ actor: 'kindle', target: 'korund' }); await treaty({ kind: 'non-aggression', status: 'in_force', at: 1_000_000 });
    assert.equal((await limited()).reason, 'casus_belli_insufficient', 'a pact WE broke, a lifted embargo, our own embargo and an in-force pact are not grievances');
    await treaty({ kind: 'trade', brokenBy: 'korund' }); await embargo();
    const stack = await limited(); assert.equal(stack.reason, 'casus_belli_insufficient', 'embargo 20 + broken trade treaty 15 = 35, below 40, and no other input exists in this PoC');
    assert.equal((await rows()).length, 0, 'nothing is written on a refusal');
    await treaty({ kind: 'non-aggression', brokenBy: 'korund' });
    const ok = await limited(); assert.equal(ok.ok, true, 'a non-aggression pact broken by the target alone clears the gate'); assert.equal((await rows()).length, 1);
  });

  test(`grievances toward a different nation do not count${label}`, async t => {
    const { limited, treaty } = await setup(t, { backend });
    await treaty({ a: 'kindle', b: 'aurelle', brokenBy: 'aurelle' });
    assert.equal((await limited()).reason, 'casus_belli_insufficient', 'Aurelle broke a pact with Kindle; Korund did not');
    assert.equal((await limited({ defender: 'aurelle' })).ok, true);
  });

  test(`rate limit: 1 declaration per nation per 14 real days, measured from the last declaration even after that war ended; exact boundary${label}`, async t => {
    const { limited, treaty, war, r, rows, nowS } = await setup(t, { backend });
    await treaty({ brokenBy: 'korund' }); await treaty({ a: 'kindle', b: 'aurelle', brokenBy: 'aurelle' });
    const at = nowS(); const first = await limited({}, at); assert.equal(first.ok, true);
    await war.endWar(r.db, first.war.id, 'other', at + 60, true);
    const again = await limited({ defender: 'aurelle' }, at + 3 * D);
    assert.equal(again.ok, false); assert.equal(again.reason, 'rate_limit_declarations'); assert.equal(again.status, 409);
    const day = ts => new Date(ts * 1000).toISOString().slice(0, 10);
    assert.ok(again.error.includes(day(declarationNextDay(at))), 'the line says the day Kindle can declare again');
    assert.ok(declarationNextDay(at) >= at + 14 * D && declarationNextDay(at) < at + 15 * D, 'rounded up to the next UTC midnight, never earlier than the exact moment');
    const late = await limited({ defender: 'aurelle' }, at + 3 * D + 7); // a different, later refusal reads the same date: it depends on the last declaration, not on now
    assert.equal(late.error, again.error);
    assert.equal((await limited({ defender: 'aurelle' }, at + 14 * D - 1)).reason, 'rate_limit_declarations', 'one second early');
    assert.equal((await limited({ defender: 'aurelle' }, at + 14 * D)).ok, true, 'exactly 14 real days later');
    assert.equal((await rows()).length, 2);
  });

  test(`the interval is per nation: another nation can declare the same day${label}`, async t => {
    const { limited, treaty, nowS } = await setup(t, { backend });
    await treaty({ brokenBy: 'korund' }); await treaty({ a: 'korund', b: 'aurelle', brokenBy: 'aurelle' });
    const at = nowS();
    assert.equal((await limited({}, at)).ok, true);
    assert.equal((await limited({ attacker: 'korund', defender: 'aurelle' }, at + 60)).ok, true);
  });

  test(`a replay of an accepted declaration still returns it, whatever the limits now say${label}`, async t => {
    const { limited, treaty, nowS } = await setup(t, { backend });
    await treaty({ brokenBy: 'korund' });
    const requestId = randomUUID(), at = nowS();
    assert.equal((await limited({ requestId }, at)).ok, true);
    const replay = await limited({ requestId }, at + 60); assert.equal(replay.ok, true); assert.equal(replay.replay, true);
  });

  test(`active offensive wars: at most 2 per nation, counted only for the declarer${label}`, async t => {
    const { limited, treaty, openWar, nowS } = await setup(t, { backend });
    await treaty({ brokenBy: 'korund' }); await treaty({ a: 'korund', b: 'aurelle', brokenBy: 'aurelle' });
    const at = nowS();
    await openWar('kindle', 'aurelle', at - 40 * D); await openWar('kindle', 'korund', at - 30 * D);
    const capped = await limited({}, at); assert.equal(capped.ok, false); assert.equal(capped.reason, 'rate_limit_active_wars');
    assert.match(capped.error, /declaration was not made/i);
    // Korund is the DEFENDER in one open war: that is not an offensive war for Korund.
    assert.equal((await limited({ attacker: 'korund', defender: 'aurelle' }, at)).ok, true, 'wars Korund is attacked in do not count against it');
  });

  test(`one open offensive war leaves room for a second once the interval has passed${label}`, async t => {
    const { limited, treaty, openWar, nowS } = await setup(t, { backend });
    await treaty({ brokenBy: 'korund' });
    const at = nowS(); await openWar('kindle', 'aurelle', at - 20 * D);
    assert.equal((await limited({}, at)).ok, true);
  });

  test(`concurrent declarations by one nation: only one lands, the other is told which limit${label}`, async t => {
    const { limited, treaty, rows, nowS } = await setup(t, { backend });
    await treaty({ brokenBy: 'korund' }); await treaty({ a: 'kindle', b: 'aurelle', brokenBy: 'aurelle' });
    const at = nowS();
    const results = await Promise.all([limited({}, at), limited({ defender: 'aurelle' }, at)]);
    assert.equal(results.filter(x => x.ok).length, 1, 'exactly one declaration lands');
    assert.equal(results.find(x => !x.ok).reason, 'rate_limit_declarations');
    assert.equal((await rows()).length, 1);
  });

  test(`the server command honours the limits input only when it is on${label}`, async t => {
    const { cmd, treaty, rows } = await setup(t, { backend });
    const on = await cmd({}); assert.equal(on.ok, false); assert.equal(on.reason, 'casus_belli_insufficient');
    assert.equal((await rows()).length, 0);
    const off = await cmd({}, { limits: false }); assert.equal(off.ok, true, 'limits off: no grievance needed');
    const second = await cmd({ defender: 'aurelle' }, { limits: false }); assert.equal(second.ok, true, 'limits off: no interval');
    await treaty({ a: 'korund', b: 'aurelle', brokenBy: 'aurelle' });
    assert.equal((await cmd({ nation: 'korund', role: 'Chairman', defender: 'aurelle' })).ok, true, 'with a grievance and no earlier declaration it goes through');
  });
}

// #584: pinned to SQLite: the DROP TABLE below fails on the PGlite fixture, which `npm run test:postgres` (HARIMU_TEST_STORAGE=postgres) would otherwise select.
test('missing treaty and embargo tables read as no grievance (fail closed), not as an error', async t => {
  const { limited, r } = await setup(t, { backend: 'sqlite' });
  await r.db.prepare('DROP TABLE treaties').run(); await r.db.prepare('DROP TABLE embargoes').run();
  const refused = await limited(); assert.equal(refused.ok, false); assert.equal(refused.reason, 'casus_belli_insufficient');
});

test('other read errors still surface (a failing grievance read is not silently allowed)', async t => {
  const { limited, treaty, r } = await setup(t);
  await treaty({ brokenBy: 'korund' });
  const prepare = r.db.prepare.bind(r.db);
  r.db.prepare = sql => { if (/FROM treaties/.test(sql)) throw new Error('disk on fire'); return prepare(sql); };
  await assert.rejects(limited(), /disk on fire/);
});

/** #351: the real Kindle mid-term Assembly calendar (docs politics/elections 9.1: 120-day cycle, election at day 60, 72-hour window), seats carried between terms,
 *  and the 5% district share. HARIMU_TEST_STORAGE=postgres runs the runtime tests on PGlite. */
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';

const rt = await localRuntime(); after(() => rt.close());
const R = await rt.importModule('lib/assembly-rules.ts');
const { planAssembly, nextAssemblyOpen, carryIncumbents, districtResult, assemblyResult, assemblyIncumbents, assemblyDistricts, assemblyCycleSeconds, assemblyMidtermOffsetSeconds, assemblyWindowSeconds, assemblyMinSharePercent } = R;

const backend = process.env.HARIMU_TEST_STORAGE === 'postgres' ? 'postgres' : 'd1';
const S = 'steady-hand', O = 'open-ledger', D = 'dockside-builders';
const sumOf = v => Object.values(v).reduce((a, b) => a + b, 0);
const DAY = 86400, W = 72 * 3600;

test('#351 pure: the calendar is 120 real days with the election at day 60 for 72 hours', () => {
  assert.equal(assemblyCycleSeconds, 120 * DAY); assert.equal(assemblyMidtermOffsetSeconds, 60 * DAY); assert.equal(assemblyWindowSeconds, W);
  const start = 1_000_000, t = { openAt: null, cycleStartAt: start };
  const first = planAssembly('base', t, start); assert.deepEqual(first, { id: 'base-cycle-0', cycle: 0, opensAt: start + 60 * DAY, closesAt: start + 60 * DAY + W });
  assert.deepEqual(planAssembly('base', t, start - 5 * DAY), first, 'before the first cycle it points at the first election, still ahead');
  assert.equal(planAssembly('base', t, start + 60 * DAY - 1).cycle, 0); assert.equal(planAssembly('base', t, start + 60 * DAY + W + 1).cycle, 0, 'after the window it still points at the election that just ran');
  assert.equal(planAssembly('base', t, start + 119 * DAY).cycle, 0, 'the presidential voting days of the cycle (116-119) do not move the Assembly plan');
  const second = planAssembly('base', t, start + 120 * DAY + 60 * DAY); assert.equal(second.cycle, 1); assert.equal(second.opensAt, start + 180 * DAY); assert.equal(second.id, 'base-cycle-1');
  assert.equal(planAssembly('base', t, start + 120 * DAY + 59 * DAY).cycle, 0, 'cycle 1 has begun but its day-60 open has not come: still the previous election');
  assert.equal(planAssembly('base', t, start + 10 * 120 * DAY + 61 * DAY).cycle, 10);
});

test('#351 pure: nothing configured never opens; the manual open time keeps its old shape; the schedule wins when both are set', () => {
  assert.equal(planAssembly('base', { openAt: null, cycleStartAt: null }, 5), null); assert.equal(nextAssemblyOpen({ openAt: null, cycleStartAt: null }, 5), null);
  assert.deepEqual(planAssembly('base', { openAt: 100, cycleStartAt: null }, 5), { id: 'base', cycle: null, opensAt: 100, closesAt: 100 + W });
  assert.equal(nextAssemblyOpen({ openAt: 100, cycleStartAt: null }, 5), 100); assert.equal(nextAssemblyOpen({ openAt: 100, cycleStartAt: null }, 100), null);
  assert.equal(planAssembly('base', { openAt: 100, cycleStartAt: 0 }, 5).id, 'base-cycle-0');
  const t = { openAt: null, cycleStartAt: 1000 }, first = 1000 + 60 * DAY;
  assert.equal(nextAssemblyOpen(t, 1000), first); assert.equal(nextAssemblyOpen(t, first - 1), first); assert.equal(nextAssemblyOpen(t, first), first + 120 * DAY); assert.equal(nextAssemblyOpen(t, first + 5 * 120 * DAY - 1), first + 5 * 120 * DAY);
});

test('#351 pure: seats carry over with staggered terms; a district keeps six seats, three up and three held', () => {
  const first = assemblyResult({ forgehaven: { [S]: 3, [O]: 1, [D]: 2 }, 'tarrek-foundry': { [O]: 5, [D]: 5 } });
  const carried = carryIncumbents(first);
  for (const d of first.districts) {
    if (d.contested) { assert.deepEqual(carried[d.districtId].up, d.seatsHeld, 'the half that served the whole term goes up next'); assert.deepEqual(carried[d.districtId].held, d.seatsWon, 'the seats just won are held next'); }
    else assert.deepEqual(carried[d.districtId], { up: d.seatsUp, held: d.seatsHeld }, 'a district nobody voted in does not rotate');
    assert.equal(sumOf(carried[d.districtId].up), 3); assert.equal(sumOf(carried[d.districtId].held), 3);
  }
  const second = assemblyResult({ forgehaven: { [D]: 5 } }, carried);
  const f = second.districts.find(d => d.districtId === 'forgehaven');
  assert.deepEqual(f.seatsUp, carried.forgehaven.up); assert.deepEqual(f.seatsHeld, carried.forgehaven.held); assert.equal(sumOf(f.seatsAfter), 6);
  assert.deepEqual(second.totals.before, Object.fromEntries(Object.keys(first.totals.after).map(id => [id, first.totals.after[id]])), 'the seats before the second election are exactly the seats after the first');
  assert.equal(sumOf(second.totals.after), 18);
});

test('#351 pure: a party under 5% of the district human ballots takes no part in the award', () => {
  assert.equal(assemblyMinSharePercent, 5);
  // 20 ballots: S 1 = 5.0% (stays in: the minimum is inclusive), O 19, D 0.
  const edge = districtResult('forgehaven', { [S]: 1, [O]: 19, [D]: 0 }); assert.deepEqual(edge.belowThreshold, [D]); assert.equal(edge.belowThreshold.includes(S), false, 'exactly 5% stays in');
  // 21 ballots: S 1 = 4.76% falls under.
  const under = districtResult('forgehaven', { [S]: 1, [O]: 20, [D]: 0 }); assert.deepEqual([...under.belowThreshold].sort(), [D, S].sort());
  assert.deepEqual(under.seatsWon, { [S]: 0, [O]: 3, [D]: 0 }); assert.equal(sumOf(under.seatsWon), 3);
  assert.equal('bloc' in under, false, '#449: no AI bloc in the count');
  // Nobody voted: nothing is excluded or contested.
  const none = districtResult('kolt-savanna', {}); assert.deepEqual(none.belowThreshold, []); assert.equal(none.contested, false);
  // Everyone clears it: all three take part, as before.
  const even = districtResult('forgehaven', { [S]: 3, [O]: 1, [D]: 2 }); assert.deepEqual(even.belowThreshold, []);
  // Five ballots for one party (the #463 floor): it has 100% and the other two have none, so they are out (the dominance is accepted for the MVP, #356).
  const one = districtResult('forgehaven', { [S]: 5 }); assert.deepEqual([...one.belowThreshold].sort(), [D, O].sort()); assert.deepEqual(one.seatsWon, { [S]: 3, [O]: 0, [D]: 0 });
  for (const d of assemblyDistricts) for (let s = 0; s < 8; s++) for (let o = 0; o < 8; o++) for (let dd = 0; dd < 8; dd++) {
    const r = districtResult(d.id, { [S]: s, [O]: o, [D]: dd }); assert.equal(sumOf(r.seatsWon), 3); assert.equal(sumOf(r.seatsAfter), 6);
    if (r.contested) for (const id of [S, O, D]) assert.equal(r.belowThreshold.includes(id), r.human[id] * 100 < 5 * r.humanBallots, `${d.id} ${s}/${o}/${dd} ${id}`);
  }
});

const previewEnv = { NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW: 'true', HARIMU_ACCOUNT_ELECTION_POC_ENABLED: 'true' };
const base = 'kindle-assembly-account-poc-1';
const writePattern = /^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i;
function recordWrites(r) {
  const writes = []; const prepare = r.db.prepare.bind(r.db); const batch = r.db.batch.bind(r.db);
  r.db.prepare = sql => { if (writePattern.test(sql)) writes.push(sql.replace(/\s+/g, ' ').slice(0, 90)); return prepare(sql); };
  r.db.batch = statements => { writes.push(`batch(${statements.length})`); return batch(statements); };
  return { writes, restore() { r.db.prepare = prepare; r.db.batch = batch; } };
}
async function setup(t, { flag = true, cycleStartOffset = 0, openAtOffset = null } = {}) {
  const r = await localRuntime({ accountElectionBindings: previewEnv }); t.after(() => r.close());
  const nowS = () => Math.floor(r.now / 1000), start = nowS() + cycleStartOffset;
  if (flag) r.setFixtureEnv('HARIMU_KINDLE_ASSEMBLY_ENABLED', 'true');
  if (cycleStartOffset !== null) r.setFixtureEnv('HARIMU_KINDLE_CYCLE_START_AT', String(start));
  const openAt = openAtOffset === null ? null : nowS() + openAtOffset;
  if (openAt !== null) r.setFixtureEnv('HARIMU_KINDLE_ASSEMBLY_OPEN_AT', String(openAt));
  const iso = new Date(r.now).toISOString();
  const citizen = async (user, home) => {
    if (!['alice', 'bob'].includes(user)) await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,'kindle',?,18,0,'Good standing',?,?)").bind(user, `Private ${user}`, iso, iso).run();
    if (home) await r.db.prepare("INSERT INTO citizen_city_locations (user_id,nation_id,home_city_id,current_city_id,updated_at) VALUES (?,'kindle',?,?,?)").bind(user, home, home, nowS()).run();
  };
  const vote = (user, partyId, electionId, extra = {}) => r.call('assembly', user, { action: 'vote', electionId, requestId: randomUUID(), partyId, ...extra });
  const count = async table => Number((await r.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n);
  const tick = async () => { await r.call('world', null); await r.call('world', null); };
  const at = s => r.setNow(s * 1000);
  return { r, start, openAt, nowS, citizen, vote, count, tick, at };
}

test(`#351 ${backend}: flag off is a complete no-op even with the cycle start set`, async t => {
  const c = await setup(t, { flag: false }); const { r } = c, probe = recordWrites(r);
  try {
    assert.equal((await r.call('assembly', 'alice')).status, 404); assert.equal((await c.vote('alice', S, `${base}-cycle-0`)).status, 404);
    c.at(c.start + 61 * DAY); await c.tick(); assert.deepEqual(probe.writes.filter(w => /assembly/i.test(w)), []);
  } finally { probe.restore(); }
  assert.equal(await c.count('assembly_elections'), 0);
});

test(`#351 ${backend}: neither the cycle start nor the open time set: it never opens`, async t => {
  const c = await setup(t, { cycleStartOffset: null }); const { r } = c;
  c.at(c.nowS() + 500 * DAY); await c.tick();
  const got = await r.call('assembly', 'alice'); assert.equal(got.status, 200); assert.equal(got.data.status, 'waiting'); assert.equal(got.data.opensAt, null); assert.equal(got.data.nextOpensAt, null);
  assert.equal(await c.count('assembly_elections'), 0);
});

test(`#351 ${backend}: the world tick opens at day 60, closes after 72 hours, counts once; GETs write nothing`, async t => {
  const c = await setup(t); const { r } = c, id0 = `${base}-cycle-0`, open0 = c.start + 60 * DAY;
  const read = async () => { const probe = recordWrites(r); try { const res = await r.call('assembly', 'alice'); assert.equal(res.status, 200, JSON.stringify(res.data)); assert.deepEqual(probe.writes, []); return res.data; } finally { probe.restore(); } };
  const waiting = await read(); assert.equal(waiting.status, 'waiting'); assert.equal(waiting.id, id0); assert.equal(waiting.opensAt, open0); assert.equal(waiting.nextOpensAt, open0);
  c.at(open0 - 60); await c.tick(); assert.equal(await c.count('assembly_elections'), 0, 'not before day 60');
  c.at(open0 + 60); const projected = await read(); assert.equal(projected.status, 'open'); assert.equal(projected.closesAt, open0 + W); assert.equal(await c.count('assembly_elections'), 0, 'a GET does not open it');
  await c.tick(); assert.equal(await c.count('assembly_elections'), 1, 'the tick opens it');
  const row = await r.db.prepare('SELECT id,opens_at,closes_at FROM assembly_elections').first(); assert.deepEqual({ ...row }, { id: id0, opens_at: open0, closes_at: open0 + W });
  assert.equal((await c.vote('alice', S, 'kindle-assembly-account-poc-1')).status, 400, 'the old fixed election id is not this election');
  assert.equal((await c.vote('alice', S, id0)).status, 200);
  c.at(open0 + W - 5); assert.equal((await r.call('assembly', 'alice')).data.result, null, 'results stay hidden until close');
  c.at(open0 + W + 5); await c.tick(); await c.tick();
  const closed = await read(); assert.equal(closed.status, 'closed'); assert.equal(closed.result.humanBallots, 1); assert.equal(closed.nextOpensAt, open0 + 120 * DAY);
  const stored = (await r.db.prepare('SELECT closed_at,result_json FROM assembly_elections').all()).results; assert.equal(stored.length, 1); assert.equal(stored[0].result_json, JSON.stringify(closed.result));
  await c.tick(); assert.equal((await r.db.prepare('SELECT result_json FROM assembly_elections').first()).result_json, stored[0].result_json, 'counted once');
  assert.equal((await c.vote('bob', O, id0)).status, 409, 'voting is closed');
});

test(`#351 ${backend}: the next cycle opens a new election and the first count's seats carry into it`, async t => {
  const c = await setup(t); const { r } = c, id0 = `${base}-cycle-0`, id1 = `${base}-cycle-1`, open0 = c.start + 60 * DAY, open1 = open0 + 120 * DAY;
  c.at(open0 + 60); await c.tick();
  const plan = [['forgehaven', S, 3], ['forgehaven', O, 1], ['forgehaven', D, 2], ['tarrek-foundry', O, 5], ['tarrek-foundry', D, 5]]; // #463: 5 ballots is the floor to count
  let n = 0; for (const [district, party, votes] of plan) for (let i = 0; i < votes; i++) { const user = `v${n++}`; await c.citizen(user, district); assert.equal((await c.vote(user, party, id0)).status, 200, user); }
  c.at(open0 + W + 5); await c.tick(); await c.tick();
  const first = (await r.call('assembly', 'v0')).data.result, f0 = first.districts.find(d => d.districtId === 'forgehaven');
  assert.deepEqual(f0.seatsUp, assemblyIncumbents.forgehaven.up, 'the first election uses the placeholder tables');
  c.at(open1 - 60); const between = (await r.call('assembly', 'v0')).data;
  assert.equal(between.status, 'closed', 'between elections the last count stays shown'); assert.equal(between.id, id0); assert.equal(between.nextOpensAt, open1);
  c.at(open1 + 60); const projected = (await r.call('assembly', 'v0')).data;
  assert.equal(projected.id, id1); assert.equal(projected.status, 'open'); assert.equal(projected.result, null);
  const fp = projected.districts.find(d => d.id === 'forgehaven'); assert.deepEqual(fp.seatsUp, f0.seatsHeld, 'the held half goes up'); assert.deepEqual(fp.seatsHeld, f0.seatsWon, 'the seats just won are held');
  assert.equal((await c.vote('v0', S, id0)).status, 400, 'the old election id no longer takes ballots');
  await c.tick(); assert.equal(await c.count('assembly_elections'), 2);
  for (let i = 0; i < 5; i++) assert.equal((await c.vote(`v${i}`, D, id1)).status, 200, 'one ballot per election: v0 to v4 vote again in the new one (5 ballots, the #463 floor)');
  c.at(open1 + W + 5); await c.tick(); await c.tick();
  const second = (await r.call('assembly', 'v0')).data.result; const f1 = second.districts.find(d => d.districtId === 'forgehaven');
  assert.deepEqual(f1.seatsUp, f0.seatsHeld); assert.deepEqual(f1.seatsHeld, f0.seatsWon); assert.equal(sumOf(f1.seatsAfter), 6);
  assert.deepEqual(second.totals.before, first.totals.after, 'the seats before the second election are the seats after the first');
  assert.deepEqual(f1.belowThreshold.sort(), [O, S].sort(), 'five ballots for Dockside: the other two are under 5%');
  assert.equal(sumOf(second.totals.after), 18);
  const rows = (await r.db.prepare('SELECT id,closed_at,result_json FROM assembly_elections ORDER BY opens_at').all()).results; assert.deepEqual(rows.map(x => x.id), [id0, id1]); assert.ok(rows.every(x => x.closed_at && x.result_json));
  // The diplomacy ratification seats (#308) read the latest counted result.
  const d = await r.importModule('lib/diplomacy.ts'); assert.deepEqual(await d.kindleSeats(r.db), second.totals.after);
});

test(`#351 ${backend}: a skipped cycle (never held) does not advance the rotation: the half that was due goes up again`, async t => {
  const c = await setup(t); const { r } = c, id0 = `${base}-cycle-0`, open0 = c.start + 60 * DAY, open2 = open0 + 240 * DAY;
  c.at(open0 + 60); await c.tick(); for (let i = 0; i < 5; i++) { await c.citizen(`v${i}`, 'forgehaven'); assert.equal((await c.vote(`v${i}`, S, id0)).status, 200); } // 5 ballots: the #463 floor
  c.at(open0 + W + 5); await c.tick(); await c.tick();
  const first = (await r.call('assembly', 'v0')).data.result;
  // Cycle 1 passes with no tick, no ballot and no election row: nobody counted.
  assert.equal(await c.count('assembly_elections'), 1);
  c.at(open2 + 60); const projected = (await r.call('assembly', 'v0')).data; assert.equal(projected.id, `${base}-cycle-2`);
  const f = projected.districts.find(d => d.id === 'forgehaven'), f0 = first.districts.find(d => d.districtId === 'forgehaven');
  assert.deepEqual(f.seatsUp, f0.seatsHeld, 'the half that was due in the skipped cycle goes up now (the rotation advanced once, for the one counted election)');
  assert.deepEqual(f.seatsHeld, f0.seatsWon);
  await c.tick(); assert.equal(await c.count('assembly_elections'), 2, 'only the held cycles have rows (0 and 2)');
});

test(`#351 ${backend}: an election nobody voted in is not counted: the same half goes up again next time`, async t => {
  const c = await setup(t); const { r } = c, open0 = c.start + 60 * DAY, open1 = open0 + 120 * DAY;
  c.at(open0 + 60); await c.tick(); c.at(open0 + W + 5); await c.tick(); await c.tick();
  const first = (await r.call('assembly', 'alice')).data; assert.equal(first.status, 'closed'); assert.equal(first.result.humanBallots, 0);
  for (const d of first.result.districts) { assert.equal(d.contested, false); assert.deepEqual(d.seatsWon, d.seatsUp); }
  c.at(open1 + 60); const next = (await r.call('assembly', 'alice')).data;
  for (const d of next.districts) { assert.deepEqual(d.seatsUp, assemblyIncumbents[d.id].up, `${d.id}: the same half goes up again`); assert.deepEqual(d.seatsHeld, assemblyIncumbents[d.id].held); }
  assert.deepEqual(next.districts.map(d => d.id), assemblyDistricts.map(d => d.id));
});

test('#351 pure: a district nobody voted in keeps its up and held halves when seats carry over', () => {
  const result = assemblyResult({ forgehaven: { [S]: 3, [O]: 1, [D]: 2 } }), carried = carryIncumbents(result);
  const forge = result.districts.find(d => d.districtId === 'forgehaven'), tarrek = result.districts.find(d => d.districtId === 'tarrek-foundry');
  assert.deepEqual(carried.forgehaven, { up: forge.seatsHeld, held: forge.seatsWon }, 'a counted district rotates');
  assert.deepEqual(carried['tarrek-foundry'], { up: tarrek.seatsUp, held: tarrek.seatsHeld }, 'an uncounted district does not');
  assert.deepEqual(carried['tarrek-foundry'], assemblyIncumbents['tarrek-foundry']);
});

test(`#351 ${backend}: the manual open time still works as before when no cycle start is set`, async t => {
  const c = await setup(t, { cycleStartOffset: null, openAtOffset: 3600 }); const { r } = c;
  const waiting = (await r.call('assembly', 'alice')).data; assert.equal(waiting.id, base, 'the manual election keeps its original id'); assert.equal(waiting.status, 'waiting'); assert.equal(waiting.opensAt, c.openAt); assert.equal(waiting.nextOpensAt, c.openAt);
  c.at(c.openAt + 60); await c.tick(); assert.equal((await r.call('assembly', 'alice')).data.status, 'open');
  assert.equal((await c.vote('alice', S, base)).status, 200);
  c.at(c.openAt + W + 5); await c.tick(); const closed = (await r.call('assembly', 'alice')).data; assert.equal(closed.status, 'closed'); assert.equal(closed.nextOpensAt, null);
  assert.equal((await r.db.prepare('SELECT id FROM assembly_elections').first()).id, base);
});

test('#351 the privacy fence and the flags are unchanged: assembly ballot tables stay fenced, flag off by default, no cycle start by default', async () => {
  const database = await readFile(new URL('../lib/postgres/database.ts', import.meta.url), 'utf8');
  assert.match(database, /\(civic\|poc\|assembly\|primary\)_\(anonymous_ballots\|voter_receipts\)/, 'the ballot and receipt tables are in the PostgreSQL ballot fence');
  const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.match(wrangler, /"HARIMU_KINDLE_ASSEMBLY_ENABLED": "true"/); assert.match(await readFile(new URL('../wrangler.prod.jsonc', import.meta.url), 'utf8'), /"HARIMU_KINDLE_ASSEMBLY_ENABLED": "false"/); assert.doesNotMatch(wrangler, /^\s*"HARIMU_KINDLE_CYCLE_START_AT"/m, 'no cycle start is configured by default');
  assert.doesNotMatch(wrangler, /^\s*"HARIMU_KINDLE_ASSEMBLY_OPEN_AT"/m);
  const route = await readFile(new URL('../app/api/assembly/route.ts', import.meta.url), 'utf8');
  assert.match(route, /if \(!assemblyEnabled\(bindings\(\)\)\) return json\(\{ enabled: false \}, 404\)/);
});

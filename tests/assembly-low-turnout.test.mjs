/** #463 (ARC ruling): a district counts only with at least 5 human ballots (an absolute count floor, applied before the 5% share). Under it the district takes the
 *  zero-ballot path: incumbents keep the seats up, the rotation does not advance, `belowMinimum` says why. HARIMU_TEST_STORAGE=postgres runs the runtime test on PGlite.
 *  Out of scope (plain D'Hondt at 3 seats): a 3-1-1 split of five ballots still gives 3-0-0. */
import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { randomUUID } from 'node:crypto';
import { localRuntime } from './helpers/local-runtime.mjs';

const rt = await localRuntime(); after(() => rt.close());
const R = await rt.importModule('lib/assembly-rules.ts');
const { districtResult, assemblyResult, carryIncumbents, assemblyIncumbents, assemblyMinBallotsPerDistrict, assemblyMinSharePercent } = R;
const backend = process.env.HARIMU_TEST_STORAGE === 'postgres' ? 'postgres' : 'd1';
const S = 'steady-hand', O = 'open-ledger', D = 'dockside-builders';
const sumOf = v => Object.values(v).reduce((a, b) => a + b, 0);
const DAY = 86400, W = 72 * 3600;

test('#463 pure: the floor is one constant, 5, and an absolute count, not a share', () => {
  assert.equal(assemblyMinBallotsPerDistrict, 5); assert.equal(assemblyMinSharePercent, 5);
});

test('#463 pure: 0, 1, 2 and 4 ballots are not counted; the seats up stay with the incumbents and nothing rotates', () => {
  // Forgehaven: incumbents up S2 O1 D0, held S1 O1 D1. The old rule gave one ballot all three seats (3-0-0, after 4-1-1).
  for (const [ballots, belowMinimum] of [[{}, false], [{ [S]: 1 }, true], [{ [O]: 1, [D]: 1 }, true], [{ [S]: 2, [O]: 1, [D]: 1 }, true]]) {
    const r = districtResult('forgehaven', ballots);
    assert.equal(r.contested, false, JSON.stringify(ballots)); assert.equal(r.belowMinimum, belowMinimum, JSON.stringify(ballots));
    assert.deepEqual(r.seatsWon, { [S]: 2, [O]: 1, [D]: 0 }); assert.deepEqual(r.seatsAfter, { [S]: 3, [O]: 2, [D]: 1 });
    assert.deepEqual(r.belowThreshold, [], 'the 5% share is only applied to a counted district');
    assert.deepEqual(carryIncumbents({ districts: [r] }).forgehaven, { up: r.seatsUp, held: r.seatsHeld }, 'no rotation');
    assert.equal(r.humanBallots, sumOf(r.human), 'the ballots are still counted and published');
  }
});

test('#463 pure: exactly 5 ballots count, with a hand-computed D\'Hondt table', () => {
  // 5-0-0 for Dockside: weights D5 -> D takes all three seats up. After: S1 O1 D4.
  const a = districtResult('forgehaven', { [D]: 5 }); assert.equal(a.contested, true); assert.equal(a.belowMinimum, false);
  assert.deepEqual(a.seatsWon, { [S]: 0, [O]: 0, [D]: 3 }); assert.deepEqual(a.seatsAfter, { [S]: 1, [O]: 1, [D]: 4 }); assert.deepEqual([...a.belowThreshold].sort(), [O, S].sort());
  // 2-2-1: quotients S 2 1 | O 2 1 | D 1. Seat 1 S (tie to declared order), seat 2 O, seat 3 ties S 1 / O 1 / D 1 and goes to S: S2 O1 D0.
  const b = districtResult('forgehaven', { [S]: 2, [O]: 2, [D]: 1 }); assert.deepEqual(b.seatsWon, { [S]: 2, [O]: 1, [D]: 0 }); assert.deepEqual(b.belowThreshold, []);
  assert.equal(b.contested, true);
  // 3-1-1 keeps a 3-0-0 under plain D'Hondt (3 seats up): known and out of scope for #463.
  const c = districtResult('forgehaven', { [S]: 3, [O]: 1, [D]: 1 }); assert.deepEqual(c.seatsWon, { [S]: 3, [O]: 0, [D]: 0 });
});

test('#463 pure: the floor comes before the 5% share (20 ballots keep a 5% party, 21 drop it; 4 never reach either)', () => {
  const edge = districtResult('forgehaven', { [S]: 1, [O]: 19 }); assert.equal(edge.contested, true); assert.equal(edge.belowThreshold.includes(S), false);
  const under = districtResult('forgehaven', { [S]: 1, [O]: 20 }); assert.equal(under.belowThreshold.includes(S), true);
  const few = districtResult('forgehaven', { [S]: 4 }); assert.equal(few.contested, false); assert.deepEqual(few.belowThreshold, []);
});

test('#463 pure: a mixed election counts only the districts with enough ballots, and only those rotate', () => {
  const res = assemblyResult({ forgehaven: { [S]: 3, [O]: 1, [D]: 2 }, 'tarrek-foundry': { [O]: 3 } }); // Forgehaven 6 counted, Tarrek 3 under, Kolt none
  const by = Object.fromEntries(res.districts.map(d => [d.districtId, d]));
  assert.deepEqual([by.forgehaven.contested, by['tarrek-foundry'].contested, by['kolt-savanna'].contested], [true, false, false]);
  assert.deepEqual([by.forgehaven.belowMinimum, by['tarrek-foundry'].belowMinimum, by['kolt-savanna'].belowMinimum], [false, true, false]);
  assert.deepEqual(by['tarrek-foundry'].seatsWon, by['tarrek-foundry'].seatsUp); assert.equal(res.humanBallots, 9, 'the ballots under the floor are still published');
  assert.equal(sumOf(res.totals.after), 18);
  const carried = carryIncumbents(res);
  assert.deepEqual(carried.forgehaven, { up: by.forgehaven.seatsHeld, held: by.forgehaven.seatsWon });
  for (const id of ['tarrek-foundry', 'kolt-savanna']) assert.deepEqual(carried[id], assemblyIncumbents[id], `${id} does not rotate`);
});

test('#463 pure: two cycles with a district under the floor: the same half goes up both times, no drift', () => {
  const first = assemblyResult({ 'kolt-savanna': { [D]: 4 } }), second = assemblyResult({ 'kolt-savanna': { [S]: 2 } }, carryIncumbents(first));
  for (const res of [first, second]) { const k = res.districts.find(d => d.districtId === 'kolt-savanna'); assert.equal(k.contested, false); assert.deepEqual(k.seatsUp, assemblyIncumbents['kolt-savanna'].up); assert.deepEqual(k.seatsAfter, { [S]: 2, [O]: 3, [D]: 1 }); }
  assert.deepEqual(second.totals.after, first.totals.after);
});

test('#463 pure: no count is made from anything but human ballots (the result carries no bloc and the counts are the human ballots)', () => {
  for (const ballots of [{}, { [S]: 1 }, { [S]: 5 }, { [S]: 3, [O]: 2 }]) { const r = districtResult('forgehaven', ballots); assert.equal('bloc' in r, false); assert.deepEqual(r.human, { [S]: ballots[S] ?? 0, [O]: ballots[O] ?? 0, [D]: ballots[D] ?? 0 }); }
});

const previewEnv = { NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW: 'true', HARIMU_ACCOUNT_ELECTION_POC_ENABLED: 'true' };
const base = 'kindle-assembly-account-poc-1';
async function setup(t) {
  const r = await localRuntime({ accountElectionBindings: previewEnv }); t.after(() => r.close());
  const nowS = () => Math.floor(r.now / 1000), start = nowS(), iso = new Date(r.now).toISOString();
  r.setFixtureEnv('HARIMU_KINDLE_ASSEMBLY_ENABLED', 'true'); r.setFixtureEnv('HARIMU_KINDLE_CYCLE_START_AT', String(start));
  const citizen = async (user, home) => {
    await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,'kindle',?,18,0,'Good standing',?,?)").bind(user, `Private ${user}`, iso, iso).run();
    await r.db.prepare("INSERT INTO citizen_city_locations (user_id,nation_id,home_city_id,current_city_id,updated_at) VALUES (?,'kindle',?,?,?)").bind(user, home, home, nowS()).run();
  };
  const vote = (user, partyId, electionId) => r.call('assembly', user, { action: 'vote', electionId, requestId: randomUUID(), partyId });
  const tick = async () => { await r.call('world', null); await r.call('world', null); };
  return { r, start, citizen, vote, tick, at: s => r.setNow(s * 1000) };
}

test(`#463 ${backend}: the closed count under the floor is recorded as not counted, shown as published, and a pre-#463 saved count is left alone`, async t => {
  const c = await setup(t), { r } = c, id0 = `${base}-cycle-0`, open0 = c.start + 60 * DAY;
  c.at(open0 + 60); await c.tick();
  const plan = [['forgehaven', S, 3], ['forgehaven', O, 1], ['forgehaven', D, 2], ['tarrek-foundry', D, 4], ['kolt-savanna', O, 1]]; // 6 counts; 4 and 1 do not
  let n = 0; for (const [district, party, votes] of plan) for (let i = 0; i < votes; i++) { const user = `v${n++}`; await c.citizen(user, district); assert.equal((await c.vote(user, party, id0)).status, 200, user); }
  c.at(open0 + W + 5); await c.tick(); await c.tick();
  const { data } = await r.call('assembly', 'v0'); assert.equal(data.status, 'closed');
  const by = Object.fromEntries(data.result.districts.map(d => [d.districtId, d]));
  assert.deepEqual(by.forgehaven.seatsWon, { [S]: 2, [O]: 0, [D]: 1 }); assert.equal(by.forgehaven.contested, true);
  for (const id of ['tarrek-foundry', 'kolt-savanna']) { assert.equal(by[id].contested, false, id); assert.equal(by[id].belowMinimum, true, id); assert.deepEqual(by[id].seatsWon, by[id].seatsUp, id); }
  assert.deepEqual(by['tarrek-foundry'].human, { [S]: 0, [O]: 0, [D]: 4 }, 'the ballots under the floor are published');
  assert.equal(sumOf(data.result.totals.after), 18);
  const stored = (await r.db.prepare('SELECT result_json FROM assembly_elections').first()).result_json; assert.equal(stored, JSON.stringify(data.result));
  // A count saved before #463 (no `belowMinimum`; Tarrek's 4 ballots were counted then) stays exactly as published, not recounted.
  const old = JSON.parse(stored); for (const d of old.districts) delete d.belowMinimum;
  await r.db.prepare('UPDATE assembly_elections SET result_json=?').bind(JSON.stringify(old)).run();
  assert.deepEqual((await r.call('assembly', 'v0')).data.result, old, 'an older saved count is shown as published');
});

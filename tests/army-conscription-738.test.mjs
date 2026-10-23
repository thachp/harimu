/** #738 slice 3: conscription (docs §11.3, §15.4): the Korund lottery and Aurelle levies, one draft per nation per game week, the 14-day
 *  newcomer shield, dormant citizens skipped, a conscript cannot leave before the term ends. Behind HARIMU_ARMIES_ENABLED. SQLite + PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { localRuntime } from './helpers/local-runtime.mjs';
import { volunteerNations } from '../lib/army-rules.ts';
const NEWCOMER_SHIELD_DAYS = Number(/export const NEWCOMER_SHIELD_DAYS=(\d+)/.exec(readFileSync('lib/war-protections-copy.ts', 'utf8'))[1]); // the docs' 14 days

const { pickConscripts, DRAFT_WEEK_SECONDS, SERVICE_TERM_SECONDS, NEWCOMER_SHIELD_SECONDS } = await (async () => { const r = await localRuntime(); try { return await r.importModule('lib/army-conscription.ts'); } finally { await r.close(); } })();
const E = (n, city = null, p = 'c') => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}`, city: typeof city === 'function' ? city(i) : city }));
test('rules: lottery size, one levy per home city, deterministic, Kindle never conscripts, shield = docs 14 days', () => {
  assert.deepEqual([0, 1, 9, 10, 19, 20, 25].map(n => pickConscripts('korund', 5, E(n)).length), [0, 1, 1, 1, 1, 2, 2]);
  assert.deepEqual(pickConscripts('korund', 5, E(30)), pickConscripts('korund', 5, [...E(30)].reverse()), 'order-independent');
  assert.notDeepEqual(Array.from({ length: 8 }, (_, w) => pickConscripts('korund', w, E(10))[0]).filter((x, i, a) => a.indexOf(x) === i).length, 1, 'the draw changes week to week');
  const lev = pickConscripts('aurelle', 5, E(7, i => ['a', 'a', 'a', 'b', 'b', null, null][i]));
  assert.equal(lev.length, 3, 'one per city, homeless citizens share one bucket'); assert.equal(new Set(lev).size, 3);
  assert.deepEqual(pickConscripts('kindle', 5, E(10)), []); assert.deepEqual([...volunteerNations], ['kindle'], 'volunteering stays Kindle-only');
  assert.equal(NEWCOMER_SHIELD_SECONDS, NEWCOMER_SHIELD_DAYS * 86400); assert.equal(SERVICE_TERM_SECONDS, 2 * DRAFT_WEEK_SECONDS);
  assert.deepEqual(pickConscripts('aurelle', 9, E(6, i => `c${i % 3}`)), pickConscripts('aurelle', 9, E(6, i => `c${i % 3}`)), 'a retry of the same nation and week picks the same people');
  const copy = readFileSync('lib/army-copy.ts', 'utf8'); assert.match(copy, /PLACEHOLDER copy, marked for Content[^\n]*\n calledUp:L\(/, 'call-up line is placeholder copy marked for Content');
  const card = readFileSync('app/army-card.tsx', 'utf8'); assert.match(card, /army\.serveUntil \? <p>\{fill\(unitMembership\.calledUp\.text/);
  assert.match(readFileSync('app/page.tsx', 'utf8'), /<GovernmentPanel [^\n]*\/>\s*<ArmyCard \/>/, 'pin: ArmyCard after GovernmentPanel');
});

const D = 86400;
async function world(t, backend, on = true) {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  await r.call('citizen', 'alice');
  r.setFixtureEnv('HARIMU_ARMIES_ENABLED', on ? 'true' : 'false'); r.setFixtureEnv('HARIMU_WAR_ENABLED', 'true');
  const now = Math.floor(r.now / 1000), iso = s => new Date(s * 1000).toISOString();
  const add = async (id, nation, { age = 20, idle = 0, city = null } = {}) => {
    await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at,last_active_at) VALUES (?,?,?,18,0,'Good standing',?,?,?)").bind(id, nation, id, iso(now - age * D), iso(now), iso(now - idle * D)).run();
    if (city) await r.db.prepare('INSERT INTO citizen_city_locations (user_id,nation_id,home_city_id,current_city_id,updated_at) VALUES (?,?,?,?,?)').bind(id, nation, city, city, now).run();
  };
  const n = async (sql) => Number((await r.db.prepare(sql).first()).n);
  const conscripts = () => r.db.prepare('SELECT clerk_user_id AS id FROM army_conscripts ORDER BY clerk_user_id').all().then(x => x.results.map(y => y.id));
  return { r, now, add, n, conscripts };
}
let k = 0; const rid = () => `req-c738-${String(++k).padStart(4, '0')}`;

for (const backend of ['sqlite', 'postgres']) {
  test(`${backend}: flag off: /api/army is 404 before auth with zero prepares, and no draft runs`, async t => {
    const w = await world(t, backend, false);
    for (let i = 0; i < 10; i++) await w.add(`k${i}`, 'korund');
    const prepare = w.r.db.prepare.bind(w.r.db), seen = []; w.r.db.prepare = q => { seen.push(q); return prepare(q); };
    const res = [await w.r.call('army', 'k0'), await w.r.call('army', null), await w.r.call('army', 'k0', { action: 'leave', requestId: rid() })];
    w.r.db.prepare = prepare;
    assert.deepEqual(res.map(x => x.status), [404, 404, 404]); assert.deepEqual(seen, []);
    assert.deepEqual([await w.n('SELECT COUNT(*) AS n FROM army_drafts'), await w.n('SELECT COUNT(*) AS n FROM army_members')], [0, 0]);
  });

  test(`${backend}: Korund lottery: eligible only (newcomer shield, dormant, members skipped), once per week, replay, conscript cannot leave`, async t => {
    const w = await world(t, backend);
    for (let i = 0; i < 10; i++) await w.add(`k${i}`, 'korund');
    await w.add('knew', 'korund', { age: 13 }); await w.add('kold', 'korund', { idle: 31 }); await w.add('kok', 'korund', { age: 14 });
    const first = await w.r.call('army', 'k0'); assert.equal(first.status, 200);
    const drafted = await w.conscripts(); assert.equal(drafted.length, 1, '11 eligible draws 1');
    assert.ok(!['knew', 'kold'].includes(drafted[0]), 'shielded and dormant citizens are never drawn');
    assert.equal(await w.n(`SELECT COUNT(*) AS n FROM army_members WHERE unit_id = 'korund-home-guard'`), 1);
    const prepare = w.r.db.prepare.bind(w.r.db), seen = []; w.r.db.prepare = q => { seen.push(q); return prepare(q); };
    try { for (let i = 0; i < 3; i++) await w.r.call('army', `k${i}`); } finally { w.r.db.prepare = prepare; }
    assert.deepEqual(seen.filter(q => /AS id FROM citizens|INSERT INTO army_/.test(q)), [], 'a drafted week is not re-read or re-written');
    assert.deepEqual(await w.conscripts(), drafted, 'replay in the same week writes nothing'); assert.equal(await w.n('SELECT COUNT(*) AS n FROM army_drafts'), 1);
    const me = drafted[0], view = await w.r.call('army', me);
    assert.deepEqual([view.data.army.member, view.data.army.unit.id, view.data.army.serveUntil], [true, 'korund-home-guard', w.now + SERVICE_TERM_SECONDS]);
    const leave = await w.r.call('army', me, { action: 'leave', requestId: rid() }); assert.deepEqual([leave.status, leave.data.reason], [409, 'conscripted']);
    assert.equal((await w.r.call('army', me, { action: 'stance', stance: 'advance', requestId: rid() })).status, 200, 'a conscript still picks a stance');
    const vol = await w.r.call('army', 'k1', { action: 'join', unitId: 'korund-home-guard', requestId: rid() }); assert.deepEqual([vol.status, vol.data.reason], [403, 'not_open_yet']);
    w.r.setNow(w.r.now + SERVICE_TERM_SECONDS * 1000);
    assert.equal((await w.r.call('army', me, { action: 'leave', requestId: rid() })).status, 200, 'the term ended: leave is allowed');
    await w.r.call('army', 'k0'); assert.equal(await w.n('SELECT COUNT(*) AS n FROM army_drafts'), 2, 'a new game week drafts again');
    assert.equal(await w.n('SELECT COUNT(*) AS n FROM army_drafts WHERE nation_id <> \'korund\''), 0, 'only the viewer\'s nation');
    assert.equal(await w.n(`SELECT COUNT(*) AS n FROM army_members WHERE clerk_user_id = 'alice'`), 0); assert.equal((await w.r.call('army', 'alice')).data.army.serveUntil, undefined, 'Kindle: no draft');
  });

  test(`${backend}: a citizen already in the unit is never conscripted`, async t => {
    const w = await world(t, backend); await w.add('km', 'korund');
    await w.r.db.prepare("INSERT INTO army_members (clerk_user_id, unit_id, stance, joined_at, request_id) VALUES ('km','korund-home-guard','hold',?, 'fixture-km-0001')").bind(w.now - D).run();
    await w.r.call('army', 'km'); assert.deepEqual(await w.conscripts(), []); assert.equal(await w.n('SELECT drafted AS n FROM army_drafts'), 0);
  });

  test(`${backend}: Aurelle levy: one citizen per home city; concurrent reads draft once`, async t => {
    const w = await world(t, backend);
    for (const [id, city] of [['a1', 'city-a'], ['a2', 'city-a'], ['a3', 'city-a'], ['b1', 'city-b'], ['b2', 'city-b']]) await w.add(id, 'aurelle', { city });
    await Promise.all([w.r.call('army', 'a1'), w.r.call('army', 'b1'), w.r.call('army', 'a2')]);
    const got = await w.conscripts(); assert.equal(got.length, 2); assert.equal(got.filter(x => x.startsWith('a')).length, 1); assert.equal(await w.n('SELECT COUNT(*) AS n FROM army_drafts'), 1);
  });

  test(`${backend}: forced race: a stale loser's draft is fenced by the winner's token and writes no members`, async t => {
    const w = await world(t, backend);
    for (const [id, city] of [['a1', 'city-a'], ['b1', 'city-b'], ['c1', 'city-c']]) await w.add(id, 'aurelle', { city });
    const { runDraft } = await w.r.importModule('lib/army-conscription.ts');
    const prepare = w.r.db.prepare.bind(w.r.db), batch = w.r.db.batch.bind(w.r.db); let arrived = 0, open, staleDone; const gate = new Promise(r => { open = r; }), stale = new Promise(r => { staleDone = r; }); let reads = 0;
    w.r.db.prepare = q => { const st = prepare(q);
      if (/^SELECT 1 AS x FROM army_drafts/.test(q)) return { bind: (...a) => { const b = st.bind(...a); return { first: async () => { const out = await b.first(); if (++arrived === 2) open(); await gate; return out; } }; } };
      if (/^SELECT c\.clerk_user_id AS id/.test(q)) return { bind: (...a) => { const b = st.bind(...a); return { all: async () => { const out = await b.all(); return ++reads === 1 ? { ...out, results: out.results.filter(x => x.id !== 'c1') } : out; } }; } };
      return st; };
    w.r.db.batch = async stmts => { if (stmts.length === 7) await stale; const out = await batch(stmts); if (stmts.length === 5) staleDone(); return out; };
    let res; try { res = await Promise.all([runDraft(w.r.db, 'aurelle', w.now), runDraft(w.r.db, 'aurelle', w.now)]); } finally { w.r.db.prepare = prepare; w.r.db.batch = batch; }
    assert.deepEqual(res.slice().sort(), [2, null], 'one winner (the stale roster), one fenced loser');
    assert.deepEqual(await w.conscripts(), ['a1', 'b1']); assert.equal(await w.n(`SELECT COUNT(*) AS n FROM army_members WHERE unit_id = 'aurelle-home-guard'`), 2);
    assert.equal(await w.n('SELECT drafted AS n FROM army_drafts'), 2, 'members drafted equal the recorded count');
  });
}

/** #738 slice 2: drills and shifts raise unit strength and morale (docs §15.3), flag HARIMU_ARMY_DRILLS_ENABLED on top of the slice-1 flags.
 *  Flag-off 404 with no DB (spy), one drill per game day, replay and concurrency decided by the insert outcome, aggregates only. SQLite + PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { localRuntime } from './helpers/local-runtime.mjs';
import { armyDrillsEnabled, unitStrength, unitMorale, parseDrill, ARMY_GAME_DAY_SECONDS, armyParticipation } from '../lib/army-rules.ts';
import { GAME_DAY_SECONDS } from '../lib/gray-market-rules.ts';
import { unitMembership } from '../lib/army-copy.ts';

const ON = { HARIMU_ARMIES_ENABLED: 'true', HARIMU_WAR_ENABLED: 'true', HARIMU_ARMY_DRILLS_ENABLED: 'true' };
test('rules: three flags, readiness math boundaries, request id bounds, game day length', () => {
  assert.equal(armyDrillsEnabled(ON), true);
  for (const k of Object.keys(ON)) assert.equal(armyDrillsEnabled({ ...ON, [k]: 'false' }), false, k);
  assert.equal(armyDrillsEnabled({ ...ON, HARIMU_ARMY_DRILLS_ENABLED: 'TRUE' }), false); assert.equal(armyDrillsEnabled(null), false);
  assert.equal(ARMY_GAME_DAY_SECONDS, GAME_DAY_SECONDS); assert.equal(armyParticipation.windowDays, 7);
  assert.equal(unitStrength(0, 0, 0), 0); assert.equal(unitStrength(2, 3, 4), 20 + 9 + 4); assert.equal(unitStrength(-1, -1, -1), 0);
  assert.equal(unitMorale(0, 0), 50); assert.equal(unitMorale(3, 0), 50); assert.equal(unitMorale(3, 1), 66); assert.equal(unitMorale(3, 3), 100); assert.equal(unitMorale(2, 5), 100);
  assert.equal(parseDrill({ requestId: 'a'.repeat(7) }), null); assert.ok(parseDrill({ requestId: 'a'.repeat(8) })); assert.ok(parseDrill({ requestId: 'a'.repeat(64) }));
  assert.equal(parseDrill({ requestId: 'a'.repeat(65) }), null); assert.equal(parseDrill({ requestId: 'bad id!!' }), null);
  for (const k of ['drillButton']) assert.ok(unitMembership[k].length <= 40); for (const k of ['drilled', 'drilledToday']) assert.ok(unitMembership[k].text.length <= 100 && unitMembership[k].proposal);
});

test('card: strength, morale and Drill only when the read carries strength; strings from army-copy; pinned after GovernmentPanel', () => {
  const card = readFileSync('app/army-card.tsx', 'utf8');
  assert.match(card, /unit\.strength !== undefined && <p>\{unitCard\.strengthLabel\}/); assert.match(card, /\{unitMembership\.drillButton\}/); assert.match(card, /unitMembership\.drilledToday\.text/);
  assert.doesNotMatch(card, />\s*(Strength|Morale|Drill)\b/, 'no hard-coded labels');
  assert.match(readFileSync('app/page.tsx', 'utf8'), /<GovernmentPanel [^\n]*\/>\s*<ArmyCard key=\{`army:\$\{citizenSessionKey\}`\}\/>/);
});

async function spy(r, fn) { const prepare = r.db.prepare.bind(r.db), seen = { sql: [] }; r.db.prepare = q => { seen.sql.push(q); return prepare(q); }; try { seen.result = await fn(); } finally { r.db.prepare = prepare; } return seen; }
const count = async (r, t) => Number((await r.db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first()).n);
let n = 0; const rid = () => `drill-738-${String(++n).padStart(4, '0')}`;
async function world(t, backend) {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  await r.call('citizen', 'alice'); await r.call('citizen', 'bob');
  for (const [k, v] of Object.entries(ON)) r.setFixtureEnv(k, v);
  const join = u => r.call('army', u, { action: 'join', unitId: 'kindle-home-guard', requestId: rid() });
  const drill = (u, requestId = rid()) => r.call('army/drill', u, { requestId });
  const read = async u => (await r.call('army', u)).data.army.unit;
  return { r, join, drill, read };
}

for (const backend of ['sqlite', 'postgres']) {
  test(`${backend}: flag off (any of the three flags) is 404 before auth or any database access; GET keeps the slice-1 shape`, async t => {
    const { r, join } = await world(t, backend); await join('alice');
    for (const k of Object.keys(ON)) {
      r.setFixtureEnv(k, 'false');
      const off = await spy(r, async () => [await r.call('army/drill', 'alice', { requestId: rid() }), await r.call('army/drill', null, { requestId: rid() })]);
      assert.deepEqual(off.result.map(x => x.status), [404, 404], k); assert.deepEqual(off.sql, [], `${k}: no database access`);
      r.setFixtureEnv(k, 'true');
    }
    assert.equal(await count(r, 'army_drills'), 0, 'flag-off POST wrote nothing');
    r.setFixtureEnv('HARIMU_ARMY_DRILLS_ENABLED', 'false');
    const get = await spy(r, () => r.call('army', 'alice'));
    assert.equal(get.result.status, 200); assert.equal('strength' in get.result.data.army.unit, false); assert.equal('morale' in get.result.data.army.unit, false);
    assert.deepEqual(get.sql.filter(q => /army_drills|shift_settlements/.test(q)), [], 'no readiness reads with the flag off');
    r.setFixtureEnv('HARIMU_ARMY_DRILLS_ENABLED', 'true');
    const on = await spy(r, () => r.call('army/drill', 'alice', { requestId: rid() })); assert.equal(on.result.status, 200); assert.ok(on.sql.length > 0, 'baseline');
  });

  test(`${backend}: drills and shifts raise strength and morale; one drill per game day; replay; refusals write nothing; aggregates only`, async t => {
    const { r, join, drill, read } = await world(t, backend);
    assert.equal((await drill(null)).status, 401); assert.equal((await r.call('army/drill', 'alice', { requestId: rid() }, 'https://evil.invalid')).status, 403);
    assert.equal((await r.call('army/drill', 'alice', { requestId: 'short' })).status, 400);
    const nm = await drill('alice'); assert.deepEqual([nm.status, nm.data.reason], [409, 'not_member']); assert.equal(await count(r, 'army_drills'), 0);
    await join('alice'); await join('bob');
    assert.deepEqual([(await read('alice')).strength, (await read('alice')).morale], [20, 50]);
    const id = rid(), first = await drill('alice', id);
    assert.equal(first.status, 200); assert.equal(first.data.replayed, false); assert.deepEqual([first.data.army.unit.strength, first.data.army.unit.morale], [23, 75]);
    const replay = await drill('alice', id); assert.deepEqual([replay.status, replay.data.replayed, replay.data.army.unit.strength], [200, true, 23]);
    const steal = await drill('bob', id); assert.deepEqual([steal.status, steal.data.reason], [409, 'request_conflict']);
    const twice = await drill('alice'); assert.deepEqual([twice.status, twice.data.reason], [409, 'already_drilled']); assert.equal(await count(r, 'army_drills'), 1);
    assert.doesNotMatch(JSON.stringify(first.data), /alice|bob/, 'no identities');
    // A settled shift by a member inside the window adds 1; a non-member's shift adds nothing.
    const order = (await r.db.prepare('SELECT id FROM work_orders LIMIT 1').first()).id, at = new Date(r.now).toISOString();
    for (const [sid, u] of [['s-a', 'alice'], ['s-x', 'carol']]) {
      if (u === 'carol') await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES ('carol','kindle','carol',18,0,'Good standing',?,?)").bind(at, at).run();
      await r.db.batch([r.db.prepare('INSERT INTO work_shifts VALUES (?,?,?,?,?,?,?,?,?)').bind(sid, u, order, 'Fixture shift', 'fixture', 4, at, at, at),
        r.db.prepare('INSERT INTO shift_settlements (shift_id, clerk_user_id, wage_minor, item, quantity, settled_at) VALUES (?,?,?,?,?,?)').bind(sid, u, 800, 'food', 0, at)]);
    }
    assert.equal((await read('bob')).strength, 24);
    // Next game day: alice drills again; after the 7-day window the drills and shift fall out.
    r.setNow(r.now + ARMY_GAME_DAY_SECONDS * 1000);
    assert.equal((await drill('alice')).data.army.unit.strength, 27); assert.equal((await read('bob')).morale, 75, 'morale counts drilled members, not drills');
    r.setNow(r.now + 7 * ARMY_GAME_DAY_SECONDS * 1000);
    assert.deepEqual([(await read('bob')).strength, (await read('bob')).morale], [20, 50], 'window expired');
    // Leaving drops a member's drills; rejoining does not bring old drills back.
    await drill('alice'); await r.call('army', 'alice', { action: 'leave', requestId: rid() });
    assert.deepEqual([(await read('bob')).strength, (await read('bob')).morale], [10, 50]);
    r.setNow(r.now + 1000); await join('alice'); assert.equal((await read('bob')).strength, 20, 'old drills do not count after rejoining');
  });

  test(`${backend}: ARC on #836: a shift settled before joining adds nothing; one settled after joining adds 1`, async t => {
    const { r, join, read } = await world(t, backend);
    const order = (await r.db.prepare('SELECT id FROM work_orders LIMIT 1').first()).id;
    const settle = (sid, atMs) => { const at = new Date(atMs).toISOString(); return r.db.batch([r.db.prepare('INSERT INTO work_shifts VALUES (?,?,?,?,?,?,?,?,?)').bind(sid, 'alice', order, 'Fixture shift', 'fixture', 4, at, at, at),
      r.db.prepare('INSERT INTO shift_settlements (shift_id, clerk_user_id, wage_minor, item, quantity, settled_at) VALUES (?,?,?,?,?,?)').bind(sid, 'alice', 800, 'food', 0, at)]); };
    await settle('vet-1', r.now - 60_000); // a veteran's shift, inside the window but before joining
    await join('alice'); assert.equal((await read('alice')).strength, 10, 'pre-join shift adds nothing');
    r.setNow(r.now + 60_000); await settle('new-1', r.now);
    assert.equal((await read('alice')).strength, 11, 'post-join shift adds 1');
  });

  test(`${backend}: concurrency: the same request id twice and two ids on one game day each pay once; only the winning insert reports replayed false`, async t => {
    const { r, join, drill } = await world(t, backend); await join('alice');
    const id = rid(), same = await Promise.all([drill('alice', id), drill('alice', id)]);
    assert.deepEqual(same.map(x => x.status), [200, 200]); assert.deepEqual(same.map(x => x.data.replayed).sort(), [false, true]);
    r.setNow(r.now + ARMY_GAME_DAY_SECONDS * 1000);
    const two = await Promise.all([drill('alice'), drill('alice')]);
    assert.deepEqual(two.map(x => x.status).sort(), [200, 409]); assert.equal(two.find(x => x.status === 409).data.reason, 'already_drilled');
    assert.equal(await count(r, 'army_drills'), 2);
    // Forced race: both requests pass the "seen?" read before either inserts (barrier), on both backends.
    r.setNow(r.now + ARMY_GAME_DAY_SECONDS * 1000);
    const prepare = r.db.prepare.bind(r.db); let arrived = 0, open; const gate = new Promise(res => { open = res; });
    r.db.prepare = q => { const st = prepare(q); if (!/^SELECT clerk_user_id, game_day FROM army_drills/.test(q)) return st;
      return { bind: (...a) => { const b = st.bind(...a); return { first: async () => { const out = await b.first(); if (arrived < 2) { if (++arrived === 2) open(); await gate; } return out; } }; } }; };
    const raceId = rid(); let raced; try { raced = await Promise.all([drill('alice', raceId), drill('alice', raceId)]); } finally { r.db.prepare = prepare; }
    assert.deepEqual(raced.map(x => x.status), [200, 200]); assert.deepEqual(raced.map(x => x.data.replayed).sort(), [false, true], 'the loser of the insert is a replay');
    assert.equal(await count(r, 'army_drills'), 3);
    // Leave race: the member leaves between the membership read and the insert; the guarded insert writes nothing.
    r.setNow(r.now + ARMY_GAME_DAY_SECONDS * 1000);
    r.db.prepare = q => { const st = prepare(q); if (!/^SELECT unit_id FROM army_members/.test(q)) return st;
      return { bind: (...a) => { const b = st.bind(...a); return { first: async () => { const out = await b.first(); await prepare("DELETE FROM army_members WHERE clerk_user_id = 'alice'").run(); return out; } }; } }; };
    let left; try { left = await drill('alice'); } finally { r.db.prepare = prepare; }
    assert.deepEqual([left.status, left.data.reason], [409, 'not_member']); assert.equal(await count(r, 'army_drills'), 3, 'no drill for a departed member');
  });
}

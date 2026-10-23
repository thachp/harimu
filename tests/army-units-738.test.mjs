/** #738 slice 1: army units (docs §15.3). Flag-off 404 with no DB (GET and POST, spy), join/leave/stance, replay, cross-nation refusal, count only. SQLite + PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';
import { readFileSync } from 'node:fs';
import { armiesEnabled, parseArmyCommand, armyUnits, unitForNation } from '../lib/army-rules.ts';
import { unitCard, unitMembership, armyFailureNote } from '../lib/army-copy.ts';

test('rules: both flags, command parsing boundaries, one unit per MVP nation', () => {
  assert.equal(armiesEnabled({ HARIMU_ARMIES_ENABLED: 'true', HARIMU_WAR_ENABLED: 'true' }), true);
  for (const e of [{ HARIMU_ARMIES_ENABLED: 'true' }, { HARIMU_WAR_ENABLED: 'true' }, { HARIMU_ARMIES_ENABLED: 'true', HARIMU_WAR_ENABLED: 'false' }, { HARIMU_ARMIES_ENABLED: 'TRUE', HARIMU_WAR_ENABLED: 'true' }, null]) assert.equal(armiesEnabled(e), false, JSON.stringify(e));
  assert.equal(parseArmyCommand({ action: 'leave', requestId: 'a'.repeat(7) }), null); assert.ok(parseArmyCommand({ action: 'leave', requestId: 'a'.repeat(8) }));
  assert.ok(parseArmyCommand({ action: 'leave', requestId: 'a'.repeat(64) })); assert.equal(parseArmyCommand({ action: 'leave', requestId: 'a'.repeat(65) }), null);
  assert.equal(parseArmyCommand({ action: 'leave', requestId: 'bad id!!' }), null);
  for (const s of ['hold', 'advance', 'fall_back']) assert.deepEqual(parseArmyCommand({ action: 'stance', stance: s, requestId: 'req-00001' }), { action: 'stance', stance: s, requestId: 'req-00001' });
  assert.equal(parseArmyCommand({ action: 'stance', stance: 'charge', requestId: 'req-00001' }), null);
  assert.equal(parseArmyCommand({ action: 'join', requestId: 'req-00001' }), null); assert.equal(parseArmyCommand({ action: 'march', requestId: 'req-00001' }), null);
  assert.deepEqual(armyUnits.map(u => u.nationId), ['kindle', 'korund', 'aurelle']); assert.equal(unitForNation('confluence'), null);
  for (const u of armyUnits) assert.ok(u.name.length <= 24 && u.officer.length <= 24, u.id);
});

async function spy(r, fn) { const prepare = r.db.prepare.bind(r.db), seen = { sql: [] }; r.db.prepare = q => { seen.sql.push(q); return prepare(q); }; try { seen.result = await fn(); } finally { r.db.prepare = prepare; } return seen; }
const rows = async (r, t) => Number((await r.db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first()).n);
let n = 0; const rid = () => `req-738-${String(++n).padStart(4, '0')}`;

test('card copy (QA3 on #793): member count label from army-copy, neutral failure note for leave/stance, not-open-yet instead of Join', () => {
  const card = readFileSync('app/army-card.tsx', 'utf8');
  assert.doesNotMatch(card, />\s*Members\b|'Members|"Members/, 'no hard-coded member label'); assert.match(card, /unitCard\.memberCountLabel/); assert.equal(unitCard.memberCountLabel, 'Members');
  assert.equal(armyFailureNote('join', 'Kindle Home Guard', 'X'), unitMembership.notEligible.text.replace('{reason}', 'X'));
  for (const action of ['leave', 'stance']) { const note = armyFailureNote(action, 'Kindle Home Guard', 'You are not in a unit.'); assert.equal(note, unitMembership.actionFailed.text.replace('{reason}', 'You are not in a unit.')); assert.doesNotMatch(note, /join/i, action); }
  assert.match(card, /armyFailureNote\(/); assert.doesNotMatch(card, /notEligible/, 'the card never picks the join template itself');
  assert.match(card, /!unit\.openToVolunteers \? <p>\{unitMembership\.notOpenYet\.text\}<\/p> : <button/, 'Korund/Aurelle see the not-open-yet copy, no Join button');
  const page = readFileSync('app/page.tsx', 'utf8'); assert.match(page, /<GovernmentPanel [^\n]*\/>\s*<ArmyCard key=\{`army:\$\{citizenSessionKey\}`\}\/>/, 'mounted after GovernmentPanel (siege-panel-620 and founding-period-ui-612 pins)');
});

for (const backend of ['sqlite', 'postgres']) {
  test(`/api/army (${backend}): flag off (either flag) is 404 for GET and POST before auth or any database access, and writes nothing`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    await r.call('citizen', 'alice');
    for (const [armies, war] of [[undefined, undefined], ['true', 'false'], ['true', undefined], ['false', 'true'], [undefined, 'true']]) {
      r.setFixtureEnv('HARIMU_ARMIES_ENABLED', armies); r.setFixtureEnv('HARIMU_WAR_ENABLED', war);
      const off = await spy(r, async () => [await r.call('army', 'alice'), await r.call('army', null), await r.call('army', 'alice', { action: 'join', unitId: 'kindle-home-guard', requestId: rid() }), await r.call('army', null, { action: 'leave', requestId: rid() })]);
      assert.deepEqual(off.result.map(x => x.status), [404, 404, 404, 404], `${armies}/${war}`); assert.deepEqual(off.sql, [], 'no database access');
    }
    assert.deepEqual([await rows(r, 'army_members'), await rows(r, 'army_requests')], [0, 0], 'flag-off POST had no side effects');
    r.setFixtureEnv('HARIMU_ARMIES_ENABLED', 'true'); r.setFixtureEnv('HARIMU_WAR_ENABLED', 'true');
    const on = await spy(r, () => r.call('army', 'alice'));
    assert.equal(on.result.status, 200); assert.ok(on.sql.length > 0, 'baseline: the same spy sees reads');
  });

  test(`/api/army (${backend}): join, stance, leave, replay, cross-nation refusal, one unit, per-unit counts, no identities`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    await r.call('citizen', 'alice'); await r.call('citizen', 'bob');
    const at = new Date(r.now).toISOString(); // the fixture seeds only alice and bob (Kindle)
    for (const [id, nation] of [['kim', 'korund'], ['ava', 'aurelle'], ['cam', 'confluence']]) await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,?,?,18,0,'Good standing',?,?)").bind(id, nation, id, at, at).run();
    r.setFixtureEnv('HARIMU_ARMIES_ENABLED', 'true'); r.setFixtureEnv('HARIMU_WAR_ENABLED', 'true');
    const post = (u, body) => r.call('army', u, { requestId: rid(), ...body });
    assert.equal((await r.call('army', null)).status, 401); assert.equal((await post(null, { action: 'leave' })).status, 401);
    assert.equal((await r.call('army', 'alice', { action: 'leave', requestId: rid() }, 'https://evil.invalid')).status, 403, 'same origin only');
    assert.deepEqual((await r.call('army', 'alice')).data.army, { unit: { id: 'kindle-home-guard', name: 'Kindle Home Guard', officer: 'Captain Arden', memberCount: 0, openToVolunteers: true }, member: false, stance: null });
    assert.equal((await post('alice', { action: 'stance', stance: 'charge' })).status, 400);
    for (const unitId of ['korund-home-guard', 'nowhere']) { const x = await post('alice', { action: 'join', unitId }); assert.deepEqual([x.status, x.data.reason], [403, 'not_eligible'], unitId); }
    assert.equal((await post('cam', { action: 'join', unitId: 'kindle-home-guard' })).status, 403, 'no MVP nation, no unit');
    assert.equal((await r.call('army', 'cam')).data.army.unit, null);
    assert.equal(await rows(r, 'army_members') + await rows(r, 'army_requests'), 0, 'refusals write nothing');
    for (const action of ['leave', 'stance']) { const x = await post('alice', { action, stance: 'hold' }); assert.deepEqual([x.status, x.data.reason], [409, 'not_member']); }
    const joinId = rid(), join = await r.call('army', 'alice', { action: 'join', unitId: 'kindle-home-guard', requestId: joinId });
    assert.equal(join.status, 200); assert.deepEqual([join.data.army.member, join.data.army.stance, join.data.army.unit.memberCount, join.data.replayed], [true, 'hold', 1, false]);
    const again = await post('alice', { action: 'join', unitId: 'kindle-home-guard' }); assert.deepEqual([again.status, again.data.reason], [409, 'already_member'], 'at most one unit');
    const before = [await rows(r, 'army_members'), await rows(r, 'army_requests')];
    const replay = await r.call('army', 'alice', { action: 'join', unitId: 'kindle-home-guard', requestId: joinId });
    assert.deepEqual([replay.status, replay.data.replayed, replay.data.army.unit.memberCount], [200, true, 1]);
    assert.equal((await r.call('army', 'alice', { action: 'leave', requestId: joinId })).status, 409, 'same id, other action');
    assert.equal((await r.call('army', 'bob', { action: 'join', unitId: 'kindle-home-guard', requestId: joinId })).status, 409, 'same id, other citizen');
    assert.deepEqual([await rows(r, 'army_members'), await rows(r, 'army_requests')], before, 'replays wrote nothing');
    assert.equal((await post('bob', { action: 'join', unitId: 'kindle-home-guard' })).data.army.unit.memberCount, 2);
    // ARC on #793: only Kindle takes volunteers; Korund and Aurelle answer 403 not_open_yet until slice 3 (conscription), and write nothing.
    const before2 = [await rows(r, 'army_members'), await rows(r, 'army_requests')];
    for (const [u, unitId] of [['kim', 'korund-home-guard'], ['ava', 'aurelle-home-guard']]) { const x = await post(u, { action: 'join', unitId }); assert.deepEqual([x.status, x.data.reason], [403, 'not_open_yet'], u); }
    assert.deepEqual([await rows(r, 'army_members'), await rows(r, 'army_requests')], before2, 'not_open_yet writes nothing');
    assert.equal((await post('kim', { action: 'join', unitId: 'kindle-home-guard' })).data.reason, 'not_eligible', 'korund citizen, kindle unit');
    assert.deepEqual([(await r.call('army', 'kim')).data.army.unit.id, (await r.call('army', 'kim')).data.army.unit.memberCount], ['korund-home-guard', 0], 'counts are per unit');
    for (const u of ['kim', 'ava']) assert.equal((await r.call('army', u)).data.army.unit.openToVolunteers, false, `${u}: the card shows not-open-yet`);
    const stanceId = rid();
    assert.equal((await r.call('army', 'alice', { action: 'stance', stance: 'advance', requestId: stanceId })).data.army.stance, 'advance');
    assert.equal((await r.call('army', 'alice', { action: 'stance', stance: 'fall_back', requestId: stanceId })).data.army.stance, 'advance', 'stance replay returns the stored state');
    assert.equal((await post('alice', { action: 'stance', stance: 'fall_back' })).data.army.stance, 'fall_back');
    assert.equal((await r.call('army', 'bob')).data.army.stance, 'hold', 'a stance change touches only the caller');
    assert.ok(!/alice|kim/.test(JSON.stringify((await r.call('army', 'bob')).data)), 'only a count, never identities');
    const left = await post('alice', { action: 'leave' }); assert.deepEqual([left.data.army.member, left.data.army.stance, left.data.army.unit.memberCount], [false, null, 1]);
    assert.equal((await r.call('army', 'bob')).data.army.member, true, 'leave removes only the caller');
    assert.equal((await r.call('army', 'kim')).data.army.unit.memberCount, 0);
    assert.equal((await post('alice', { action: 'leave' })).data.reason, 'not_member');
    assert.equal((await post('alice', { action: 'join', unitId: 'kindle-home-guard' })).data.army.member, true, 'can rejoin after leaving');
  });
}

for (const backend of ['sqlite', 'postgres']) {
  test(`army race (${backend}): a same-request-id race that loses the batch re-reads once and replays, never a 500`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    await r.call('citizen', 'alice');
    const army = await r.importModule('lib/army.ts');
    const cmd = { action: 'join', unitId: 'kindle-home-guard', requestId: 'req-race-0001' };
    assert.equal((await army.runArmyCommand(r.db, 'alice', cmd, 100)).replayed, false);
    // The racing twin read before the winner committed: no request row and no membership on its first look, so its batch hits the keys.
    let blind = 2;
    const stale = { [String(/FROM army_requests WHERE request_id=\?/)]: null, [String(/SELECT c\.nation_id, m\.unit_id FROM citizens/)]: { nation_id: 'kindle', unit_id: null } };
    const racing = { batch: s => r.db.batch(s), prepare: q => { const hit = blind > 0 && Object.keys(stale).find(k => new RegExp(k.slice(1, -1)).test(q)); if (!hit) return r.db.prepare(q); blind--; return { bind: () => ({ first: async () => stale[hit] }) }; } };
    const before = Number((await r.db.prepare('SELECT COUNT(*) AS n FROM army_requests').first()).n);
    const result = await army.runArmyCommand(racing, 'alice', cmd, 101);
    assert.deepEqual([result.ok, result.replayed, result.member], [true, true, true], 'the retry finds the winner and replays');
    assert.equal(blind, 0, 'the race was forced (both stale reads served)');
    assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM army_requests').first()).n), before, 'nothing new written');
  });
}

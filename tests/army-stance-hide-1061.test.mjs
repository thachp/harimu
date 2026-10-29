/** #1061: hide the opposing side's squad stance counts until a battle resolves. Counts only.
 *  Behind HARIMU_ARMY_BATTLES_ENABLED (no new flag). A viewer's nation is their side. SQLite + PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { unitMembership } from '../lib/army-copy.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const boot = await localRuntime({ backend: 'sqlite' });
const { cardStanceCounts, presentBattle, stanceCountsForViewer } = await boot.importModule('lib/army-battle.ts');
await boot.close();

const kindle = { hold: 4, advance: 17, fall_back: 9 }, korund = { hold: 6, advance: 23, fall_back: 1 };
const live = { status: 'ongoing', attackerNationId: 'kindle', defenderNationId: 'korund', stances: { attacker: kindle, defender: korund }, attackerStrength: 150 };
const mixes = (value, found = []) => {
  if (value && typeof value === 'object') {
    if (['hold', 'advance', 'fall_back'].every(k => typeof value[k] === 'number') && Object.keys(value).length === 3) found.push(value);
    for (const v of Object.values(value)) mixes(v, found);
  }
  return found;
};

test('a live battle keeps the other side out of the response; a resolved battle shows both', () => {
  assert.deepEqual(stanceCountsForViewer(live, 'kindle'), { attacker: kindle });
  assert.deepEqual(stanceCountsForViewer(live, 'korund'), { defender: korund });
  assert.equal(stanceCountsForViewer(live, 'aurelle'), undefined);
  assert.equal(stanceCountsForViewer(live, null), undefined);
  const shown = presentBattle(live, 'kindle');
  assert.deepEqual(shown.stances, { attacker: kindle });
  assert.equal(Object.hasOwn(shown.stances, 'defender'), false);
  assert.equal(JSON.stringify(shown).includes('"advance":23'), false, 'the other side\'s count is not in the JSON');
  assert.deepEqual(live.stances, { attacker: kindle, defender: korund }, 'the server mix is unchanged');
  const done = { ...live, status: 'attacker_won' };
  assert.deepEqual(stanceCountsForViewer(done, null), live.stances);
  assert.deepEqual(stanceCountsForViewer(done, 'aurelle'), live.stances);
  assert.deepEqual(cardStanceCounts(live, 'kindle'), { stances: kindle });
  assert.deepEqual(cardStanceCounts(live, 'korund'), { stances: korund });
  assert.deepEqual(cardStanceCounts(done, 'kindle'), { stances: kindle, opponentStances: korund });
  assert.deepEqual(cardStanceCounts(done, 'korund'), { stances: korund, opponentStances: kindle });
  assert.equal(JSON.stringify(cardStanceCounts(live, 'kindle')).includes('"advance":23'), false);
});

test('migration 0112 adds the six count columns, the card only renders an opponent mix the server sent, and there is no new flag', () => {
  const cols = ['attacker_hold', 'attacker_advance', 'attacker_fall_back', 'defender_hold', 'defender_advance', 'defender_fall_back'];
  const lite = readFileSync('drizzle/0112_army_battle_stances.sql', 'utf8'), pg = readFileSync('db/postgres/0112_army_battle_stances.sql', 'utf8');
  const battle = readFileSync('lib/army-battle.ts', 'utf8');
  for (const col of cols) {
    assert.match(lite, new RegExp(`ADD COLUMN ${col} INTEGER`));
    assert.match(pg, new RegExp(`ADD COLUMN IF NOT EXISTS ${col} INTEGER`));
    assert.ok(battle.includes(col), col);
  }
  assert.doesNotMatch(`${lite}\n${pg}`, /\b(DROP|DELETE|TRUNCATE)\b/i);
  assert.doesNotMatch(battle, /HARIMU_[A-Z0-9_]*STANCE/, 'no new flag');
  assert.match(readFileSync('app/army-card.tsx', 'utf8'), /unit\.battle\?\.opponentStances && <p>\{opponentStanceLine\(unit\.battle\)\}<\/p>/);
  const line = unitMembership.opponentBattleStances;
  assert.equal(line.proposal, true);
  assert.ok(line.text.length <= 100, line.text);
  assert.equal(line.text, '{nation} squads: {hold} holding, {advance} advancing, {fall_back} falling back.');
});

const ON = { HARIMU_ARMIES_ENABLED: 'true', HARIMU_WAR_ENABLED: 'true', HARIMU_ARMY_MAP_ENABLED: 'true', HARIMU_ARMY_SUPPLY_ENABLED: 'true', HARIMU_ARMY_BATTLES_ENABLED: 'true', HARIMU_ARMY_DRILLS_ENABLED: 'true' };
const citizen = (r, id, nation) => r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,?,?,18,0,'Good standing','2026-01-15T12:00:00Z','2026-01-15T12:00:00Z')").bind(id, nation, id).run();
const member = (r, id, unit, stance) => r.db.prepare('INSERT INTO army_members (clerk_user_id, unit_id, stance, joined_at, request_id) VALUES (?,?,?,?,?)').bind(id, unit, stance, 0, `rq-${id}`).run();
async function seedMix(r, nation, unit, mix) {
  let i = 0;
  for (const [stance, n] of Object.entries(mix)) for (let k = 0; k < n; k++, i++) {
    const id = `m1061-${nation}-${i}`;
    await citizen(r, id, nation); await member(r, id, unit, stance);
  }
}
async function spy(r, fn) { const prepare = r.db.prepare.bind(r.db), seen = { sql: [] }; r.db.prepare = q => { seen.sql.push(q); return prepare(q); }; try { seen.result = await fn(); } finally { r.db.prepare = prepare; } return seen; }

for (const backend of ['sqlite', 'postgres']) {
  test(`${backend}: each side sees only its own counts while the battle is live, both after it resolves, and flag off sends none`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    for (const [k, v] of Object.entries(ON)) r.setFixtureEnv(k, v);
    await seedMix(r, 'kindle', 'kindle-home-guard', kindle);
    await seedMix(r, 'korund', 'korund-home-guard', korund);
    await citizen(r, 'ada1061', 'aurelle');
    const now = Math.floor(r.now / 1000), AB = await r.importModule('lib/army-battle.ts'), Map = await r.importModule('lib/army-map.ts');
    const probe = Map.unitMarch('kindle', [{ attacker_nation: 'kindle', defender_nation: 'korund', mobilization_ends_at: 0, declared_at: 0 }], 1);
    const mob = now - Map.marchArrivalAt(probe) - AB.BATTLE_ROUND_SECONDS;
    await r.db.prepare("INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,casus_belli,declared_by,declared_at,mobilization_ends_at) VALUES ('w1061','r-1061','kindle:korund','kindle','korund','','AI',?,?)").bind(mob - 172800, mob).run();
    const sideA = 'm1061-kindle-0', sideB = 'm1061-korund-0';
    const battlesOf = async user => (await r.call('army/battles', user)).data;
    const cardOf = async user => (await r.call('army', user)).data.army.unit.battle;
    const liveA = await battlesOf(sideA), liveB = await battlesOf(sideB), liveOut = await battlesOf(null), liveAda = await battlesOf('ada1061');
    assert.equal(liveA.battles[0].status, 'ongoing');
    assert.deepEqual(liveA.battles[0].stances, { attacker: kindle });
    assert.equal(JSON.stringify(liveA).includes('"advance":23'), false);
    assert.deepEqual(liveB.battles[0].stances, { defender: korund });
    assert.equal(JSON.stringify(liveB).includes('"advance":17'), false);
    assert.equal(liveOut.battles[0].stances, undefined);
    assert.equal(liveAda.battles[0].stances, undefined);
    assert.deepEqual(mixes(liveOut), []);
    assert.deepEqual(mixes(liveAda), []);
    const cardA = await cardOf(sideA), cardB = await cardOf(sideB);
    assert.deepEqual(cardA.stances, kindle);
    assert.equal(cardA.opponentStances, undefined);
    assert.equal(JSON.stringify(cardA).includes('"advance":23'), false);
    assert.deepEqual(cardB.stances, korund);
    assert.equal(cardB.opponentStances, undefined);
    assert.equal(JSON.stringify(cardB).includes('"advance":17'), false);
    const ids = (await r.db.prepare('SELECT clerk_user_id FROM army_members').all()).results.map(x => x.clerk_user_id);
    const blob = JSON.stringify({ liveA, liveB, liveOut, cardA, cardB });
    for (const id of ids) assert.equal(blob.includes(id), false, id);
    const later = now + AB.BATTLE_MAX_ROUNDS * AB.BATTLE_ROUND_SECONDS;
    await AB.recordFinishedBattles(r.db, later);
    await r.db.prepare("UPDATE army_members SET stance = 'hold'").run();
    for (const user of [sideA, sideB, null, 'ada1061']) {
      const body = await battlesOf(user);
      assert.notEqual(body.battles[0].status, 'ongoing', user ?? 'signed-out');
      assert.deepEqual(body.battles[0].stances, { attacker: kindle, defender: korund });
      assert.deepEqual(mixes(body), [kindle, korund]);
    }
    const doneA = await cardOf(sideA), doneB = await cardOf(sideB);
    assert.deepEqual(doneA.stances, kindle); assert.deepEqual(doneA.opponentStances, korund);
    assert.deepEqual(doneB.stances, korund); assert.deepEqual(doneB.opponentStances, kindle);
    assert.deepEqual((await AB.readBattles(r.db, await Map.readActiveWars(r.db), later))[0].stances, { attacker: kindle, defender: korund }, 'a later stance change does not rewrite the stored mix');
    r.setFixtureEnv('HARIMU_ARMY_BATTLES_ENABLED', 'false');
    const offBattles = await spy(r, () => r.call('army/battles', sideA));
    assert.equal(offBattles.result.status, 404);
    assert.deepEqual(offBattles.sql, [], 'flag off: no read');
    const offCard = await spy(r, () => r.call('army', sideA));
    assert.equal(offCard.result.data.army.unit.battle, undefined);
    assert.ok(!offCard.sql.some(q => q.includes("stance = 'hold'")), 'flag off: stance counts are not read');
  });
}

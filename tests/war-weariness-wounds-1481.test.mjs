/** #1481: with HARIMU_WAR_WEARINESS_LOSSES_ENABLED, army_wounds in the rolling week feed the casualty add-on (docs 15.3 / 15.4). No new flag. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { localRuntime } from './helpers/local-runtime.mjs';
import { mutantTree } from './helpers/mutant-tree.mjs';
import { WEARINESS_WEEK_SECONDS as WEEK, warWearinessUnrest, wearinessConfig } from '../lib/war-rules.ts';

const KINDLE = 'kindle-home-guard', KORUND = 'korund-home-guard', AURELLE = 'aurelle-home-guard';
const daySec = 7200;
const levels = weariness => Object.keys(weariness ?? {}).sort();
const isLevel = v => v === 'rising' || v === 'high' || v === 'severe';

async function citizen(r, id, nation) {
  const at = new Date(r.now).toISOString();
  await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,?,?,18,0,'Good standing',?,?)").bind(id, nation, id, at, at).run();
}
async function addWar(r, attacker, defender, mobEnd, endedAt = null) {
  const id = randomUUID();
  await r.db.prepare('INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,casus_belli,declared_by,declared_at,mobilization_ends_at,ended_at,end_kind) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id, randomUUID(), [attacker, defender].sort().join(':'), attacker, defender, '', 'test', mobEnd - 172800, mobEnd, endedAt, endedAt === null ? null : 'other').run();
  return id;
}
async function addBattle(r, { war, attackerUnit, defenderUnit, end, retreated, rounds = 2, roundSeconds }) {
  const key = randomUUID(), startedAt = end - rounds * roundSeconds;
  const status = retreated === 'attacker' ? 'defender_won' : 'attacker_won';
  await r.db.prepare('INSERT INTO army_battles (battle_key,war_id,attacker_unit,defender_unit,started_at,rounds,status,retreated,attacker_strength,defender_strength,recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .bind(key, war, attackerUnit, defenderUnit, startedAt, rounds, status, retreated, 10, 10, end).run();
  return key;
}
async function addWounds(r, battleKey, n) {
  for (let i = 0; i < n; i++) await r.db.prepare('INSERT INTO army_wounds (battle_key,clerk_user_id,wounded_until) VALUES (?,?,?)').bind(battleKey, `${battleKey}-${i}`, 1).run();
}
async function captureSquares(r, war, attacker, defender, lost, at) {
  const siege = randomUUID(), cap = randomUUID();
  await r.db.prepare('INSERT INTO city_sieges (id,war_id,city_key,city_kind,center_x,center_y,attacker_nation,defender_nation,created_at,captured_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(siege, war, `outpost:${siege.slice(0, 8)}`, 'outpost', 3, 4, attacker, defender, at - 100, at).run();
  await r.db.prepare('INSERT INTO city_captures (id,siege_id,war_id,request_id,attacker_nation,defender_nation,squares_transferred,squares_kept_private,captured_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(cap, siege, war, randomUUID(), attacker, defender, lost, 0, at).run();
}
async function setup(t, { backend, weeks = 2 } = {}) {
  const r = await localRuntime({ backend: backend ?? 'sqlite' }); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_WAR_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_WAR_WEARINESS_ENABLED', 'true');
  await citizen(r, 'ava', 'aurelle'); await citizen(r, 'kai', 'korund'); await citizen(r, 'kim', 'kindle');
  const day = Math.floor(r.now / 1000 / daySec) + 3, scheduledAt = day * daySec;
  await r.db.prepare("INSERT INTO world_clock (id,epoch_seconds) VALUES ('main',?) ON CONFLICT(id) DO UPDATE SET epoch_seconds=excluded.epoch_seconds").bind((day - 1) * daySec).run();
  const mobEnd = scheduledAt - weeks * WEEK - 100;
  const war = await addWar(r, 'kindle', 'korund', mobEnd);
  r.setNow((scheduledAt + 60) * 1000);
  const wear = await r.importModule('lib/war-weariness.ts');
  const { BATTLE_ROUND_SECONDS: roundSeconds } = await r.importModule('lib/army-battle.ts');
  const read = (at = scheduledAt, losses = true) => wear.readWarWeariness(r.db, at, { losses });
  const base = await wear.readWarWeariness(r.db, scheduledAt);
  return { r, scheduledAt, war, wear, roundSeconds, read, base };
}
const scoreOf = async (r, nation) => { const x = await r.db.prepare('SELECT unrest,inputs_json,breakdown_json FROM nation_stability_scores WHERE tick=1 AND nation_id=?').bind(nation).first(); return { unrest: x.unrest, inputs: JSON.parse(x.inputs_json), unrestTerms: JSON.parse(x.breakdown_json).unrest }; };
const warTerm = s => s.unrestTerms.find(x => x.input === 'war');

for (const backend of ['sqlite', 'postgres']) {
  const label = backend;

  test(`#1481 (${label}): 25 wounds add floor(n/10) capped at 10; the winning attacker is not charged; 9 add nothing`, async t => {
    const { read, base, war, scheduledAt, roundSeconds, r } = await setup(t, { backend });
    assert.deepEqual(base, { kindle: 6, korund: 2, aurelle: 0 });
    await addWounds(r, await addBattle(r, { war, attackerUnit: KINDLE, defenderUnit: KORUND, end: scheduledAt - 1000, retreated: 'defender', roundSeconds }), 25);
    let w = await read();
    assert.equal(w.korund, 2 + 2, '25 wounds → floor(25/10)=2 on the destroyed defender');
    assert.equal(w.kindle, 6, 'the winning attacker is not charged');
    assert.equal(w.aurelle, 0);
    assert.equal(w.korund, warWearinessUnrest('korund', 2, { casualties: 25 }));
    await addWounds(r, await addBattle(r, { war, attackerUnit: KINDLE, defenderUnit: KORUND, end: scheduledAt - 500, retreated: 'attacker', roundSeconds }), 9);
    w = await read();
    assert.equal(w.kindle, 6, '9 wounds add nothing');
    assert.equal(w.korund, 4, 'Korund is unchanged by Kindle wounds');
    await addWounds(r, await addBattle(r, { war, attackerUnit: KINDLE, defenderUnit: KORUND, end: scheduledAt - 200, retreated: 'defender', roundSeconds }), 80);
    w = await read();
    assert.equal(w.korund, 2 + wearinessConfig.casualtyCap, '105 wounds cap at 10');
    assert.deepEqual(w, await read(), 'a pure function of the stored rows and the time');
  });

  test(`#1481 (${label}): per-war and per-nation isolation; a battle that ended exactly one week ago is outside; ended wars and retreated=null add nothing`, async t => {
    const { read, base, war, scheduledAt, roundSeconds, r } = await setup(t, { backend });
    const ended = await addWar(r, 'aurelle', 'kindle', scheduledAt - 5 * WEEK, scheduledAt - 4 * WEEK);
    await addWounds(r, await addBattle(r, { war: ended, attackerUnit: AURELLE, defenderUnit: KINDLE, end: scheduledAt - 1000, retreated: 'defender', roundSeconds }), 40);
    assert.deepEqual(await read(), base, 'wounds from an ended war add nothing');
    const other = await addWar(r, 'aurelle', 'kindle', scheduledAt - 2 * WEEK - 100);
    await addWounds(r, await addBattle(r, { war: other, attackerUnit: AURELLE, defenderUnit: KINDLE, end: scheduledAt - 800, retreated: 'attacker', roundSeconds }), 20);
    let w = await read();
    assert.equal(w.aurelle, warWearinessUnrest('aurelle', 2, { casualties: 20 }), 'Aurelle is charged in its own active war');
    assert.equal(w.kindle, warWearinessUnrest('kindle', 4), 'Kindle, the winner in that war, is not charged (weeks from both active wars only)');
    assert.equal(w.korund, 2, 'Korund is not in the Aurelle war');
    await addWounds(r, await addBattle(r, { war, attackerUnit: KINDLE, defenderUnit: KORUND, end: scheduledAt - WEEK, retreated: 'defender', roundSeconds }), 30);
    assert.equal((await read()).korund, 2, 'a battle that ended exactly one week ago is outside (asOf-WEEK, asOf]');
    await addWounds(r, await addBattle(r, { war, attackerUnit: KINDLE, defenderUnit: KORUND, end: scheduledAt - WEEK + 1, retreated: 'defender', roundSeconds }), 10);
    assert.equal((await read()).korund, 2 + 1, 'one second inside the week it counts');
    await addWounds(r, await addBattle(r, { war, attackerUnit: KINDLE, defenderUnit: KORUND, end: scheduledAt, retreated: 'defender', roundSeconds }), 10);
    assert.equal((await read()).korund, 2 + 2, 'a battle that ends at asOf counts');
    await addWounds(r, await addBattle(r, { war, attackerUnit: KINDLE, defenderUnit: KORUND, end: scheduledAt + 1, retreated: 'defender', roundSeconds }), 30);
    assert.equal((await read()).korund, 2 + 2, 'a battle that has not ended yet at asOf does not count');
    const limit = await addBattle(r, { war, attackerUnit: KINDLE, defenderUnit: KORUND, end: scheduledAt - 100, retreated: null, roundSeconds });
    await addWounds(r, limit, 30);
    w = await read();
    assert.equal(w.korund, 2 + 2, 'a round-limit loss (retreated null) adds nothing even if wound rows exist');
    assert.equal(w.kindle, warWearinessUnrest('kindle', 4), 'the attacker is also uncharged on a round-limit loss');
  });

  test(`#1481 (${label}): losses off is unchanged and runs no casualty query; missing tables read as zero; squares still stack`, async t => {
    const { r, read, base, war, scheduledAt, roundSeconds, wear } = await setup(t, { backend });
    await addWounds(r, await addBattle(r, { war, attackerUnit: KINDLE, defenderUnit: KORUND, end: scheduledAt - 1000, retreated: 'defender', roundSeconds }), 25);
    await captureSquares(r, war, 'kindle', 'korund', 3, scheduledAt - 1000);
    const seen = [];
    const prepare = r.db.prepare.bind(r.db);
    r.db.prepare = sql => { seen.push(sql); return prepare(sql); };
    let off;
    try { off = await wear.readWarWeariness(r.db, scheduledAt); } finally { r.db.prepare = prepare; }
    assert.deepEqual(off, base, 'flag off (default): scores are unchanged');
    assert.deepEqual(await wear.readWarWeariness(r.db, scheduledAt, { losses: false }), base);
    assert.ok(!seen.some(sql => /army_wounds|army_battles/i.test(sql)), 'flag off runs no casualty query');
    const on = await read();
    assert.equal(on.korund, 2 + 3 + 2, '3 lost squares and 25 wounds stack: +3 + floor(25/10)');
    assert.equal(on.kindle, 6);
    const writes = [];
    const prep = r.db.prepare.bind(r.db), batch = r.db.batch.bind(r.db);
    r.db.prepare = sql => { if (/^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i.test(sql)) writes.push(sql.slice(0, 40)); return prep(sql); };
    r.db.batch = x => { writes.push('batch'); return batch(x); };
    try { await wear.readWarWeariness(r.db, scheduledAt, { losses: true }); } finally { r.db.prepare = prep; r.db.batch = batch; }
    assert.deepEqual(writes, [], 'reads never write');
    // #584: DROP TABLE fails on the PGlite fixture; pin the missing-table case to SQLite.
    // Pass backend: 'sqlite' explicitly so HARIMU_TEST_STORAGE=postgres (CI Postgres shards) cannot override it.
    if (backend === 'sqlite') {
      assert.equal(r.storageEngine, 'sqlite');
      await r.db.prepare('DROP TABLE army_wounds').run();
      assert.deepEqual(await read(), { kindle: 6, korund: 2 + 3, aurelle: 0 }, 'missing army_wounds reads as zero casualties; lost squares still count');
      await r.db.prepare('DROP TABLE army_battles').run();
      assert.deepEqual(await read(), { kindle: 6, korund: 2 + 3, aurelle: 0 }, 'missing army_battles also reads as zero casualties');
    }
  });

  test(`#1481 (${label}): daily score from a live tick equals a replay; GET responses stay level words; Korund sees only Korund`, async t => {
    const { r, scheduledAt, war, roundSeconds, wear } = await setup(t, { backend });
    r.setFixtureEnv('HARIMU_WAR_WEARINESS_LOSSES_ENABLED', 'true');
    await addWounds(r, await addBattle(r, { war, attackerUnit: KINDLE, defenderUnit: KORUND, end: scheduledAt - 1000, retreated: 'defender', roundSeconds }), 25);
    const live = (await wear.readWarWeariness(r.db, scheduledAt, { losses: true })).korund;
    assert.equal(live, 2 + 2);
    await r.call('world', null);
    const s = await scoreOf(r, 'korund');
    assert.equal(s.inputs.warWeariness, live);
    assert.equal(warTerm(s).points, live);
    const before = JSON.stringify(s);
    await r.call('world', null);
    assert.equal(JSON.stringify(await scoreOf(r, 'korund')), before, 'a replayed tick is a no-op');
    assert.equal(warTerm(await scoreOf(r, 'kindle')).points, 6, 'Kindle score is unchanged');
    await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='alice'").run();
    const aliceWorld = await r.call('world', 'alice'), bobWorld = await r.call('world', 'bob');
    assert.equal(aliceWorld.status, 200);
    const aliceW = aliceWorld.data.simulation.weariness, bobW = bobWorld.data.simulation.weariness;
    assert.ok(aliceW && bobW);
    assert.ok(Object.values(aliceW).every(isLevel) && Object.values(bobW).every(isLevel), 'public weariness is only level words');
    assert.ok(!Object.values(aliceW).some(v => typeof v === 'number') && !('casualties' in aliceW), 'no casualty count in public copy');
    assert.deepEqual(levels(aliceW), ['korund']);
    assert.equal(aliceW.korund, 'rising');
    assert.ok(!('kindle' in aliceW) && !('aurelle' in aliceW));
    assert.equal(bobW.korund, 'rising');
    assert.equal(bobW.kindle, 'rising');
    const aliceCitizen = await r.call('citizen', 'alice');
    assert.deepEqual(levels(aliceCitizen.data.simulation.weariness), ['korund']);
    assert.ok(Object.values(aliceCitizen.data.simulation.weariness).every(isLevel));
  });
}

test('#1481 BATTLE_ROUND_SECONDS is the window tick length', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const battle = await r.importModule('lib/army-battle.ts');
  assert.equal(battle.BATTLE_ROUND_SECONDS, 600, 'docs §15.3: a round every 10 real minutes');
});

test('#1481 mutations: skipping the count, charging the winner, and a window off-by-one all fail', () => {
  const file = 'tests/war-weariness-wounds-1481.test.mjs';
  const cases = [
    {
      file: 'lib/war-weariness.ts',
      find: 'out[nation] = warWearinessUnrest(nation, weeks[nation], { lostSquares: lost[nation], casualties: casualties[nation] });',
      replace: 'out[nation] = warWearinessUnrest(nation, weeks[nation], { lostSquares: lost[nation] });',
      pattern: '25 wounds',
    },
    {
      file: 'lib/war-weariness.ts',
      find: "const unitId = row.retreated === 'attacker' ? row.attacker_unit : row.retreated === 'defender' ? row.defender_unit : null;",
      replace: "const unitId = row.retreated === 'attacker' ? row.defender_unit : row.retreated === 'defender' ? row.attacker_unit : null;",
      pattern: 'the winning attacker is not charged',
    },
    {
      file: 'lib/war-weariness.ts',
      find: 'WHERE b.started_at+b.rounds*? > ? AND b.started_at+b.rounds*? <= ?',
      replace: 'WHERE b.started_at+b.rounds*? >= ? AND b.started_at+b.rounds*? <= ?',
      pattern: 'exactly one week ago is outside',
    },
  ];
  const tree = mutantTree(); // #1509: mutants live only in a tmpdir copy, never in the shared tree that parallel test files read
  try {
    for (const c of cases) {
      const restore = tree.mutate(c.file, c.find, c.replace);
      try {
        const result = tree.run([file], c.pattern);
        assert.notEqual(result.status, 0, `mutant survived (${c.find}):\n${result.stdout}\n${result.stderr}`);
      } finally { restore(); }
    }
  } finally { tree.close(); }
});

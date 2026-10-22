/** #495: lost frontier squares (city captures) feed the war weariness add-on, behind HARIMU_WAR_WEARINESS_LOSSES_ENABLED (default "false"). Casualties stay zero: nothing records them. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';
import { WEARINESS_WEEK_SECONDS as WEEK, warWearinessUnrest, wearinessConfig } from '../lib/war-rules.ts';

const daySec = 7200;
async function citizen(r, id, nation) {
  const at = new Date(r.now).toISOString();
  await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,?,?,18,0,'Good standing',?,?)").bind(id, nation, id, at, at).run();
}
async function addWar(r, attacker, defender, mobEnd, endedAt = null) {
  const declared = mobEnd - 172800;
  await r.db.prepare('INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,casus_belli,declared_by,declared_at,mobilization_ends_at,ended_at,end_kind) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .bind(randomUUID(), randomUUID(), [attacker, defender].sort().join(':'), attacker, defender, '', 'test', declared, mobEnd, endedAt, endedAt === null ? null : 'other').run();
}
/** Tick 1 is scheduled at `scheduledAt`; Kindle and Korund are at war and went active two full game weeks (and a bit) earlier. */
async function setup(t, { war = true, weariness = true, backend, weeks = 2, endedWeeksAgo = null } = {}) {
  const r = await localRuntime(backend ? { backend } : {}); t.after(() => r.close());
  if (war) r.setFixtureEnv('HARIMU_WAR_ENABLED', 'true');
  if (weariness) r.setFixtureEnv('HARIMU_WAR_WEARINESS_ENABLED', 'true');
  await citizen(r, 'ava', 'aurelle'); await citizen(r, 'kai', 'korund'); await citizen(r, 'kim', 'kindle');
  const day = Math.floor(r.now / 1000 / daySec) + 3, scheduledAt = day * daySec;
  await r.db.prepare("INSERT INTO world_clock (id,epoch_seconds) VALUES ('main',?) ON CONFLICT(id) DO UPDATE SET epoch_seconds=excluded.epoch_seconds").bind((day - 1) * daySec).run();
  const mobEnd = scheduledAt - weeks * WEEK - 100;
  await addWar(r, 'kindle', 'korund', mobEnd, endedWeeksAgo === null ? null : scheduledAt - endedWeeksAgo * WEEK);
  r.setNow((scheduledAt + 60) * 1000);
  return { r, scheduledAt, mobEnd };
}
const scoreOf = async (r, nation) => { const x = await r.db.prepare('SELECT unrest,inputs_json,breakdown_json FROM nation_stability_scores WHERE tick=1 AND nation_id=?').bind(nation).first(); return { unrest: x.unrest, inputs: JSON.parse(x.inputs_json), unrestTerms: JSON.parse(x.breakdown_json).unrest }; };
const warTerm = s => s.unrestTerms.find(x => x.input === 'war');
const warId = async (r, a, d) => (await r.db.prepare('SELECT id FROM wars WHERE attacker_nation=? AND defender_nation=?').bind(a, d).first()).id;
/** One captured city: the defender lost `lost` national squares and a holder privately kept `kept`. */
async function capture(r, war, attacker, defender, lost, at, kept = 0) {
  const siege = randomUUID(), cap = randomUUID();
  await r.db.prepare('INSERT INTO city_sieges (id,war_id,city_key,city_kind,center_x,center_y,attacker_nation,defender_nation,created_at,captured_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(siege, war, `outpost:${siege.slice(0, 8)}`, 'outpost', 3, 4, attacker, defender, at - 100, at).run();
  await r.db.prepare('INSERT INTO city_captures (id,siege_id,war_id,request_id,attacker_nation,defender_nation,squares_transferred,squares_kept_private,captured_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(cap, siege, war, randomUUID(), attacker, defender, lost, kept, at).run();
}

test('pure rules are unchanged: the caps hold and zero weeks ignore the counts (add-on numbers stay [ASSUMPTION]s)', () => {
  assert.equal(warWearinessUnrest('korund', 2, { lostSquares: 3 }), 5);
  assert.equal(warWearinessUnrest('korund', 2, { lostSquares: 500 }), 2 + wearinessConfig.lostSquareCap);
  assert.equal(warWearinessUnrest('korund', 0, { lostSquares: 9 }), 0);
});

test('readWarWeariness: with losses on, a nation\'s captured-away squares add the capped Unrest; off, or before the capture, or after the war ended, they add nothing', async t => {
  const { r, scheduledAt } = await setup(t);
  const wear = await r.importModule('lib/war-weariness.ts'), war = await warId(r, 'kindle', 'korund');
  const base = await wear.readWarWeariness(r.db, scheduledAt); assert.deepEqual(base, { kindle: 6, korund: 2, aurelle: 0 });
  await capture(r, war, 'kindle', 'korund', 3, scheduledAt - 1000, 4);
  assert.deepEqual(await wear.readWarWeariness(r.db, scheduledAt), base, 'losses flag off: nothing changes (the default)');
  assert.deepEqual(await wear.readWarWeariness(r.db, scheduledAt, { losses: false }), base);
  assert.deepEqual(await wear.readWarWeariness(r.db, scheduledAt, { losses: true }), { kindle: 6, korund: 2 + 3, aurelle: 0 }, 'Korund lost 3 squares; the 4 a holder kept are not lost; the attacker gains no Unrest from winning');
  assert.deepEqual(await wear.readWarWeariness(r.db, scheduledAt - 2000, { losses: true }), await wear.readWarWeariness(r.db, scheduledAt - 2000), 'a capture that has not happened yet at that time does not count');
  await capture(r, war, 'kindle', 'korund', 20, scheduledAt - 500);
  assert.equal((await wear.readWarWeariness(r.db, scheduledAt, { losses: true })).korund, 2 + wearinessConfig.lostSquareCap, 'capped at the add-on cap');
  assert.deepEqual(await wear.readWarWeariness(r.db, scheduledAt, { losses: true }), await wear.readWarWeariness(r.db, scheduledAt, { losses: true }), 'a pure function of the stored rows and the time');
  // a war that has ended counts nothing, losses included
  await addWar(r, 'aurelle', 'kindle', scheduledAt - 5 * WEEK, scheduledAt - 4 * WEEK);
  await capture(r, await warId(r, 'aurelle', 'kindle'), 'aurelle', 'kindle', 9, scheduledAt - 4.5 * WEEK);
  assert.equal((await wear.readWarWeariness(r.db, scheduledAt, { losses: true })).kindle, 6, 'a lost square from an ended war adds nothing');
});

for (const backend of [undefined, 'postgres']) test(`world tick (${backend ?? 'sqlite'}): the losses flag adds the captured-away squares to the daily score once, replays change nothing, and the GET writes nothing${backend ? ' (PGlite)' : ''}`, async t => {
  const off = await setup(t, { backend });
  await capture(off.r, await warId(off.r, 'kindle', 'korund'), 'kindle', 'korund', 3, off.scheduledAt - 1000);
  await off.r.call('world', null);
  assert.equal(warTerm(await scoreOf(off.r, 'korund')).points, 2, 'both war flags on, losses flag off: unchanged');
  const { r, scheduledAt } = await setup(t, { backend }); r.setFixtureEnv('HARIMU_WAR_WEARINESS_LOSSES_ENABLED', 'true');
  await capture(r, await warId(r, 'kindle', 'korund'), 'kindle', 'korund', 3, scheduledAt - 1000);
  const wear = await r.importModule('lib/war-weariness.ts'), sim = await r.importModule('lib/world-simulation.ts');
  const writes = [], prepare = r.db.prepare.bind(r.db), batch = r.db.batch.bind(r.db);
  r.db.prepare = sql => { if (/^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i.test(sql)) writes.push(sql.slice(0, 40)); return prepare(sql); };
  r.db.batch = x => { writes.push('batch'); return batch(x); };
  try { await sim.readWorldSimulation(r.db, scheduledAt + 60, { war: true, warWeariness: true, warWearinessLosses: true }); await wear.readWarWeariness(r.db, scheduledAt, { losses: true }); } finally { r.db.prepare = prepare; r.db.batch = batch; }
  assert.deepEqual(writes, [], 'reads never write');
  await r.call('world', null);
  const s = await scoreOf(r, 'korund');
  assert.equal(warTerm(s).points, 2 + 3, 'Korund: 2 weeks x 2 x 0.5 + 3 lost squares'); assert.equal(s.inputs.warWeariness, 5);
  assert.equal(warTerm(await scoreOf(r, 'kindle')).points, 6, 'the attacker is unchanged');
  const before = JSON.stringify(s); await r.call('world', null); await r.call('world', null);
  assert.equal(JSON.stringify(await scoreOf(r, 'korund')), before, 'a replayed tick is a no-op');
});

test('wiring: the losses flag is "true" in preview and "false" in production, needs both war flags, and every advanceWorld caller passes it', async t => {
  const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
  assert.equal(strip(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8')).vars.HARIMU_WAR_WEARINESS_LOSSES_ENABLED, 'true');
  assert.equal(strip(await readFile(new URL('../wrangler.prod.jsonc', import.meta.url), 'utf8')).vars.HARIMU_WAR_WEARINESS_LOSSES_ENABLED, 'false');
  const rt = await localRuntime(); t.after(() => rt.close()); const wear = await rt.importModule('lib/war-weariness.ts'), all = { HARIMU_WAR_ENABLED: 'true', HARIMU_WAR_WEARINESS_ENABLED: 'true', HARIMU_WAR_WEARINESS_LOSSES_ENABLED: 'true' };
  assert.equal(wear.wearinessLossesEnabled(all), true);
  for (const off of ['HARIMU_WAR_ENABLED', 'HARIMU_WAR_WEARINESS_ENABLED', 'HARIMU_WAR_WEARINESS_LOSSES_ENABLED']) assert.equal(wear.wearinessLossesEnabled({ ...all, [off]: 'false' }), false, off);
  assert.equal(wear.wearinessLossesEnabled({}), false, 'default off');
  for (const file of ['world/route.ts', 'citizen/route.ts', 'market/orders/route.ts', 'aurelle/rising/route.ts']) {
    const src = await readFile(new URL(`../app/api/${file}`, import.meta.url), 'utf8');
    assert.match(src, /warWearinessLosses: wearinessLossesEnabled\(env as unknown as WearinessBindings\)/, file);
  }
});

/** #679: state snapshot of the runner phase. The same world, advanced the same way, ends in the same world_events, market_orders, aurelle_risings and aurelle_coups
 *  whether the runners run as dev ran them (one after another, the literal order below) or as the parallel chains of lib/world-simulation.ts. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

const previewFlags = [...readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8').matchAll(/"(HARIMU_[A-Z_]+)": *"true"/g)].map(m => m[1]);
const tables = { world_events: 'kind, headline, detail, location', market_orders: '*', aurelle_risings: '*', aurelle_coups: '*' };
const volatile = /^(id|request_id|order_id)$|_at$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;

async function advanced(t, path) {
  const r = await localRuntime(); t.after(() => r.close());
  const m = async name => r.importModule(`lib/${name}.ts`);
  const [sim, spoilage, npc, rising, coup, primaries, assembly, presidium, raids, diplomacy, sanctions, embargo, founding] = await Promise.all(['world-simulation', 'spoilage', 'npc-supply', 'aurelle-rising', 'aurelle-coup', 'primaries', 'assembly', 'korund-presidium', 'korund-underground', 'diplomacy', 'goods-sanctions', 'embargo', 'founding-period'].map(m));
  await r.call('world'); r.setNow(r.now + 30 * 3600000); await r.call('world'); // ticks land with the flags off, so the runner phase below is the only difference
  const first = new Map(), prepare = r.db.prepare.bind(r.db); let count = 0; // which runner module issued its first statement when
  const runnerModules = ['spoilage', 'npc-supply', 'aurelle-rising', 'aurelle-coup', 'korund-presidium', 'korund-underground', 'diplomacy', 'goods-sanctions', 'embargo'];
  r.db.prepare = sql => { const caller = runnerModules.find(name => new Error().stack.includes(`/lib/${name}.`)); if (caller && !first.has(caller)) first.set(caller, count); count++; return prepare(sql); };
  const env = Object.fromEntries(previewFlags.map(flag => [flag, 'true'])), now = Math.floor(r.now / 1000), db = r.db;
  const options = { npcSupply: true, aurelleRising: true, aurelleCoup: true, favorDecay: true, primaries: primaries.primaryTickConfig(env), kindleAssembly: assembly.assemblyTickConfig(env), korundPresidium: true, faithFestivals: true, diplomacy: true, targetedSanctions: true, embargo: true, foundingPeriod: true };
  if (path === 'sequential') { // the dev order before #680, written out
    const current = await db.prepare('SELECT tick,scheduled_at FROM world_ticks ORDER BY tick DESC LIMIT 1').first();
    if (current) { await spoilage.runSpoilage(db, Number(current.tick), now); await npc.runNpcSupply(db, Number(current.tick), Number(current.scheduled_at), now, sim.tickSeconds); }
    await rising.runAurelleRising(db, now); await coup.runAurelleCoup(db, now, true);
    if (options.primaries) await primaries.runPrimaries(db, now, options.primaries).catch(() => {});
    if (options.kindleAssembly) await assembly.runKindleAssembly(db, now, options.kindleAssembly).catch(() => {});
    await presidium.runKorundPresidium(db, now); await raids.runKorundRaids(db, now).catch(() => {});
    await diplomacy.runDiplomacy(db, now).catch(() => {}); await sanctions.decideProposedGoodsSanctions(db, now).catch(() => {}); await embargo.runEmbargo(db, now).catch(() => {});
    await founding.runFoundingDay30(db, now).catch(() => {});
  } else await sim.runWorldChains(sim.worldRunnerChains(db, now, options));
  r.db.prepare = prepare;
  const snapshot = { order: [...first.keys()] };
  for (const [table, columns] of Object.entries(tables)) {
    const rows = (await db.prepare(`SELECT ${columns} FROM ${table}`).all().catch(() => ({ results: [] }))).results;
    snapshot[table] = rows.map(row => JSON.stringify(Object.fromEntries(Object.entries(row).filter(([k, v]) => !volatile.test(k) && !(typeof v === 'string' && uuid.test(v)))))).sort();
  }
  return snapshot;
}

test('the parallel runner chains leave the same world_events, market_orders, risings and coups as the sequential dev order', async t => {
  const sequential = await advanced(t, 'sequential'), parallel = await advanced(t, 'parallel');
  assert.ok(sequential.market_orders.length > 0 && sequential.world_events.length > 0, `the runners wrote something: ${JSON.stringify(Object.fromEntries(Object.entries(sequential).map(([k, v]) => [k, v.length])))}`);
  const before = (order, a, b) => order.indexOf(a) >= 0 && order.indexOf(a) < order.indexOf(b);
  for (const [a, b] of [['spoilage', 'npc-supply'], ['aurelle-rising', 'aurelle-coup'], ['korund-presidium', 'korund-underground'], ['diplomacy', 'goods-sanctions'], ['goods-sanctions', 'embargo']])
    for (const [name, view] of [['sequential', sequential], ['parallel', parallel]]) assert.ok(before(view.order, a, b), `${name}: ${a} runs before ${b} (${view.order.join(' > ')})`);
  delete sequential.order; delete parallel.order;
  assert.deepEqual(parallel, sequential);
});

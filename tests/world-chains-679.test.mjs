/** #679: the world runner chains. Failure handling of runWorldChains (all chains settle before the first failure is rethrown, later failures are logged) and the order
 *  snapshot: the parallel chains keep exactly the sequential tick's order (dev before #680) inside each chain. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

const r = await localRuntime(); // compiles lib/ for import; its database takes the slow chain's write below
const sim = await r.importModule('lib/world-simulation.ts');
after(() => r.close());
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const runner = (name, run, on = true) => ({ name, on, run });

test('a failing chain fails the request only after every other chain has settled; later failures are logged, not dropped', async () => {
  const done = [], warnings = [], warn = console.warn; console.warn = (...args) => warnings.push(args.join(' '));
  const first = new Error('first'), second = new TypeError('second');
  try {
    await assert.rejects(sim.runWorldChains([
      [runner('a', async () => { throw first; }), runner('after-a', async () => { done.push('after-a'); })],
      [runner('slow', async () => { await wait(40); await r.db.prepare("INSERT INTO world_events (kind, headline, detail, location, occurred_at, sort_order) VALUES ('test','slow chain','landed',NULL,'2026-10-21T00:00:00.000Z',9999)").run(); done.push('slow'); })],
      [runner('b', async () => { await wait(10); throw second; })],
      [runner('off', async () => { done.push('off'); }, false)],
    ]), error => error === first);
  } finally { console.warn = warn; }
  assert.deepEqual(done, ['slow'], 'the slow chain finished before the rejection; a failed chain stops; an off runner never runs');
  assert.ok(await r.db.prepare("SELECT 1 AS landed FROM world_events WHERE headline='slow chain'").first(), 'the in-flight chain\'s write landed before the failure surfaced');
  assert.ok(warnings.some(line => /another runner chain failed TypeError/.test(line)), warnings.join('\n'));
  await sim.runWorldChains([[runner('ok', async () => {})]]); // no failure: resolves
});

test('advanceWorld runs the chains through runWorldChains and awaits them', () => {
  const source = readFileSync(new URL('../lib/world-simulation.ts', import.meta.url), 'utf8');
  assert.match(source, /\n  await runWorldChains\(worldRunnerChains\(db, now, options\)\);/);
});

const devOrder = ['spoilage', 'npcSupply', 'aurelleRising', 'aurelleCoup', 'primaries', 'kindleAssembly', 'korundPresidium', 'korundRaids', 'diplomacy', 'targetedSanctions', 'embargo', 'foundingDay30'];
const allOn = { npcSupply: true, aurelleRising: true, aurelleCoup: true, primaries: {}, kindleAssembly: {}, korundPresidium: true, faithFestivals: true, diplomacy: true, targetedSanctions: true, embargo: true, foundingPeriod: true };
const fakeDb = { prepare: () => ({ first: async () => null }) };

test('order snapshot: the chains, flattened, are the sequential tick order, and each chain keeps that order when run in parallel', async () => {
  const chains = sim.worldRunnerChains(fakeDb, 0, allOn);
  assert.deepEqual(chains.flat().map(x => x.name), devOrder, 'same runners, same order as the sequential tick');
  assert.ok(chains.flat().every(x => x.on), 'every runner is on with every flag on');
  const record = async (parallel) => {
    const seen = [], recorded = chains.map((chain, c) => chain.map(x => runner(x.name, async () => { await wait((chain.length - c) % 3); seen.push(`${c}:${x.name}`); })));
    if (parallel) await sim.runWorldChains(recorded); else for (const x of recorded.flat()) await x.run();
    return chains.map((_, c) => seen.filter(s => s.startsWith(`${c}:`)));
  };
  assert.deepEqual(await record(true), await record(false), 'per-chain order is the same in the parallel and the sequential path');
});

test('flags still gate each runner', () => {
  const none = sim.worldRunnerChains(fakeDb, 0, {}).flat();
  assert.ok(none.every(x => !x.on));
  assert.deepEqual(sim.worldRunnerChains(fakeDb, 0, { faithFestivals: true }).flat().filter(x => x.on).map(x => x.name), ['korundRaids']);
});

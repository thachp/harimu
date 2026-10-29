/** #423: war weariness PoC (docs 15.3). Pure rules, the Unrest term in the daily score, the world tick, and the read-only public level. Flags default off. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { localRuntime } from './helpers/local-runtime.mjs';
import { computeStability } from '../lib/stability.ts';
import { WEARINESS_WEEK_SECONDS as WEEK, warWeeksAtWar, warWearinessUnrest, wearinessConfig, wearinessLevel } from '../lib/war-rules.ts';

const sum = terms => terms.reduce((t, x) => t + x.points, 0);
const base = { citizens: 10, fed: 5, worked: 5, promisesKept: 0, promisesBroken: 0, petitionBacklog: 0 };

test('pure rules: zero while mobilizing and after the war ends; Kindle > Aurelle > Korund; steps weekly; losses raise it; caps hold', () => {
  const war = { mobilizationEndsAt: 1000, endedAt: null };
  assert.equal(warWeeksAtWar(war, 999), 0, 'mobilization does not count');
  assert.equal(warWeeksAtWar(war, 1000 + WEEK - 1), 0, 'only full weeks count');
  assert.equal(warWeeksAtWar(war, 1000 + WEEK), 1);
  assert.equal(warWeeksAtWar(war, 1000 + 3 * WEEK + 5), 3);
  assert.equal(warWeeksAtWar({ ...war, endedAt: 1000 + 2 * WEEK }, 1000 + 2 * WEEK), 0, 'zero once the war has ended');
  assert.equal(warWeeksAtWar({ ...war, endedAt: 1000 + 2 * WEEK }, 1000 + 2 * WEEK - 1), 1, 'still running just before it ends');
  assert.equal(warWearinessUnrest('kindle', 0), 0); assert.equal(warWearinessUnrest('kindle', 0, { lostSquares: 9, casualties: 900 }), 0, 'counts do nothing without an active week');
  const [k, a, c] = [warWearinessUnrest('kindle', 4), warWearinessUnrest('aurelle', 4), warWearinessUnrest('korund', 4)];
  assert.deepEqual([k, a, c], [12, 8, 4]); assert.ok(k > a && a > c);
  assert.deepEqual([1, 2, 3].map(w => warWearinessUnrest('kindle', w)), [3, 6, 9]);
  assert.equal(warWearinessUnrest('korund', 2, { lostSquares: 3 }), 2 + 3); assert.equal(warWearinessUnrest('korund', 2, { casualties: 25 }), 2 + 2);
  assert.equal(warWearinessUnrest('korund', 2, { casualties: 9 }), 2, 'under 10 casualties adds nothing');
  assert.equal(warWearinessUnrest('korund', 1, { lostSquares: 500 }), 1 + wearinessConfig.lostSquareCap);
  assert.equal(warWearinessUnrest('korund', 1, { casualties: 99999 }), 1 + wearinessConfig.casualtyCap);
  assert.equal(warWearinessUnrest('kindle', 500, { lostSquares: 500, casualties: 99999 }), wearinessConfig.totalCap);
  assert.equal(warWearinessUnrest('hoarvale', 5), 0, 'unknown nation fails closed'); assert.equal(warWearinessUnrest('kindle', Number.NaN), 0);
  assert.deepEqual([0, 1, 7, 8, 19, 20, 99].map(wearinessLevel), [null, 'rising', 'rising', 'high', 'high', 'severe', 'severe']);
});

test('stability scoring: the war term appears only when set, the breakdown still sums to the score, and it never pushes Unrest past 100', () => {
  const plain = computeStability(base);
  assert.deepEqual(computeStability({ ...base, warWeariness: 0 }), plain, 'zero adds nothing');
  assert.equal(plain.breakdown.unrest.some(t => t.input === 'war'), false);
  const hot = computeStability({ ...base, warWeariness: 12 });
  assert.equal(hot.unrest, plain.unrest + 12); assert.equal(hot.stability, plain.stability, 'weariness only raises Unrest');
  assert.deepEqual(hot.breakdown.unrest.at(-1), { input: 'war', points: 12, detail: 'Weeks at war add Unrest' });
  assert.equal(sum(hot.breakdown.unrest), hot.unrest);
  const worst = { citizens: 10, fed: 0, worked: 0, promisesKept: 0, promisesBroken: 10, petitionBacklog: 1000 };
  const full = computeStability(worst); assert.equal(full.unrest, 100, 'the other terms alone can reach 100');
  const capped = computeStability({ ...worst, warWeariness: 40 });
  assert.equal(capped.unrest, 100); assert.equal(sum(capped.breakdown.unrest), 100); assert.equal(capped.breakdown.unrest.some(t => t.input === 'war'), false, 'no headroom, no term');
  const near = computeStability({ ...worst, petitionBacklog: 0, warWeariness: 40 });
  assert.ok(near.unrest <= 100); assert.equal(sum(near.breakdown.unrest), near.unrest);
});

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
const scores = async r => Object.fromEntries((await r.db.prepare('SELECT nation_id,unrest,inputs_json,breakdown_json FROM nation_stability_scores WHERE tick=1').all()).results.map(x => [x.nation_id, { unrest: x.unrest, inputs: JSON.parse(x.inputs_json), unrestTerms: JSON.parse(x.breakdown_json).unrest }]));
const warTerm = s => s.unrestTerms.find(x => x.input === 'war');

for (const backend of [undefined, 'postgres']) test(`world tick (${backend ?? 'sqlite'}): both flags on add weariness to the nations at war once per game week; replays change nothing${backend ? ' (PGlite)' : ''}`, async t => {
  const { r } = await setup(t, { backend });
  const sim = (await r.call('world', null)).data;
  const s = await scores(r);
  assert.equal(warTerm(s.kindle).points, 6, 'Kindle: 2 weeks x 2 x 1.5'); assert.equal(s.kindle.inputs.warWeariness, 6);
  assert.equal(warTerm(s.korund).points, 2, 'Korund: 2 weeks x 2 x 0.5');
  assert.equal(warTerm(s.aurelle), undefined, 'a nation not at war adds nothing'); assert.equal(s.aurelle.inputs.warWeariness, undefined);
  assert.deepEqual(sim.simulation?.weariness ?? sim.weariness, { kindle: 'rising', korund: 'rising' });
  const before = JSON.stringify(s);
  await r.call('world', null); await r.call('world', null);
  assert.equal(JSON.stringify(await scores(r)), before, 'a replayed tick is a no-op (INSERT OR IGNORE, derived from the wars table)');
  assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM nation_stability_scores WHERE tick=1').first()).n, 3);
});

test('flags: weariness flag off, war flag off, or an ended war give no term, no input, no public level', async t => {
  for (const opts of [{ weariness: false }, { war: false }, { endedWeeksAgo: 1 }]) {
    const { r } = await setup(t, opts);
    const res = (await r.call('world', null)).data;
    const s = await scores(r);
    for (const nation of ['kindle', 'korund', 'aurelle']) { assert.equal(warTerm(s[nation]), undefined, JSON.stringify(opts)); assert.equal('warWeariness' in s[nation].inputs, false); }
    assert.deepEqual((res.simulation ?? res).weariness ?? {}, {}, JSON.stringify(opts)); // absent when a flag is off, empty once the war has ended
  }
});

test('GET read path writes nothing: the public level is derived on read, Korund gets a level but never an amount', async t => {
  const { r, scheduledAt } = await setup(t);
  await r.call('world', null);
  const sim = await r.importModule('lib/world-simulation.ts'), wear = await r.importModule('lib/war-weariness.ts');
  const writes = [], prepare = r.db.prepare.bind(r.db), batch = r.db.batch.bind(r.db);
  r.db.prepare = sql => { if (/^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i.test(sql)) writes.push(sql.slice(0, 40)); return prepare(sql); };
  r.db.batch = s => { writes.push('batch'); return batch(s); };
  try {
    const on = await sim.readWorldSimulation(r.db, scheduledAt + 60, { war: true, warWeariness: true });
    const off = await sim.readWorldSimulation(r.db, scheduledAt + 60, { war: true });
    assert.deepEqual(on.weariness, { kindle: 'rising', korund: 'rising' }); assert.equal(off.weariness, undefined);
    assert.deepEqual(await wear.readPublicWeariness(r.db, scheduledAt + 60), { kindle: 'rising', korund: 'rising' });
    assert.equal(JSON.stringify(on.weariness).match(/\d/), null, 'no amounts in the public state');
    // three weeks later the level climbs for Kindle first (3/week): 12 points is high, Korund's 4 is still rising
    assert.deepEqual(await wear.readPublicWeariness(r.db, scheduledAt + 60 + 2 * WEEK), { kindle: 'high', korund: 'rising' });
    assert.deepEqual(await wear.readWarWeariness(r.db, scheduledAt + 60 - 3 * WEEK), { kindle: 0, korund: 0, aurelle: 0 }, 'before the war went active');
  } finally { r.db.prepare = prepare; r.db.batch = batch; }
  assert.deepEqual(writes, []);
  assert.deepEqual(await wear.readWarWeariness(r.db, scheduledAt), { kindle: 6, korund: 2, aurelle: 0 });
});

test('wiring: preview flag true, every advanceWorld caller passes it, the banner shows the level copy, war routes untouched', async () => {
  const cfg = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.deepEqual([...cfg.matchAll(/"HARIMU_WAR_WEARINESS_ENABLED"\s*:\s*"([^"]*)"/g)].map(m => m[1]), ['true']);
  for (const file of ['world/route.ts', 'citizen/route.ts', 'market/orders/route.ts', 'aurelle/rising/route.ts']) {
    const src = await readFile(new URL(`../app/api/${file}`, import.meta.url), 'utf8');
    assert.match(src, /warWeariness: wearinessEnabled\(env as unknown as WearinessBindings\)/, file);
  }
  const banner = await readFile(new URL('../app/war-banner.tsx', import.meta.url), 'utf8');
  assert.match(banner, /wearinessBanners\[nationId as WarNation\]\[weariness\]/);
  for (const file of ['app/api/war/route.ts', 'lib/war-authority.ts', 'lib/war-actions.ts']) assert.doesNotMatch(await readFile(new URL(`../${file}`, import.meta.url), 'utf8'), /weariness/i, `${file} is not touched`);
});

test('war banner: one weariness line in the viewer nation\'s own voice, only when a level is sent and the nation has a war to show', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const { renderToStaticMarkup } = await import('react-dom/server');
  const require = createRequire(import.meta.url);
  const copy = await r.importModule('lib/war-weariness-copy.ts');
  const stubs = { '@/lib/war-copy': await r.importModule('lib/war-copy.ts'), '@/lib/war-rules': await r.importModule('lib/war-rules.ts'), '@/lib/war-weariness-copy': copy, '@/lib/war-ending-copy': { endingBodyFor: () => ({ text: '' }), endingResults: {} }, './game-timer': { GameTimer: () => null }, './display-preferences': { useDisplayTimestamp: () => v => String(v) }, '@/lib/war': {} };
  const exports = {}; const src = await readFile(new URL('../app/war-banner.tsx', import.meta.url), 'utf8');
  new Function('exports', 'require', ts.transpileModule(src, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText)(exports, name => name in stubs ? stubs[name] : require(name));
  const war = { id: 'w1', attacker: 'kindle', defender: 'korund', casusBelli: '', declaredBy: 'x', declaredAt: 1000, mobilizationEndsAt: 2000, status: 'active', endedAt: null, endKind: null, peaceLockEndsAt: null };
  const html = (nationId, weariness, wars = [war]) => renderToStaticMarkup(exports.WarBanner({ wars, nationId, weariness }));
  assert.match(html('kindle', 'rising'), /War weariness is rising/); assert.match(html('korund', 'rising'), /Resolve is being tested/); assert.doesNotMatch(html('korund', 'severe'), /weari|tired/i);
  assert.equal(html('kindle', undefined).includes('War weariness'), false, 'no level, no line');
  assert.equal(html('aurelle', 'high'), '', 'a nation with no war on its own view shows nothing');
  assert.equal(html('kindle', 'high', [{ ...war, status: 'ended', endedAt: 5000, endKind: 'other' }]), '', 'an ended war shows nothing');
});

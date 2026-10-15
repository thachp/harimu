/** #362: Aurelle Crown debasement PoC behind HARIMU_CROWN_DEBASEMENT_ENABLED. Mint parity, Currency Confidence, one decree per game year, gazette line, flag off is a no-op. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { localRuntime } from './helpers/local-runtime.mjs';
import { confidenceAfter, crownConfig, debasedBp, debasedParity, debasementBpOk, gameYear, monarchPlan, officialTesseraMilli, rumoredPremiumBp } from '../lib/crown-debasement-rules.ts';

const YEAR = crownConfig.gameYearSeconds;

test('pure rules: the docs cap of 15%, parity, fixed Confidence drop, official rate and the noisy premium rumor', () => {
  assert.equal(crownConfig.debasementCapBp, 1500);
  assert.equal(debasementBpOk(1), true); assert.equal(debasementBpOk(1500), true);
  for (const bad of [0, -1, 1501, 15.5, '100', null, NaN]) assert.equal(debasementBpOk(bad), false, String(bad));
  assert.equal(debasedParity(1000, 1000), 1100); assert.equal(debasedParity(1100, 1500), 1265);
  assert.equal(confidenceAfter(100), 90); assert.equal(confidenceAfter(5), 0, 'Confidence never goes below 0');
  assert.equal(officialTesseraMilli(1000), 500); assert.equal(officialTesseraMilli(1100), 454); assert.ok(officialTesseraMilli(1265) < officialTesseraMilli(1100));
  assert.equal(gameYear(0, 0), 1); assert.equal(gameYear(YEAR - 1, 0), 1); assert.equal(gameYear(YEAR, 0), 2); assert.equal(gameYear(5, 100), 1);
  assert.equal(debasedBp(1000), 0); assert.equal(debasedBp(1100), 1000);
  assert.equal(rumoredPremiumBp(1000, 12345), null, 'no rumor before a debasement');
  const seen = new Set();
  for (let bucket = 0; bucket < 60; bucket++) {
    const rumor = rumoredPremiumBp(1100, bucket * crownConfig.rumorWindowSeconds);
    assert.ok(rumor >= 500 && rumor <= 1500, `${rumor} is 50-150% of the 1000 bp debasement`); seen.add(rumor);
  }
  assert.ok(seen.size > 5, 'the rumor is noisy');
  assert.equal(rumoredPremiumBp(1100, 777), rumoredPremiumBp(1100, 777), 'but deterministic for one moment');
  for (let year = 1; year <= 200; year++) { const plan = monarchPlan(year); assert.ok(debasementBpOk(plan.percentBp), `year ${year}`); assert.ok(plan.offsetSeconds >= 0 && plan.offsetSeconds < YEAR); }
  assert.ok([...Array(200).keys()].some(i => monarchPlan(i + 1).debases) && [...Array(200).keys()].some(i => !monarchPlan(i + 1).debases));
});

test('the flag defaults to "false", migration 0041 only adds a table, and no route or page can decree a debasement', async () => {
  const cfg = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.deepEqual([...cfg.matchAll(/"HARIMU_CROWN_DEBASEMENT_ENABLED"\s*:\s*"([^"]*)"/g)].map(m => m[1]), ['false']);
  for (const file of ['../drizzle/0041_crown_decrees.sql', '../db/postgres/0041_crown_decrees.sql']) {
    const sql = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(sql, /\b(DROP|ALTER|RENAME|DELETE|UPDATE)\b/i, file); assert.match(sql, /CREATE TABLE IF NOT EXISTS crown_decrees/);
  }
  const walk = async dir => (await Promise.all((await readdir(dir, { withFileTypes: true })).map(e => e.isDirectory() ? walk(new URL(`${e.name}/`, dir)) : [new URL(e.name, dir)]))).flat();
  for (const file of await walk(new URL('../app/', import.meta.url))) if (/\.(ts|tsx)$/.test(file.pathname)) assert.doesNotMatch(await readFile(file, 'utf8'), /decreeDebasement|runCrownCron/, file.pathname);
  const entry = await readFile(new URL('../worker/entry.ts', import.meta.url), 'utf8');
  assert.match(entry, /async scheduled\(/); assert.match(entry, /runCrownCron\(/);
});

async function setup(t, { flag = true } = {}) {
  const r = await localRuntime(); t.after(() => r.close());
  if (flag) r.setFixtureEnv('HARIMU_CROWN_DEBASEMENT_ENABLED', 'true');
  await r.db.prepare("UPDATE citizens SET nation_id='aurelle'").run();
  await r.call('world', null);
  const c = await r.importModule('lib/crown-debasement.ts');
  const epoch = Number((await r.db.prepare("SELECT epoch_seconds FROM world_clock WHERE id='main'").first()).epoch_seconds);
  const rows = async () => (await r.db.prepare('SELECT * FROM crown_decrees ORDER BY game_year').all()).results.map(x => ({ ...x }));
  const gazette = async () => (await r.db.prepare("SELECT headline,detail,location FROM world_events WHERE kind='court-gazette' AND headline='A decree on the coinage'").all()).results;
  const decree = (percentBp, now, over = {}) => c.decreeDebasement(r.db, { requestId: randomUUID(), percentBp, ...over }, now, { enabled: flag });
  return { r, c, epoch, rows, gazette, decree };
}

test('flag off: nothing is decreed, read or shown, and the Aurelle plan is unchanged', async t => {
  const { r, c, epoch, rows, gazette, decree } = await setup(t, { flag: false });
  const res = await decree(1000, epoch + 1); assert.equal(res.ok, false); assert.equal(res.reason, 'disabled');
  assert.deepEqual(await c.runCrownCron(r.db, epoch + YEAR * 3 + 25 * 86400, { enabled: false }), { status: 'disabled' });
  assert.deepEqual(await rows(), []); assert.deepEqual(await gazette(), []);
  const plan = (await r.call('citizen', 'alice')).data.aurellePlan;
  assert.equal(plan.available, true); assert.equal('mint' in plan, false, 'no mint strip while the flag is off');
  assert.deepEqual(Object.keys(plan).sort(), ['available', 'charter', 'favor', 'foodQuantity', 'job', 'mealReadyAt', 'mode', 'publicFoodRemaining', 'publicFundMinor', 'shifts', 'walletMinor']);
  // An old row cannot show up either.
  await r.db.prepare("INSERT INTO crown_decrees VALUES ('d','req-xxxxxxxx',1,1000,1000,1100,100,90,'Monarch',1)").run();
  assert.equal('mint' in (await r.call('citizen', 'alice')).data.aurellePlan, false);
});

test('a seeded debasement moves mint parity, lowers Confidence, posts one gazette line and moves the official rate', async t => {
  const { r, c, epoch, rows, gazette, decree } = await setup(t);
  const before = await c.readCrownMint(r.db, epoch + 10);
  assert.deepEqual([before.mintParity, before.currencyConfidence, before.officialRate.tesseraMilliPerCrown, before.rumoredFullWeightPremiumBp, before.lastDecree], [1000, 100, 500, null, null]);
  const plan0 = (await r.call('citizen', 'alice')).data.aurellePlan;
  assert.equal(plan0.mint.mintParity, 1000); assert.equal(plan0.mint.currencyConfidence, 100);
  const at = epoch + 5 * 86400, requestId = randomUUID();
  const res = await decree(1000, at, { requestId }); assert.equal(res.ok, true);
  assert.deepEqual([res.decree.parityBefore, res.decree.parityAfter, res.decree.confidenceBefore, res.decree.confidenceAfter, res.decree.gameYear], [1000, 1100, 100, 90, 1]);
  const after = await c.readCrownMint(r.db, at + 60);
  assert.deepEqual([after.mintParity, after.currencyConfidence, after.officialRate.tesseraMilliPerCrown], [1100, 90, 454]);
  assert.ok(after.rumoredFullWeightPremiumBp >= 500 && after.rumoredFullWeightPremiumBp <= 1500);
  const lines = await gazette(); assert.equal(lines.length, 1); assert.equal(lines[0].location, 'Aurelle'); assert.match(lines[0].detail, /coinage is reissued at a new weight/);
  // The citizen strip shows the same numbers through the route; other nations get none.
  const plan = (await r.call('citizen', 'alice')).data.aurellePlan;
  assert.deepEqual([plan.mint.mintParity, plan.mint.currencyConfidence, plan.mint.officialRate.tesseraMilliPerCrown, plan.mint.lastDecree.percentBp], [1100, 90, 454, 1000]);
  // Idempotent receipt: the same request id replays and adds nothing.
  const replay = await decree(1000, at + 10, { requestId }); assert.equal(replay.ok, true); assert.equal(replay.replay, true);
  assert.equal((await rows()).length, 1); assert.equal((await gazette()).length, 1);
  assert.equal((await decree(900, at + 20, { requestId })).reason, 'request_reused');
});

test('a second debasement in the same game year is rejected; the next game year compounds parity and Confidence', async t => {
  const { r, c, epoch, rows, gazette, decree } = await setup(t);
  assert.equal((await decree(500, epoch + 100)).ok, true);
  const again = await decree(300, epoch + YEAR - 1); assert.equal(again.ok, false); assert.equal(again.status, 409); assert.equal(again.reason, 'already_debased_this_year');
  assert.equal((await rows()).length, 1); assert.equal((await gazette()).length, 1); assert.equal((await c.readCrownMint(r.db, epoch + YEAR - 1)).mintParity, 1050);
  const next = await decree(1500, epoch + YEAR + 5); assert.equal(next.ok, true); assert.equal(next.decree.gameYear, 2);
  const mint = await c.readCrownMint(r.db, epoch + YEAR + 6);
  assert.deepEqual([mint.mintParity, mint.currencyConfidence], [Math.round(1050 * 1.15), 80]);
  assert.equal((await rows()).length, 2);
});

test('the decree is capped at 15% per game year and needs a request id', async t => {
  const { r, c, epoch, rows, decree } = await setup(t);
  for (const bad of [0, 1501, 2000, -5, 10.5]) { const res = await decree(bad, epoch + 1); assert.equal(res.ok, false); assert.equal(res.status, 400, String(bad)); }
  assert.equal((await decree(1000, epoch + 1, { requestId: 'short' })).reason, 'bad_request');
  assert.equal((await decree(1000, epoch + 1, { decreedBy: '' })).reason, 'bad_request');
  assert.deepEqual(await rows(), []); assert.equal((await decree(1500, epoch + 1)).ok, true);
  assert.equal((await c.readCrownMint(r.db, epoch + 2)).mintParity, 1150);
});

test('the scheduled AI Monarch decrees at most once in a seeded game year, only on or after its seeded day, never when its year says no', async t => {
  const { r, c, epoch, rows, gazette } = await setup(t);
  const year4 = epoch + 3 * YEAR, plan = monarchPlan(4), day = year4 + plan.offsetSeconds;
  assert.equal(plan.debases, true);
  assert.deepEqual(await c.runCrownCron(r.db, year4 + 1, { enabled: true }), { status: 'idle' }, 'before its day');
  assert.deepEqual(await c.runCrownCron(r.db, epoch + 5 * 86400, { enabled: true }), { status: 'idle' }, 'a year that does not debase');
  assert.deepEqual(await rows(), []);
  const first = await c.runCrownCron(r.db, day, { enabled: true }); assert.equal(first.status, 'decreed'); assert.equal(first.decree.gameYear, 4); assert.equal(first.decree.percentBp, plan.percentBp);
  assert.equal(first.decree.parityAfter, debasedParity(1000, plan.percentBp));
  for (const later of [day, day + 3600, year4 + YEAR - 1]) assert.deepEqual(await c.runCrownCron(r.db, later, { enabled: true }), { status: 'idle' });
  assert.equal((await rows()).length, 1); assert.equal((await gazette()).length, 1);
});

test('GET routes stay read-only: reading the citizen, world and news routes writes no decree and no gazette line', async t => {
  const { r, epoch, rows, gazette, decree } = await setup(t);
  r.setNow((epoch + 3 * YEAR + 25 * 86400) * 1000); // inside a game year whose Monarch would debase
  const count = async () => Number((await r.db.prepare('SELECT COUNT(*) AS n FROM world_events').first()).n);
  const events = await count();
  for (let i = 0; i < 3; i++) { await r.call('citizen', 'alice'); await r.call('world', null); await r.call('news', 'alice'); }
  assert.deepEqual(await rows(), []); assert.deepEqual(await gazette(), []);
  assert.equal(await count(), events, 'no world event is written by a read');
  assert.equal((await decree(1000, epoch + 3 * YEAR + 25 * 86400)).ok, true);
});

test('the Aurelle panel shows the Royal Mint strip only when the plan carries it, and labels the premium a rumor', async () => {
  const { default: ts } = await import('typescript');
  const { dirname, resolve } = await import('node:path');
  const root = new URL('../', import.meta.url).pathname;
  async function componentModule(path) {
    let source = (await readFile(path, 'utf8')).replace(/import\s+['"][^'"]+\.css['"];?/g, '');
    let output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
    for (const match of [...output.matchAll(/from (['"])([^'"]+)\1/g)]) {
      const specifier = match[2]; let url;
      if (specifier.endsWith('.css')) url = 'data:text/javascript,export default {}';
      else if (specifier.startsWith('@/') || specifier.startsWith('.')) {
        const base = specifier.startsWith('@/') ? resolve(root, specifier.slice(2)) : resolve(dirname(path), specifier); let child;
        for (const extension of ['.ts', '.tsx']) { try { await readFile(base + extension); child = base + extension; break; } catch { /* try next */ } }
        assert.ok(child, specifier); url = await componentModule(child);
      } else url = import.meta.resolve(specifier);
      output = output.replace(match[0], `from ${JSON.stringify(url)}`);
    }
    return `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
  }
  const { AurellePlanPanel } = await import(await componentModule(resolve(root, 'app/aurelle-plan-panel.tsx')));
  const noop = () => {};
  const plan = { available: true, charter: { id: 'estate', name: 'Highspire charter', active: true }, walletMinor: 800, foodQuantity: 2, favor: 2, publicFoodRemaining: 40, publicFundMinor: 100000, mealReadyAt: null, shifts: [] };
  const mint = { mintParity: 1100, baselineParity: 1000, currencyConfidence: 90, officialRate: { from: 'CRN', to: 'TSR', tesseraMilliPerCrown: 454, source: 's' }, rumoredFullWeightPremiumBp: 800, lastDecree: null };
  const render = (scene, p) => renderToStaticMarkup(React.createElement(AurellePlanPanel, { plan: p, scene, capacity: 14, pending: false, uncertain: false, localDemo: false, error: null, onCommand: noop, onRetry: noop, onRefresh: noop, onNavigate: noop }));
  for (const scene of ['market', 'household']) {
    const html = render(scene, { ...plan, mint });
    assert.match(html, /Royal Mint/); assert.match(html, /1100 CRN per gold bar/); assert.match(html, /90 \/ 100/); assert.match(html, /1 CRN = 0\.454 TSR/); assert.match(html, /Rumor: full-weight old Crowns .* about 8\.0% more\. This is a rumor, not the official rate/);
    assert.doesNotMatch(render(scene, plan), /Royal Mint/, 'flag off: no strip');
  }
  assert.doesNotMatch(render('workplace', { ...plan, mint }), /Royal Mint/);
  assert.doesNotMatch(render('market', { ...plan, mint: { ...mint, rumoredFullWeightPremiumBp: null } }), /Rumor/);
});

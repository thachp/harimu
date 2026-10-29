/** #999: Aurelle charter account shows the Crown balance in TSR at the official Royal Mint rate (docs §12.8 Display).
 *  Flag HARIMU_AURELLE_TSR_VIEW_ENABLED. Display only: no exchange, no migration. Flag off adds nothing. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { localRuntime } from './helpers/local-runtime.mjs';
import { componentModule } from './helpers/component-module.mjs';
import { officialTesseraMilli, quoteCrownTessera } from '../lib/crown-debasement-rules.ts';

const root = new URL('../', import.meta.url).pathname;
const line = minor => `≈ ${(minor / 100).toFixed(2)} TSR at the official rate`;

test('quoteCrownTessera uses the official milli rate and rounds down in integer minor units', () => {
  assert.equal(officialTesseraMilli(1000), 500);
  assert.equal(officialTesseraMilli(1100), 454);
  assert.equal(quoteCrownTessera(800, officialTesseraMilli(1000)), 400, '8.00 CRN at baseline is 4.00 TSR');
  assert.equal(quoteCrownTessera(800, officialTesseraMilli(1100)), 363, '8.00 CRN after 1100 parity is 3.63 TSR, not 3.64');
  assert.equal(quoteCrownTessera(1, 500), 0, '0.01 CRN at 0.500 TSR rounds down to 0');
  assert.equal(quoteCrownTessera(1999, 500), 999, '9.995 TSR rounds down to 9.99');
  assert.equal(quoteCrownTessera(0, 500), 0);
  assert.equal(quoteCrownTessera(-800, 500), 0);
  assert.equal(quoteCrownTessera(800, 0), 0);
  assert.equal(quoteCrownTessera(1.5, 500), 0);
});

test('the flag is "true" in preview and "false" in production, inside HARIMU_AURELLE_PACK, with a full-line pack comment', async () => {
  for (const [file, value] of [['wrangler.jsonc', 'true'], ['wrangler.prod.jsonc', 'false']]) {
    const cfg = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.deepEqual([...cfg.matchAll(/"HARIMU_AURELLE_TSR_VIEW_ENABLED"\s*:\s*"([^"]*)"/g)].map(m => m[1]), [value], file);
    assert.equal([...cfg.matchAll(/"HARIMU_AURELLE_TSR_VIEW_ENABLED"\s*:/g)].length, 1, `${file}: not a standalone var as well as the pack`);
    assert.match(cfg, /^\s*\/\/ #988 \/ #999:.*\n\s*"HARIMU_AURELLE_PACK": \{$/m, `${file}: the pack comment is a full line above HARIMU_AURELLE_PACK`);
  }
});

test('the Aurelle panel shows the official-rate line only when the plan carries crownRateMilli', async () => {
  const { AurellePlanPanel } = await import(await componentModule(resolve(root, 'app/aurelle-plan-panel.tsx')));
  const noop = () => {};
  const plan = { available: true, charter: { id: 'estate', name: 'Highspire charter', active: true }, walletMinor: 800, foodQuantity: 2, favor: 2, publicFoodRemaining: 40, publicFundMinor: 100000, mealReadyAt: null, shifts: [] };
  const render = (scene, p) => renderToStaticMarkup(React.createElement(AurellePlanPanel, { plan: p, scene, capacity: 14, pending: false, uncertain: false, localDemo: false, error: null, onCommand: noop, onRetry: noop, onRefresh: noop, onNavigate: noop }));
  for (const scene of ['market', 'household', 'workplace']) {
    assert.match(render(scene, { ...plan, crownRateMilli: officialTesseraMilli(1100) }), new RegExp(line(363).replace(/[.]/g, '\\.')), `${scene}: flag on, debased rate`);
    assert.match(render(scene, { ...plan, crownRateMilli: officialTesseraMilli(1000) }), /≈ 4\.00 TSR at the official rate/);
    const off = render(scene, plan);
    assert.doesNotMatch(off, /TSR at the official rate/, `${scene}: flag off`);
    assert.doesNotMatch(off, /≈/, `${scene}: flag off adds no quote`);
  }
  assert.match(render('market', { ...plan, walletMinor: 1999, crownRateMilli: 500 }), /≈ 9\.99 TSR at the official rate/);
  assert.doesNotMatch(render('market', { ...plan, walletMinor: 1999, crownRateMilli: 500 }), /10\.00 TSR/);
});

const aurellePack = (overrides = {}) => JSON.stringify({
  HARIMU_AURELLE_RISING_ENABLED: 'false', HARIMU_AURELLE_COUP_ENABLED: 'false', HARIMU_AURELLE_CHARTERS_ENABLED: 'false',
  HARIMU_AURELLE_SUCCESSION_ENABLED: 'false', HARIMU_CROWN_DEBASEMENT_ENABLED: 'false', HARIMU_AURELLE_TSR_VIEW_ENABLED: 'false', ...overrides,
});
async function setup(t, { tsr = false, mint = false } = {}) {
  const r = await localRuntime(); t.after(() => r.close());
  if (tsr || mint) r.setFixtureEnv('HARIMU_AURELLE_PACK', aurellePack({ ...(tsr ? { HARIMU_AURELLE_TSR_VIEW_ENABLED: 'true' } : {}), ...(mint ? { HARIMU_CROWN_DEBASEMENT_ENABLED: 'true' } : {}) }));
  await r.db.prepare("UPDATE citizens SET nation_id='aurelle' WHERE clerk_user_id='alice'").run();
  await r.call('world', null);
  return r;
}
async function earn(r, user = 'alice') {
  const shiftId = randomUUID();
  assert.equal((await r.call('citizen', user, { action: 'aurelle-start-work', requestId: shiftId })).status, 200);
  const shift = (await r.call('citizen', user)).data.aurellePlan.shifts.find(s => s.id === shiftId);
  r.setNow(Date.parse(shift.completesAt));
  assert.equal((await r.call('citizen', user, { action: 'aurelle-claim-work', requestId: randomUUID(), shiftId })).status, 200);
}
const planOf = async (r, user = 'alice') => (await r.call('citizen', user)).data.aurellePlan;
async function sqlDuring(r, fn) {
  const seen = [], prepare = r.db.prepare.bind(r.db);
  r.db.prepare = sql => { seen.push(sql.replace(/\s+/g, ' ').trim()); return prepare(sql); };
  try { await fn(); } finally { r.db.prepare = prepare; }
  return seen;
}
const isMintRead = sql => /FROM crown_decrees/i.test(sql);
const isWrite = sql => /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|REPLACE)/i.test(sql);

test('flag off: no crownRateMilli and no mint read for the quote; flag on matches the Royal Mint rate, including after a debasement', async t => {
  const off = await setup(t);
  await off.db.prepare("INSERT INTO crown_decrees VALUES ('d','req-xxxxxxxx',1,1000,1000,1100,100,90,'Monarch',1)").run();
  assert.equal((await sqlDuring(off, () => planOf(off))).filter(isMintRead).length, 0, 'flag off does not read the mint');
  const hidden = await planOf(off);
  assert.equal(hidden.walletMinor, 0);
  assert.equal('crownRateMilli' in hidden, false, 'flag off');
  assert.equal('mint' in hidden, false);

  const on = await setup(t, { tsr: true, mint: true });
  const before = await planOf(on);
  assert.equal(before.crownRateMilli, before.mint.officialRate.tesseraMilliPerCrown);
  assert.equal(before.crownRateMilli, officialTesseraMilli(1000));
  assert.equal(quoteCrownTessera(before.walletMinor, before.crownRateMilli), 0);
  await earn(on);
  const earned = await planOf(on);
  assert.equal(earned.walletMinor, 800);
  assert.equal(quoteCrownTessera(earned.walletMinor, earned.crownRateMilli), 400);
  const c = await on.importModule('lib/crown-debasement.ts');
  const epoch = Number((await on.db.prepare("SELECT epoch_seconds FROM world_clock WHERE id='main'").first()).epoch_seconds);
  const decreed = await c.decreeDebasement(on.db, { requestId: randomUUID(), percentBp: 1000 }, epoch + 5 * 86400, { enabled: true });
  assert.equal(decreed.ok, true);
  const after = await planOf(on);
  assert.equal(after.mint.officialRate.tesseraMilliPerCrown, officialTesseraMilli(1100));
  assert.equal(after.crownRateMilli, after.mint.officialRate.tesseraMilliPerCrown, 'same official rate as the Royal Mint strip');
  assert.equal(quoteCrownTessera(after.walletMinor, after.crownRateMilli), 363);
  const sql = await sqlDuring(on, async () => { for (let i = 0; i < 3; i++) await planOf(on); });
  assert.ok(sql.some(isMintRead));
  assert.deepEqual(sql.filter(isWrite), [], 'GET writes nothing');
  const kindle = await setup(t, { tsr: true });
  await kindle.db.prepare("UPDATE citizens SET nation_id='kindle' WHERE clerk_user_id='alice'").run();
  const other = await planOf(kindle);
  assert.equal(other.available, false);
  assert.equal('crownRateMilli' in other, false, 'not an Aurelle citizen');
  assert.equal((await sqlDuring(kindle, () => planOf(kindle))).filter(isMintRead).length, 0);
});

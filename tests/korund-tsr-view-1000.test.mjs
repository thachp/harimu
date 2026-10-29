/** #1000: Korund plan wallet shows the Labor Note balance in TSR at the Bureau rate, marked not convertible (docs §12.8 Display).
 *  Flag HARIMU_KORUND_TSR_VIEW_ENABLED, inside HARIMU_GRAY_PACK. Display only. Flag off adds nothing. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { localRuntime } from './helpers/local-runtime.mjs';
import { componentModule } from './helpers/component-module.mjs';
import { flagOn } from '../lib/flag-pack.mjs';

const root = new URL('../', import.meta.url).pathname;
const { bureauTsrLine, laborNoteBureauHundredths, quoteLaborNoteTessera } = await import(await componentModule(resolve(root, 'lib/gray-market-text.ts')));
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));

test('quoteLaborNoteTessera uses the Bureau hundredths and rounds down in integer minor units', () => {
  assert.equal(laborNoteBureauHundredths, 20, '1.00 LN = 0.20 TSR');
  assert.equal(quoteLaborNoteTessera(800), 160, '8.00 LN is 1.60 TSR');
  assert.equal(quoteLaborNoteTessera(1999), 399, '3.998 TSR rounds down to 3.99');
  assert.equal(quoteLaborNoteTessera(1), 0, '0.01 LN rounds down to 0');
  assert.equal(quoteLaborNoteTessera(0), 0);
  assert.equal(quoteLaborNoteTessera(-800), 0);
  assert.equal(quoteLaborNoteTessera(1.5), 0);
  assert.equal(quoteLaborNoteTessera(800, 0), 0);
  assert.equal(bureauTsrLine(800), '≈ 1.60 TSR at the Bureau rate · not convertible');
  assert.equal(bureauTsrLine(1999), '≈ 3.99 TSR at the Bureau rate · not convertible');
  assert.equal(bureauTsrLine(0), '≈ 0.00 TSR at the Bureau rate · not convertible');
  assert.doesNotMatch(bureauTsrLine(800), /buy|exchange|kiosk/i);
});

test('the flag is preview true and production false, only inside HARIMU_GRAY_PACK, and a direct string wins', async () => {
  const preview = strip(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  const prod = strip(await readFile(new URL('../wrangler.prod.jsonc', import.meta.url), 'utf8'));
  assert.equal(preview.vars.HARIMU_KORUND_TSR_VIEW_ENABLED, undefined, 'not a top-level binding');
  assert.equal(prod.vars.HARIMU_KORUND_TSR_VIEW_ENABLED, undefined, 'not a top-level binding');
  assert.equal(preview.vars.HARIMU_GRAY_PACK.HARIMU_KORUND_TSR_VIEW_ENABLED, 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK.HARIMU_KORUND_TSR_VIEW_ENABLED, 'false');
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, 'HARIMU_KORUND_TSR_VIEW_ENABLED'), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, 'HARIMU_KORUND_TSR_VIEW_ENABLED'), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, HARIMU_KORUND_TSR_VIEW_ENABLED: 'false' }, 'HARIMU_KORUND_TSR_VIEW_ENABLED'), false, 'a direct string wins');
});

test('the Korund panel shows the Bureau line only when the plan carries bureauTsr', async () => {
  const { KorundPlanPanel } = await import(await componentModule(resolve(root, 'app/korund-plan-panel.tsx')));
  const noop = () => {};
  const plan = { available: true, shifts: [], couponExpiresAt: '2099-01-01T00:00:00.000Z', walletMinor: 800, foodQuantity: 2, gameWeek: 1, couponFoodRemaining: 2, mealReadyAt: null,
    assignment: { name: 'State food-production brigade', capacityCost: 4, hours: 2, wageMinor: 800, foodOutput: 4 } };
  const render = (scene, p) => renderToStaticMarkup(React.createElement(KorundPlanPanel, { plan: p, scene, capacity: 14, pending: false, uncertain: false, localDemo: false, error: null, onCommand: noop, onRetry: noop, onRefresh: noop, onNavigate: noop }));
  for (const scene of ['workplace', 'household', 'nation']) {
    const on = render(scene, { ...plan, bureauTsr: true, streetRate: { rumoredRate: 118 } });
    assert.match(on, /≈ 1\.60 TSR at the Bureau rate · not convertible/, scene);
    assert.match(on, /Rumored street rate: about 1\.18 FC per LN/, `${scene}: street rate stays`);
    assert.ok(on.indexOf('at the Bureau rate') < on.indexOf('Rumored street rate'), `${scene}: Bureau line sits under the balance, ahead of the rumor`);
    const off = render(scene, { ...plan, streetRate: { rumoredRate: 118 } });
    assert.doesNotMatch(off, /wallet-bureau-rate|at the Bureau rate/, `${scene}: flag off`);
    assert.doesNotMatch(off, /not convertible/, `${scene}: flag off adds no note`);
    assert.match(off, /Rumored street rate: about 1\.18 FC per LN/, `${scene}: street rate unchanged`);
  }
  assert.match(render('workplace', { ...plan, walletMinor: 1999, bureauTsr: true }), /≈ 3\.99 TSR at the Bureau rate · not convertible/);
  assert.doesNotMatch(render('workplace', { ...plan, walletMinor: 1999, bureauTsr: true }), /4\.00 TSR/);
});

async function setup(t, on = false) {
  const r = await localRuntime(); t.after(() => r.close());
  await r.db.prepare("UPDATE citizens SET nation_id='korund'").run();
  await r.call('world', null);
  if (on) r.setFixtureEnv('HARIMU_KORUND_TSR_VIEW_ENABLED', 'true');
  return r;
}
const planOf = async (r, user = 'alice') => (await r.call('citizen', user)).data.korundPlan;
async function sqlDuring(r, fn) {
  const seen = [], prepare = r.db.prepare.bind(r.db);
  r.db.prepare = sql => { seen.push(sql.replace(/\s+/g, ' ').trim()); return prepare(sql); };
  try { await fn(); } finally { r.db.prepare = prepare; }
  return seen;
}
const isWrite = sql => /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|REPLACE)/i.test(sql);

test('flag off leaves the plan unchanged; flag on quotes the same wallet at the Bureau rate and writes nothing', async t => {
  const off = await setup(t);
  const hidden = await planOf(off);
  assert.equal(hidden.walletMinor, 0);
  assert.equal('bureauTsr' in hidden, false, 'flag off');
  const offSql = await sqlDuring(off, () => planOf(off));
  assert.deepEqual(offSql.filter(isWrite), []);

  const on = await setup(t, true);
  const before = await planOf(on);
  assert.equal(before.bureauTsr, true);
  assert.equal(bureauTsrLine(before.walletMinor), '≈ 0.00 TSR at the Bureau rate · not convertible');
  const id = randomUUID();
  assert.equal((await on.call('citizen', 'alice', { action: 'korund-start-work', requestId: id })).status, 200);
  on.setNow(on.now + 7200 * 1000);
  assert.equal((await on.call('citizen', 'alice', { action: 'korund-claim-work', shiftId: id })).status, 200);
  const earned = await planOf(on);
  assert.equal(earned.walletMinor, 800);
  assert.equal(earned.bureauTsr, true);
  assert.equal(quoteLaborNoteTessera(earned.walletMinor), 160);
  assert.equal(bureauTsrLine(earned.walletMinor), '≈ 1.60 TSR at the Bureau rate · not convertible');
  const onSql = await sqlDuring(on, () => planOf(on));
  assert.deepEqual(onSql.filter(isWrite), []);
  assert.deepEqual(onSql, offSql, 'flag on adds no query');

  await on.db.prepare("UPDATE citizens SET nation_id='kindle' WHERE clerk_user_id='alice'").run();
  const other = await planOf(on);
  assert.equal(other.available, false);
  assert.equal('bureauTsr' in other, false, 'not a Korund citizen');
  const korund = await readFile(new URL('../lib/korund.ts', import.meta.url), 'utf8');
  const exec = korund.slice(korund.indexOf('export async function executeKorund'));
  assert.doesNotMatch(exec, /bureauTsr/);
  assert.doesNotMatch(await readFile(new URL('../lib/korund-wallet.ts', import.meta.url), 'utf8'), /bureauTsr|HARIMU_KORUND_TSR_VIEW_ENABLED/);
  assert.doesNotMatch(await readFile(new URL('../lib/wallet-street-rate.ts', import.meta.url), 'utf8'), /bureauTsr|quoteLaborNoteTessera/);
});

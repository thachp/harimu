import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { clampIncomeTaxPercent, withholdIncomeTax, describeKindlePay, kindleIncomeTaxPercent, activeIncomeTaxPercent } from '../lib/income-tax.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

// Issue #86: Kindle income tax is withheld at settlement into the kindle-treasury fund.
const treasury = r => r.db.prepare("SELECT COALESCE((SELECT initial_minor FROM economy_funds WHERE id='kindle-treasury'),0) + COALESCE((SELECT SUM(tax_minor) FROM shift_income_tax),0) AS balance").first();
// The tax ships behind HARIMU_KINDLE_INCOME_TAX_ENABLED (off). These runtimes turn it on unless noted.
async function taxed(t, on = true) { const r = await localRuntime(); t.after(() => r.close()); r.setFixtureEnv('HARIMU_KINDLE_INCOME_TAX_ENABLED', on ? 'true' : undefined); return r; }
async function finishShift(r, user, order = 'harvest') {
  await r.call('citizen', user, { action: 'commit-work', workOrderId: order });
  const shift = (await r.call('citizen', user)).data.shifts.find(s => !s.claimedAt);
  r.setNow(Date.parse(shift.completesAt)); return shift;
}

test('withholding math: default 15%, rounds down in the citizen favour, integer minor units', () => {
  assert.equal(kindleIncomeTaxPercent, 15);
  assert.deepEqual(withholdIncomeTax(800), { grossMinor: 800, taxMinor: 120, netMinor: 680, percent: 15 });
  assert.deepEqual(withholdIncomeTax(699), { grossMinor: 699, taxMinor: 104, netMinor: 595, percent: 15 }); // 104.85 → 104
  assert.deepEqual(withholdIncomeTax(6), { grossMinor: 6, taxMinor: 0, netMinor: 6, percent: 15 });
  for (const wage of [0, 1, 7, 99, 600, 700, 900, 1000, 1200, 12345]) {
    const p = withholdIncomeTax(wage); assert.equal(p.taxMinor, Math.floor(wage * 0.15)); assert.equal(p.grossMinor, p.taxMinor + p.netMinor);
  }
});
test('a rate config outside 0–50 is clamped', () => {
  assert.equal(clampIncomeTaxPercent(-5), 0); assert.equal(clampIncomeTaxPercent(75), 50); assert.equal(clampIncomeTaxPercent(50), 50);
  assert.equal(clampIncomeTaxPercent(0), 0); assert.equal(clampIncomeTaxPercent('120'), 50); assert.equal(clampIncomeTaxPercent(12.9), 12);
  assert.equal(clampIncomeTaxPercent('abc'), 15); assert.equal(clampIncomeTaxPercent(Number.NaN), 15);
  assert.equal(withholdIncomeTax(1000, 90).taxMinor, 500); assert.equal(withholdIncomeTax(1000, -10).taxMinor, 0);
});
test('settling a Kindle shift credits net to the citizen and tax to kindle-treasury once, even on retry', async t => {
  const r = await taxed(t);
  const before = (await r.call('citizen', 'alice')).data.economy.walletMinor;
  const shift = await finishShift(r, 'alice');
  const first = await r.call('citizen', 'alice', { action: 'claim-work', shiftId: shift.id });
  const retry = await r.call('citizen', 'alice', { action: 'claim-work', shiftId: shift.id });
  assert.equal(first.status, 200); assert.equal(retry.status, 200);
  assert.equal(first.data.economy.walletMinor - before, 800 - Math.floor(800 * 0.15));
  assert.equal(retry.data.economy.walletMinor, first.data.economy.walletMinor, 'retry never double-taxes or double-pays');
  assert.equal((await treasury(r)).balance, 120);
  const row = await r.db.prepare('SELECT gross_minor, tax_minor, rate_percent FROM shift_income_tax WHERE shift_id=?').bind(shift.id).first();
  assert.deepEqual({ ...row }, { gross_minor: 800, tax_minor: 120, rate_percent: 15 });
  // Wallet history shows the gross wage and a separate income tax row that reconcile to the net credit.
  const tx = first.data.economy.transactions;
  const wage = tx.find(x => x.kind === 'wage'); const tax = tx.find(x => x.kind === 'income-tax');
  assert.equal(wage.amountMinor, 800); assert.equal(tax.amountMinor, -120); assert.match(tax.reason, /^Income tax · 15% withheld/);
  assert.ok(tx.indexOf(tax) < tx.indexOf(wage), 'tax sorts after the wage it was withheld from');
});
test('the tax rides the settlement transaction: no settlement, no tax', async t => {
  const r = await taxed(t);
  const shift = await finishShift(r, 'alice');
  await r.db.prepare("UPDATE economy_funds SET initial_minor=0 WHERE id='kindle-employer'").run();
  const res = await r.call('citizen', 'alice', { action: 'claim-work', shiftId: shift.id });
  assert.equal(res.status, 409);
  assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM shift_income_tax').first()).n, 0);
  assert.equal((await treasury(r)).balance, 0);
});
test('non-Kindle citizens are not taxed; Korund settlements are unchanged', async t => {
  const r = await taxed(t);
  const shift = await finishShift(r, 'bob');
  await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='bob'").run();
  await r.call('citizen', 'bob', { action: 'claim-work', shiftId: shift.id });
  assert.equal((await r.db.prepare("SELECT COUNT(*) AS n FROM shift_income_tax WHERE clerk_user_id='bob'").first()).n, 0);
  const korund = await readFile(new URL('../lib/korund.ts', import.meta.url), 'utf8').catch(() => '');
  assert.ok(!/shift_income_tax|income-tax/.test(korund), 'Korund ledger never references the Kindle tax');
});
test('Kindle availableBudgetMinor includes the treasury balance', async t => {
  const r = await taxed(t);
  const government = await r.importModule('lib/government-state.ts');
  const nowSec = () => Math.floor(Date.now() / 1000);
  const shift = await finishShift(r, 'alice');
  await r.call('citizen', 'alice', { action: 'claim-work', shiftId: shift.id });
  const employer = (await r.db.prepare("SELECT initial_minor - COALESCE((SELECT SUM(wage_minor) FROM shift_settlements),0) - COALESCE((SELECT SUM(spend_minor) FROM government_policy_executions),0) AS balance FROM economy_funds WHERE id='kindle-employer'").first()).balance;
  const snapshot = await government.readGovernment(r.db, 'kindle', nowSec(), undefined, { readOnly: true });
  const inputs = snapshot.inputs ?? snapshot;
  assert.equal(employer, 100000 - 800);
  assert.equal(inputs.availableBudgetMinor, Math.min(employer + 120, 100000));
});
test('shift board and work menus show gross, tax and net from the same rounding', async () => {
  assert.equal(describeKindlePay(800, 0), '8.00 SPK', 'flag off: no tax line');
  assert.equal(describeKindlePay(800, 15), '8.00 SPK gross − 1.20 income tax (15%, set by the AI Assembly) = 6.80 SPK net');
  for (const file of ['../app/work-shift-board.tsx', '../app/nation-institutions.tsx', '../app/page.tsx'])
    assert.match(await readFile(new URL(file, import.meta.url), 'utf8'), /describeKindlePay\([^)]*incomeTaxPercent/, file);
});

test('flag off (shipped default): nothing is withheld, the full wage is credited, no tax lines, snapshot reports 0%', async t => {
  const r = await taxed(t, false);
  const before = (await r.call('citizen', 'alice')).data.economy.walletMinor;
  const shift = await finishShift(r, 'alice');
  const res = await r.call('citizen', 'alice', { action: 'claim-work', shiftId: shift.id });
  assert.equal(res.status, 200);
  assert.equal(res.data.economy.walletMinor - before, 800, 'gross wage');
  assert.equal(res.data.economy.incomeTaxPercent, 0);
  assert.ok(!res.data.economy.transactions.some(x => x.kind === 'income-tax'));
  assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM shift_income_tax').first()).n, 0);
  assert.equal((await treasury(r)).balance, 0);
  assert.equal(activeIncomeTaxPercent(undefined), 0); assert.equal(activeIncomeTaxPercent('false'), 0); assert.equal(activeIncomeTaxPercent('true'), 15);
  const cfg = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.deepEqual([...cfg.matchAll(/"HARIMU_KINDLE_INCOME_TAX_ENABLED"\s*:\s*"([^"]*)"/g)].map(x => x[1]), ['false']);
});
test('flag on: the snapshot reports the 15% rate used for the gross/tax/net copy', async t => {
  const r = await taxed(t);
  assert.equal((await r.call('citizen', 'alice')).data.economy.incomeTaxPercent, 15);
});
test('availableBudgetMinor = min(treasury + employer fund, employer-fund cap)', async t => {
  const r = await taxed(t);
  const g = await r.importModule('lib/government-state.ts');
  assert.equal(g.spendableKindleBudget(99200, 120, 100000), 99320, 'below the cap: fund + treasury');
  assert.equal(g.spendableKindleBudget(100000, 500, 100000), 100000, 'capped at the employer-fund cap');
  assert.equal(g.spendableKindleBudget(-50, 300, 100000), 300, 'an overdrawn fund never counts negative');
  assert.equal(g.spendableKindleBudget(0, 0, 100000), 0);
  // Integration: a treasury larger than the drawdown is capped.
  await r.db.prepare("UPDATE economy_funds SET initial_minor=50000 WHERE id='kindle-treasury'").run();
  const snapshot = await g.readGovernment(r.db, 'kindle', Math.floor(Date.now() / 1000), undefined, { readOnly: true });
  assert.equal((snapshot.inputs ?? snapshot).availableBudgetMinor, 100000);
});

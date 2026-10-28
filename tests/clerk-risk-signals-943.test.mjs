/** #943: Clerk email risk signals folded into staff risk scores. Flag off = no Clerk call and no signal writes. Human review only. SQLite + PGlite. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { assessClerkEmail, disposableEmailDomains } from '../lib/clerk-risk-signals.ts';
import { scoreRisk, riskScoring as cfg } from '../lib/risk-scoring.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

test('assessClerkEmail: disposable domain, plus-sub-address, clean and malformed', () => {
  assert.deepEqual(assessClerkEmail('a@mailinator.com'), { email: 'a@mailinator.com', disposable: true, subAddress: false, flagged: true });
  assert.deepEqual(assessClerkEmail('name+tag@gmail.com'), { email: 'name+tag@gmail.com', disposable: false, subAddress: true, flagged: true });
  assert.deepEqual(assessClerkEmail('citizen@example.com'), { email: 'citizen@example.com', disposable: false, subAddress: false, flagged: false });
  assert.equal(assessClerkEmail('').flagged, false);
  assert.equal(assessClerkEmail(null).flagged, false);
  assert.ok(disposableEmailDomains.includes('yopmail.com'));
});

test('scoreRisk adds clerk-email points without changing civic windows', () => {
  const only = scoreRisk({ accountAgeSeconds: null, civicActCount: 0, clerkEmailRisk: true });
  assert.deepEqual(only, { score: cfg.clerkEmailPoints, reasons: ['clerk-email'], civicActCount: 0 });
  const both = scoreRisk({ accountAgeSeconds: 1, civicActCount: 0, clerkEmailRisk: true });
  assert.equal(both.score, cfg.newAccountPoints + cfg.clerkEmailPoints);
  assert.deepEqual(both.reasons, ['new-account', 'clerk-email']);
  assert.equal(scoreRisk({ accountAgeSeconds: null, civicActCount: 0 }).score, 0);
});

for (const backend of ['sqlite', 'postgres']) {
  test(`#943 ${backend}: flag off writes nothing; flagged email scores clerk-email; re-run idempotent; clear when unflagged`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    const now = Math.floor(r.now / 1000);
    const iso = new Date((now - 10 * 86400) * 1000).toISOString();
    await r.db.prepare("UPDATE citizens SET created_at=? WHERE clerk_user_id IN ('alice','bob')").bind(iso).run();
    const signals = await r.importModule('lib/clerk-risk-signals.ts');
    const risk = await r.importModule('lib/risk-scoring.ts');

    r.setFixtureEnv('HARIMU_CLERK_RISK_SIGNALS_ENABLED', 'false');
    assert.equal(await signals.refreshClerkRiskSignal(r.db, 'alice', { HARIMU_CLERK_RISK_SIGNALS_ENABLED: 'false' }, now, 'a@mailinator.com'), null);
    assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM clerk_risk_signals').first()).n), 0, 'flag off: no rows');

    r.setFixtureEnv('HARIMU_CLERK_RISK_SIGNALS_ENABLED', 'true');
    const envOn = { HARIMU_CLERK_RISK_SIGNALS_ENABLED: 'true' };
    const flagged = await signals.refreshClerkRiskSignal(r.db, 'alice', envOn, now, 'alt+tag@mailinator.com');
    assert.equal(flagged.flagged, true); assert.equal(flagged.disposable, true); assert.equal(flagged.subAddress, true);
    await risk.runRiskScoring(r.db, now);
    let row = await r.db.prepare("SELECT score, reasons FROM risk_scores WHERE clerk_user_id='alice'").first();
    assert.equal(Number(row.score), cfg.clerkEmailPoints);
    assert.equal(row.reasons, 'clerk-email');
    await risk.runRiskScoring(r.db, now);
    row = await r.db.prepare("SELECT score, reasons FROM risk_scores WHERE clerk_user_id='alice'").first();
    assert.equal(Number(row.score), cfg.clerkEmailPoints, 'idempotent');

    await signals.refreshClerkRiskSignal(r.db, 'alice', envOn, now, 'citizen@example.com');
    await risk.runRiskScoring(r.db, now);
    row = await r.db.prepare("SELECT score, reasons FROM risk_scores WHERE clerk_user_id='alice'").first();
    assert.equal(Number(row.score), 0);
    assert.equal(row.reasons, '');
    assert.equal((await risk.listRiskScores(r.db)).filter(a => a.userId === 'alice').length, 0);
    assert.ok(!(await risk.listRiskScores(r.db)).some(a => a.reasons.includes('clerk-email')));
  });

  test(`#943 ${backend}: HARIMU_CLERK_RISK_SIGNALS_ENABLED off values are 404-style no-ops for the pin audit`, async t => {
    // Pin file must name the flag next to a flag-off case (flag-off-audit-384).
    const r = await localRuntime({ backend }); t.after(() => r.close());
    const signals = await r.importModule('lib/clerk-risk-signals.ts');
    const now = Math.floor(r.now / 1000);
    for (const value of ['false', 'TRUE', '1', '']) {
      r.setFixtureEnv('HARIMU_CLERK_RISK_SIGNALS_ENABLED', value);
      assert.equal(await signals.refreshClerkRiskSignal(r.db, 'alice', { HARIMU_CLERK_RISK_SIGNALS_ENABLED: value }, now, 'a@mailinator.com'), null, value);
    }
    assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM clerk_risk_signals').first()).n), 0);
  });
}

test('#943 migrations and admin route stay human-review only', () => {
  for (const file of ['drizzle/0102_clerk_risk_signals.sql', 'db/postgres/0102_clerk_risk_signals.sql']) {
    const sql = readFileSync(file, 'utf8');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS clerk_risk_signals/);
    assert.match(sql, /clerk-email/);
  }
  assert.match(readFileSync('db/postgres/0102_clerk_risk_signals.sql', 'utf8'), /harimu:destructive-reviewed/);
  assert.match(readFileSync('app/api/admin/risk-scores/route.ts', 'utf8'), /reviewOnly/);
});

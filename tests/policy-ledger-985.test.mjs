/** #985: Kindle Policy Ledger. Flag HARIMU_KINDLE_POLICY_LEDGER_ENABLED. Flag off: no ledger read or write, and the latest decision is unchanged. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { simulateGovernment } from '../lib/government.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const require = createRequire(import.meta.url);
const tick = 7200;
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
async function seen(r, fn) {
  const prepare = r.db.prepare.bind(r.db), sql = [];
  r.db.prepare = q => { sql.push(q); return prepare(q); };
  try { return { sql, result: await fn() }; } finally { r.db.prepare = prepare; }
}
const publicKeys = ['brief', 'id', 'office', 'publishedAt', 'title'];

for (const backend of ['sqlite', 'postgres']) {
  test(`#985 publish path (${backend}): flag off unchanged; on, newest first with each public brief; idempotent`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    const sim = await r.importModule('lib/world-simulation.ts');
    const t0 = Math.floor(r.now / 1000);
    await sim.advanceWorld(r.db, t0);
    const off = await seen(r, async () => { await sim.advanceWorld(r.db, t0 + tick); return r.call('citizen', 'alice'); });
    assert.ok(!off.sql.some(q => /kindle_policy_decisions/.test(q)), 'flag off opens no ledger');
    assert.equal('policyLedger' in off.result.data.government, false);
    const decision = off.result.data.government.decision;
    r.setFixtureEnv('HARIMU_KINDLE_POLICY_LEDGER_ENABLED', 'true');
    const empty = await r.call('citizen', 'alice');
    assert.deepEqual(empty.data.government.decision, decision, 'latest decision unchanged');
    assert.deepEqual(empty.data.government.policyLedger, []);
    await sim.advanceWorld(r.db, t0 + tick * 2);
    await sim.advanceWorld(r.db, t0 + tick * 3);
    assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM kindle_policy_decisions').first()).n), 1, 'idempotent per decision');
    await r.db.prepare("INSERT INTO starter_food_grants (clerk_user_id, quantity) VALUES ('alice', 2)").run();
    await r.db.prepare("INSERT INTO starter_food_grants (clerk_user_id, quantity) VALUES ('bob', 2)").run();
    await sim.advanceWorld(r.db, t0 + tick * 4);
    const on = await r.call('citizen', 'alice');
    const ledger = on.data.government.policyLedger;
    assert.equal(ledger.length, 2);
    assert.ok(ledger[0].publishedAt > ledger[1].publishedAt, 'newest first');
    assert.ok(ledger.every(row => row.office === 'President' && row.brief && deep(row)));
    assert.match(ledger[1].brief, /0\/100/);
    assert.match(ledger[0].brief, /ties favor food/);
    assert.equal(ledger[0].title, 'Food security reserve');
    assert.doesNotMatch(JSON.stringify(ledger), /privateRationale|staffOnly|CHAIN_OF_THOUGHT|verificationPolicy|clerk_user|requestId/);
    const read = await seen(r, () => r.call('citizen', 'alice'));
    assert.ok(read.sql.some(q => /FROM kindle_policy_decisions/.test(q)));
    assert.ok(!read.sql.some(q => /INSERT INTO kindle_policy_decisions/.test(q)), 'the citizen read does not record');
    await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='alice'").run();
    const korund = await seen(r, () => r.call('citizen', 'alice'));
    assert.equal('policyLedger' in korund.result.data.government, false);
    assert.ok(!korund.sql.some(q => /kindle_policy_decisions/.test(q)), 'outside Kindle the ledger is not read');
  });

  test(`#985 recording (${backend}): idempotent, last 20, no private or staff fields, other nations ignored`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    const ledger = await r.importModule('lib/policy-ledger.ts');
    const poisoned = simulateGovernment({ nationId: 'kindle', availableBudgetMinor: 1000, foodSecurity: 10, petitionCounts: { food: 1 } });
    poisoned.privateRationale = 'CHAIN_OF_THOUGHT_SECRET';
    poisoned.staffOnly = 'STAFF_ONLY_NOTE';
    poisoned.petitions = [{ requestId: 'secret-request', topic: 'work', submittedAt: 1, status: 'deferred', reason: 'STAFF_REVIEW', reviewedAt: 2 }];
    assert.equal(await ledger.recordPublishedKindleDecision(r.db, poisoned, 40), true);
    assert.equal(await ledger.recordPublishedKindleDecision(r.db, poisoned, 90), false, 'same decision records once');
    const stored = await r.db.prepare('SELECT * FROM kindle_policy_decisions').all();
    assert.deepEqual(Object.keys(stored.results[0]).sort(), ['brief', 'decision_key', 'office', 'published_at', 'title']);
    assert.equal(stored.results[0].brief, poisoned.decision.reason);
    assert.doesNotMatch(JSON.stringify(stored.results), /CHAIN_OF_THOUGHT_SECRET|STAFF_ONLY_NOTE|STAFF_REVIEW|secret-request|privateRationale/);
    const closed = simulateGovernment({ nationId: 'korund', availableBudgetMinor: 1000, foodSecurity: 10, petitionCounts: {} });
    closed.decision = { ...closed.decision, reason: 'HIDDEN_KORUND_REASON' };
    assert.equal(await ledger.recordPublishedKindleDecision(r.db, closed, 1), false);
    assert.doesNotMatch(JSON.stringify((await r.db.prepare('SELECT brief FROM kindle_policy_decisions').all()).results), /HIDDEN_KORUND_REASON/);
    for (let i = 0; i < 21; i++) {
      const row = simulateGovernment({ nationId: 'kindle', availableBudgetMinor: 1000, foodSecurity: 80, petitionCounts: {} });
      row.decision = { ...row.decision, reason: `Public brief ${String(i).padStart(2, '0')} only.` };
      assert.equal(await ledger.recordPublishedKindleDecision(r.db, row, 1000 + i), true);
    }
    const page = await ledger.readKindlePolicyLedger(r.db);
    assert.equal(page.length, 20);
    assert.equal(page[0].brief, 'Public brief 20 only.');
    assert.equal(page[19].brief, 'Public brief 01 only.');
    assert.ok(page.every((row, i) => i === 0 || row.publishedAt < page[i - 1].publishedAt));
    assert.ok(!page.some(row => /Public brief 00|CHAIN_OF_THOUGHT|STAFF_/.test(row.brief)));
    assert.equal(ledger.policyLedgerEnabled({}), false);
    assert.equal(ledger.policyLedgerEnabled({ HARIMU_KINDLE_POLICY_LEDGER_ENABLED: 'true' }), true);
  });
}
function deep(row) { assert.deepEqual(Object.keys(row).sort(), publicKeys); return true; }

test('Policy Ledger rows show each public brief behind Why?; flag off the panel is unchanged', async () => {
  const src = await readFile(new URL('../app/leader-panel.tsx', import.meta.url), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const exports = {};
  new Function('exports', 'require', 'module', js)(exports, name => ({
    './nation-document': { NationDocument: ({ children }) => React.createElement('div', null, children) },
    '../lib/leader-personas': require('../lib/leader-personas.ts'), '../lib/government-disclosure': require('../lib/government-disclosure.ts'), '../lib/decision-disclosure-copy': require('../lib/decision-disclosure-copy.ts'),
    './game-timer': { GameTimer: () => null }, './ai-disclosure': { AiBadge: () => React.createElement('small', { className: 'ai-badge' }, 'SI'), AiTextTag: () => React.createElement('small', null, 'Simulated statement') },
  })[name] ?? require(name), { exports });
  const Panel = exports.LeaderPanel;
  const snapshot = simulateGovernment({ nationId: 'kindle', availableBudgetMinor: 1000, foodSecurity: 80, petitionCounts: {} });
  const plain = text(renderToStaticMarkup(React.createElement(Panel, { snapshot })));
  assert.doesNotMatch(plain, /Policy Ledger/);
  assert.equal((plain.match(/Why\?/g) || []).length, 1);
  assert.match(plain, /Goal:/);
  const rows = [
    { id: 'newer', publishedAt: 1_800_000_000, office: 'President', title: 'Food security reserve', brief: 'NEWER_PUBLIC_BRIEF' },
    { id: 'older', publishedAt: 1_700_000_000, office: 'President', title: 'Workplace support', brief: 'OLDER_PUBLIC_BRIEF' },
  ];
  const html = renderToStaticMarkup(React.createElement(Panel, { snapshot: { ...snapshot, policyLedger: rows, privateRationale: 'CHAIN_OF_THOUGHT_SECRET', staffOnly: 'STAFF_ONLY_NOTE' } }));
  const body = text(html);
  assert.ok(body.indexOf('NEWER_PUBLIC_BRIEF') < body.indexOf('OLDER_PUBLIC_BRIEF'));
  assert.match(body, new RegExp(new Date(rows[0].publishedAt * 1000).toISOString().slice(0, 10)));
  assert.match(body, /President/); assert.match(body, /Workplace support/); assert.match(body, /Reasoning Brief/);
  assert.match(body, /Part of the rationale is held back for now/);
  assert.equal((html.match(/Why\?/g) || []).length, 3, 'the latest Why? plus one per ledger row');
  assert.match(html, /class="ai-badge"/); assert.match(body, /Goal:/); assert.ok(body.includes(snapshot.decision.reason.slice(0, 24)));
  assert.doesNotMatch(body, /CHAIN_OF_THOUGHT_SECRET|STAFF_ONLY_NOTE/);
  const empty = text(renderToStaticMarkup(React.createElement(Panel, { snapshot: { ...snapshot, policyLedger: [] } })));
  assert.match(empty, /No published decisions are on the ledger yet/);
  const korund = simulateGovernment({ nationId: 'korund', availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} });
  assert.doesNotMatch(text(renderToStaticMarkup(React.createElement(Panel, { snapshot: { ...korund, policyLedger: rows } }))), /Policy Ledger|NEWER_PUBLIC_BRIEF/);
});

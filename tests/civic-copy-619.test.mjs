/** #619: Korund and Aurelle Civic must not say "Kindle allocations" or "Kindle proposals"; Kindle keeps its own wording. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { localRuntime } from './helpers/local-runtime.mjs';

const require = createRequire(import.meta.url);
async function component(file, name) {
  const source = await readFile(new URL(`../app/${file}`, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
  const stub = n => ({ GameTimer: () => null, LeaderPanel: () => null, AiBadge: () => null, StabilityPanel: () => null, NationDocument: ({ children }) => React.createElement('div', null, children), DefenseWindow: () => null, WarBanner: () => null, ForeignAffairsPanel: () => null })[n];
  const exports = {};
  new Function('exports', 'require', compiled)(exports, id => id === '@/lib/action-reasons' ? require('../lib/action-reasons.ts') : id === '@/lib/nation-discovery' ? require('../lib/nation-discovery.ts') : id === './display-preferences' ? { useDisplayTimestamp: () => t => String(t) } : id === 'react/jsx-runtime' ? require('react/jsx-runtime') : new Proxy({}, { get: (_, k) => stub(k) }));
  return exports[name];
}
const GovernmentPanel = await component('government-panel.tsx', 'GovernmentPanel');
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'");

test('only Kindle names Kindle allocations and proposals; Korund and Aurelle read their own nation', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const { simulateGovernment } = await r.importModule('lib/government.ts');
  const view = nationId => text(renderToStaticMarkup(React.createElement(GovernmentPanel, { snapshot: simulateGovernment({ nationId, availableBudgetMinor: 0, foodSecurity: 35, petitionCounts: {} }), nationId, localDemo: true, pending: false, error: null, onPetition() {} })));
  const kindle = view('kindle');
  assert.match(kindle, /executed Kindle allocations are recorded separately above/); assert.match(kindle, /Kindle proposals and executed allocations use the remaining work-programme budget/);
  for (const [nationId, name] of [['korund', 'Korund'], ['aurelle', 'Aurelle']]) {
    const page = view(nationId);
    assert.doesNotMatch(page, /Kindle/, `${nationId} Civic has no Kindle wording`);
    assert.match(page, /This proposal itself does not spend funds\./);
    assert.match(page, new RegExp(`${name}’s proposals are saved for review only`.replace('’', '.')));
  }
});

test('the panel takes the per-nation copy from helpers, not literals in the JSX', async () => {
  const src = await readFile(new URL('../app/government-panel.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /<p>[^<{]*Kindle (allocations|proposals)/, 'no Kindle sentence is a literal in the JSX any more');
  assert.match(src, /civicSpendingNote\(snapshot\.nationId\)/); assert.match(src, /civicBudgetNote\(snapshot\.nationId\)/);
});

/** QA2 preview report (#738): the Army card went missing from the Civic panel. ArmyCard fetched once on mount with no session key, so a
 *  signed-out or failed first load left it hidden for good. Pins: it sits right after GovernmentPanel, keyed on citizenSessionKey, and a
 *  remount after sign-in shows the unit (armies flag on: GET /api/army answers). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

test('Civic panel: ArmyCard renders after GovernmentPanel, keyed on the citizen session (armies flag on)', async () => {
  const page = readFileSync('app/page.tsx', 'utf8');
  const civic = page.slice(page.indexOf("{viewMode === 'government' && <>"));
  assert.match(civic, /<GovernmentPanel [^\n]*\/>\s*<ArmyCard key=\{`army:\$\{citizenSessionKey\}`\}\/>/, 'right after GovernmentPanel, remounts on session change');
  assert.equal((page.match(/<ArmyCard\b/g) ?? []).length, 1);
  const { Window } = await import('happy-dom'), ts = (await import('typescript')).default, { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url), w = new Window({ url: 'http://localhost/' }); globalThis.window = w; globalThis.document = w.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const React = require('react'), { createRoot } = require('react-dom/client'), { act } = React;
  const js = ts.transpileModule(readFileSync('app/army-card.tsx', 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const mod = { exports: {} }; new Function('exports', 'require', 'module', js)(mod.exports, n => n === './session-retry' ? (() => { const m = { exports: {} }; new Function('exports', 'require', 'module', ts.transpileModule(readFileSync('app/session-retry.tsx', 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText)(m.exports, require, m); return m.exports; })() : n.startsWith('@/lib/') ? require(`../lib/${n.slice(6)}.ts`) : require(n), mod);
  const army = { unit: { id: 'kindle-home-guard', name: 'Kindle Home Guard', officer: 'Captain Ardent', memberCount: 0, openToVolunteers: true }, member: false, stance: null };
  let signedIn = false;
  globalThis.fetch = async url => ({ ok: url !== '/api/army' || signedIn, status: url === '/api/army' && !signedIn ? 401 : 200, json: async () => (url === '/api/army' ? { army } : {}) });
  const el = document.createElement('div'); document.body.appendChild(el); const root = createRoot(el);
  const render = key => act(async () => { root.render(React.createElement('div', null, React.createElement('section', { className: 'government' }), React.createElement(mod.exports.ArmyCard, { key }))); await new Promise(r => setTimeout(r, 0)); });
  await render('army:0'); assert.equal(el.querySelector('.army-card'), null, 'signed out: hidden');
  signedIn = true; await render('army:1');
  const card = el.querySelector('.army-card'); assert.ok(card, 'new session key: the card loads and shows');
  assert.equal(card.previousElementSibling?.className, 'government', 'after GovernmentPanel'); assert.ok(card.textContent.includes('Kindle Home Guard'));
  await act(async () => root.unmount()); el.remove();
});

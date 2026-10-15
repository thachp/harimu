/** #120: Tab order and focus rings on the REAL GameShell, AccountMenu and CitizenDock (server-rendered with
 *  real React into happy-dom with the shipped focus-visible CSS), not a synthetic fixture. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { Window } from 'happy-dom';
const require = createRequire(import.meta.url);
const React = require('react'); const { renderToStaticMarkup } = require('react-dom/server');

const cache = new Map();
async function load(rel) {
  if (cache.has(rel)) return cache.get(rel);
  const src = await readFile(new URL(`../app/${rel}.tsx`, import.meta.url), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const deps = {};
  for (const [, name] of js.matchAll(/require\("([^"]+)"\)/g)) {
    if (name.startsWith('./') && !name.endsWith('.css') && !['./game-viewport', './game-timer', './square-chat'].includes(name)) deps[name] = await load(name.slice(2));
  }
  const exports = {}; const mod = { exports };
  new Function('exports', 'require', 'module', js)(exports, name => {
    if (deps[name]) return deps[name];
    if (name.endsWith('.css')) return {};
    if (name === './game-viewport') return { __esModule: true, default: () => null };
    if (name === './game-timer') return { GameTimer: () => null };
    if (name === './square-chat') return { SquareChat: () => null };
    if (name === '@phosphor-icons/react') return new Proxy({}, { get: () => () => null });
    if (name === '@clerk/nextjs') return { useClerk: () => ({ mountUserButton() {}, unmountUserButton() {} }) };
    if (name.startsWith('@/lib/')) return require(`../lib/${name.slice(6)}.ts`);
    if (name.startsWith('../lib/')) return require(`${name}.ts`);
    return require(name);
  }, mod);
  cache.set(rel, mod.exports); return mod.exports;
}

test('real Account, Work, Market and dock controls are tabbable in order and each shows a focus ring', async () => {
  const { GameShell } = await load('game-shell'); const { AccountMenu } = await load('account-menu'); const { CitizenDock } = await load('citizen-dock');
  const nation = { id: 'kindle', name: 'Kindle Republic', capital: 'Forgehaven' };
  const html = renderToStaticMarkup(React.createElement(GameShell, {
    view: 'square', nation, citizenNation: nation, nations: [nation], capacity: 18, localDemo: false, panel: null, onNavigate() {},
    accountControls: React.createElement(AccountMenu),
    socialDock: React.createElement(CitizenDock, { nationId: 'kindle', cityVisible: true, session: 'ready', configured: true, shifts: [], government: null, onNavigate() {} }),
  }));
  const globals = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8');
  const focusCss = [...globals.matchAll(/:is\(button[^{]*:focus-visible \{[^}]*\}/g)].map(m => m[0]).join('\n');
  const window = new Window(); const d = window.document;
  try {
    d.head.innerHTML = `<style>${focusCss}</style>`; d.body.innerHTML = html;
    const tabbable = [...d.querySelectorAll('button, a[href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')]
      .filter(e => !e.disabled && !e.closest('[hidden], dialog:not([open])'));
    const label = e => (e.getAttribute('aria-label') ?? e.textContent).trim();
    const names = tabbable.map(label);
    const at = re => { const i = names.findIndex(n => re.test(n)); assert.ok(i >= 0, `missing ${re} in ${JSON.stringify(names)}`); return i; };
    const order = [at(/^Account$/), at(/^Open Work$/), at(/^Open Market$/), at(/^Chat$/), at(/^Civic inbox/)];
    // Top bar (Account) precedes the scene dock (Work, Market), which precedes the citizen dock (Chat, Civic inbox).
    assert.deepEqual([...order].sort((a, b) => a - b), order, `tab order ${JSON.stringify(names)}`);
    for (const i of order) {
      const el = tabbable[i]; el.focus();
      assert.equal(d.activeElement, el); assert.equal(el.matches(':focus-visible'), true, label(el));
      assert.equal(window.getComputedStyle(el).outlineStyle, 'solid', label(el));
    }
  } finally { window.close(); }
});

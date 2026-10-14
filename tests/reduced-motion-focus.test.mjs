/** Behavioural reduced-motion and focus-visible tests (#83, #120): real app CSS in a DOM, not source regexes. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { Window } from 'happy-dom';
import { effectiveReducedMotion } from '../lib/display-preferences.ts';

const require = createRequire(import.meta.url);
const globals = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8');
const pick = re => [...globals.matchAll(re)].map(m => m[0]).join('\n');
// The reduced-motion rules and the focus-visible baseline, exactly as shipped.
const motionCss = pick(/^html\[data-harimu-reduced-motion\][^{]*\{[^}]*\}/gm);
const focusCss = pick(/:is\(button[^{]*:focus-visible \{[^}]*\}/g);
// Animated surfaces: toast, settings dialog, Clerk popup root, morning brief.
const appCss = `.game-notice{transition-duration:300ms;animation-duration:2s}.game-settings-dialog{transition-duration:250ms}.cl-userButtonPopoverCard{transition-duration:200ms;animation-duration:180ms}.morning-brief{animation-duration:400ms}`;

function page() {
  const window = new Window(); const d = window.document;
  d.head.innerHTML = `<style>${appCss}\n${motionCss}\n${focusCss}</style>`;
  d.body.innerHTML = `<header><button id="account">Account</button></header>
    <main><button id="work">Collect wages and goods</button><button id="market">Buy 1 · 1.00 SPK</button></main>
    <nav class="citizen-dock"><button id="chat">Chat</button><button id="news">News</button><button id="inbox">Civic inbox</button></nav>
    <div class="game-notice">Shift started</div><dialog class="game-settings-dialog"></dialog><div class="cl-userButtonPopoverCard"></div><section class="morning-brief"></section>`;
  return { window, d, style: sel => window.getComputedStyle(d.querySelector(sel)) };
}

test('reduced motion = Settings Reduce OR OS preference', () => {
  assert.equal(effectiveReducedMotion('reduce', false), true);
  assert.equal(effectiveReducedMotion('system', true), true);
  assert.equal(effectiveReducedMotion('system', false), false);
  assert.equal(effectiveReducedMotion(undefined, false), false);
});

test('with reduced motion on, toast, settings dialog, Clerk popup and brief report ≤0.01ms durations', () => {
  const baseline = page();
  assert.equal(baseline.style('.game-notice').transitionDuration, '300ms', 'animates normally without the attribute');
  baseline.window.close();
  const { window, d, style } = page();
  try {
    d.documentElement.setAttribute('data-harimu-reduced-motion', '');
    for (const sel of ['.game-notice', '.game-settings-dialog', '.cl-userButtonPopoverCard']) assert.equal(style(sel).transitionDuration, '.01ms', sel);
    for (const sel of ['.game-notice', '.cl-userButtonPopoverCard', '.morning-brief']) assert.equal(style(sel).animationDuration, '.01ms', sel);
  } finally { window.close(); }
});

test('provider sets the shared attribute from the in-app toggle and from the OS query, and follows OS changes', async () => {
  const compiled = ts.transpileModule(await readFile(new URL('../app/display-preferences.tsx', import.meta.url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
  const run = (motion, osMatches) => {
    const window = new Window(); const listeners = new Set(); const query = { matches: osMatches, addEventListener: (_, f) => listeners.add(f), removeEventListener: (_, f) => listeners.delete(f) };
    globalThis.document = window.document; globalThis.window = { matchMedia: () => query };
    let effect; const react = { createContext: v => ({ Provider: 'p', v }), useContext: () => ({ preferences: { motion } }), useEffect: f => { effect = f; }, useState: v => [v, () => {}] };
    const exports = {}; new Function('exports', 'require', compiled)(exports, n => n === 'react' ? react : n === '../lib/display-preferences' ? require('../lib/display-preferences.ts') : n === 'react/jsx-runtime' ? { jsx: (t, p) => ({ t, p }), jsxs: (t, p) => ({ t, p }) } : require(n));
    const tree = exports.DisplayPreferencesProvider({ children: null });
    const motionNode = [tree.p.children].flat().find(c => c?.t?.name === 'MotionPreference');
    motionNode.t(); const cleanup = effect();
    const root = window.document.documentElement;
    return { has: () => root.hasAttribute('data-harimu-reduced-motion'), query, listeners, cleanup, close() { delete globalThis.document; delete globalThis.window; window.close(); } };
  };
  const inApp = run('reduce', false); assert.equal(inApp.has(), true, 'Settings > Motion = Reduce without OS'); inApp.close();
  const os = run('system', true); assert.equal(os.has(), true, 'OS reduced motion'); os.close();
  const off = run('system', false); assert.equal(off.has(), false);
  off.query.matches = true; off.listeners.forEach(f => f()); assert.equal(off.has(), true, 'follows OS change');
  off.cleanup(); assert.equal(off.has(), false); assert.equal(off.listeners.size, 0); off.close();
});

test('focus-visible CSS only (synthetic markup; real component tab order is in real-tab-order.test.mjs): each control shows a ring', () => {
  const { window, d } = page();
  try {
    const order = [...d.querySelectorAll('button, a[href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')].filter(e => !e.disabled).map(e => e.id);
    assert.deepEqual(order, ['account', 'work', 'market', 'chat', 'news', 'inbox']);
    for (const id of order) {
      const el = d.getElementById(id); el.focus();
      assert.equal(d.activeElement, el); assert.equal(el.matches(':focus-visible'), true, id);
      const s = window.getComputedStyle(el); assert.equal(s.outlineStyle, 'solid', id); assert.match(s.outlineWidth, /^2px$/, id);
    }
  } finally { window.close(); }
});

test('toasts hide by unmounting, not by an exit animation, so .01ms/1-iteration cannot leave one visible', async () => {
  const { readdir } = await import('node:fs/promises');
  const dir = new URL('../app/', import.meta.url);
  for (const f of (await readdir(dir)).filter(f => f.endsWith('.css'))) {
    const css = await readFile(new URL(f, dir), 'utf8');
    assert.doesNotMatch(css, /\.game-notice[^{]*\{[^}]*animation/, `${f}: toast exit animation`);
  }
  const shell = await readFile(new URL('../app/game-shell.tsx', import.meta.url), 'utf8');
  assert.match(shell, /\{noticeVisible && <div className="game-notice"/, 'toast is conditionally rendered');
});

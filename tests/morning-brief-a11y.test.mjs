import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { Window } from 'happy-dom';
import { briefDayKey, claimDailyBrief } from '../lib/morning-brief.ts';

const require = createRequire(import.meta.url);
const now = new Date(2026, 9, 14, 8, 0).getTime();
const memory = (initial = {}) => { const data = { ...initial }; return { data, getItem: k => data[k] ?? null, setItem: (k, v) => { data[k] = String(v); } }; };

test('brief auto-opens on the first load of the day and not again on reload', () => {
  const storage = memory();
  assert.equal(claimDailyBrief(storage, 'k', now), true);
  assert.equal(storage.data.k, briefDayKey(now));
  assert.equal(claimDailyBrief(storage, 'k', now + 60_000), false, 'reload the same day without dismissing');
  assert.equal(claimDailyBrief(storage, 'k', now + 24 * 3600_000), true, 'next real day');
});
test('blocked storage never auto-opens in a loop', () => {
  assert.equal(claimDailyBrief(null, 'k', now), false);
  assert.equal(claimDailyBrief({ getItem() { throw new Error('denied'); }, setItem() {} }, 'k', now), false);
});

const compiled = ts.transpileModule(await readFile(new URL('../app/morning-brief.tsx', import.meta.url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
function harness(props) {
  const refs = []; const effects = []; let index = 0;
  const react = { useRef: () => refs[index++] ?? (refs[index - 1] = { current: null }), useEffect: fn => effects.push(fn) };
  const exports = {}; new Function('exports', 'require', compiled)(exports, name => name === 'react' ? react : require(name));
  const tree = exports.MorningBrief(props);
  const all = node => [node, ...[node?.props?.children].flat(Infinity).filter(n => n && typeof n === 'object').flatMap(all)];
  return { exports, tree, nodes: all(tree), refs, effects };
}
test('opening focuses the card, Escape closes, focus returns to the Brief trigger', async () => {
  const window = new Window(); globalThis.document = window.document; globalThis.requestAnimationFrame = fn => fn();
  try {
    window.document.body.innerHTML = '<button id="morning-brief-trigger">Brief</button><section id="card" tabindex="-1"></section>';
    let closed = 0;
    const h = harness({ nationName: 'Kindle', sections: [], onNavigate() {}, onClose() { closed++; } });
    assert.equal(h.tree.props.tabIndex, -1); assert.equal(h.tree.props.role, 'dialog');
    h.refs[0].current = window.document.getElementById('card');
    const cleanup = h.effects[0]();
    assert.equal(window.document.activeElement.id, 'card');
    let stopped = 0; h.tree.props.onKeyDown({ key: 'Tab', stopPropagation() { stopped++; } }); assert.equal(closed, 0);
    h.tree.props.onKeyDown({ key: 'Escape', stopPropagation() { stopped++; } }); assert.equal(closed, 1); assert.equal(stopped, 1);
    cleanup();
    assert.equal(window.document.activeElement.id, h.exports.MORNING_BRIEF_TRIGGER_ID);
  } finally { delete globalThis.document; delete globalThis.requestAnimationFrame; window.close(); }
});
test('Brief trigger keeps an accessible name and a visible icon when the label is hidden at <=1100px', async () => {
  const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  const trigger = page.match(/<button id=\{MORNING_BRIEF_TRIGGER_ID\}[^]*?<\/button>/)?.[0];
  assert.ok(trigger);
  assert.match(trigger, /aria-label="Open morning brief"/);
  assert.match(trigger, /<Newspaper [^>]*aria-hidden="true"/);
  assert.match(trigger, /aria-expanded=\{morningBriefOpen\}/);
  const css = await readFile(new URL('../app/game-shell.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /\.game-glossary svg\{[^}]*display:none/);
});

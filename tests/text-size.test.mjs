/** Text size (#80): the setting, the root variable and CSS coverage. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { Window } from 'happy-dom';
const require = createRequire(import.meta.url);
const app = new URL('../app/', import.meta.url);
const read = f => readFile(new URL(f, app), 'utf8');
// Documented exceptions: Clerk derives its own type scale from one base size (providers.tsx);
// scaling it with calc() breaks Clerk's internal math, so the auth widgets stay at their own size.
const allowInlineFontSize = ['providers.tsx'];

test('no unscaled font sizes remain in app CSS (px, clamp and font shorthand)', async () => {
  for (const f of (await readdir(app)).filter(f => f.endsWith('.css'))) {
    const css = await read(f);
    assert.doesNotMatch(css, /font-size:\s*\d+(\.\d+)?px/, `${f}: unscaled px font-size`);
    assert.doesNotMatch(css, /font-size:\s*clamp\(/, `${f}: unscaled clamp font-size`);
    assert.doesNotMatch(css, /font:\s*(\d{3}\s+)?\d+(\.\d+)?px/, `${f}: unscaled font shorthand`);
  }
  for (const f of (await readdir(app)).filter(f => f.endsWith('.tsx') && !allowInlineFontSize.includes(f))) assert.doesNotMatch(await read(f), /fontSize\s*:\s*['"]?\d/, `${f}: inline px fontSize`);
});

test('fixed text boxes that clipped at 150% scale with the text or grow (dock, HUD rows, crest, marks)', async () => {
  const shell = (await read('game-shell.css')), g = await read('globals.css');
  assert.doesNotMatch(shell, /\.game-dock\{[^}]*[;{]height:\d+px/, 'dock uses min-height');
  assert.doesNotMatch(shell, /\.game-dock button\{[^}]*[;{]height:\d+px/, 'dock buttons use min-height');
  assert.doesNotMatch(shell, /grid-template-rows:\d+px/, 'mobile HUD/dock rows scale');
  assert.doesNotMatch(shell, /--hud-height:\d+px|--context-height:\d+px/);
  assert.doesNotMatch(shell, /\.game-crest\{[^}]*width:\d+px/);
  assert.doesNotMatch(g, /\.brand-mark \{ width: \d+px/);
  assert.doesNotMatch(g, /\.nation-document-mark\{[^}]*width:\d+px/);
});

test('changing the setting updates --text-scale on <html> and computed font sizes scale', async () => {
  const compiled = ts.transpileModule(await read('display-preferences.tsx'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
  const window = new Window(); globalThis.document = window.document;
  try {
    const effects = []; let textScale = 150;
    const react = { createContext: v => ({ Provider: 'p', v }), useContext: () => ({ preferences: { textScale } }), useEffect: f => effects.push(f), useState: v => [v, () => {}] };
    const exports = {}; new Function('exports', 'require', compiled)(exports, n => n === 'react' ? react : n === '../lib/display-preferences' ? require('../lib/display-preferences.ts') : n === 'react/jsx-runtime' ? { jsx: (t, p) => ({ t, p }), jsxs: (t, p) => ({ t, p }) } : require(n));
    const tree = exports.DisplayPreferencesProvider({ children: null });
    const node = [tree.p.children].flat().find(c => c?.t?.name === 'TextScalePreference'); node.t();
    const cleanup = effects.at(-1)();
    const root = window.document.documentElement;
    assert.equal(root.style.getPropertyValue('--text-scale'), '1.5');
    assert.equal(root.dataset.harimuTextScale, '150');
    cleanup(); assert.equal(root.style.getPropertyValue('--text-scale'), '');
  } finally { delete globalThis.document; window.close(); }
});

test('Settings has a labelled Text size select with 100/125/150% that saves with display preferences', async () => {
  const settings = await read('game-settings.tsx');
  assert.match(settings, /<label>Text size <select value=\{String\(preferences\.textScale\?\?100\)\}/);
  assert.match(settings, /save\(\{\.\.\.preferences,textScale:Number\(event\.target\.value\)/);
  assert.deepEqual(require('../lib/display-preferences.ts').textScales, [100, 125, 150]);
});

test('HUD, mobile top bar, resources, context strip and dock size to their content (no fixed heights win)', async () => {
  const css = (await read('game-shell.css')).replace(/\s+/g, '');
  // The last matching declaration wins; check the final rule block appended for #80.
  const tail = css.slice(css.lastIndexOf('/*Textsize(#80'));
  assert.match(tail, /\.game-hud\{height:auto;min-height:calc\(62px\*var\(--text-scale,1\)\)\}/);
  const mobile = tail.slice(tail.indexOf('@media(max-width:760px)'));
  for (const sel of ['game-hud', 'game-resources', 'game-context-strip']) assert.match(mobile, new RegExp(`\\.${sel}\\{height:auto;min-height:calc\\(`), sel);
  assert.match(mobile, /\.game-dockbuttonspan\{overflow-wrap:anywhere/, 'dock labels wrap instead of overflowing');
  for (const rows of css.match(/grid-template-rows:[^;}]*/g).filter(r => r.includes('260px') || r.includes('620px'))) {
    assert.ok(rows.startsWith('grid-template-rows:autominmax(calc(40px*var(--text-scale,1)),auto)'), rows);
    assert.doesNotMatch(rows, /\)\s*calc\(\d+px/, `${rows}: fixed context row`);
  }
});

test('mobile HUD wraps instead of clipping, and the context strip grows with its text (QA3 #131 review)', async () => {
  const css = (await read('game-shell.css')).replace(/\s+/g, '');
  const tail = css.slice(css.lastIndexOf('/*Textsize(#80'));
  assert.doesNotMatch(css, /\.harimu-game\{overflow-x:clip\}/, 'overflow must not be hidden with overflow-x:clip');
  assert.match(tail, /\.game-resources\{[^}]*flex-wrap:wrap/);
  assert.match(tail, /\.game-resources>\*,\.game-resources>\.game-hud-help\{min-width:0;flex:11calc\(72px\*var\(--text-scale,1\)\)\}/);
  assert.match(tail, /\.harimu-game:has\(\.citizen-dock\)\.game-context-strip,\.game-mode-world\.game-context-strip\{height:auto;min-height:calc\(120px\*var\(--text-scale,1\)\)/);
  assert.match(tail, /\.game-context-heading:is\(h2,small,span\)[^{]*\{overflow-wrap:normal;word-break:normal;hyphens:manual\}/);
  assert.doesNotMatch(css, /word-break:break-all/);
});

test('desktop 150%: whole-word wrap applies at all widths and resource items size to content (QA3 #131 review 2)', async () => {
  const css = (await read('game-shell.css')).replace(/\s+/g, '');
  const tail = css.slice(css.lastIndexOf('/*Textsize(#80'));
  const global = tail.slice(0, tail.indexOf('@media(max-width:760px)'));
  assert.match(global, /\.game-context-heading:is\(h2,small,span\),\.game-context-items:is\(strong,span\)\{overflow-wrap:normal;word-break:normal;hyphens:manual\}/);
  assert.doesNotMatch(css, /\.game-context-headingh2[^{]*\{overflow-wrap:anywhere\}/);
  assert.match(global, /\.game-resources\{min-width:max-content\}\.game-resources>\*\{flex:00auto\}/);
  assert.match(global, /\.game-resources>div,\.game-resources>\.game-hud-help>summary,\.game-resources>\.game-wallet-button\{min-width:max-content\}/);
});

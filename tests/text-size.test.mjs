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

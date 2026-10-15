// #528: phone (<=760px) controls are at least 44x44 CSS px. The rendered measurements live in scripts/phone-tap-targets-check.mjs
// (npm run test:layout, headless Chromium); this browser-free test pins the CSS contract and the wiring, so it cannot be dropped silently.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
const css = await readFile(new URL('../app/game-shell.css', import.meta.url), 'utf8');
const start = css.indexOf('/* #528 phones');
const open = css.indexOf('@media(max-width:760px){', start);
// The block is one media query: find its closing brace by counting braces.
let depth = 0, end = open;
for (let i = open; i < css.length; i++) { if (css[i] === '{') depth++; if (css[i] === '}' && --depth === 0) { end = i; break; } }
const block = css.slice(open, end + 1).replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...block.slice(block.indexOf('{') + 1, -1).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({ selector: selector.trim().replace(/\s+/g, ' '), body }));
const rule = fragment => rules.find(r => r.selector.includes(fragment));

test('#528: the phone tap-target rules sit in one max-width:760px media block, so desktop is unchanged', () => {
  assert.ok(start > 0 && open > start, 'the #528 comment and media block exist');
  assert.ok(rules.length >= 15, `expected the full rule list, got ${rules.length}`);
  assert.ok(!css.slice(0, start).includes('#528'), 'no #528 rule outside the phone media block');
});

test('#528: top bar, breadcrumb, tab and dock controls are at least 44px on phones', () => {
  for (const [fragment, props] of [
    ['.game-account .game-glossary', ['min-width:44px', 'min-height:44px']],
    ['.game-account>.game-settings-button', ['width:44px', 'min-width:44px', 'min-height:44px']],
    ['.game-account .account-sign-in', ['min-width:44px', 'min-height:44px']],
    ['.game-account .game-notifications', ['min-width:44px', 'min-height:44px']],
    ['.game-account>.game-hud-help>summary', ['min-width:44px', 'min-height:44px']],
    ['.game-resources>.game-hud-help>summary', ['min-height:44px']],
    ['.game-hud>.game-identity', ['min-width:calc(120px*var(--text-scale,1))']],
    ['.game-breadcrumbs button', ['min-width:44px', 'min-height:44px']],
    ['.game-shift-chip', ['min-height:44px']],
    ['.game-dock button', ['min-height:max(44px,']],
    ['.citizen-dock>button', ['min-height:44px']],
    ['.game-inspector-body summary', ['min-height:44px']],
    ['.game-stage .viewport-controls button', ['min-width:44px', 'min-height:44px']],
  ]) {
    const r = rule(fragment);
    assert.ok(r, `no phone rule for ${fragment}`);
    for (const p of props) assert.ok(r.body.replace(/\s+/g, '').includes(p), `${fragment} must set ${p}`);
  }
  assert.match(block, /\.citizen-dock\{height:45px\}/, 'the 44px buttons fit inside the dock with its 1px top border');
  assert.match(block, /\.game-stage \.game-viewport\{display:flex;flex-direction:column\}/);
});

test('#528: the camera bar is a strip under the canvas on phones, never an overlay that can cover a globe label', () => {
  const bar = rule('.game-stage .viewport-controls,');
  assert.ok(bar, 'a phone rule for the camera bar');
  assert.match(bar.body, /position:static/);
  assert.match(css.slice(0, start), /\.viewport-controls,\.has-inspector \.viewport-controls\{position:absolute/, 'desktop keeps the overlay');
  assert.match(rule('.game-stage .viewport-canvas').body, /height:auto!important/);
});

test('#528: the breadcrumb and shift chip stack in the stage cell, not at fixed top offsets', () => {
  const overlay = rules.find(r => r.selector === '.harimu-game .game-stage-overlay');
  assert.ok(overlay);
  assert.match(overlay.body, /grid-row:3/); assert.match(overlay.body, /flex-direction:column/); assert.match(overlay.body, /pointer-events:none/);
  assert.match(rules.find(r => r.selector === '.harimu-game .game-stage-overlay>*').body, /position:static/);
});

test('#528: the rendered check is wired into npm run test:layout', async () => {
  const layout = await readFile(new URL('../scripts/hud-layout-check.mjs', import.meta.url), 'utf8');
  assert.match(layout, /import \{ checkPhoneTapTargets \} from '\.\/phone-tap-targets-check\.mjs'/);
  assert.match(layout, /await checkPhoneTapTargets\(\{ browser, css, preflight, failures, rows \}\)/);
  const check = await readFile(new URL('../scripts/phone-tap-targets-check.mjs', import.meta.url), 'utf8');
  for (const size of ['[1280, 800]', '[390, 844]', '[320, 640]']) assert.ok(check.includes(size), `check covers ${size}`);
  assert.match(check, /\[1, 1\.25, 1\.5\]/);
  assert.match(check, /clock text overlaps the identity text/, 'the probe measures the clock text against the identity text');
});

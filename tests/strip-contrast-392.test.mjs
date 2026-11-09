/** #392: nation-strip detail text clears WCAG AA on the chip, including hover and the selected state.
 *  The shared detail colour is .game-context-items span (#a1bdc5). On the selected chip that pair is under 4.5.
 *  --strip-detail applies only on .game-nation-strip (the legacy strip and the UI_V2_WORLD crest chips). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { accentContrast, ACCENT_TEXT_AA } from '../lib/nation-accent.ts';

const css = await readFile(new URL('../app/game-shell.css', import.meta.url), 'utf8');
const hex = re => { const m = css.match(re); assert.ok(m, String(re)); return m[1]; };

test('strip detail token clears 4.5:1 on the resting, hover and selected chip', () => {
  const detail = hex(/\.game-nation-strip\{--strip-detail:(#[0-9a-fA-F]{6})\}/);
  const rest = hex(/\.game-context-items>button\{[^}]*background:(#[0-9a-fA-F]{6})/);
  const hover = hex(/\.game-context-items>button:hover\{background:(#[0-9a-fA-F]{6})/);
  const selected = hex(/\.game-context-items>button\[aria-pressed=true\]\{[^}]*background:(#[0-9a-fA-F]{6})/);
  const previous = hex(/\.game-context-items span\{[^}]*color:(#[0-9a-fA-F]{6})/);
  assert.equal(previous, '#a1bdc5', 'other context strips keep the shared detail colour');
  assert.ok(accentContrast(previous, selected) < ACCENT_TEXT_AA, 'the previous detail colour fails on the selected chip');
  for (const [name, bg] of [['rest', rest], ['hover', hover], ['selected', selected]]) {
    const ratio = accentContrast(detail, bg);
    assert.ok(ratio >= ACCENT_TEXT_AA, `${name} ${ratio.toFixed(2)} ${detail} on ${bg}`);
  }
  assert.match(css, /\.game-nation-strip \.game-context-items>button>span\{color:var\(--strip-detail\)\}/);
});

test('other small strip text already clears 4.5:1 on its ground', () => {
  const strip = hex(/\.game-context-strip\{[^}]*background:(#[0-9a-fA-F]{6})/);
  const rest = hex(/\.game-context-items>button\{[^}]*background:(#[0-9a-fA-F]{6})/);
  const hover = hex(/\.game-context-items>button:hover\{background:(#[0-9a-fA-F]{6})/);
  const selected = hex(/\.game-context-items>button\[aria-pressed=true\]\{[^}]*background:(#[0-9a-fA-F]{6})/);
  const name = hex(/\.game-context-items>button\{[^}]*color:(#[0-9a-fA-F]{6})/);
  const pairs = [
    ['heading small', hex(/\.game-context-heading small\{[^}]*color:(#[0-9a-fA-F]{6})/), strip],
    ['heading status', hex(/\.game-context-heading>span\{[^}]*color:(#[0-9a-fA-F]{6})/), strip],
    ['preview badge', hex(/\.nation-preview-badge\{[^}]*color:(#[0-9a-fA-F]{6})/), rest],
    ['preview badge hover', hex(/\.nation-preview-badge\{[^}]*color:(#[0-9a-fA-F]{6})/), hover],
    ['preview badge selected', hex(/\.nation-preview-badge\{[^}]*color:(#[0-9a-fA-F]{6})/), selected],
    ['band', hex(/\.population-band-badge\{[^}]*color:(#[0-9a-fA-F]{6})/), selected],
    ['thriving', hex(/\.population-band-badge\[data-band="Thriving"\]\{[^}]*color:(#[0-9a-fA-F]{6})/), selected],
    ['needs citizens', hex(/\.population-band-badge\[data-band="Needs citizens"\]\{[^}]*color:(#[0-9a-fA-F]{6})/), selected],
    ['coming soon', hex(/\.population-band-badge\[data-band="Coming soon"\]\{[^}]*color:(#[0-9a-fA-F]{6})/), selected],
    ['chip name', name, rest],
    ['chip name hover', name, hover],
    ['chip name selected', name, selected],
  ];
  for (const [label, fg, bg] of pairs) {
    const ratio = accentContrast(fg, bg);
    assert.ok(ratio >= ACCENT_TEXT_AA, `${label} ${ratio.toFixed(2)} ${fg} on ${bg}`);
  }
});

/** #392 S2 (#544): UI v2 top bar, flag NEXT_PUBLIC_HARIMU_UI_V2_TOPBAR (default false). Browser-free pins; the rendered flag-off/emblem-only/on check is scripts/ui-v2-topbar-check.mjs (npm run test:layout). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { uiV2TopbarEnabled, topBarEmblemEnabled } from '../lib/nation-emblem.ts';
const read = p => readFile(new URL(`../${p}`, import.meta.url), 'utf8');

test('the flag is off unless it is exactly "true", and wrangler ships it off', async () => {
  assert.equal(uiV2TopbarEnabled('true'), true);
  for (const v of [undefined, 'false', '', '1', 'TRUE', 'yes']) assert.equal(uiV2TopbarEnabled(v), false);
  assert.match(await read('wrangler.jsonc'), /"NEXT_PUBLIC_HARIMU_UI_V2_TOPBAR":\s*"false"/);
});

test('one code path with #78: the v2 flag implies the emblem and bell, the emblem flag never implies v2', () => {
  assert.equal(topBarEmblemEnabled('false', 'true'), true);
  assert.equal(topBarEmblemEnabled('true', 'false'), true);
  assert.equal(topBarEmblemEnabled('false', 'false'), false);
  assert.equal(topBarEmblemEnabled(undefined, undefined), false);
  assert.equal(uiV2TopbarEnabled('false'), false);
});

test('flag off keeps the exact old header class; v2 only adds game-hud-v2', async () => {
  const shell = await read('app/game-shell.tsx');
  assert.match(shell, /topbarV2 = uiV2TopbarEnabled\(\)/);
  assert.match(shell, /className=\{topbarV2 \? 'game-hud game-hud-v2' : 'game-hud'\}/);
  assert.doesNotMatch(shell, /className="game-hud"/);
});

test('every S2 CSS rule is scoped to .game-hud-v2, so flag off is untouched', async () => {
  const css = await read('app/game-shell.css'), start = css.indexOf('/* #392 S2:');
  assert.ok(start > 0, 'S2 marker present');
  const block = css.slice(start).replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...block.matchAll(/(?:^|\})\s*(@media[^{]*\{)?\s*([^{}@]+)\{/g)].map(m => m[2].trim()).filter(Boolean);
  assert.ok(rules.length >= 8, `found ${rules.length} rules`);
  for (const sel of rules) for (const part of sel.split(',')) assert.match(part.trim(), /^\.game-hud-v2\b/, `unscoped selector: ${part.trim()}`);
});

test('the restyle adds no copy: no new text content in the S2 block, and the Account button keeps its own label', async () => {
  const css = await read('app/game-shell.css'), block = css.slice(css.indexOf('/* #392 S2:')).replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of block.matchAll(/content:\s*([^;}]+)/g)) assert.equal(m[1].trim(), "''", `S2 CSS must not inject text: ${m[1]}`);
  assert.match(await read('app/account-menu.tsx'), />Account<\/button>/);
});

test('the S2 check is wired into the layout run', async () => {
  assert.match(await read('scripts/hud-layout-check.mjs'), /checkUiV2Topbar\(\{ browser, css, preflight, failures, rows \}\)/);
});

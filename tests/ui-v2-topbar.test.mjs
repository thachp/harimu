/** #392 S2 (#544): UI v2 top bar, flag NEXT_PUBLIC_HARIMU_UI_V2_TOPBAR (default false). Browser-free pins; the rendered flag-off/emblem-only/on check is scripts/ui-v2-topbar-check.mjs (npm run test:layout). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { uiV2TopbarEnabled, topBarEmblemEnabled } from '../lib/nation-emblem.ts';
const read = p => readFile(new URL(`../${p}`, import.meta.url), 'utf8');
/** S2 is the block that starts at its marker and stops at the next comment. #1257 appends the crest strip after it; those rules are not S2. */
const s2Block = css => { const start = css.indexOf('/* #392 S2:'), next = css.indexOf('/*', css.indexOf('*/', start) + 2); return css.slice(start, next < 0 ? undefined : next); };

test('the flag is off unless it is exactly "true", and wrangler has it on in preview and off in production', async () => {
  assert.equal(uiV2TopbarEnabled('true'), true);
  for (const v of [undefined, 'false', '', '1', 'TRUE', 'yes']) assert.equal(uiV2TopbarEnabled(v), false);
  assert.match(await read('wrangler.jsonc'), /"NEXT_PUBLIC_HARIMU_UI_V2_TOPBAR":\s*"true"/);
  assert.match(await read('wrangler.prod.jsonc'), /"NEXT_PUBLIC_HARIMU_UI_V2_TOPBAR":\s*"false"/);
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
  const block = s2Block(css).replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...block.matchAll(/(?:^|\})\s*(@media[^{]*\{)?\s*([^{}@]+)\{/g)].map(m => m[2].trim()).filter(Boolean);
  assert.ok(rules.length >= 8, `found ${rules.length} rules`);
  for (const sel of rules) for (const part of sel.split(',')) assert.match(part.trim(), /^\.game-hud-v2\b/, `unscoped selector: ${part.trim()}`);
});

test('the restyle adds no copy: no new text content in the S2 block, and the Account button keeps its own label', async () => {
  const css = await read('app/game-shell.css'), block = s2Block(css).replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of block.matchAll(/(^|[;{\s])content\s*:\s*([^;}]+)/g)) assert.equal(m[2].trim(), "''", `S2 CSS must not inject text: ${m[2]}`);
  assert.match(await read('app/account-menu.tsx'), />Account<\/button>/);
});

test('the S2 check is wired into the layout run', async () => {
  assert.match(await read('scripts/hud-layout-check.mjs'), /checkUiV2Topbar\(\{ browser, css, preflight, failures, rows \}\)/);
});

test('every esbuild harness that bundles the shell defines the top-bar flag (topBarEmblemEnabled reads it, so a missing define throws "process is not defined" in the browser; same class as #571)', async () => {
  const { readdir } = await import('node:fs/promises'), dir = new URL('../scripts/', import.meta.url), bundlers = [];
  for (const f of await readdir(dir)) { if (!f.endsWith('.mjs')) continue; const src = await readFile(new URL(f, dir), 'utf8'); if (/from 'esbuild'/.test(src) && /\bdefine\s*:/.test(src)) bundlers.push([f, src]); }
  assert.ok(bundlers.length >= 2, 'found the shell bundlers');
  for (const [f, src] of bundlers) assert.match(src, /['"]process\.env\.NEXT_PUBLIC_HARIMU_UI_V2_TOPBAR['"]/, `${f} must define NEXT_PUBLIC_HARIMU_UI_V2_TOPBAR`);
});

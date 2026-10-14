import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const css = async f => (await readFile(new URL(`../app/${f}`, import.meta.url), 'utf8')).replace(/\s+/g, ' ');

test('OS reduced motion stops transitions and animations globally, not only inside the game shell', async () => {
  const g = await css('globals.css');
  const block = g.match(/@media \(prefers-reduced-motion: reduce\) \{(.*?\}) \}/)?.[1] ?? '';
  for (const rule of ['transition-duration: .01ms', 'animation-duration: .01ms', 'animation-iteration-count: 1', 'scroll-behavior: auto']) assert.ok(block.includes(rule), rule);
  assert.match(block, /\*::before/); assert.match(block, /::backdrop/);
  const shell = await css('game-shell.css');
  assert.match(shell, /html\[data-harimu-motion="reduce"\] \*[^{]*\{[^}]*transition:none!important;animation:none!important/, 'Settings > Motion = Reduce still applies');
});
test('focus-visible baseline covers buttons, links, form fields, summaries and tabbable widgets', async () => {
  const g = await css('globals.css');
  const rule = g.match(/:is\(([^)]*\([^)]*\)[^)]*)\):focus-visible \{([^}]*)\}/);
  assert.ok(rule, 'baseline rule present');
  for (const sel of ['button', 'a[href]', 'input', 'select', 'textarea', 'summary', '[role="button"]']) assert.ok(rule[1].includes(sel), sel);
  assert.match(rule[2], /outline: 2px solid/);
  assert.doesNotMatch(g + await css('game-shell.css'), /:focus-visible\s*\{[^}]*outline:\s*(none|0)\b/, 'no rule removes the focus-visible ring');
});
test('top bar, account, work, market and dock primary controls are native, tabbable buttons', async () => {
  const src = f => readFile(new URL(`../app/${f}`, import.meta.url), 'utf8');
  const dock = await src('citizen-dock.tsx'); assert.match(dock, /<nav className="citizen-dock"[^>]*><button type="button"/);
  assert.match(await src('account-menu.tsx'), /<button ref=\{trigger\}[^>]*type="button"/);
  for (const f of ['game-shell.tsx', 'citizen-dock.tsx', 'account-menu.tsx', 'work-shift-board.tsx', 'citizen-market.tsx']) {
    const s = await src(f);
    assert.doesNotMatch(s, /<(div|span|li)[^>]*\sonClick=/, `${f}: no click-only non-button controls`);
  }
});

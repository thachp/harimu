// #452: the Clerk account menu must not cut off the email. The rendered proof is scripts/account-menu-layout-check.mjs (npm run test:layout);
// this browser-free test pins the contract so it cannot be dropped silently.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const [tsx, css, layout, check] = await Promise.all([read('app/account-menu.tsx'), read('app/account-menu.module.css'), read('scripts/hud-layout-check.mjs'), read('scripts/account-menu-layout-check.mjs')]);

test('#452: the real menu passes wrapping classes for the name, the email and their container to Clerk', () => {
  assert.match(tsx, /userPreviewTextContainer:styles\.previewText/);
  assert.match(tsx, /userPreviewMainIdentifier:styles\.previewIdentifier/);
  assert.match(tsx, /userPreviewSecondaryIdentifier:styles\.previewIdentifier/);
  assert.match(tsx, /userButtonPopoverCard:styles\.menu/, 'the existing card class is kept');
});

test('#452: those classes beat Clerk\'s nowrap + hidden + ellipsis (all !important) and let the email wrap', () => {
  const rule = css.match(/\.previewIdentifier\{([^}]*)\}/)?.[1] ?? '';
  for (const decl of ['overflow:visible!important', 'text-overflow:clip!important', 'white-space:normal!important', 'overflow-wrap:break-word!important']) assert.ok(rule.includes(decl), `previewIdentifier must set ${decl}`);
  assert.match(css, /\.previewText\{[^}]*min-width:0!important;overflow:visible!important/);
});

test('#452: the menu widens with the text size, capped to the screen, and phones keep the full-width rule', () => {
  assert.match(css, /\.dialog\{[^}]*width:min\(calc\(380px \* var\(--text-scale, 1\)\),calc\(100vw - 32px\)\)/);
  assert.match(css, /@media\(max-width:760px\)\{.*\.dialog\{[^}]*width:calc\(100vw - 32px\)/);
});

test('#452: the rendered check covers 1280/390/320 at 100/125/150% and is wired into test:layout', () => {
  assert.match(layout, /import \{ checkAccountMenu \} from '\.\/account-menu-layout-check\.mjs'/);
  assert.match(layout, /await checkAccountMenu\(\{ browser, css, preflight, failures, rows \}\)/);
  for (const size of ['[1280, 800]', '[390, 844]', '[320, 640]']) assert.ok(check.includes(size));
  assert.match(check, /\[1, 1\.25, 1\.5\]/);
  assert.match(check, /email still truncates/);
});

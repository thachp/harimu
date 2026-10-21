/** #682 (top-bar bell is an empty box on phones) and #683 (emblem glyph tiny and off-centre): CSS-only fixes, checked on the stylesheet's rule order and specificity. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const css = readFileSync('app/game-shell.css', 'utf8');

test('#682: at phone width the top-bar bell shows its icon again, after the legacy rule that hides it', () => {
  const hide = css.indexOf('.game-notifications>svg{display:none}');
  const show = css.indexOf('.game-notifications-topbar>svg{display:block;flex:none;width:16px;height:16px}');
  assert.ok(hide > 0 && show > hide, 'the top-bar rule comes later, so it wins at equal specificity (0,1,1)');
  const media = css.lastIndexOf('@media(max-width:760px){', show);
  assert.ok(media > 0 && !css.slice(media, show).includes('}}'), 'scoped to the same phone breakpoint');
  assert.ok(!/\.game-notifications(-topbar)?>svg\{display:none\}/.test(css.slice(show)), 'nothing hides it again later');
  assert.ok(css.slice(media, show).includes('.game-notifications-topbar{flex-shrink:0;white-space:nowrap;box-sizing:border-box;width:44px;max-width:44px;padding:0}'), 'fixed 44px, font-independent: the icon cannot widen the button and wrap the v2 bar (CI fonts, 390x844 @125%)');
});

test('#683: the emblem rule outranks `.game-identity span:not(.game-crest)` and restores inline-grid, centring and 13px', () => {
  const generic = css.indexOf('.game-identity span:not(.game-crest){display:block');
  const fix = css.indexOf('.game-identity span.nation-emblem{');
  assert.ok(generic > 0 && fix > generic, 'same specificity (0,2,1), declared later');
  const body = css.slice(fix, css.indexOf('}', fix));
  for (const decl of ['flex-shrink:0', 'display:inline-grid', 'place-items:center', 'margin-top:0', 'font-size:calc(13px * var(--text-scale, 1))', 'max-width:none', 'overflow:visible'])
    assert.ok(body.includes(decl), decl);
  assert.ok(!/\.game-identity span(:not\(\.game-crest\))?\{[^}]*display:block/.test(css.slice(fix)), 'no later generic rule turns it back into a block');
});

test('no phone grid or shell chrome changes: the grid templates are untouched', () => {
  assert.match(css, /grid-template-rows:auto minmax\(calc\(40px \* va/);
});

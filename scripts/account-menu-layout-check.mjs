/** #452 check: the Clerk account menu never cuts off the email, at 100/125/150% text, 1280x800 and 390x844 (and 320 wide).
 *  Bundles the real AccountMenu (native dialog, appearance classes, CSS module) with the shipped CSS in headless Chromium. Clerk's own
 *  popover can't be loaded on the box (it needs clerk-js and a live key), so a stub `useClerk().mountUserButton` builds markup with Clerk's
 *  class names (cl-userPreview*, cl-userButtonPopover*) and Clerk's truncating rules (nowrap + hidden + ellipsis) at single-class specificity,
 *  and applies the appearance classes the real component passes in: if those classes stop winning, the email is cut off again and this fails.
 *  Fails when: the email is not fully readable (ellipsis, clipped, outside the card), the menu leaves the screen, or the page scrolls sideways.
 *  Used by hud-layout-check.mjs (npm run test:layout). Screenshots: LAYOUT_SHOTS_DIR=docs/screenshots/452 (ACCOUNT_MENU_BEFORE=1 names them "before"). */
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const email = 'harimuqa+harimu@mail.grokbot.com';
const entry = `
  import React from 'react'; import { createRoot } from 'react-dom/client'; import { AccountMenu } from './app/account-menu.tsx';
  window.mountMenu = () => { createRoot(document.getElementById('root')).render(<div className="game-account"><div className="account-control"><AccountMenu /></div></div>); };`;
const clerkStub = `
  export const useClerk = () => ({
    user: { fullName: 'QA Tester', primaryEmailAddress: { emailAddress: ${JSON.stringify(email)} } },
    mountUserButton(el, { appearance: { elements: e = {} } = {} }) {
      const c = k => (e[k] ? ' ' + e[k] : '');
      el.innerHTML = '<div class="cl-userButtonPopoverCard' + c('userButtonPopoverCard') + '"><div class="cl-userPreview"><span class="cl-avatarBox"><img class="cl-userButtonAvatarImage" alt="" width="40" height="40"></span><div class="cl-userPreviewTextContainer' + c('userPreviewTextContainer') + '"><p class="cl-userPreviewMainIdentifier' + c('userPreviewMainIdentifier') + '">QA Tester</p><p class="cl-userPreviewSecondaryIdentifier' + c('userPreviewSecondaryIdentifier') + '">${email}</p></div></div><button type="button" class="cl-userButtonPopoverActionButton">Manage account</button><button type="button" class="cl-userButtonPopoverActionButton">Sign out</button><div class="cl-userButtonPopoverFooter' + c('userButtonPopoverFooter') + '">Secured by Clerk</div></div>';
    },
    unmountUserButton(el) { el.innerHTML = ''; },
  });`;
// Clerk's own rules, as emotion class selectors (specificity 0,1,0): they truncate, so only !important overrides can beat them.
const clerkCss = `.cl-userButtonPopoverCard{padding:16px;display:block}.cl-userPreview{display:flex;gap:12px;align-items:center;padding-bottom:12px}.cl-avatarBox{flex:none}
  .cl-userPreviewTextContainer{min-width:0;flex:1 1 0;overflow:hidden}.cl-userPreviewMainIdentifier,.cl-userPreviewSecondaryIdentifier{margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:calc(14px * var(--text-scale, 1))}
  .cl-userButtonPopoverActionButton{display:block;width:100%;min-height:36px;text-align:left;color:#f3ecd8;font-size:calc(13px * var(--text-scale, 1))}.cl-userButtonPopoverFooter{font-size:calc(11px * var(--text-scale, 1))}`;

async function bundle() {
  const result = await build({
    stdin: { resolveDir: root, loader: 'tsx', contents: entry }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', target: 'es2022', logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_CREST': '"false"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_TOPBAR': '"false"' , 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_PANEL': '\"false\"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_RAIL': '\"false\"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_WORLD': '\"false\"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_NATION': '\"false\"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_CITY': '\"false\"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_MOBILE': '\"false\"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_HOUSEHOLD': '\"false\"', 'process.env.NEXT_PUBLIC_HARIMU_MOD_CONSOLE': '"false"', 'process.env.NEXT_PUBLIC_HARIMU_NATION_SKIN': '\"false\"', 'process.env.NEXT_PUBLIC_HARIMU_WIRE_BYLINES': '\"false\"', 'process.env.NEXT_PUBLIC_HARIMU_RARE_MARKER': '\"false\"', 'process.env.NEXT_PUBLIC_HARIMU_TOPBAR_COUNTDOWN': '\"false\"'}, alias: { '@': root.replace(/\/$/, '') }, loader: { '.css': 'empty' },
    plugins: [{ name: 'stubs', setup(b) {
      b.onResolve({ filter: /^@clerk\/nextjs$/ }, a => ({ path: a.path, namespace: 'stub' }));
      b.onResolve({ filter: /\.module\.css$/ }, () => ({ path: 'css-module', namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: a.path === 'css-module' ? 'export default new Proxy({}, { get: (_, k) => String(k) })' : clerkStub, loader: 'jsx', resolveDir: root }));
    } }],
  });
  return result.outputFiles[0].text;
}

/** Runs in the page, with the menu open. */
const probe = email => {
  const vw = document.documentElement.clientWidth, vh = window.innerHeight, issues = [];
  const dialog = document.querySelector('dialog'), card = dialog?.querySelector('.cl-userButtonPopoverCard'), el = dialog?.querySelector('.cl-userPreviewSecondaryIdentifier');
  if (!dialog?.open || !card || !el) return { issues: ['account menu did not open'] };
  const d = dialog.getBoundingClientRect(), c = card.getBoundingClientRect();
  if (d.left < -0.5 || d.right > vw + 0.5 || d.top < -0.5) issues.push(`menu leaves the screen (${Math.round(d.left)} to ${Math.round(d.right)} of ${vw})`);
  if (document.documentElement.scrollWidth > vw + 1) issues.push('page scrolls sideways');
  if (el.textContent !== email) issues.push('email text changed');
  const cs = getComputedStyle(el);
  if (cs.textOverflow === 'ellipsis' || cs.overflow !== 'visible' || cs.whiteSpace === 'nowrap') issues.push(`email still truncates (overflow ${cs.overflow}, text-overflow ${cs.textOverflow}, white-space ${cs.whiteSpace})`);
  const range = document.createRange(); range.selectNodeContents(el);
  const rects = [...range.getClientRects()].filter(x => x.width > 0);
  if (rects.some(x => x.right > c.right + 0.5 || x.left < c.left - 0.5)) issues.push('email text runs outside the menu card');
  if (rects.some(x => x.right > el.getBoundingClientRect().right + 0.5)) issues.push('email text is wider than its own box (clipped)');
  for (const b of dialog.querySelectorAll('.cl-userButtonPopoverActionButton, .cl-userButtonPopoverFooter')) { const r = b.getBoundingClientRect(); if (r.bottom > vh + 0.5 && dialog.scrollHeight <= dialog.clientHeight) issues.push(`"${b.textContent.trim()}" is below the screen`); }
  return { issues, lines: rects.length ? new Set(rects.map(x => Math.round(x.top))).size : 0, menu: `${Math.round(d.width)}px` };
};

export async function checkAccountMenu({ browser, css, preflight, failures, rows }) {
  const script = await bundle();
  const full = css + await readFile(new URL('app/account-menu.module.css', `file://${root}`), 'utf8') + clerkCss;
  const shots = process.env.LAYOUT_SHOTS_DIR, tag = process.env.ACCOUNT_MENU_BEFORE === '1' ? 'before' : 'after';
  for (const [w, h] of [[1280, 800], [390, 844], [320, 640]]) for (const scale of [1, 1.25, 1.5]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const id = `${w}x${h} @${scale * 100}% account menu`;
    await page.setContent(`<!doctype html><html style="--text-scale:${scale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}${full}</style></head><body><div id="root"></div></body></html>`);
    await page.addScriptTag({ content: script });
    await page.evaluate(() => window.mountMenu());
    await page.locator('button[aria-haspopup="dialog"]').click();
    await page.waitForSelector('dialog[open] .cl-userPreviewSecondaryIdentifier');
    const r = await page.evaluate(probe, email);
    for (const i of r.issues) failures.push(`${id}: ${i}`);
    rows.push(`${id}: menu ${r.menu}, email on ${r.lines} line(s)${r.issues.length ? ' ✗ ' + r.issues.join('; ') : ', fully readable'}`);
    if (shots && w !== 320 && (scale === 1 || scale === 1.25 || scale === 1.5)) await page.screenshot({ path: `${shots}/${tag}-menu-${w}-${scale * 100}.png` });
    await page.close();
  }
}

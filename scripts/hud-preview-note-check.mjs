/** #366 check: the "Development preview" label is not in the top bar any more; it is a small note at the bottom of the Game settings
 *  dialog (app/development-preview-note.tsx), shown only when NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW=true.
 *  Bundles the real GameShell with the flag ON and OFF and checks, at 1280x800 and 390x844, 100/125/150% text:
 *  - the top bar (.game-hud) has no "Development preview" text anywhere, and no horizontal overflow
 *  - the account control holds just its button (no stray label stacked above it), and everything stays on-screen
 *  - flag on: opening settings shows the note, readable, unclipped and inside the dialog; flag off: no note at all
 *  Used by hud-layout-check.mjs (npm run test:layout). Screenshots: LAYOUT_SHOTS_DIR=docs/screenshots/366. */
import { bundleShell, shellProps } from './hud-tooltip-check.mjs';

const entry = `
  import React from 'react'; import { createRoot } from 'react-dom/client'; import { GameShell } from './app/game-shell.tsx';
  window.mountShell = props => { const el = document.getElementById('root'); window.__root?.unmount(); window.__root = createRoot(el); window.__root.render(<GameShell {...props} onNavigate={() => {}} accountControls={<div className="account-control"><button className="account-sign-in" type="button">Sign in</button></div>} />); };`;

const topBar = () => {
  const vw = document.documentElement.clientWidth, hud = document.querySelector('.game-hud'), account = document.querySelector('.game-hud .account-control');
  const out = { text: hud.textContent.includes('Development preview'), overflow: hud.scrollWidth - hud.clientWidth, offscreen: [], accountKids: account ? account.children.length : -1, accountExtra: -1 };
  for (const el of hud.querySelectorAll('summary, button, .account-control')) { const r = el.getBoundingClientRect(); if (r.width && (r.left < -0.5 || r.right > vw + 0.5)) out.offscreen.push(el.className || el.tagName); }
  if (account) { const b = account.querySelector('button').getBoundingClientRect(), a = account.getBoundingClientRect(); out.accountExtra = Math.round(a.height - b.height); }
  out.hudHeight = Math.round(hud.getBoundingClientRect().height);
  return out;
};
const note = () => {
  const n = document.querySelector('.development-preview-note'), d = document.querySelector('.game-settings-dialog');
  if (!n) return null;
  n.scrollIntoView({ block: 'end' });
  const r = n.getBoundingClientRect(), dr = d.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = window.innerHeight;
  const range = document.createRange(); range.selectNodeContents(n);
  return { text: n.textContent, inDialog: r.left >= dr.left - 0.5 && r.right <= dr.right + 0.5 && r.top >= dr.top - 0.5 && r.bottom <= dr.bottom + 0.5, onScreen: r.left >= 0 && r.right <= vw && r.top >= 0 && r.bottom <= vh, clipped: n.scrollWidth > n.clientWidth + 1 || [...range.getClientRects()].some(x => x.right > r.right + 0.5), fontPx: parseFloat(getComputedStyle(n).fontSize), height: r.height };
};

export async function checkDevelopmentPreviewNote({ browser, css, preflight, failures, rows }) {
  const scripts = { on: await bundleShell(entry, { NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW: 'true' }), off: await bundleShell(entry, { NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW: 'false' }) };
  const shots = process.env.LAYOUT_SHOTS_DIR;
  for (const [w, h] of [[1280, 800], [390, 844]]) for (const scale of [1, 1.25, 1.5]) for (const flag of ['on', 'off']) {
    const context = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await context.newPage();
    const id = `${w}x${h} @${scale * 100}% preview-note (${flag})`;
    const fail = m => failures.push(`${id}: ${m}`);
    await page.setContent(`<!doctype html><html style="--text-scale:${scale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}${css}</style></head><body><div id="root"></div></body></html>`);
    await page.addScriptTag({ content: scripts[flag] });
    await page.evaluate(props => window.mountShell(props), shellProps);
    await page.waitForSelector('.game-hud .account-control');
    const t = await page.evaluate(topBar);
    if (t.text) fail('the top bar still contains "Development preview"');
    if (t.overflow > 1) fail(`the top bar overflows horizontally by ${t.overflow}px`);
    if (t.offscreen.length) fail(`top-bar items leave the screen: ${t.offscreen.join(', ')}`);
    if (t.accountKids !== 1) fail(`the account control holds ${t.accountKids} children, expected just its button`);
    if (t.accountExtra > 2) fail(`the account control is ${t.accountExtra}px taller than its button (something is stacked above it)`);
    await page.click('.game-settings-button'); await page.waitForSelector('.game-settings-dialog[open]');
    const n = await page.evaluate(note);
    if (flag === 'off') { if (n) fail('the note shows with the development-preview flag off'); }
    else if (!n) fail('the note is missing with the development-preview flag on');
    else {
      if (!n.text.includes('Development preview')) fail(`unexpected note text "${n.text}"`);
      if (!n.inDialog) fail('the note is not inside the settings dialog'); if (!n.onScreen) fail('the note is off-screen'); if (n.clipped) fail('the note text is clipped');
      if (n.fontPx < 11 * scale - 0.5) fail(`the note text is too small (${n.fontPx}px)`);
      if (shots) await page.screenshot({ path: `${shots}/after-preview-note-${w}-${scale * 100}.png` });
    }
    if (flag === 'on' && shots) { await page.keyboard.press('Escape'); await page.screenshot({ path: `${shots}/after-topbar-${w}-${scale * 100}.png`, clip: { x: 0, y: 0, width: w, height: Math.min(h, 160) } }); }
    rows.push(`${id}: top bar ${t.hudHeight}px tall, no label${n ? `, note ${Math.round(n.height)}px tall in the settings dialog` : ', no note'}`);
    await context.close();
  }
}

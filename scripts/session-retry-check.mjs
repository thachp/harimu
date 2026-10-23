/** #928 check: the session-card Retry state (app/session-retry.tsx) in the real GameShell Civic side panel, S4 rail and S8 mobile on as in preview, at 1280x800,
 *  390x844, 320x700 and 320x640, 100/125/150% text. Each Retry card has its status line and one Retry button inside the panel; the button is at least 44px on a
 *  phone and shows a focus ring when tabbed to; nothing is clipped or splits mid-word; no sideways scroll. With LAYOUT_SHOTS_DIR, shots go to docs/screenshots/928.
 *  Used by hud-layout-check.mjs; runs on its own too. */
import { readFile } from 'node:fs/promises';
import { bundleShell, shellProps } from './hud-tooltip-check.mjs';
import { isMain, runStandalone } from './layout-standalone.mjs';

const entry = `
  import React from 'react'; import { createRoot } from 'react-dom/client'; import { GameShell } from './app/game-shell.tsx'; import { SessionRetry } from './app/session-retry.tsx';
  window.mount = props => { window.__root?.unmount(); window.__root = createRoot(document.getElementById('root'));
    window.__root.render(<GameShell {...props} onNavigate={() => {}} onSelectNation={() => {}} accountControls={null}
      panel={<div className="s928-cards"><SessionRetry name="Your unit" onRetry={() => {}} /><SessionRetry name="Kindle presidential debate" onRetry={() => {}} /></div>} />); };`;

/** Runs in the page. */
const probe = () => {
  const issues = [], vw = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > vw + 1) issues.push(`page scrolls sideways by ${document.documentElement.scrollWidth - vw}px`);
  const cards = [...document.querySelectorAll('.game-inspector .s928-cards .session-retry')], panel = document.querySelector('.game-inspector')?.getBoundingClientRect();
  if (cards.length !== 2) issues.push(`${cards.length} Retry cards`);
  for (const card of cards) {
    const inside = r => r.left >= panel.left - 0.5 && r.right <= panel.right + 0.5, buttons = card.querySelectorAll('button');
    if (!card.querySelector('[role=status]')) issues.push('no status line');
    if (buttons.length !== 1) issues.push(`${buttons.length} buttons`);
    for (const b of buttons) { const r = b.getBoundingClientRect(); if (!inside(r)) issues.push(`"${b.textContent}" overflows the panel`); if (vw <= 760 && r.height < 43.5) issues.push(`"${b.textContent}" is ${Math.round(r.height)}px tall`); }
    for (const el of card.querySelectorAll('p, button')) {
      if (!inside(el.getBoundingClientRect()) || el.scrollWidth > el.clientWidth + 1) issues.push(`"${el.textContent}" is clipped or overflows`);
      for (const node of [...el.childNodes].filter(n => n.nodeType === 3)) for (const m of node.textContent.matchAll(/\S+/g)) {
        const range = document.createRange(); range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
        if (new Set([...range.getClientRects()].map(r => Math.round(r.top))).size > 1) issues.push(`"${m[0]}" splits mid-word`);
      }
    }
  }
  return issues;
};

export async function checkSessionRetry({ browser, css, preflight, failures, rows }) {
  const shots = process.env.LAYOUT_SHOTS_DIR, panelCss = await readFile(new URL('../app/panel-v2.css', import.meta.url), 'utf8');
  for (const flag of ['true']) {
    const script = await bundleShell(entry, { NEXT_PUBLIC_HARIMU_UI_V2_PANEL: flag, NEXT_PUBLIC_HARIMU_UI_V2_RAIL: 'true', NEXT_PUBLIC_HARIMU_UI_V2_MOBILE: 'true' }), on = flag === 'true';
    for (const [w, h] of [[1280, 800], [390, 844], [320, 700], [320, 640]]) for (const scale of [1, 1.25, 1.5]) {
      const id = `${w}x${h} @${scale * 100}% #928 session retry `, context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w <= 760 }), page = await context.newPage(); page.setDefaultTimeout(90000);
      await page.setContent(`<!doctype html><html style="--text-scale:${scale}"><head><base href="https://harimu.test/"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}${css}${panelCss}</style></head><body><div id="root"></div></body></html>`);
      await page.addScriptTag({ content: script }); await page.evaluate(p => window.mount(p), { ...shellProps, view: 'government' });
      await page.waitForSelector('.game-inspector', { state: 'attached' });
      await page.waitForTimeout(150);
      if (shots && h !== 640 && scale !== 1.25 && w !== 390) { await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(300); await page.screenshot({ path: `${shots}/session-retry-${w}-${scale * 100}.png` }); } // before the row click scrolls the sheet
      const issues = await page.evaluate(probe);
      { await page.locator('.session-retry button').first().focus(); const ring = await page.evaluate(() => { const cs = getComputedStyle(document.activeElement); return cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2 || cs.boxShadow !== 'none'; }); if (!ring) issues.push('Retry shows no focus ring'); } for (const i of issues) failures.push(`${id}: ${i}`);
      rows.push(`${id}${issues.length ? ' ✗' : ''}`);
      await context.close();
    }
  }
}
if (isMain(import.meta.url)) await runStandalone('#928 session retry', checkSessionRetry);

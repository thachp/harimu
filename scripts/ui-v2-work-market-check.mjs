/** #392 S10 check (#870): the Work and Market panel heads (NEXT_PUBLIC_HARIMU_UI_V2_PANEL) in the real GameShell side panel, S4 rail and S8 mobile on as in preview,
 *  flag off and on, at 1280x800, 390x844, 320x700 and 320x640, 100/125/150% text. Flag on: both heads with their stats, rows and primary sit inside the panel; rows and
 *  the primary are at least 44px on a phone; no text is clipped or splits mid-word. Flag off: no heads. Both: no sideways scroll.
 *  With LAYOUT_SHOTS_DIR, panel shots go to docs/screenshots/392-s10. Used by hud-layout-check.mjs; runs on its own too. */
import { readFile } from 'node:fs/promises';
import { bundleShell, shellProps } from './hud-tooltip-check.mjs';
import { isMain, runStandalone } from './layout-standalone.mjs';

const entry = `
  import React from 'react'; import { createRoot } from 'react-dom/client'; import { GameShell } from './app/game-shell.tsx'; import { MarketSummary, WorkSummary } from './app/scene-panels-v2.tsx';
  window.mount = props => { window.__root?.unmount(); window.__root = createRoot(document.getElementById('root'));
    window.__root.render(<GameShell {...props} onNavigate={() => {}} onSelectNation={() => {}} accountControls={null}
      panel={<div className="s10-heads"><WorkSummary capacity={18} contributions={3} onMarket={() => {}} /><MarketSummary nation={{ id: 'kindle', name: 'Kindle Republic', currency: 'Spark' }} walletMinor={4000} food={6} board listings onHousehold={() => {}} /><section className="scene-work-orders"><h2>Available contributions</h2></section></div>} />); };`;

/** Runs in the page. */
const probe = on => {
  const issues = [], vw = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > vw + 1) issues.push(`page scrolls sideways by ${document.documentElement.scrollWidth - vw}px`);
  const heads = [...document.querySelectorAll('.game-inspector .s10-heads .panel-v2')];
  if (heads.length !== (on ? 2 : 0)) issues.push(`${heads.length} Work/Market heads with the flag ${on ? 'on' : 'off'}`);
  for (const root of heads) {
  const box = root.getBoundingClientRect(), inside = r => r.left >= box.left - 0.5 && r.right <= box.right + 0.5;
  const title = root.querySelector('h2')?.textContent, dts = [...root.querySelectorAll('.panel-v2-stats dt')].map(d => d.textContent).join();
  if (dts !== (title === 'Workplace' ? 'WC,Available contributions' : 'Wallet,Food')) issues.push(`${title}: stats are ${dts}`);
  const buttons = [...root.querySelectorAll('.panel-v2-rows button, .panel-v2-primary')]; if (buttons.length !== (title === 'Workplace' ? 3 : 4)) issues.push(`${title}: ${buttons.length} rows and primary`);
  for (const b of buttons) { const r = b.getBoundingClientRect(); if (!inside(r)) issues.push(`"${b.textContent}" overflows the panel`); if (vw <= 760 && r.height < 43.5) issues.push(`"${b.textContent}" is ${Math.round(r.height)}px tall`); }
  for (const el of root.querySelectorAll('h2, p, dt, dd, .panel-v2-rows button span, .panel-v2-primary span')) {
    if (!inside(el.getBoundingClientRect()) || el.scrollWidth > el.clientWidth + 1) issues.push(`"${el.textContent}" is clipped or overflows`);
    for (const node of [...el.childNodes].filter(n => n.nodeType === 3)) for (const m of node.textContent.matchAll(/\S+/g)) {
      const range = document.createRange(); range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
      if (new Set([...range.getClientRects()].map(r => Math.round(r.top))).size > 1) issues.push(`"${m[0]}" splits mid-word`);
    }
  }
  }
  return issues;
};

export async function checkUiV2WorkMarket({ browser, css, preflight, failures, rows }) {
  const shots = process.env.LAYOUT_SHOTS_DIR, panelCss = await readFile(new URL('../app/panel-v2.css', import.meta.url), 'utf8');
  for (const flag of ['false', 'true']) {
    const script = await bundleShell(entry, { NEXT_PUBLIC_HARIMU_UI_V2_PANEL: flag, NEXT_PUBLIC_HARIMU_UI_V2_RAIL: 'true', NEXT_PUBLIC_HARIMU_UI_V2_MOBILE: 'true' }), on = flag === 'true';
    for (const [w, h] of [[1280, 800], [390, 844], [320, 700], [320, 640]]) for (const scale of [1, 1.25, 1.5]) {
      const id = `${w}x${h} @${scale * 100}% S10 work and market (flag ${on ? 'on' : 'off'})`, context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w <= 760 }), page = await context.newPage(); page.setDefaultTimeout(90000);
      await page.setContent(`<!doctype html><html style="--text-scale:${scale}"><head><base href="https://harimu.test/"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}${css}${panelCss}</style></head><body><div id="root"></div></body></html>`);
      await page.addScriptTag({ content: script }); await page.evaluate(p => window.mount(p), { ...shellProps, view: 'workplace' });
      await page.waitForSelector('.game-inspector', { state: 'attached' });
      await page.waitForTimeout(150);
      const issues = await page.evaluate(probe, on);
      if (on) { await page.locator('.panel-v2-rows button', { hasText: 'Available contributions' }).click(); // #894: the row moves focus to the section heading
        const f = await page.evaluate(() => { const a = document.activeElement; return a?.matches('.scene-work-orders h2') && a.tabIndex === -1 ? '' : `focus on ${a?.tagName} "${a?.textContent?.slice(0, 30)}"`; }); if (f) issues.push(`row did not move focus: ${f}`); } for (const i of issues) failures.push(`${id}: ${i}`);
      rows.push(`${id}${issues.length ? ' ✗' : ''}`);
      if (shots && h !== 640 && scale !== 1.25 && on) { await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(300); await page.screenshot({ path: `${shots}/s10-work-market-${w}-${scale * 100}.png` }); }
      await context.close();
    }
  }
}
if (isMain(import.meta.url)) await runStandalone('S10 work and market', checkUiV2WorkMarket);

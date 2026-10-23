/** #392 S9 check: the Household panel (NEXT_PUBLIC_HARIMU_UI_V2_HOUSEHOLD) in the real GameShell side panel, Household view, S3 panel, S4 rail and S8 mobile on as in preview,
 *  flag off and on, at 1280x800, 390x844, 320x700 and 320x640, 100/125/150% text. Flag on: Wallet, Food, Residence and Pantry stats and four family cards sit inside the
 *  panel; no text is clipped or splits mid-word; portraits load and are decorative; cards never overflow. Flag off: no Household panel. Both: no sideways scroll.
 *  With LAYOUT_SHOTS_DIR, panel shots go to docs/screenshots/392-s9. Used by hud-layout-check.mjs; runs on its own too. */
import { readFile } from 'node:fs/promises';
import { bundleShell, shellProps } from './hud-tooltip-check.mjs';
import { isMain, runStandalone } from './layout-standalone.mjs';

const entry = `
  import React from 'react'; import { createRoot } from 'react-dom/client'; import { GameShell } from './app/game-shell.tsx'; import { HouseholdSummary } from './app/scene-panels-v2.tsx';
  window.mount = props => { window.__root?.unmount(); window.__root = createRoot(document.getElementById('root'));
    window.__root.render(<GameShell {...props} onNavigate={() => {}} onSelectNation={() => {}} accountControls={null}
      panel={<HouseholdSummary nation={{ name: 'Kindle Republic', currency: 'Spark' }} walletMinor={4000} inventory={[{ item: 'food', quantity: 6 }, { item: 'materials', quantity: 2 }]} residence="Forgehaven" />} />); };`;

/** Runs in the page. */
const probe = on => {
  const issues = [], vw = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > vw + 1) issues.push(`page scrolls sideways by ${document.documentElement.scrollWidth - vw}px`);
  const root = document.querySelector('.game-inspector .household-v2');
  if (on !== Boolean(root)) issues.push(`Household panel ${root ? 'shown' : 'missing'} with the flag ${on ? 'on' : 'off'}`);
  if (!root) return issues;
  const box = root.getBoundingClientRect(), inside = r => r.left >= box.left - 0.5 && r.right <= box.right + 0.5;
  const dts = [...root.querySelectorAll('.panel-v2-stats dt')].map(d => d.textContent).join();
  if (dts !== 'Wallet,Food,Residence,Pantry') issues.push(`stats are ${dts}`);
  const cards = [...root.querySelectorAll('.household-v2-family li')]; if (cards.length !== 4) issues.push(`${cards.length} family cards`);
  for (const c of cards) { const img = c.querySelector('img'), r = c.getBoundingClientRect(), name = c.querySelector('strong')?.textContent;
    if (!inside(r)) issues.push(`${name}: card overflows the panel`);
    if (!img || !img.complete || img.naturalWidth === 0) issues.push(`${name}: portrait did not load`); else if (img.getAttribute('alt') !== '') issues.push(`${name}: portrait is not decorative`); }
  for (const el of root.querySelectorAll('h2, dt, dd, strong, small')) {
    if (!inside(el.getBoundingClientRect()) || el.scrollWidth > el.clientWidth + 1) issues.push(`"${el.textContent}" is clipped or overflows`);
    for (const node of [...el.childNodes].filter(n => n.nodeType === 3)) for (const m of node.textContent.matchAll(/\S+/g)) {
      const range = document.createRange(); range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
      if (new Set([...range.getClientRects()].map(r => Math.round(r.top))).size > 1) issues.push(`"${m[0]}" splits mid-word`);
    }
  }
  return issues;
};

export async function checkUiV2Household({ browser, css, preflight, failures, rows }) {
  const shots = process.env.LAYOUT_SHOTS_DIR, panelCss = await readFile(new URL('../app/panel-v2.css', import.meta.url), 'utf8');
  for (const flag of ['false', 'true']) {
    const script = await bundleShell(entry, { NEXT_PUBLIC_HARIMU_UI_V2_HOUSEHOLD: flag, NEXT_PUBLIC_HARIMU_UI_V2_PANEL: 'true', NEXT_PUBLIC_HARIMU_UI_V2_RAIL: 'true', NEXT_PUBLIC_HARIMU_UI_V2_MOBILE: 'true' }), on = flag === 'true';
    for (const [w, h] of [[1280, 800], [390, 844], [320, 700], [320, 640]]) for (const scale of [1, 1.25, 1.5]) {
      const id = `${w}x${h} @${scale * 100}% S9 household (flag ${on ? 'on' : 'off'})`, context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w <= 760 }), page = await context.newPage(); page.setDefaultTimeout(90000);
      await page.route('**/assets/household/*', r => r.fulfill({ path: new URL(`../public/assets/household/${r.request().url().split('/').pop()}`, import.meta.url).pathname }));
      await page.setContent(`<!doctype html><html style="--text-scale:${scale}"><head><base href="https://harimu.test/"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}${css}${panelCss}</style></head><body><div id="root"></div></body></html>`);
      await page.addScriptTag({ content: script }); await page.evaluate(p => window.mount(p), { ...shellProps, view: 'household' });
      await page.waitForSelector('.game-inspector', { state: 'attached' });
      if (on) await page.waitForFunction(() => [...document.querySelectorAll('.household-v2-family img')].every(i => i.complete && i.naturalWidth > 0), null, { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(150);
      const issues = await page.evaluate(probe, on); for (const i of issues) failures.push(`${id}: ${i}`);
      rows.push(`${id}${issues.length ? ' ✗' : ''}`);
      if (shots && h !== 640 && scale !== 1.25 && on) { await page.addStyleTag({ content: '.game-nav-row{visibility:hidden}' }); await page.locator('.household-v2').scrollIntoViewIfNeeded(); await page.locator('.household-v2').screenshot({ path: `${shots}/s9-household-${w}-${scale * 100}.png` }); }
      await context.close();
    }
  }
}
if (isMain(import.meta.url)) await runStandalone('S9 household', checkUiV2Household);

/** #1063: Veldwood Dividend Day on the top-bar wallet at 320, 390 and 1280, text 100% and 150%.
 *  Words stay whole, the chip stays on screen, and the page does not scroll sideways.
 *  Flag off leaves the chip as SPK only. */
import { bundleShell, shellProps } from './hud-tooltip-check.mjs';
import { isMain, runStandalone } from './layout-standalone.mjs';

const entry = `
  import React from 'react'; import { createRoot } from 'react-dom/client'; import { GameShell } from './app/game-shell.tsx';
  window.mountShell = props => { window.__root?.unmount(); window.__root = createRoot(document.getElementById('root'));
    window.__root.render(<GameShell {...props} onNavigate={() => {}} />); };`;

const year = 30 * 86400, epoch = 1_700_000_000, at = epoch + year;
const veldwood = { id: 'veldwood', name: 'Veldwood', capital: 'Ringhall' };
const clock = { epochSeconds: epoch, nowSeconds: at - 86400, gameDay: 360, latestTick: 0, dividendDayAt: at };
const props = remain => ({ ...shellProps, nation: veldwood, citizenNation: veldwood, localDemo: false, currencyCode: 'SPK', walletMinor: 800, worldClock: clock, dividendNow: (at - remain) * 1000 });

const probe = () => {
  const vw = document.documentElement.clientWidth, issues = [];
  if (document.documentElement.scrollWidth > vw + 1) issues.push(`page scrolls sideways by ${document.documentElement.scrollWidth - vw}px`);
  const summary = document.querySelector('[data-help-id="hud-help-wallet"] > summary');
  if (!summary) return { issues: ['no wallet summary'], text: '', label: '' };
  const r = summary.getBoundingClientRect();
  if (r.left < -0.5 || r.right > vw + 0.5) issues.push(`wallet leaves the screen (${Math.round(r.left)}..${Math.round(r.right)} of ${vw})`);
  const hud = document.querySelector('.game-hud'), dock = document.querySelector('.game-dock');
  if (hud && dock && hud.getBoundingClientRect().bottom > dock.getBoundingClientRect().top + 1) issues.push('HUD runs into the dock');
  const walker = document.createTreeWalker(summary, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) for (const m of node.textContent.matchAll(/\S+/g)) {
    const range = document.createRange(); range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
    if (new Set([...range.getClientRects()].filter(x => x.width > 0).map(x => Math.round(x.top))).size > 1) issues.push(`"${m[0]}" breaks mid-word`);
  }
  return { issues, text: summary.textContent.replace(/\s+/g, ' ').trim(), label: summary.getAttribute('aria-label') || '' };
};

export async function checkVeldwoodWalletDividend({ browser, css, preflight, failures, rows }) {
  const shots = process.env.VELDWOOD_DIVIDEND_SHOTS || '';
  const on = await bundleShell(entry, { NEXT_PUBLIC_HARIMU_VELDWOOD_WALLET_DIVIDEND: 'true', NEXT_PUBLIC_HARIMU_UI_V2_TOPBAR: 'true' });
  const off = await bundleShell(entry, { NEXT_PUBLIC_HARIMU_VELDWOOD_WALLET_DIVIDEND: 'false', NEXT_PUBLIC_HARIMU_UI_V2_TOPBAR: 'true' });
  for (const [w, h] of [[1280, 800], [390, 844], [320, 568]]) for (const scale of [1, 1.5]) {
    const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const id = `${w}x${h} @${scale * 100}%`;
    await page.setContent(`<!doctype html><html style="--text-scale:${scale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}${css}</style></head><body><div id="root"></div></body></html>`);
    await page.addScriptTag({ content: on });
    await page.evaluate(p => window.mountShell(p), props(86400));
    await page.waitForSelector('.game-wallet-dividend-word');
    const result = await page.evaluate(probe);
    if (!/SPK\s*·\s*Dividend Day in 1 day/.test(result.text)) failures.push(`${id}: expected "Dividend Day in 1 day", got "${result.text}"`);
    if (!/1 day real time; 12 days game time/i.test(result.label)) failures.push(`${id}: accessible label missing both times ("${result.label}")`);
    if (/1 days|1 hours|1 minutes/.test(result.label)) failures.push(`${id}: plural where the count is one ("${result.label}")`);
    for (const issue of result.issues) failures.push(`${id}: ${issue}`);
    if (shots && scale === 1.5 && (w === 320 || w === 1280)) await page.screenshot({ path: `${shots}/veldwood-dividend-${w}-${scale * 100}.png`, clip: { x: 0, y: 0, width: w, height: Math.min(h, 280) } });
    rows.push(`${id}: ${result.text}`);
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.setContent(`<!doctype html><html style="--text-scale:1.5"><head><style>${preflight}${css}</style></head><body><div id="root"></div></body></html>`);
  await page.addScriptTag({ content: off });
  await page.evaluate(p => window.mountShell(p), props(86400));
  const hidden = await page.evaluate(probe);
  if (/Dividend Day/i.test(hidden.text) || /Dividend Day/i.test(hidden.label)) failures.push(`flag off still shows "${hidden.text}" / "${hidden.label}"`);
  rows.push('flag off: SPK only');
  await context.close();
}

if (isMain(import.meta.url)) await runStandalone('Veldwood dividend countdown', checkVeldwoodWalletDividend);

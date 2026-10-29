/** #1050: Aurelle top-bar mint parity at 320, 390 and 1280, text 100% and 150%.
 *  Words stay whole, the chip stays on screen, and the page does not scroll sideways.
 *  Flag off, and flag on without a rate, leave the chip as CRN only. */
import { bundleShell, shellProps } from './hud-tooltip-check.mjs';
import { isMain, runStandalone } from './layout-standalone.mjs';

const entry = `
  import React from 'react'; import { createRoot } from 'react-dom/client'; import { GameShell } from './app/game-shell.tsx';
  window.mountShell = props => { window.__root?.unmount(); window.__root = createRoot(document.getElementById('root'));
    window.__root.render(<GameShell {...props} onNavigate={() => {}} />); };`;

const aurelle = { id: 'aurelle', name: 'Aurelle', capital: 'Highspire' };
const mint = { officialRate: { tesseraMilliPerCrown: 500 }, lastDecree: null };
const moved = { officialRate: { tesseraMilliPerCrown: 469 }, lastDecree: { parityBefore: 1000, parityAfter: 1066 } };
const props = (crownMint) => ({ ...shellProps, nation: aurelle, citizenNation: aurelle, localDemo: false, currencyCode: 'CRN', walletMinor: 650, crownMint });

const probe = () => {
  const vw = document.documentElement.clientWidth, issues = [];
  if (document.documentElement.scrollWidth > vw + 1) issues.push(`page scrolls sideways by ${document.documentElement.scrollWidth - vw}px`);
  const summary = document.querySelector('[data-help-id="hud-help-wallet"] > summary');
  if (!summary) return { issues: ['no wallet summary'], text: '', label: '' };
  const r = summary.getBoundingClientRect();
  if (r.left < -0.5 || r.right > vw + 0.5) issues.push(`wallet leaves the screen (${Math.round(r.left)}..${Math.round(r.right)} of ${vw})`);
  const hud = document.querySelector('.game-hud'), dock = document.querySelector('.game-dock');
  if (hud && dock && hud.getBoundingClientRect().bottom > dock.getBoundingClientRect().top + 1) issues.push('HUD runs into the dock');
  for (const other of document.querySelectorAll('.game-resources .game-hud-help > summary, .game-resources > .game-wallet-button')) {
    if (other === summary) continue;
    const o = other.getBoundingClientRect();
    if (r.left < o.right - 0.5 && o.left < r.right - 0.5 && r.top < o.bottom - 0.5 && o.top < r.bottom - 0.5) issues.push(`wallet overlaps "${(other.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 18)}"`);
  }
  const walker = document.createTreeWalker(summary, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) for (const m of node.textContent.matchAll(/\S+/g)) {
    const range = document.createRange(); range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
    if (new Set([...range.getClientRects()].filter(x => x.width > 0).map(x => Math.round(x.top))).size > 1) issues.push(`"${m[0]}" breaks mid-word`);
  }
  return { issues, text: summary.textContent.replace(/\s+/g, ' ').trim(), label: summary.getAttribute('aria-label') || '' };
};

export async function checkAurelleWalletParity({ browser, css, preflight, failures, rows }) {
  const shots = process.env.LAYOUT_SHOTS_DIR;
  const on = await bundleShell(entry, { NEXT_PUBLIC_HARIMU_AURELLE_WALLET_PARITY: 'true', NEXT_PUBLIC_HARIMU_UI_V2_TOPBAR: 'true' });
  const off = await bundleShell(entry, { NEXT_PUBLIC_HARIMU_AURELLE_WALLET_PARITY: 'false', NEXT_PUBLIC_HARIMU_UI_V2_TOPBAR: 'true' });
  const sizes = [[1280, 800], [390, 844], [320, 568]];
  for (const [w, h] of sizes) for (const scale of [1, 1.5]) {
    const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 600 });
    const page = await context.newPage();
    const id = `${w}x${h} @${scale * 100}%`;
    await page.setContent(`<!doctype html><html style="--text-scale:${scale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}${css}</style></head><body><div id="root"></div></body></html>`);
    await page.addScriptTag({ content: on });
    await page.evaluate(p => window.mountShell(p), props(mint));
    await page.waitForSelector('.game-wallet-parity');
    const result = await page.evaluate(probe);
    if (!/CRN · parity 0\.500/.test(result.text)) failures.push(`${id}: expected "CRN · parity 0.500", got "${result.text}"`);
    if (!/zero point five zero zero/.test(result.label)) failures.push(`${id}: accessible label missing words ("${result.label}")`);
    for (const issue of result.issues) failures.push(`${id}: ${issue}`);
    if (shots) await page.screenshot({ path: `${shots}/aurelle-wallet-parity-${w}-${scale * 100}.png`, clip: { x: 0, y: 0, width: w, height: Math.min(h, 280) } });
    rows.push(`${id}: ${result.text}`);
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.setContent(`<!doctype html><html style="--text-scale:1.5"><head><style>${preflight}${css}</style></head><body><div id="root"></div></body></html>`);
  await page.addScriptTag({ content: on });
  await page.evaluate(p => window.mountShell(p), props(moved));
  const movedResult = await page.evaluate(probe);
  if (!/parity 0\.469/.test(movedResult.text) || !/moved/.test(movedResult.text)) failures.push(`moved marker missing ("${movedResult.text}")`);
  if (!/moved since the last mint change/i.test(movedResult.label)) failures.push(`moved label missing ("${movedResult.label}")`);
  for (const issue of movedResult.issues) failures.push(`390 moved: ${issue}`);
  if (shots) await page.screenshot({ path: `${shots}/aurelle-wallet-parity-moved-390-150.png`, clip: { x: 0, y: 0, width: 390, height: 280 } });
  rows.push(`moved: ${movedResult.text}`);
  await page.evaluate(p => window.mountShell(p), props(null));
  const missing = await page.evaluate(probe);
  if (/parity|moved/.test(missing.text)) failures.push(`missing mint still shows "${missing.text}"`);
  await page.addScriptTag({ content: off });
  await page.evaluate(p => window.mountShell(p), props(mint));
  const hidden = await page.evaluate(probe);
  if (/parity|game-wallet-parity/.test(hidden.text) || hidden.label) failures.push(`flag off still shows "${hidden.text}" / "${hidden.label}"`);
  rows.push('flag off and missing mint: CRN only');
  await context.close();
}

if (isMain(import.meta.url)) await runStandalone('Aurelle wallet parity', checkAurelleWalletParity);

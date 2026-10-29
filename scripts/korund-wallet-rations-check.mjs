/** #1055: Korund food coupons on the top-bar wallet at 320, 390 and 1280, text 100% and 150%.
 *  Words stay whole, the chip stays on screen, and the page does not scroll sideways.
 *  Flag off, and flag on without a plan, leave the chip as LN only. */
import { bundleShell, shellProps } from './hud-tooltip-check.mjs';
import { isMain, runStandalone } from './layout-standalone.mjs';

const entry = `
  import React from 'react'; import { createRoot } from 'react-dom/client'; import { GameShell } from './app/game-shell.tsx';
  window.mountShell = props => { window.__root?.unmount(); window.__root = createRoot(document.getElementById('root'));
    window.__root.render(<GameShell {...props} onNavigate={() => {}} />); };`;

const korund = { id: 'korund', name: 'Korund', capital: 'Stonehearth' };
const live = { couponFoodRemaining: 3, couponExpiresAt: '2099-01-01T00:00:00.000Z' };
const ended = { couponFoodRemaining: 3, couponExpiresAt: '2000-01-01T00:00:00.000Z' };
const props = korundCoupons => ({ ...shellProps, nation: korund, citizenNation: korund, localDemo: false, currencyCode: 'LN', walletMinor: 800, korundCoupons });

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

export async function checkKorundWalletRations({ browser, css, preflight, failures, rows }) {
  const shots = process.env.KORUND_RATION_SHOTS || (process.env.LAYOUT_SHOTS_DIR ? `${process.env.LAYOUT_SHOTS_DIR}` : '');
  const on = await bundleShell(entry, { NEXT_PUBLIC_HARIMU_KORUND_WALLET_RATIONS: 'true', NEXT_PUBLIC_HARIMU_UI_V2_TOPBAR: 'true' });
  const off = await bundleShell(entry, { NEXT_PUBLIC_HARIMU_KORUND_WALLET_RATIONS: 'false', NEXT_PUBLIC_HARIMU_UI_V2_TOPBAR: 'true' });
  const plain = await bundleShell(entry, { NEXT_PUBLIC_HARIMU_KORUND_WALLET_RATIONS: 'true', NEXT_PUBLIC_HARIMU_UI_V2_TOPBAR: 'false' });
  const sizes = [[1280, 800], [390, 844], [320, 568]];
  for (const script of [on, plain]) for (const [w, h] of sizes) for (const scale of [1, 1.5]) {
    const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 600 });
    const page = await context.newPage();
    const id = `${script === plain ? 'v1 ' : ''}${w}x${h} @${scale * 100}%`;
    await page.setContent(`<!doctype html><html style="--text-scale:${scale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}${css}</style></head><body><div id="root"></div></body></html>`);
    await page.addScriptTag({ content: script });
    await page.evaluate(p => window.mountShell(p), props(live));
    await page.waitForSelector('.game-wallet-ration');
    const result = await page.evaluate(probe);
    if (!/LN\s*·\s*3 food coupons/.test(result.text)) failures.push(`${id}: expected "LN · 3 food coupons", got "${result.text}"`);
    if (!/three food coupons/i.test(result.label)) failures.push(`${id}: accessible label missing words ("${result.label}")`);
    for (const issue of result.issues) failures.push(`${id}: ${issue}`);
    if (shots && script === on) await page.screenshot({ path: `${shots}/korund-wallet-rations-${w}-${scale * 100}.png`, clip: { x: 0, y: 0, width: w, height: Math.min(h, 280) } });
    rows.push(`${id}: ${result.text}`);
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.setContent(`<!doctype html><html style="--text-scale:1.5"><head><style>${preflight}${css}</style></head><body><div id="root"></div></body></html>`);
  await page.addScriptTag({ content: on });
  await page.evaluate(p => window.mountShell(p), props(ended));
  const endedResult = await page.evaluate(probe);
  if (!/expired/.test(endedResult.text) || /food coupons/.test(endedResult.text)) failures.push(`expired chip shows "${endedResult.text}"`);
  if (!/three food coupons, expired/i.test(endedResult.label)) failures.push(`expired label missing words ("${endedResult.label}")`);
  for (const issue of endedResult.issues) failures.push(`390 expired: ${issue}`);
  if (shots) await page.screenshot({ path: `${shots}/korund-wallet-rations-expired-390-150.png`, clip: { x: 0, y: 0, width: 390, height: 280 } });
  rows.push(`expired: ${endedResult.text}`);
  await page.evaluate(p => window.mountShell(p), props(null));
  const missing = await page.evaluate(probe);
  if (/food coupons|expired|game-wallet-ration/.test(missing.text)) failures.push(`missing plan still shows "${missing.text}"`);
  await page.addScriptTag({ content: off });
  await page.evaluate(p => window.mountShell(p), props(live));
  const hidden = await page.evaluate(probe);
  if (/food coupons|expired/.test(hidden.text) || /food coupon/i.test(hidden.label)) failures.push(`flag off still shows "${hidden.text}" / "${hidden.label}"`);
  rows.push('flag off and missing plan: LN only');
  await context.close();
}

if (isMain(import.meta.url)) await runStandalone('Korund wallet rations', checkKorundWalletRations);

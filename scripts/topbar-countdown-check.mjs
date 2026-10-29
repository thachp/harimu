/** #969: top-bar countdown beside the world clock, flag NEXT_PUBLIC_HARIMU_TOPBAR_COUNTDOWN.
 *  Real GameShell and CSS at 1280, 390 and 640 (a 1280px screen at 200% zoom), text 100% and 150%.
 *  Flag on: the chip names the next event, stays on screen, does not overlap the clock or run the HUD into the dock,
 *  meets 4.5:1, and its tooltip states real time and game time. At 390 the summary is at least 44px.
 *  Flag off, and flag on with no scheduled event: no chip. */
import { bundleShell, shellProps } from './hud-tooltip-check.mjs';
import { isMain, runStandalone } from './layout-standalone.mjs';

const entry = `
  import React from 'react'; import { createRoot } from 'react-dom/client'; import { GameShell } from './app/game-shell.tsx';
  window.mountShell = props => { window.__root?.unmount(); window.__root = createRoot(document.getElementById('root'));
    window.__root.render(<GameShell {...props} onNavigate={() => {}} />); };`;

const nation = { id: 'kindle', name: 'Kindle Republic', capital: 'Forgehaven' };
const soon = () => { const now = Math.floor(Date.now() / 1000); return now + 3 * 86400 + 4 * 3600 + 1800 - 30 * 86400; }; // 3d 4h 30m, so the chip stays "3d 4h" for the whole check
const props = (withEvent) => ({ ...shellProps, citizenNation: nation, localDemo: false, ...(withEvent ? { countdown: { nationId: 'kindle', cycleStartAt: soon(), election: null, wars: null } } : {}) });

const probe = () => {
  const rgb = c => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
  const lum = c => { const [r, g, b] = rgb(c).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const opaque = el => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor, m = c.match(/[\d.]+/g); if (m && (m.length < 4 || Number(m[3]) > 0.9) && rgb(c).some(n => n > 0)) return c; } return 'rgb(7,24,32)'; };
  const vw = document.documentElement.clientWidth, issues = [];
  if (document.documentElement.scrollWidth > vw + 1) issues.push(`page scrolls sideways by ${document.documentElement.scrollWidth - vw}px`);
  const chip = document.querySelector('.game-countdown'), hud = document.querySelector('.game-hud'), dock = document.querySelector('.game-dock');
  const timer = chip?.closest('[role="timer"]') ?? chip;
  if (timer && timer.getAttribute('aria-live') !== 'off') issues.push('countdown timer is not aria-live off');
  const access = timer?.getAttribute('aria-label') ?? '';
  if (chip && (!access.includes('real time') || !access.includes('game time'))) issues.push(`accessible name missing real and game time ("${access}")`);
  const hudDock = Math.round(hud.getBoundingClientRect().bottom - dock.getBoundingClientRect().top);
  if (hudDock > 0) issues.push(`HUD runs ${hudDock}px into the dock`);
  if (!chip) return { issues, text: '', ratio: 0, tip: '', target: null };
  const summary = chip.closest('summary'), r = summary.getBoundingClientRect();
  if (r.left < -0.5 || r.right > vw + 0.5) issues.push(`countdown leaves the screen (${Math.round(r.left)}..${Math.round(r.right)} of ${vw})`);
  const clock = document.querySelector('.game-clock')?.closest('summary');
  if (clock) { const c = clock.getBoundingClientRect(); if (r.left < c.right - 0.5 && c.left < r.right - 0.5 && r.top < c.bottom - 0.5 && c.top < r.bottom - 0.5) issues.push('countdown overlaps the clock'); }
  const ratio = contrast(getComputedStyle(chip).color, opaque(chip));
  if (ratio < 4.5) issues.push(`contrast ${ratio.toFixed(2)} is below 4.5:1`);
  if (vw <= 760 && (r.width < 43.5 || r.height < 43.5)) issues.push(`countdown target is ${Math.round(r.width)}x${Math.round(r.height)} (needs 44)`);
  const walker = document.createTreeWalker(chip, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) for (const m of node.textContent.matchAll(/\S+/g)) {
    const rg = document.createRange(); rg.setStart(node, m.index); rg.setEnd(node, m.index + m[0].length);
    if (new Set([...rg.getClientRects()].filter(x => x.width > 0).map(x => Math.round(x.top))).size > 1) issues.push(`"${m[0]}" breaks mid-word`);
  }
  return { issues, text: chip.textContent.replace(/\s+/g, ' ').trim(), ratio, tip: document.querySelector('.game-hud-tip')?.textContent ?? '', target: `${Math.round(r.width)}x${Math.round(r.height)}` };
};

export async function checkTopbarCountdown({ browser, css, preflight, failures, rows }) {
  const shots = process.env.LAYOUT_SHOTS_DIR;
  const on = await bundleShell(entry, { NEXT_PUBLIC_HARIMU_TOPBAR_COUNTDOWN: 'true' });
  const off = await bundleShell(entry, { NEXT_PUBLIC_HARIMU_TOPBAR_COUNTDOWN: 'false' });
  const sizes = [[1280, 800], [390, 844], [640, 400]];
  for (const flag of ['true', 'false']) for (const [w, h] of sizes) for (const scale of flag === 'true' ? [1, 1.5] : [1]) {
    const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 600 });
    const page = await context.newPage();
    const id = `${w}x${h} @${scale * 100}% flag ${flag}`;
    await page.setContent(`<!doctype html><html style="--text-scale:${scale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}${css}</style></head><body><div id="root"></div></body></html>`);
    await page.addScriptTag({ content: flag === 'true' ? on : off });
    await page.evaluate(p => window.mountShell(p), props(true));
    if (flag === 'true') await page.waitForSelector('.game-countdown', { timeout: 3000 }); else await page.waitForTimeout(50);
    const result = await page.evaluate(probe);
    if (flag === 'false') { if (result.text) failures.push(`${id}: flag off still shows "${result.text}"`); }
    else {
      if (!/Election in 3d/.test(result.text)) failures.push(`${id}: expected "Election in 3d…", got "${result.text}"`);
      for (const issue of result.issues) failures.push(`${id}: ${issue}`);
      if (w >= 1280 && scale === 1) {
        await page.hover('.game-countdown');
        const tip = page.locator('#hud-help-next-event');
        const text = await tip.textContent();
        const shown = await tip.evaluate(el => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0);
        if (!shown) failures.push(`${id}: tooltip did not open`);
        if (!text?.includes('real time') || !text.includes('game time')) failures.push(`${id}: tooltip missing real and game time ("${text}")`);
        if (shots) await page.screenshot({ path: `${shots}/countdown-tooltip-${w}.png`, clip: { x: 0, y: 0, width: w, height: Math.min(h, 320) } });
      }
      if (shots && (scale === 1 || scale === 1.5)) await page.screenshot({ path: `${shots}/countdown-${w}-${scale * 100}.png`, clip: { x: 0, y: 0, width: w, height: Math.min(h, 280) } });
    }
    rows.push(`${id}: ${flag === 'true' ? result.text : 'hidden'} ${result.target ?? ''} contrast ${result.ratio ? result.ratio.toFixed(1) : 'n/a'}`);
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.setContent(`<!doctype html><html><head><style>${preflight}${css}</style></head><body><div id="root"></div></body></html>`);
  await page.addScriptTag({ content: on });
  await page.evaluate(p => window.mountShell(p), props(false));
  await page.waitForTimeout(50);
  const empty = await page.evaluate(probe);
  if (empty.text) failures.push(`no scheduled event still shows "${empty.text}"`);
  rows.push('flag on, nothing scheduled: hidden');
  await context.close();
}

if (isMain(import.meta.url)) await runStandalone('top-bar countdown', checkTopbarCountdown);

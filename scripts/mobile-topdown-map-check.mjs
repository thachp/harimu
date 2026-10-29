/** #1039: below the #847 phone width the real map camera is straight down; at 1280 it stays tilted.
 *  Flag NEXT_PUBLIC_HARIMU_MOBILE_TOPDOWN_MAP. A city tap and a world-label tap still select.
 *  Screenshots (reduced motion): LAYOUT_SHOTS_DIR=/opt/cursor/artifacts/screenshots */
import { mkdir } from 'node:fs/promises';
import { bundleShell } from './hud-tooltip-check.mjs';
import { isMain, runStandalone } from './layout-standalone.mjs';

const entry = `import React from 'react'; import { createRoot } from 'react-dom/client'; import { GameViewport } from './app/game-viewport.tsx';
  const nations = [{ id: 'kindle', name: 'Kindle Republic', color: '#d06a3a' }, { id: 'aurelle', name: 'Aurelle', color: '#e6d7a8' }, { id: 'korund', name: 'Korund', color: '#8aa399' }];
  window.mountMap = mode => { window.__picked = null; const el = document.getElementById('root'); window.__root?.unmount(); window.__root = createRoot(el); window.__root.render(<GameViewport mode={mode} nationId="kindle" cityName="Forgehaven" nations={nations} onSelect={s => { window.__picked = s; }} />); };`;

export async function checkMobileTopdownMap({ browser, css, preflight, failures, rows }) {
  const script = await bundleShell(entry, { NEXT_PUBLIC_HARIMU_MOBILE_TOPDOWN_MAP: 'true' }, { realViewport: true });
  const shots = process.env.LAYOUT_SHOTS_DIR;
  if (shots) await mkdir(shots, { recursive: true });
  const fit = 'html,body{height:100%;margin:0;background:#0b1c24}.harimu-game,.game-stage,#root,.game-viewport{height:100%}.game-stage{position:relative!important;inset:auto!important}';
  for (const [mode, w, h, expect] of [['city', 390, 844, 'topdown'], ['city', 1280, 800, 'desktop'], ['world', 390, 844, 'topdown'], ['world', 1280, 800, 'desktop']]) {
    const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w <= 760 });
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const id = `#1039 ${mode} ${w}x${h}`;
    await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}${css}${fit}</style></head><body><div class="harimu-game"><div class="game-stage"><div id="root"></div></div></div></body></html>`);
    await page.addScriptTag({ content: script });
    await page.evaluate(m => window.mountMap(m), mode);
    try { await page.waitForSelector(`[data-map-camera="${expect}"]`, { timeout: 20000 }); }
    catch { failures.push(`${id}: camera was ${await page.locator('.viewport-canvas').getAttribute('data-map-camera').catch(() => 'missing')}, expected ${expect}`); await context.close(); continue; }
    if (await page.locator('.viewport-fallback').count()) failures.push(`${id}: 3D unavailable`);
    if (mode === 'city') {
      const box = await page.locator('canvas').boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForFunction(() => window.__picked, null, { timeout: 3000 }).catch(() => {});
      const picked = await page.evaluate(() => window.__picked);
      if (!picked || !['building', 'tile'].includes(picked.kind)) failures.push(`${id}: tap did not select a place`);
    } else {
      await page.waitForSelector('.viewport-world-label:not([hidden])');
      await page.locator('.viewport-world-label:not([hidden])').first().click();
      const picked = await page.evaluate(() => window.__picked);
      if (picked?.kind !== 'nation') failures.push(`${id}: tap did not select a city`);
    }
    if (shots) await page.screenshot({ path: `${shots}/mobile-topdown-${mode}-${w}x${h}.png` });
    rows.push(`${id}: ${expect}`);
    await context.close();
  }
}

if (isMain(import.meta.url)) await runStandalone('mobile top-down map', checkMobileTopdownMap);

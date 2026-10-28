/** #618 check: the selected nation's globe label keeps aria-pressed="true" after the scene is rebuilt.
 *  Bundles the real GameViewport (three.js globe) in headless Chromium, selects Aurelle, then changes the props that rebuild the scene after load
 *  (the visitor flag from #558 and the market flag) and asserts the Aurelle label is still pressed and the others are not.
 *  Used by hud-layout-check.mjs (npm run test:layout). */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const entry = `
  import React from 'react'; import { createRoot } from 'react-dom/client'; import GameViewport from './app/game-viewport.tsx';
  const nations = [['kindle','Kindle'],['korund','Korund'],['aurelle','Aurelle']].map(([id,name],i)=>({id,name,shortName:name,capital:name,stability:80,x:i,y:0}));
  window.mount = props => { window.__root ??= createRoot(document.getElementById('root')); window.__root.render(<div style={{width:600,height:500}}><GameViewport mode="world" nationId="aurelle" nations={nations} selectedNationId="aurelle" {...props} /></div>); };`;

export async function checkGlobeLabelPressed({ browser, failures, rows }) {
  const result = await build({ stdin: { resolveDir: root, loader: 'tsx', contents: entry }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', target: 'es2022', logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_CREST': '"false"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_TOPBAR': '"false"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_PANEL': '\"false\"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_RAIL': '\"false\"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_WORLD': '\"false\"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_NATION': '\"false\"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_CITY': '\"false\"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_MOBILE': '\"false\"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_HOUSEHOLD': '\"false\"', 'process.env.NEXT_PUBLIC_HARIMU_MOD_CONSOLE': '"false"', 'process.env.NEXT_PUBLIC_HARIMU_NATION_SKIN': '\"false\"', 'process.env.NEXT_PUBLIC_HARIMU_WIRE_BYLINES': '\"false\"', 'process.env.NEXT_PUBLIC_HARIMU_RARE_MARKER': '\"false\"', 'process.env.NEXT_PUBLIC_HARIMU_NATION_SYMBOLS': '"false"' }, alias: { '@': root.replace(/\/$/, '') }, loader: { '.css': 'empty' } });
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await page.setContent('<div id="root"></div>'); await page.addScriptTag({ content: result.outputFiles[0].text });
  const pressed = () => page.evaluate(() => [...document.querySelectorAll('.viewport-world-label')].map(b => `${b.getAttribute('aria-label')}=${b.getAttribute('aria-pressed')}`).join(', '));
  const want = 'Select Kindle=false, Select Korund=false, Select Aurelle=true';
  for (const [name, props] of [['first load', { visitor: false }], ['after the visitor flag flips', { visitor: true }], ['after the market flag arrives', { visitor: true, marketOpen: false }]]) {
    await page.evaluate(p => window.mount(p), props);
    await page.waitForSelector('.viewport-world-label', { state: 'attached' }); await page.waitForTimeout(400);
    const got = await pressed();
    if (got !== want) failures.push(`globe labels ${name}: ${got}; want ${want}`);
    rows.push(`globe labels ${name}: ${got === want ? 'Aurelle pressed OK' : '✗ ' + got}`);
  }
  await page.close();
}

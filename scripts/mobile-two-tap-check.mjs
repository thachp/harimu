/** #1040: at 390×844 each daily-loop action is a viewport tap from the city home (no scrolling) for Kindle, Korund and Aurelle
 *  when NEXT_PUBLIC_HARIMU_MOBILE_TWO_TAP is exactly "true". Flag off leaves the collapsed sheet as one Show-details button.
 *  A tap is a click on an enabled button fully inside the viewport and not covered. Used by hud-layout-check.mjs. */
import { bundleShell, shellProps } from './hud-tooltip-check.mjs';
import { isMain, runStandalone } from './layout-standalone.mjs';

const entry = `
  import React from 'react'; import { createRoot } from 'react-dom/client'; import { GameShell } from './app/game-shell.tsx';
  const nations = {
    kindle: { id: 'kindle', name: 'Kindle Republic', capital: 'Forgehaven' },
    korund: { id: 'korund', name: 'Korund', capital: 'Stonehearth' },
    aurelle: { id: 'aurelle', name: 'Aurelle', capital: 'Highspire' },
  };
  window.mount = (id) => { const nation = nations[id]; window.__fired = []; window.__root?.unmount(); window.__root = createRoot(document.getElementById('root'));
    window.__root.render(<GameShell {...${JSON.stringify(shellProps)}} view="square" nation={nation} citizenNation={nation} nations={[nation]} localDemo={false}
      panel={<p>City</p>} onNavigate={() => {}} onSelectNation={() => {}} onDailyLoop={action => { window.__fired = [...window.__fired, action]; }}
      socialDock={<nav className="citizen-dock" aria-label="Citizen communications"><button type="button">Chat</button><button type="button">News</button><button type="button">Civic inbox</button></nav>} />); };
`;
const actions = [['shift', 'Start or claim shift'], ['wage', 'Collect wage or rations'], ['ballot', 'Open civic inbox ballot']];
/** Enabled buttons fully on screen whose center is not covered. No scrolling. */
const tappable = () => [...document.querySelectorAll('button')].flatMap(b => {
  if (b.disabled) return [];
  const r = b.getBoundingClientRect();
  if (r.width < 8 || r.height < 8 || r.top < 0 || r.left < 0 || r.bottom > innerHeight || r.right > innerWidth) return [];
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  if (!(hit && (hit === b || b.contains(hit)))) return [];
  return [(b.getAttribute('aria-label') || b.textContent || '').replace(/\s+/g, ' ').trim()];
});

export async function checkMobileTwoTap({ browser, css, preflight, failures, rows }) {
  const shots = process.env.LAYOUT_SHOTS_DIR;
  const flags = { NEXT_PUBLIC_HARIMU_UI_V2_MOBILE: 'true', NEXT_PUBLIC_HARIMU_UI_V2_RAIL: 'true', NEXT_PUBLIC_HARIMU_UI_V2_PANEL: 'true', NEXT_PUBLIC_HARIMU_UI_V2_CITY: 'true' };
  for (const flag of ['true', 'false']) {
    const script = await bundleShell(entry, { ...flags, NEXT_PUBLIC_HARIMU_MOBILE_TWO_TAP: flag });
    const on = flag === 'true';
    for (const [w, h] of [[390, 844], [1280, 800]]) {
      const page = await (await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 760 })).newPage();
      page.setDefaultTimeout(20000);
      await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}${css}</style></head><body><div id="root"></div></body></html>`);
      await page.addScriptTag({ content: script });
      for (const nation of ['kindle', 'korund', 'aurelle']) {
        const id = `${w}x${h} ${nation} flag ${on ? 'on' : 'off'}`;
        await page.evaluate(n => window.mount(n), nation);
        await page.waitForSelector('.harimu-game');
        if (on && w < 760) await page.waitForSelector('.mobile-two-tap'); else await page.waitForTimeout(50);
        const home = await page.evaluate(tappable);
        if (!on || w >= 760) {
          if (await page.locator('.mobile-two-tap').count()) failures.push(`${id}: shortcuts rendered with the flag ${on ? 'on at desktop' : 'off'}`);
          if (w < 760) {
            await page.locator('button[aria-label="Collapse details"]').click();
            const reopen = await page.evaluate(() => { const b = document.getElementById('game-reopen'); return b && b.tagName === 'BUTTON' && b.classList.contains('game-reopen-panel') && !document.querySelector('.mobile-two-tap'); });
            if (!reopen) failures.push(`${id}: Show details is not the lone reopen button`);
          }
          rows.push(`${id}: unchanged`);
          continue;
        }
        const motion = await page.evaluate(() => [...document.querySelectorAll('.mobile-two-tap>button')].map(b => { const s = getComputedStyle(b); return { h: b.getBoundingClientRect().height, w: b.getBoundingClientRect().width, anim: s.animationName, trans: s.transitionProperty, dur: s.transitionDuration }; }));
        for (const box of motion) {
          if (box.h < 43.5 || box.w < 43.5) failures.push(`${id}: shortcut is ${Math.round(box.w)}x${Math.round(box.h)}`);
          if (box.anim !== 'none' || (box.trans !== 'none' && box.dur !== '0s')) failures.push(`${id}: shortcut animates (${box.anim} ${box.trans} ${box.dur})`);
        }
        if (motion.length !== 3) failures.push(`${id}: ${motion.length} shortcuts on the open home`);
        for (const [action, label] of actions) {
          if (!home.includes(label)) failures.push(`${id}: "${label}" is not an uncovered viewport target (${home.join(' | ')})`);
          await page.evaluate(() => { window.__fired = []; });
          await page.locator(`button[aria-label="${label}"]`).click();
          const fired = await page.evaluate(() => window.__fired);
          if (fired.length !== 1 || fired[0] !== action) failures.push(`${id}: "${label}" took more than one tap (${JSON.stringify(fired)})`);
          await page.locator(`button[aria-label="${label}"]`).focus();
          await page.evaluate(() => { window.__fired = []; });
          await page.keyboard.press('Enter');
          const keyed = await page.evaluate(() => window.__fired);
          if (keyed[0] !== action) failures.push(`${id}: Enter on "${label}" did not run (${JSON.stringify(keyed)})`);
        }
        await page.locator('button[aria-label="Collapse details"]').click();
        await page.waitForSelector('#game-reopen');
        const collapsed = await page.evaluate(tappable);
        for (const [, label] of actions) if (!collapsed.includes(label)) failures.push(`${id}: collapsed sheet hides "${label}"`);
        const show = await page.evaluate(() => { const b = document.getElementById('game-reopen'); const r = b.getBoundingClientRect(); return { exp: b.getAttribute('aria-expanded'), h: r.height, w: r.width, label: b.getAttribute('aria-label') || b.textContent }; });
        if (show.exp !== 'false' || show.h < 43.5 || show.w < 43.5) failures.push(`${id}: Show details ${JSON.stringify(show)}`);
        rows.push(`${id}: 3 actions in 1 tap${nation === 'korund' ? ' (Rations)' : ''}`);
        if (shots) await page.screenshot({ path: `${shots}/mobile-two-tap-${nation}-390x844.png` });
        await page.locator('#game-reopen').click();
      }
      if (on && w >= 760) {
        await page.evaluate(n => window.mount(n), 'kindle');
        await page.waitForTimeout(80);
        if (await page.locator('.mobile-two-tap').count()) failures.push('1280 flag on: shortcuts are in the desktop DOM');
      }
      await page.context().close();
    }
  }
}
if (isMain(import.meta.url)) await runStandalone('mobile two-tap', checkMobileTwoTap);

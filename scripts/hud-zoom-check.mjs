/** #346 check: the top bar and the scene overlays stay usable when text is large and when the browser is zoomed (a 1280px
 *  screen at 200% zoom is a 640px viewport, a 1920px screen at 200% is 960px, 400% is 320px). Bundles the real GameShell with
 *  an account group like the app's (Brief, bell, Account) and an active-shift chip, in headless Chromium with the shipped CSS:
 *  - the page never scrolls sideways; every top-bar control (Brief, bell, settings, Account, clock, resources) is fully on-screen
 *    and no two of them overlap
 *  - the shift chip is on-screen and none of its text is truncated or clipped
 *  - with the details panel collapsed, "Show ... details" never covers the shift chip or the location banner
 *  - the context strip heading ("Country travel") stays on one line wherever the strip is wide enough for it
 *  Used by hud-layout-check.mjs (npm run test:layout). Screenshots: LAYOUT_SHOTS_DIR=docs/screenshots/346. */
import { bundleShell, shellProps } from './hud-tooltip-check.mjs';

const entry = `
  import React from 'react'; import { createRoot } from 'react-dom/client'; import { GameShell } from './app/game-shell.tsx';
  window.mountShell = props => { window.__root?.unmount(); window.__root = createRoot(document.getElementById('root'));
    window.__root.render(<GameShell {...props} onNavigate={() => {}} accountControls={<><button type="button" className="game-glossary" aria-label="Open morning brief"><svg width="17" height="17" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 2.5h9v11h-9z M4.5 5.5h5 M4.5 8h5 M4.5 10.5h3" fill="none" stroke="currentColor" /></svg><span>Brief</span></button><button type="button" className="account-menu-trigger" aria-label="Account menu"></button></>} />);
  };`;

const props = view => ({ ...shellProps, view, citizenNation: shellProps.nation, localDemo: false, contextTitle: view === 'country' ? 'Country travel' : 'City destinations',
  shiftSummary: { title: 'Support the savanna harvest', endsAt: Math.floor(Date.now() / 1000) + 7000 }, currentCityName: 'Forgehaven' });


const topBar = () => {
  const rect = e => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
  const overlap = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
  const vw = document.documentElement.clientWidth, issues = [];
  if (document.documentElement.scrollWidth > vw + 1) issues.push(`page scrolls sideways by ${document.documentElement.scrollWidth - vw}px`);
  const hud = document.querySelector('.game-hud');
  const items = [...hud.querySelectorAll('summary, button, .game-clock, .game-identity')].filter(e => e.getBoundingClientRect().width > 0 && !e.closest('.game-hud-tip'))
    .map(e => ({ el: e, name: (e.getAttribute('aria-label') || e.textContent.trim().slice(0, 14) || e.className), r: rect(e) }));
  for (const it of items) if (it.r.left < -0.5 || it.r.right > vw + 0.5) issues.push(`top-bar "${it.name}" leaves the screen (${Math.round(it.r.left)} to ${Math.round(it.r.right)} of ${vw})`);
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j]; if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    if (overlap(a.r, b.r)) issues.push(`top-bar "${a.name}" overlaps "${b.name}"`);
  }
  return { issues, hudHeight: Math.round(hud.getBoundingClientRect().height) };
};
const chip = () => {
  const c = document.querySelector('.game-shift-chip'), vw = document.documentElement.clientWidth, issues = [];
  if (!c) return { issues: ['no shift chip'] };
  const r = c.getBoundingClientRect();
  if (r.left < -0.5 || r.right > vw + 0.5) issues.push('shift chip leaves the screen');
  for (const e of [c, ...c.querySelectorAll('*')]) { const cs = getComputedStyle(e); if (e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0 && (cs.overflow !== 'visible' || cs.textOverflow === 'ellipsis')) issues.push(`shift chip text is clipped in <${e.tagName.toLowerCase()}>`); if (cs.textOverflow === 'ellipsis' && cs.overflow !== 'visible') issues.push('shift chip truncates with an ellipsis'); }
  const range = document.createRange(); range.selectNodeContents(c);
  if ([...range.getClientRects()].some(x => x.width > 0 && (x.right > r.right + 0.5 || x.left < r.left - 0.5))) issues.push('shift chip text runs outside its box');
  return { issues };
};
const reopen = () => {
  const rect = e => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
  const overlap = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
  const b = document.querySelector('.game-reopen-panel'), issues = [], vw = document.documentElement.clientWidth;
  if (!b) return { issues: ['no collapsed-panel button'] };
  const r = rect(b);
  if (r.left < -0.5 || r.right > vw + 0.5) issues.push('"Show details" leaves the screen');
  for (const sel of ['.game-shift-chip', '.game-location-banner', '.game-breadcrumbs']) { const o = document.querySelector(sel); if (o && getComputedStyle(o).display !== 'none' && overlap(r, rect(o))) issues.push(`"Show details" covers ${sel}`); }
  return { issues };
};
const heading = () => {
  const h = document.querySelector('.game-context-heading h2'); if (!h) return { issues: [] };
  const range = document.createRange(); range.selectNodeContents(h);
  const lines = new Set([...range.getClientRects()].filter(x => x.width > 0).map(x => Math.round(x.top)));
  const strip = document.querySelector('.game-context-strip').getBoundingClientRect().width;
  return { issues: lines.size > 1 && strip >= 560 ? [`context heading "${h.textContent}" wraps onto ${lines.size} lines in a ${Math.round(strip)}px strip`] : [] };
};

export async function checkHudZoom({ browser, css, preflight, failures, rows }) {
  const script = await bundleShell(entry);
  const shots = process.env.LAYOUT_SHOTS_DIR, tag = process.env.HUD_ZOOM_BEFORE === '1' ? 'before' : 'after'; // HUD_ZOOM_BEFORE=1: run against old code to capture the "before" shots
  const sizes = [[1280, 800], [1100, 700], [960, 600], [800, 500], [761, 500], [640, 400], [390, 844], [320, 568]];
  for (const [w, h] of sizes) for (const scale of [1, 1.25, 1.5]) for (const view of ['country', 'square']) {
    const context = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await context.newPage(); page.setDefaultTimeout(90000);
    const id = `${w}x${h} @${scale * 100}% ${view} zoom`;
    const fail = m => failures.push(`${id}: ${m}`);
    await page.setContent(`<!doctype html><html style="--text-scale:${scale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}${css}</style></head><body><div id="root"></div></body></html>`);
    await page.addScriptTag({ content: script });
    await page.evaluate(p => window.mountShell(p), props(view));
    await page.waitForSelector('.game-hud');
    await page.evaluate(() => { const slot = document.getElementById('game-notification-slot'); if (slot) slot.innerHTML = '<button class="game-notifications" type="button" aria-label="Open civic inbox"><svg width="16" height="16"></svg><strong>3</strong></button>'; });
    const t = await page.evaluate(topBar); t.issues.forEach(fail);
    const c = await page.evaluate(chip); c.issues.forEach(fail);
    const hd = await page.evaluate(heading); hd.issues.forEach(fail);
    if (shots && view === 'country' && (scale === 1 || scale === 1.5) && [1280, 960, 640, 320].includes(w)) await page.screenshot({ path: `${shots}/${tag}-topbar-${w}-${scale * 100}.png`, clip: { x: 0, y: 0, width: w, height: Math.min(h, 260) } });
    await page.keyboard.press('Escape'); // collapse the details panel
    if (await page.locator('.game-reopen-panel').count()) {
      const r = await page.evaluate(reopen); r.issues.forEach(fail);
      if (shots && view === 'country' && scale === 1.5 && [1280, 960, 640].includes(w)) await page.screenshot({ path: `${shots}/${tag}-collapsed-${w}-${scale * 100}.png` });
    } else fail('Escape did not collapse the details panel');
    rows.push(`${id}: top bar ${t.hudHeight}px tall, all controls on-screen, shift chip intact, details button clear`);
    await context.close();
  }
}

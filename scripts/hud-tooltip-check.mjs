/** #366 interactive check for the top-bar help tooltips. Bundles the real GameShell with esbuild, mounts it in headless Chromium with
 *  the shipped CSS, and drives it with a real mouse, keyboard and touch at 1280x800 and 390x844, 100/125/150% text:
 *  - nothing is open at rest; hovering or keyboard-focusing an item opens exactly its own tooltip, and moving on replaces it
 *  - the tooltip is fully on-screen, not clipped, and does not cover any top-bar item
 *  - leaving, blurring, Escape and a press elsewhere close it; a mouse click never leaves it pinned by focus or click state
 *  - double-clicking an item selects no text
 *  Used by hud-layout-check.mjs (npm run test:layout). Screenshots: LAYOUT_SHOTS_DIR=docs/screenshots/366 (after);
 *  HUD_TOOLTIP_BEFORE=1 instead reproduces the old stacking by clicking three items, for the "before" shots. */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
const shellEntry = `
      import React from 'react'; import { createRoot } from 'react-dom/client'; import { GameShell } from './app/game-shell.tsx';
      window.mountShell = props => { const el = document.getElementById('root'); window.__root?.unmount(); window.__root = createRoot(el); window.__root.render(<GameShell {...props} onNavigate={() => {}} />); };`;
/** Bundles the real GameShell (and whatever the entry adds) for the browser, with the app's heavy children stubbed. `env` sets process.env.* values. */
export async function bundleShell(contents = shellEntry, env = {}) {
  const result = await build({
    stdin: { resolveDir: root, loader: 'tsx', contents },
    bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', target: 'es2022', logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_HARIMU_TOPBAR_EMBLEM': '"false"', 'process.env.NEXT_PUBLIC_HARIMU_NATION_SYMBOLS': '"false"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_CREST': '"false"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_TOPBAR': '"false"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_PANEL': '\"false\"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_RAIL': '\"false\"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_WORLD': '\"false\"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_NATION': '\"false\"', 'process.env.NEXT_PUBLIC_HARIMU_RARE_MARKER': '\"false\"', ...Object.fromEntries(Object.entries(env).map(([k, v]) => [`process.env.${k}`, JSON.stringify(v)])) }, alias: { '@': root.replace(/\/$/, '') }, loader: { '.css': 'empty' },
    plugins: [
      { name: 'stubs', setup(b) {
        const stubs = { './game-viewport': 'export default function V(){return null}', './game-timer': 'export function GameTimer({label}){return <span className="game-timer-stub"><strong>{label}</strong> · 1h 52m 10s real · 2d 19h game</span>}', './square-chat': 'export function SquareChat(){return null}', '@clerk/nextjs': 'export const useClerk=()=>({mountUserButton(){},unmountUserButton(){}})' };
        b.onResolve({ filter: /^(\.\/game-viewport|\.\/game-timer|\.\/square-chat|@clerk\/nextjs)$/ }, a => ({ path: a.path, namespace: 'stub' }));
        b.onResolve({ filter: /\.module\.css$/ }, () => ({ path: 'css-module', namespace: 'stub' }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: a.path === 'css-module' ? 'export default new Proxy({}, { get: (_, k) => String(k) })' : stubs[a.path], loader: 'jsx', resolveDir: root }));
      } },
    ],
  });
  return result.outputFiles[0].text;
}

const nation = { id: 'kindle', name: 'Kindle Republic', capital: 'Forgehaven' };
export const shellProps = { view: 'square', nation, citizenNation: nation, nations: [nation], capacity: 18, localDemo: true, panel: null,
  worldClock: { gameDay: 12, latestTick: 140 }, inventory: { food: 6, materials: 2, knowledge: 2 }, walletMinor: 4000 };

/** Visible tooltips and their geometry, measured in the page. */
const probe = () => {
  const vw = document.documentElement.clientWidth, vh = window.innerHeight;
  const items = [...document.querySelectorAll('.game-hud-help')].map(d => ({ id: d.dataset.helpId, rect: d.querySelector('summary').getBoundingClientRect() }));
  const visible = [...document.querySelectorAll('.game-hud-tip')].filter(t => { const cs = getComputedStyle(t), r = t.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; });
  const issues = [];
  for (const t of visible) {
    const r = t.getBoundingClientRect();
    if (r.left < -0.5 || r.top < -0.5 || r.right > vw + 0.5 || r.bottom > vh + 0.5) issues.push(`tooltip "${t.textContent.slice(0, 18)}…" leaves the screen (${Math.round(r.left)},${Math.round(r.top)} to ${Math.round(r.right)},${Math.round(r.bottom)} in ${vw}x${vh})`);
    for (const it of items) if (r.left < it.rect.right - 0.5 && it.rect.left < r.right - 0.5 && r.top < it.rect.bottom - 0.5 && it.rect.top < r.bottom - 0.5) issues.push(`tooltip "${t.textContent.slice(0, 18)}…" covers the ${it.id} item`);
    if (t.scrollHeight > t.clientHeight + 1 || t.scrollWidth > t.clientWidth + 1) issues.push(`tooltip "${t.textContent.slice(0, 18)}…" clips its text`);
    const range = document.createRange(); range.selectNodeContents(t);
    if ([...range.getClientRects()].some(x => x.width > 0 && (x.right > r.right + 0.5 || x.left < r.left - 0.5 || x.bottom > r.bottom + 0.5))) issues.push('tooltip text runs outside its box');
  }
  return { ids: visible.map(t => t.id), issues, items: items.map(i => i.id), selection: String(getSelection()), active: document.activeElement?.tagName + ':' + (document.activeElement?.closest?.('.game-hud-help')?.dataset.helpId ?? '') };
};

export async function checkHudTooltips({ browser, css, preflight, failures, rows }) {
  const script = await bundleShell();
  const shots = process.env.LAYOUT_SHOTS_DIR, before = process.env.HUD_TOOLTIP_BEFORE === '1';
  for (const [w, h] of [[1280, 800], [390, 844]]) for (const scale of [1, 1.25, 1.5]) {
    const touch = w < 600;
    const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch });
    const page = await context.newPage();
    const id = `${w}x${h} @${scale * 100}% tooltips`;
    const fail = m => failures.push(`${id}: ${m}`);
    await page.setContent(`<!doctype html><html style="--text-scale:${scale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}${css}</style></head><body><div id="root"></div></body></html>`);
    await page.addScriptTag({ content: script });
    await page.evaluate(props => window.mountShell(props), shellProps);
    await page.waitForSelector('.game-hud-help');
    const summaries = page.locator('.game-hud-help > summary'); const count = await summaries.count();
    const note = [];
    const expectOne = async (label, wantId) => {
      const s = await page.evaluate(probe);
      if (s.ids.length !== 1) fail(`${label}: ${s.ids.length} tooltips visible (${s.ids.join(', ')}), expected exactly one`);
      else if (wantId && s.ids[0] !== wantId) fail(`${label}: shows ${s.ids[0]}, expected ${wantId}`);
      for (const i of s.issues) fail(`${label}: ${i}`);
      return s;
    };
    const expectNone = async label => { const s = await page.evaluate(probe); if (s.ids.length) fail(`${label}: ${s.ids.join(', ')} still visible`); for (const i of s.issues) fail(`${label}: ${i}`); return s; };
    if (before) { // old behaviour: clicks toggle <details>, so tooltips stack
      for (const i of [0, 2, 3]) { await summaries.nth(i).click(); }
      await page.mouse.move(w / 2, h - 10); note.push(`before: ${(await page.evaluate(probe)).ids.length} visible`);
      if (shots) await page.screenshot({ path: `${shots}/before-${w}-${scale * 100}.png`, clip: { x: 0, y: 0, width: w, height: Math.min(h, 320) } });
      rows.push(`${id}: ${note.join('; ')}`); await context.close(); continue;
    }
    await expectNone('at rest');
    const ids = (await page.evaluate(probe)).items; if (ids.length < 6) fail(`expected six help items in the citizen top bar, found ${ids.length}`);
    // Keyboard: Tab to an item opens it, Tab to the next replaces it, Escape closes it and focus stays put.
    await page.mouse.move(w / 2, h - 20); await page.keyboard.press('Tab');
    let first = null; for (let n = 0; n < 20 && !first; n++) { const a = await page.evaluate(probe); if (a.active.startsWith('SUMMARY')) first = a; else await page.keyboard.press('Tab'); }
    if (!first) fail('could not Tab to a help item');
    else {
      const s1 = await expectOne('keyboard focus on first item', ids[0]); void s1;
      for (let k = 1; k < 4; k++) { await page.keyboard.press('Tab'); await expectOne(`keyboard focus on item ${k + 1}`, ids[k]); }
      await page.keyboard.press('Escape'); const esc = await expectNone('Escape'); if (!esc.active.startsWith('SUMMARY')) fail('Escape moved focus away from the item');
      await page.keyboard.press('Shift+Tab'); await expectOne('Shift+Tab back to the previous item', ids[2]);
      if (shots) await page.screenshot({ path: `${shots}/after-focus-${w}-${scale * 100}.png`, clip: { x: 0, y: 0, width: w, height: Math.min(h, 320) } });
      await page.evaluate(() => document.activeElement?.blur()); await expectNone('blur');
    }
    if (!touch) {
      // Mouse: each item opens only its own tooltip; moving on replaces it; leaving closes it.
      for (let i = 0; i < count; i++) { await summaries.nth(i).hover(); await expectOne(`hover item ${i + 1}`, ids[i]); if (shots && i === 3) await page.screenshot({ path: `${shots}/after-hover-${w}-${scale * 100}.png`, clip: { x: 0, y: 0, width: w, height: Math.min(h, 320) } }); }
      await page.mouse.move(w / 2, h - 20); await expectNone('pointer left the top bar');
      // Click then leave: focus stays on the item, but the tooltip must not stay pinned.
      await summaries.nth(1).click(); await expectOne('after a click', ids[1]);
      await page.mouse.move(w / 2, h - 20); const left = await expectNone('mouse left after a click (leftover focus must not pin it)');
      if (!left.active.startsWith('SUMMARY')) note.push('focus moved'); else note.push('focus stayed on the item, tooltip closed');
      await summaries.nth(0).dblclick(); const sel = await page.evaluate(() => String(getSelection())); if (sel.trim()) fail(`double-click selected text: "${sel.trim().slice(0, 30)}"`);
      await page.mouse.move(w / 2, h - 20); await expectNone('after double-click and leave');
    }
    if (touch) { // Tap: opens one, tapping another replaces it, tapping elsewhere closes it.
      await summaries.nth(1).tap(); await expectOne('tap on item 2', ids[1]);
      if (shots) await page.screenshot({ path: `${shots}/after-tap-${w}-${scale * 100}.png`, clip: { x: 0, y: 0, width: w, height: Math.min(h, 320) } });
      await summaries.nth(3).tap(); await expectOne('tap on item 4', ids[3]);
      await summaries.nth(3).tap(); await expectNone('second tap on the same item');
      await summaries.nth(2).tap(); await expectOne('tap on item 3', ids[2]);
      await page.touchscreen.tap(w / 2, h - 40); await expectNone('tap elsewhere');
    }
    rows.push(`${id}: ${count} items, one tooltip at a time${note.length ? ' (' + note.join('; ') + ')' : ''}`);
    await context.close();
  }
}

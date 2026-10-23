/** #392 S8 check: the UI v2 mobile pass (NEXT_PUBLIC_HARIMU_UI_V2_MOBILE) in the real GameShell with the shipped CSS, S3 panel, S4 rail and S7 City on as in preview,
 *  City, Nation and World views, guest and signed in (citizen dock), flag off and on, at 1280x800, 390x844, 320x700 and 320x640, 100/125/150% text.
 *  Flag on, phone:
 *  - the rail + place tabs row is a bottom tab bar: at the top of the page it sits on the screen bottom (on the citizen dock when signed in), never covers the top bar,
 *    may wrap to two rows (320 at 150%, ARC) but never truncates or scrolls sideways; the City scene fills the screen between the bars and its canvas fits (#377); scrolled to the end it sits under the panel, so nothing is hidden behind it;
 *  - every rail level and tab is at least 44px tall and uncovered; the panel is a bottom sheet (rounded top corners).
 *  Both: the same controls in the same DOM order with the same names as flag off; the page never scrolls sideways. Desktop with the flag on matches flag off.
 *  With LAYOUT_SHOTS_DIR, shots go to docs/screenshots/392-s8. Used by hud-layout-check.mjs; runs on its own too. */
import { bundleShell, shellProps } from './hud-tooltip-check.mjs';
import { readFile } from 'node:fs/promises';
import { isMain, runStandalone } from './layout-standalone.mjs';

const entry = `
  import React from 'react'; import { createRoot } from 'react-dom/client'; import { GameShell } from './app/game-shell.tsx'; import { CitySummary } from './app/scene-panels-v2.tsx';
  import { cityDestinations } from './lib/city-destinations.ts';
  const nation = { id: 'kindle', name: 'Kindle Republic', capital: 'Forgehaven', currency: 'Spark', color: '#c7643a' };
  window.mount = (props, dock) => { window.__root?.unmount(); window.__root = createRoot(document.getElementById('root')); const city = props.view === 'square';
    window.__root.render(<GameShell {...props} nation={nation} citizenNation={nation} nations={[nation]} onNavigate={() => {}} onSelectNation={() => {}} onSelect={() => {}} accountControls={null}
      socialDock={dock ? <nav className="citizen-dock" aria-label="Citizen communications"><button type="button">Chat</button><button type="button">Diplomatic hall</button><button type="button">News</button><button type="button">Civic inbox<strong> · 1 unread</strong></button></nav> : null}
      contextTitle={city ? 'City destinations' : undefined} contextItems={city ? cityDestinations('kindle', true).map(c => ({ ...c, onSelect: () => {} })) : undefined}
      panel={<CitySummary cityName="Forgehaven" city={{ capital: true }} nation={nation} destinations={cityDestinations('kindle', true)} onView={() => {}} />} />); };`;

/** Runs in the page. */
const probe = ({ on, phone, view, scale }) => {
  const issues = [], vw = document.documentElement.clientWidth, vh = window.innerHeight, q = s => document.querySelector(s);
  const box = s => { const r = q(s)?.getBoundingClientRect(); return r && { l: r.left, t: r.top, r: r.right, b: r.bottom }; };
  const overlaps = (a, b) => a && b && a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
  if (document.documentElement.scrollWidth > vw + 1) issues.push(`page scrolls sideways by ${document.documentElement.scrollWidth - vw}px`);
  const row = q('.game-nav-row'); if (!row) return { issues: [...issues, 'no nav row'] };
  const controls = [...row.querySelectorAll('button')], names = controls.map(b => b.getAttribute('aria-label') ?? b.textContent.trim());
  const rects = { nav: box('.game-nav-row'), stage: box('.game-stage'), hud: box('.game-hud'), panel: box('.game-inspector') };
  const sheet = on && phone;
  if (sheet) {
    const dock = box('.citizen-dock'), floor = dock ? dock.t : vh;
    if (Math.abs(rects.nav.b - floor) > 1) issues.push(`tab bar bottom at ${Math.round(rects.nav.b)}, not on the ${dock ? 'dock' : 'screen bottom'} (${Math.round(floor)})`);
    if (overlaps(rects.nav, rects.hud)) issues.push('tab bar covers the top bar');
    if (rects.stage && Math.abs(rects.stage.t - rects.hud.b) > 1.5) issues.push(`${Math.round(rects.stage.t - rects.hud.b)}px gap between the top bar and the scene`);
    // A pinned bar overlays whatever scrolls under it; the page end is checked below (atEnd). At 100% text the City scene fits above the bar unscrolled (#377).
    if (view === 'square' && overlaps(rects.nav, rects.stage)) issues.push('tab bar covers the City scene');
    if (view === 'square') { const c = box('.game-stage .viewport-canvas'), d = box('.citizen-dock'), sh = box(':is(#game-details, #game-reopen)'), floor = Math.min(rects.nav.t, d ? d.t : vh, sh ? sh.t : vh); // #377: the canvas fits between the bars
      if (!c || c.t < rects.hud.b - 1 || c.b > floor + 1) issues.push(`City canvas ${c ? `${Math.round(c.t)}-${Math.round(c.b)}` : 'missing'} does not fit between the bars (${Math.round(rects.hud.b)}-${Math.round(floor)})`);
      else if (on && sh && scale === 1 && rects.stage.b > sh.t + 1.5) issues.push(`scene runs ${Math.round(rects.stage.b - sh.t)}px under the sheet`); // #847: at 100% the map controls stay above the open sheet; at larger text the sheet may overlay them until collapsed (checked in sheetToggle)
      else if (Math.abs(rects.stage.b - floor) > 1.5 && rects.stage.b - rects.stage.t > 261) issues.push(`scene ends ${Math.round(floor - rects.stage.b)}px above the tab bar`); }
    for (const b of controls) { const t = b.querySelector('span') ?? b; if (t.scrollWidth > t.clientWidth + 1 || b.scrollWidth > b.clientWidth + 1) issues.push(`"${b.textContent.trim()}" is truncated`); } // ARC: the bar may wrap to two rows at 320/150%, never truncate
    if (row.scrollWidth > row.clientWidth + 1) issues.push('tab bar scrolls sideways');
    for (const b of controls) { const r = b.getBoundingClientRect(), t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (r.height < 43.5) issues.push(`"${b.textContent.trim()}" is ${Math.round(r.height)}px tall`); if (t && !b.contains(t)) issues.push(`"${b.textContent.trim()}" is covered`); }
    if (view === 'square') { const ps = [...document.querySelectorAll('.viewport-world-label')].filter(b => !b.hidden && b.offsetWidth).map(b => [b.getAttribute('aria-label'), b.getBoundingClientRect()]); // #874: City place labels never overlap, even on a ~140px map
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) { const [n, a] = ps[i], [m, b] = ps[j]; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) issues.push(`labels "${n}" and "${m}" overlap`); } }
    const sh = q(':is(#game-details, #game-reopen)'), shr = sh?.getBoundingClientRect(); // #847: the sheet is fixed on the tab bar, with one 44px+ toggle
    if (!sh || getComputedStyle(sh).position !== 'fixed' || Math.abs(shr.bottom - rects.nav.t) > 1) issues.push(`sheet is not fixed on the tab bar (${sh ? `${getComputedStyle(sh).position} ${Math.round(shr.bottom)}` : 'missing'})`);
    const tg = q('#game-details .game-inspector-title button[aria-controls=game-details], #game-reopen'), tr = tg?.getBoundingClientRect();
    if (!tg || !tg.hasAttribute('aria-expanded') || tr.height < 43.5 || tr.width < 43.5) issues.push(`sheet toggle missing, without aria-expanded or under 44px`);
    for (const b of document.querySelectorAll('.citizen-dock>button')) { const r = b.getBoundingClientRect(); // #838: dock labels wrap, never clip; the dock is never under the tab bar
      if (b.scrollWidth > b.clientWidth + 1 || b.scrollHeight > b.clientHeight + 1) issues.push(`dock "${b.textContent.trim()}" is truncated`); if (r.height < 43.5) issues.push(`dock "${b.textContent.trim()}" is ${Math.round(r.height)}px tall`);
      const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); if (t && !b.contains(t)) issues.push(`dock "${b.textContent.trim()}" is covered`); }
    const p = q('.game-inspector'); if (p && parseFloat(getComputedStyle(p).borderTopLeftRadius) < 8) issues.push('panel is not a sheet');
  } else if (phone && rects.stage && rects.nav.t > rects.stage.t) issues.push('flag off: nav row is not above the scene');
  return { issues, names, rects };
};
const atEnd = () => { if (!document.querySelector('.game-nav-row')) return []; window.scrollTo(0, document.documentElement.scrollHeight); const n = document.querySelector('.game-nav-row').getBoundingClientRect(), d = document.querySelector('.citizen-dock')?.getBoundingClientRect();
  const last = [...document.querySelectorAll('.harimu-game > :is(.game-inspector,.game-context-strip,.game-stage,.game-notice)')].reduce((m, e) => Math.max(m, e.getBoundingClientRect().bottom), 0);
  const issues = []; if (n.top < last - 1) issues.push(`scrolled to the end, the tab bar still covers ${Math.round(last - n.top)}px of content`); if (d && n.bottom > d.top + 1) issues.push('tab bar under the dock');
  window.scrollTo(0, 0); return issues; };

// #847: keyboard collapse then expand. The toggle reports aria-expanded, focus moves to the other end, and the scene resizes to the sheet each time.
const sheetToggle = async page => { // #874: collapsed, the map controls clear the Show-details bar at every size, 320x640 at 150% included
  const state = () => page.evaluate(() => { const g = document.querySelector('.harimu-game'), o = document.querySelector('#game-reopen'), sh = document.querySelector(':is(#game-details, #game-reopen)'), st = document.querySelector('.game-stage');
    return { open: !!document.querySelector('#game-details'), exp: (o ?? document.querySelector('#game-details .game-inspector-title button'))?.getAttribute('aria-expanded'), focus: document.activeElement?.id || document.activeElement?.closest('#game-details') ? (document.activeElement.id || 'in-sheet') : '', h: o?.getBoundingClientRect().height ?? 0,
      gap: Math.round(sh.getBoundingClientRect().top - st.getBoundingClientRect().bottom), sheetVar: g.style.getPropertyValue('--s8-sheet'), sh: Math.round(sh.getBoundingClientRect().height) }; });
  const issues = [];
  await page.focus('#game-details .game-inspector-title button'); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  let s = await state();
  if (s.open || s.exp !== 'false' || s.focus !== 'game-reopen' || s.h < 43.5) issues.push(`collapse by keyboard: ${JSON.stringify(s)}`);
  if (s.gap < -1.5) issues.push(`collapsed, the scene still runs ${-s.gap}px under the Show details bar`);
  if (`${s.sh}px` !== s.sheetVar && Math.abs(parseFloat(s.sheetVar) - s.sh) > 1) issues.push(`collapsed sheet not measured (${s.sheetVar} vs ${s.sh})`);
  await page.keyboard.press('Enter'); await page.waitForTimeout(250); s = await state();
  if (!s.open || s.exp !== 'true' || !s.focus) issues.push(`expand by keyboard: ${JSON.stringify(s)}`);
  return issues;
};

export async function checkUiV2Mobile({ browser, css, preflight, failures, rows }) {
  const shots = process.env.LAYOUT_SHOTS_DIR, base = {}, extra = await readFile(new URL('../app/panel-v2.css', import.meta.url), 'utf8');
  for (const flag of ['false', 'true']) {
    const script = await bundleShell(entry, { NEXT_PUBLIC_HARIMU_UI_V2_MOBILE: flag, NEXT_PUBLIC_HARIMU_UI_V2_CITY: 'true', NEXT_PUBLIC_HARIMU_UI_V2_PANEL: 'true', NEXT_PUBLIC_HARIMU_UI_V2_RAIL: 'true' }, { realViewport: true }), on = flag === 'true';
    for (const [w, h] of [[1280, 800], [390, 844], [320, 700], [320, 640]]) for (const scale of [1, 1.25, 1.5]) {
      const phone = w <= 760, context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: phone }), page = await context.newPage(); page.setDefaultTimeout(90000);
      await page.setContent(`<!doctype html><html style="--text-scale:${scale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}${css}${extra}</style></head><body><div id="root"></div></body></html>`);
      await page.addScriptTag({ content: script });
      for (const view of ['square', 'country', 'world']) for (const dock of [false, true]) {
        const id = `${w}x${h} @${scale * 100}% S8 ${view}${dock ? ' signed in' : ''} (flag ${on ? 'on' : 'off'})`, key = `${w}x${h}@${scale}/${view}/${dock}`;
        await page.evaluate(([p, d]) => window.mount(p, d), [{ ...shellProps, view }, dock]); await page.waitForSelector('.game-nav-row', { state: 'attached', timeout: 5000 }).catch(() => {}); await page.waitForTimeout(200);
        if (phone) await page.waitForFunction(() => { const c = document.querySelector('.game-stage .viewport-canvas, .game-stage'); const h = Math.round(c?.getBoundingClientRect().height ?? 0); const same = h === window.__lastH; window.__lastH = h; return same; }, null, { polling: 100, timeout: 5000 }).catch(() => {}); // the canvas size has settled (deterministic shots)
        const late = on && phone && view === 'square' && !dock ? await page.evaluate(async () => { // a dock that mounts after the shell (signing in on City) is measured too
          const main = document.querySelector('.harimu-game'), d = document.createElement('nav'); d.className = 'citizen-dock'; d.style.height = '45px'; main.appendChild(d);
          await new Promise(r => setTimeout(r, 120)); const v = main.style.getPropertyValue('--s8-dock'); d.remove(); await new Promise(r => setTimeout(r, 120));
          return v === '45px' && main.style.getPropertyValue('--s8-dock') === '0px' ? '' : `late dock not measured (--s8-dock ${v})`; }) : '';
        const r = await page.evaluate(probe, { on, phone, view, scale }), toggle = on && phone && view === 'square' ? await sheetToggle(page) : [];
        const issues = [...toggle, ...(late ? [late] : []), ...r.issues, ...(on && phone ? await page.evaluate(atEnd) : [])];
        if (!on) base[key] = r; else if (base[key]) {
          if (base[key].names && r.names && base[key].names.join() !== r.names.join()) issues.push(`controls changed: ${r.names.join()} vs ${base[key].names.join()}`);
          if (!phone && JSON.stringify(base[key].rects) !== JSON.stringify(r.rects)) issues.push('desktop layout changed with the flag on');
        }
        for (const i of issues) failures.push(`${id}: ${i}`);
        rows.push(`${id}: ${r.names?.length ?? 0} nav controls${issues.length ? ' ✗' : ''}`);
        if (shots) await page.evaluate(() => document.fonts.ready); if (shots && h !== 640 && scale !== 1.25 && !dock && (view === 'square' || (phone && on))) await page.screenshot({ path: `${shots}/s8-${view}-${on ? 'on' : 'off'}-${w}-${scale * 100}.png` });
      }
      await context.close();
    }
  }
}
if (isMain(import.meta.url)) await runStandalone('S8 mobile pass', checkUiV2Mobile);

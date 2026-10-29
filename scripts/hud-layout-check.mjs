/** #186 rendered HUD check: the world-clock TEXT (not its box) must never reach the Glossary link.
 *  Renders the real GameShell markup with the shipped CSS in headless Chromium and measures the clock text with a
 *  Range rect against the Glossary link at 1280x800 and 390x844 for text size 100/125/150%, for every clock label.
 *  Also asserts the HUD never runs into the dock and the page never scrolls sideways, and (#229) at 390 and 360 wide that
 *  no dock label breaks mid-word, spills out of its button, or makes the dock scroll sideways.
 *  (#280) The clock's "Public holiday" line is checked like every other clock label, and the faith card, congregation block and
 *  holiday banner are rendered in the inspector for Kindle, Aurelle (holiday) and Korund at the same sizes: no text may leave its
 *  card, no word may break mid-word, every control is at least 44px tall, and the page never scrolls sideways.
 *  (#78) The nation emblem (flag on/off) and the notifications bell in the top bar (scripts/hud-emblem-check.mjs).
 *  (#346) The top bar, shift chip and collapsed-panel button at 320-1280px wide and 100-150% text (scripts/hud-zoom-check.mjs).
 *  (#79) The color-blind-safe nation symbol chips, flag on and off (scripts/nation-symbols-check.mjs).
 *  (#392 S4) The zoom rail (scripts/ui-v2-rail-check.mjs).
 *  (#392 S7) City hotspot pills and no bottom strip (scripts/ui-v2-city-check.mjs).
 *  (#243) Filler wire stories under their byline in the National news dialog (scripts/wire-bylines-check.mjs).
 *  (#85) Nation skin on the top bar: same layout and text, AA text, visible focus (scripts/nation-skin-check.mjs).
 *  (#392 S6) The Nation panel (scripts/ui-v2-nation-check.mjs).
 *  (#800) Rare resource node marker on the Resources overlay, flag off and on (scripts/rare-marker-check.mjs).
 *  (#969) Top-bar countdown to the next scheduled event, flag off and on (scripts/topbar-countdown-check.mjs).
 *  (#970) Korund ration coupons as a stamped booklet, flag off and on (scripts/korund-ration-booklet-check.mjs).
 *  (#1008) Aurelle royal decree as a sealed scroll, flag off and on (scripts/aurelle-sealed-scroll-check.mjs).
 *  (#1009) Kindle Assembly and presidential ballots as a civic form, flag off and on (scripts/kindle-civic-ballot-check.mjs).
 *  (#779) Nation fact-list labels never split mid-word (scripts/nation-fact-label-check.mjs).
 *  (#392 S5) World crest chips (scripts/ui-v2-world-check.mjs).
 *  (#392 S3) The UI v2 panel shape, World and City (scripts/ui-v2-panel-check.mjs).
 *  (#392 S1) The nation crest in the inspector header, flag on and off, all ten nations (scripts/nation-crests-check.mjs).
 *  (#682) The bell's unread badge, up to the capped "99+", fits inside the fixed 44px phone bell (scripts/bell-badge-check.mjs).
 *  (#392 S2) The UI v2 top bar restyle: flag off pin, emblem-only pin, v2 on (scripts/ui-v2-topbar-check.mjs).
 *  (#347) The shift quality dialog is rendered with the real component (scripts/shift-quality-layout-check.mjs).
 *  (#366) The top-bar help tooltips are driven with a real mouse, keyboard and touch (scripts/hud-tooltip-check.mjs).
 *  (#452) The Clerk account menu never cuts off the email at 100-150% text (scripts/account-menu-layout-check.mjs).
 *  (#528) Every phone control is at least 44x44 and the camera bar never covers the canvas (scripts/phone-tap-targets-check.mjs).
 *  Run: npm run test:layout   (CI installs Chromium for it; `npm test` stays browser-free). */
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { chromium } from 'playwright';
import { checkHudTooltips } from './hud-tooltip-check.mjs';
import { checkHudZoom } from './hud-zoom-check.mjs';
import { checkDevelopmentPreviewNote } from './hud-preview-note-check.mjs';
import { checkNationSymbols } from './nation-symbols-check.mjs';
import { checkNationCrests } from './nation-crests-check.mjs';
import { checkUiV2Panel } from './ui-v2-panel-check.mjs';
import { checkRareMarker } from './rare-marker-check.mjs';
import { checkNationFactLabels } from './nation-fact-label-check.mjs';
import { checkUiV2World } from './ui-v2-world-check.mjs';
import { checkUiV2City } from './ui-v2-city-check.mjs';
import { checkUiV2Mobile } from './ui-v2-mobile-check.mjs';
import { checkUiV2Household } from './ui-v2-household-check.mjs';
import { checkModConsole } from './mod-console-check.mjs';
import { checkUiV2WorkMarket } from './ui-v2-work-market-check.mjs';
import { checkSessionRetry } from './session-retry-check.mjs';
import { checkUiV2Government } from './ui-v2-government-check.mjs';
import { checkWireBylines } from './wire-bylines-check.mjs';
import { checkNationSkin } from './nation-skin-check.mjs';
import { checkUiV2Nation } from './ui-v2-nation-check.mjs';
import { checkUiV2Rail } from './ui-v2-rail-check.mjs';
import { checkUiV2Topbar } from './ui-v2-topbar-check.mjs';
import { checkBellBadge } from './bell-badge-check.mjs';
import { checkTopBarEmblem } from './hud-emblem-check.mjs';
import { checkShiftQualityStep } from './shift-quality-layout-check.mjs';
import { checkPhoneLabels } from './phone-labels-check.mjs';
import { checkAccountMenu } from './account-menu-layout-check.mjs';
import { checkPhoneTapTargets } from './phone-tap-targets-check.mjs';
import { checkCityDestinations } from './city-destinations-check.mjs';
import { checkVisitorWording } from './visitor-wording-check.mjs';
import { checkGlobeLabelPressed } from './globe-label-pressed-check.mjs';
import { checkTopbarCountdown } from './topbar-countdown-check.mjs';
import { checkKorundRationBooklet } from './korund-ration-booklet-check.mjs';
import { checkAurelleSealedScrolls } from './aurelle-sealed-scroll-check.mjs';
import { checkKindleCivicBallot } from './kindle-civic-ballot-check.mjs';
import { checkMobileTwoTap } from './mobile-two-tap-check.mjs';
import { checkMapOverlays } from './map-overlays-layout-check.mjs';
import { faithState, congregationState } from './faith-ui-fixtures.mjs';
import { fontsBeforeShots } from './layout-standalone.mjs';
const require = createRequire(import.meta.url);
const React = require('react'); const { renderToStaticMarkup } = require('react-dom/server');
const root = new URL('../', import.meta.url);

const cache = new Map();
async function load(rel) {
  if (cache.has(rel)) return cache.get(rel);
  const src = await readFile(new URL(`app/${rel}.tsx`, root), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const deps = {};
  for (const [, name] of js.matchAll(/require\("([^"]+)"\)/g)) if (name.startsWith('./') && !name.endsWith('.css') && !['./game-viewport', './game-timer', './square-chat'].includes(name)) deps[name] = await load(name.slice(2));
  const exports = {}; const mod = { exports };
  new Function('exports', 'require', 'module', js)(exports, name => {
    if (deps[name]) return deps[name];
    if (name.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_, k) => String(k) }) };
    if (name.endsWith('.css')) return {};
    if (name === './game-viewport') return { __esModule: true, default: () => null };
    if (name === './game-timer') return { GameTimer: () => null };
    if (name === './square-chat') return { SquareChat: () => null };
    if (name === '@clerk/nextjs') return { useClerk: () => ({ mountUserButton() {}, unmountUserButton() {} }) };
    if (name.startsWith('@/lib/')) return require(new URL(`lib/${name.slice(6)}.ts`, root).pathname);
    if (name.startsWith('../lib/')) return require(new URL(`lib/${name.slice(7)}.ts`, root).pathname);
    // Icons keep their real footprint (phosphor's CJS build can't be required here): an empty svg at the given size.
    if (name === '@phosphor-icons/react') return new Proxy({}, { get: () => p => React.createElement('svg', { width: p.size ?? '1em', height: p.size ?? '1em', 'aria-hidden': true }) });
    return require(name);
  }, mod);
  cache.set(rel, mod.exports); return mod.exports;
}

const nation = { id: 'kindle', name: 'Kindle Republic', capital: 'Forgehaven' };
// Every label the clock can show (see game-shell.tsx): preview, loading (citizen), live clock, guest sample.
const variants = [
  { name: 'World preview', props: {} },
  { name: 'Loading world', props: { citizenNation: nation } },
  { name: 'Day 12 · 12×', props: { citizenNation: nation, worldClock: { gameDay: 12, latestTick: 140 } } },
  { name: 'Public holiday', props: { citizenNation: nation, worldClock: { gameDay: 12, latestTick: 140 }, holidayName: 'Oath Day' } }, // #280: extra clock line
  { name: 'Sample', props: { guestDemo: true } },
  // Korund renames two dock places (State store, Assignment): the longest dock labels.
  { name: 'Korund dock labels', props: { nation: { id: 'korund', name: 'Korund', capital: 'Stonehearth' }, citizenNation: { id: 'korund', name: 'Korund', capital: 'Stonehearth' } } },
];
// Local-demo account controls, as page.tsx renders them (Brief button + demo label).
const accountControls = React.createElement(React.Fragment, null,
  React.createElement('button', { type: 'button', className: 'game-glossary', 'aria-label': 'Open morning brief' }, React.createElement('svg', { width: 17, height: 17 }), React.createElement('span', null, 'Brief')),
  React.createElement('span', { className: 'account-demo-label' }, 'Local demo'));

const css = (await readFile(new URL('app/globals.css', root), 'utf8')).replace(/@import[^;]+;/g, '') + (await readFile(new URL('app/game-shell.css', root), 'utf8'));
const preflight = '*,::before,::after{box-sizing:border-box;margin:0;padding:0;border:0 solid}button{background:none;font:inherit;color:inherit}svg{display:block}';
const { GameShell } = await load('game-shell');
const { FaithPanel, HolidayBanner } = await load('faith-panel');

const browser = fontsBeforeShots(await chromium.launch({ args: ['--disable-gpu', '--disable-dev-shm-usage'] })); // #905
const failures = []; const rows = [];
try {
  for (const v of variants) {
    const body = renderToStaticMarkup(React.createElement(GameShell, { view: 'world', nation, citizenNation: null, nations: [nation], capacity: 18, localDemo: true, panel: null, onNavigate() {}, accountControls, ...v.props }));
    for (const [w, h] of [[1280, 800], [390, 844], [360, 740]]) for (const scale of [1, 1.25, 1.5]) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      await page.setContent(`<!doctype html><html style="--text-scale:${scale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}${css}</style></head><body>${body}</body></html>`);
      const r = await page.evaluate(() => {
        const clock = document.querySelector('.game-clock'), glossary = document.querySelector('.game-account > .game-glossary');
        const range = document.createRange(); range.selectNodeContents(clock);
        const rects = [...range.getClientRects()].filter(x => x.width > 0); const text = { left: Math.min(...rects.map(x => x.left)), right: Math.max(...rects.map(x => x.right)), top: Math.min(...rects.map(x => x.top)), bottom: Math.max(...rects.map(x => x.bottom)) };
        const g = glossary.getBoundingClientRect(); const hud = document.querySelector('.game-hud').getBoundingClientRect(); const dock = document.querySelector('.game-dock').getBoundingClientRect();
        const vOverlap = text.top < g.bottom && g.top < text.bottom;
        // #229 dock labels: no word may be split across lines, and the label text must stay inside its button.
        const dockIssues = []; const dockEl = document.querySelector('.game-dock');
        for (const btn of dockEl.querySelectorAll('button')) {
          const span = btn.querySelector('span'); if (!span || !span.firstChild) continue;
          const node = span.firstChild, text = node.textContent, b = btn.getBoundingClientRect();
          for (const m of text.matchAll(/\S+/g)) {
            const rg = document.createRange(); rg.setStart(node, m.index); rg.setEnd(node, m.index + m[0].length);
            const tops = new Set([...rg.getClientRects()].filter(x => x.width > 0).map(x => Math.round(x.top)));
            if (tops.size > 1) dockIssues.push(`"${m[0]}" breaks mid-word`);
          }
          const all = document.createRange(); all.selectNodeContents(span); const rs = [...all.getClientRects()].filter(x => x.width > 0);
          if (rs.some(x => x.left < b.left - 0.5 || x.right > b.right + 0.5)) dockIssues.push(`"${text}" overflows its button`);
        }
        if (dockEl.scrollWidth > dockEl.clientWidth + 1) dockIssues.push(`dock scrolls sideways (${dockEl.scrollWidth} > ${dockEl.clientWidth})`);
        const labels = [...dockEl.querySelectorAll('button span')].map(x => x.textContent).join('/');
        return { dockIssues, labels, dockRows: new Set([...dockEl.querySelectorAll('button')].map(x => Math.round(x.getBoundingClientRect().top))).size, gap: Math.round((g.left - text.right) * 10) / 10, vOverlap, lines: new Set(rects.map(x => Math.round(x.top))).size, hudDock: Math.round(hud.bottom - dock.top), sw: document.scrollingElement.scrollWidth, cw: document.scrollingElement.clientWidth };
      });
      const id = `${w}x${h} @${scale * 100}% "${v.name}"`;
      rows.push(`${id}: text→Glossary gap ${r.gap}px, ${r.lines} line(s), HUD-dock ${r.hudDock}px, page ${r.sw}/${r.cw}, dock ${r.dockRows} row(s)${r.dockIssues.length ? ' ✗ ' + r.dockIssues.join('; ') : ' labels OK'}`);
      if (w <= 390) for (const d of r.dockIssues) failures.push(`${id}: dock ${d}`);
      if (r.vOverlap && r.gap < 4) failures.push(`${id}: clock text is ${r.gap}px from Glossary (needs ≥4px)`);
      if (r.hudDock > 0) failures.push(`${id}: HUD runs ${r.hudDock}px into the dock`);
      if (r.sw > r.cw) failures.push(`${id}: page scrolls sideways (${r.sw} > ${r.cw})`);
      await page.close();
    }
  }

  // #280: faith card, congregation block and holiday banner inside the real inspector.
  const noop = () => {};
  const api = (faith, congregations) => ({ faith, congregations, busy: false, message: '', error: '', chooseFaith: noop, attendWorship: noop, joinFestival: noop, congregation: noop });
  const faithScenes = [
    { name: 'Kindle · Fair-Wind Vow, not joined', slug: 'not-joined', nation, faith: faithState({ devotion: 34 }), cong: congregationState({}) },
    { name: 'Kindle · locked, joined, Officiant, festival', slug: 'locked-joined-officiant', nation, faith: faithState({ locked: true, worshippedToday: true, festivalBanner: true, devotion: 100 }), cong: congregationState({ member: true, opt: true, officiant: true, blocked: 'You can join or leave a congregation once per game day. Come back tomorrow.' }) },
    { name: 'Aurelle · Oath Day holiday', slug: 'oath-day-holiday', nation: { id: 'aurelle', name: 'Aurelle', capital: 'Highspire' }, pick: 'open-hand', faith: faithState({ nation: 'aurelle', holiday: true, devotion: 62, royalFavor: 14 }), cong: congregationState({ nation: 'aurelle', faith: 'kinward-rite', member: true }) },
    { name: 'Aurelle · leaving costs Royal Favor, short', slug: 'leave-cost-short', nation: { id: 'aurelle', name: 'Aurelle', capital: 'Highspire' }, pick: 'unaffiliated', faith: faithState({ nation: 'aurelle', devotion: 20, royalFavor: 4 }), cong: congregationState({ nation: 'aurelle', faith: 'kinward-rite' }) },
    { name: 'Korund · Unaffiliated', slug: 'unaffiliated', nation: { id: 'korund', name: 'Korund', capital: 'Stonehearth' }, faith: faithState({ nation: 'korund' }), cong: null },
  ];
  for (const sc of faithScenes) {
    const panel = React.createElement(React.Fragment, null, React.createElement(HolidayBanner, { faith: sc.faith, busy: false, onJoin: noop }), React.createElement(FaithPanel, { api: api(sc.faith, sc.cong), initialPick: sc.pick ?? null }));
    const body = renderToStaticMarkup(React.createElement(GameShell, { view: 'household', nation: sc.nation, citizenNation: sc.nation, nations: [sc.nation], capacity: 18, localDemo: true, panel, onNavigate() {}, accountControls, worldClock: { gameDay: 12, latestTick: 140 }, holidayName: sc.faith.holiday?.name ?? null }));
    for (const [w, h] of [[1280, 800], [390, 844], [360, 740]]) for (const scale of [1, 1.25, 1.5]) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      await page.setContent(`<!doctype html><html style="--text-scale:${scale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}${css}</style></head><body>${body}</body></html>`);
      const r = await page.evaluate(() => {
        const issues = []; const cards = [...document.querySelectorAll('.faith-panel, .holiday-banner')];
        for (const card of cards) {
          const c = card.getBoundingClientRect();
          const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            if (!n.textContent.trim()) continue;
            const rg = document.createRange(); rg.selectNodeContents(n);
            const rs = [...rg.getClientRects()].filter(x => x.width > 0);
            if (rs.some(x => x.right > c.right + 0.5 || x.left < c.left - 0.5)) issues.push(`text leaves its card: "${n.textContent.trim().slice(0, 40)}"`);
            // Words in controls and headings must not split across lines.
            if (n.parentElement.closest('button, legend, h2, h3, strong')) for (const m of n.textContent.matchAll(/\S+/g)) {
              const wr = document.createRange(); wr.setStart(n, m.index); wr.setEnd(n, m.index + m[0].length);
              if (new Set([...wr.getClientRects()].filter(x => x.width > 0).map(x => Math.round(x.top))).size > 1) issues.push(`"${m[0]}" breaks mid-word`);
            }
          }
          for (const el of card.querySelectorAll('button, input[type=radio]')) { const b = el.getBoundingClientRect(); if (el.tagName === 'BUTTON' && b.height < 43.5) issues.push(`button "${el.textContent}" is ${Math.round(b.height)}px tall (needs 44)`); if (b.right > c.right + 0.5) issues.push(`${el.tagName.toLowerCase()} "${el.textContent || el.value}" overflows the card`); }
          const clipped = [...card.querySelectorAll('*')].find(el => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible'); if (clipped) issues.push(`<${clipped.tagName.toLowerCase()}> clips its content`);
        }
        const clock = document.querySelector('.game-clock'), g = document.querySelector('.game-account > .game-glossary');
        let gap = null; if (clock && g && getComputedStyle(clock).display !== 'none') { const rg = document.createRange(); rg.selectNodeContents(clock); const rs = [...rg.getClientRects()].filter(x => x.width > 0); const gb = g.getBoundingClientRect(); const right = Math.max(...rs.map(x => x.right)); const vo = rs.some(x => x.top < gb.bottom && gb.top < x.bottom); gap = vo ? gb.left - right : null; }
        return { issues, cards: cards.length, gap, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, hudDock: Math.round(document.querySelector('.game-hud').getBoundingClientRect().bottom - document.querySelector('.game-dock').getBoundingClientRect().top) };
      });
      if (process.env.LAYOUT_SHOTS_DIR && w !== 360 && (scale === 1 || scale === 1.5)) { // docs/screenshots/280: LAYOUT_SHOTS_DIR=docs/screenshots/280 npm run test:layout
        if (w === 1280) await page.setViewportSize({ width: 1280, height: 1500 });
        await page.screenshot({ path: `${process.env.LAYOUT_SHOTS_DIR}/${sc.name.split(' · ')[0].toLowerCase()}-${sc.slug}-${w}-${scale * 100}.png`, fullPage: w < 600 });
      }
      const id = `${w}x${h} @${scale * 100}% faith "${sc.name}"`;
      rows.push(`${id}: ${r.cards} card(s), page ${r.sw}/${r.cw}${r.issues.length ? ' ✗ ' + r.issues.join('; ') : ''}`);
      if (!r.cards) failures.push(`${id}: faith card did not render`);
      for (const i of new Set(r.issues)) failures.push(`${id}: ${i}`);
      if (r.sw > r.cw) failures.push(`${id}: page scrolls sideways (${r.sw} > ${r.cw})`);
      if (r.gap !== null && r.gap < 4) failures.push(`${id}: clock text is ${Math.round(r.gap)}px from Glossary (needs ≥4px)`);
      if (r.hudDock > 0) failures.push(`${id}: HUD runs ${r.hudDock}px into the dock`);
      await page.close();
    }
  }
  await checkTopBarEmblem({ browser, css, preflight, failures, rows }); // #78: nation emblem and notifications bell in the top bar
  await checkHudZoom({ browser, css, preflight, failures, rows }); // #346: top bar and overlays at big text and browser zoom
  await checkNationSymbols({ browser, css, preflight, failures, rows }); // #79: nation symbol chips on the strip, comparison table and globe labels
  await checkNationCrests({ browser, css, preflight, failures, rows }); // #392 S1: nation crest in the inspector header (flag on and off)
  await checkUiV2Panel({ browser, css, preflight, failures, rows }); // #392 S3: panel shape in the World and City side panel
  await checkRareMarker({ browser, css, preflight, failures, rows }); // #800: rare resource node marker
  await checkNationFactLabels({ browser, css, preflight, failures, rows }); // #779: fact labels never split mid-word
  await checkUiV2World({ browser, css, preflight, failures, rows }); // #392 S5: crest chips in the World nation strip
  await checkUiV2Nation({ browser, css, preflight, failures, rows }); // #392 S6: Nation panel shape, institution rows, Explore {nation}
  await checkUiV2City({ browser, css, preflight, failures, rows }); // #392 S7: City hotspot pills, strip removed
  await checkUiV2Mobile({ browser, css, preflight, failures, rows });
  await checkModConsole({ browser, css, preflight, failures, rows }); // #880: read-only mod console
  await checkUiV2WorkMarket({ browser, css, preflight, failures, rows }); // #392 S10 (#870): Work and Market panel heads
  await checkSessionRetry({ browser, css, preflight, failures, rows }); // #928: session-card Retry state
  await checkUiV2Government({ browser, css, preflight, failures, rows }); // #392 S11 (#871): Government panel head
  await checkUiV2Household({ browser, css, preflight, failures, rows }); // #392 S9: Household panel // #392 S8: phone bottom tab bar and bottom-sheet panel
  await checkWireBylines({ browser, css, preflight, failures, rows }); // #243: wire story bylines
  await checkNationSkin({ browser, css, preflight, failures, rows }); // #85: nation skin on the top bar
  await checkUiV2Rail({ browser, css, preflight, failures, rows }); // #392 S4: zoom rail beside the stage, places-only top tabs
  await checkUiV2Topbar({ browser, css, preflight, failures, rows }); // #392 S2: UI v2 top bar restyle (flag off, emblem-only, v2 on)
  await checkBellBadge({ browser, css, preflight, failures, rows }); // #682: the bell's unread badge (99, 99+) stays inside the 44px phone bell
  await checkShiftQualityStep({ browser, css, preflight, failures, rows }); // #347: shift quality dialog is styled, spaced, reachable
  await checkDevelopmentPreviewNote({ browser, css, preflight, failures, rows }); // #366: no "Development preview" label in the top bar; note lives in Game settings
  await checkHudTooltips({ browser, css, preflight, failures, rows }); // #366: one top-bar tooltip at a time, on-screen, closed by leave / blur / Escape
  await checkPhoneLabels({ browser, css, preflight, failures, rows }); // #377: phone city labels inside the canvas and apart, destination cards and nation strip fit the width
  await checkAccountMenu({ browser, css, preflight, failures, rows }); // #452: the account menu shows the whole email at every text size
  await checkPhoneTapTargets({ browser, css, preflight, failures, rows }); // #528: phone controls are at least 44x44; the camera bar sits under the canvas
  await checkCityDestinations({ browser, css, preflight, failures, rows }); // #378: Korund cards say Assignment / State store like the tabs; country pins fit city names
  await checkGlobeLabelPressed({ browser, failures, rows }); // #618: the selected nation's globe label keeps aria-pressed after the scene rebuilds
  await checkMapOverlays({ browser, css, preflight, failures, rows }); // #82: Overlays bar at 1280 (no overlap/clip, 44px, no mid-word breaks); phone popover never covers the World chip
  await checkVisitorWording({ browser, css, preflight, failures, rows }); // #379: visitor wording (VISITOR PREVIEW, Household) and guide/pin text fit
  await checkTopbarCountdown({ browser, css, preflight, failures, rows }); // #969: countdown beside the world clock
  await checkKorundRationBooklet({ browser, css, preflight, failures, rows }); // #970: Korund ration booklet
  await checkAurelleSealedScrolls({ browser, css, preflight, failures, rows }); // #1008: Aurelle sealed scrolls
  await checkKindleCivicBallot({ browser, css, preflight, failures, rows }); // #1009: Kindle civic ballot
  await checkMobileTwoTap({ browser, css, preflight, failures, rows }); // #1040: daily-loop actions within two taps on a phone
} finally { await browser.close(); }
console.log(rows.join('\n'));
if (failures.length) { console.error(`\nHUD layout check FAILED:\n${failures.join('\n')}`); process.exit(1); }
console.log('\nHUD layout check passed.');

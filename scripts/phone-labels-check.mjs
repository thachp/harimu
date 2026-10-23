/** #377 check: on a phone the city labels, destination cards and nation strip fit the page.
 *  Bundles the real GameShell and GameViewport (three.js city and globe) with the shipped CSS in headless Chromium at 1280x800 and 390x844, 100/125/150% text,
 *  for the three playable nations' capitals (Kindle, Korund, Aurelle) and the nation strip, and asserts:
 *  - at 320 wide the canvas is only ~180px tall, so there labels may touch but must stay inside the canvas and none may be buried under another
 *  - desktop (1280) labels are exactly where the scene puts them (placement is phone-only); on a phone every visible 3D label sits fully inside the canvas (Kindle's "Your household" was cut off at the left edge) and no two labels overlap
 *    (Korund's "Stonehearth square" was hidden behind other labels), none sits under the breadcrumb / shift chip, and the page never scrolls sideways
 *  - on the phone, the destination cards and nation strip cards fit the page width with their text inside them: no sideways scroll, no clipped text ("Goods and citizen listings", "Stability 81"); desktop keeps its scrolling row
 *  Used by hud-layout-check.mjs (npm run test:layout). Screenshots: LAYOUT_SHOTS_DIR=docs/screenshots/377 (PHONE_LABELS_BEFORE=1 names them "before"). */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const entry = `
  import React from 'react'; import { createRoot } from 'react-dom/client';
  import { GameShell } from './app/game-shell.tsx';
  window.mount = props => { window.__root?.unmount(); window.__root = createRoot(document.getElementById('root'));
    window.__root.render(<GameShell {...props} onNavigate={() => {}} panel={<p>Panel</p>} />); };`;

async function bundle() {
  const result = await build({
    stdin: { resolveDir: root, loader: 'tsx', contents: entry }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', target: 'es2022', logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_CREST': '"false"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_TOPBAR': '"false"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_PANEL': '\"false\"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_RAIL': '\"false\"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_WORLD': '\"false\"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_NATION': '\"false\"', 'process.env.NEXT_PUBLIC_HARIMU_TOPBAR_EMBLEM': '"false"', 'process.env.NEXT_PUBLIC_HARIMU_NATION_SYMBOLS': '"false"' }, alias: { '@': root.replace(/\/$/, '') }, loader: { '.css': 'empty' },
    plugins: [{ name: 'stubs', setup(b) {
      const stubs = { './game-timer': 'export function GameTimer(){return null}', './square-chat': 'export function SquareChat(){return null}', '@clerk/nextjs': 'export const useClerk=()=>({mountUserButton(){},unmountUserButton(){}})' };
      b.onResolve({ filter: /^(\.\/game-timer|\.\/square-chat|@clerk\/nextjs)$/ }, a => ({ path: a.path, namespace: 'stub' }));
      b.onResolve({ filter: /\.module\.css$/ }, () => ({ path: 'css-module', namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: a.path === 'css-module' ? 'export default new Proxy({}, { get: (_, k) => String(k) })' : stubs[a.path], loader: 'jsx', resolveDir: root }));
    } }],
  });
  return result.outputFiles[0].text;
}

// The destination cards the city view really shows (app/page.tsx, view 'square') and the nation strip rows.
const cityCards = nationId => [
  { id: 'household', label: 'Household', detail: 'Belongings and recovery' },
  { id: 'workplace', label: nationId === 'korund' ? 'Assignment board' : 'Workplace', detail: 'Contributions and earnings' },
  { id: 'market', label: nationId === 'korund' ? 'State store' : 'Market', detail: nationId === 'korund' ? 'Ration coupons and state food' : 'Goods and citizen listings' },
  { id: 'government', label: 'Government', detail: 'Policy and petitions' },
];
const nations = [['kindle', 'Kindle Republic', 'Kindle', 'Forgehaven', 81], ['korund', 'Korund Union', 'Korund', 'Stonehearth', 77], ['aurelle', 'Aurelle Kingdom', 'Aurelle', 'Highspire', 84]].map(([id, name, shortName, capital, stability]) => ({ id, name, shortName, capital, stability }));
const scene = (n, view) => {
  const nation = nations.find(x => x.id === n);
  const props = { nation, nations, capacity: 18, localDemo: false, currentCityName: nation.capital, citizenNation: nation, view };
  props.contextItems = view === 'world'
    ? nations.map(x => ({ id: x.id, label: x.shortName, selected: x.id === n, badge: 'Growing', detail: `${x.capital} · Stability ${x.stability}` }))
    : cityCards(n);
  props.contextTitle = view === 'world' ? 'Nations' : 'City destinations';
  return { name: `${nation.shortName} ${view === 'world' ? 'nation strip' : 'City'}`, slug: `${n}-${view === 'world' ? 'strip' : 'city'}`, view, props };
};
const scenes = [scene('kindle', 'square'), scene('korund', 'square'), scene('aurelle', 'square'), scene('kindle', 'world')];

/** Runs in the page. */
const probe = scene => {
  const issues = [], vw = document.documentElement.clientWidth, rect = e => e.getBoundingClientRect();
  if (document.documentElement.scrollWidth > vw + 1) issues.push(`page scrolls sideways by ${document.documentElement.scrollWidth - vw}px`);
  const canvas = document.querySelector('.game-viewport'), labels = [...document.querySelectorAll('.viewport-world-label')].filter(e => !e.hidden && e.offsetWidth > 0);
  if (scene.view === 'square' && labels.length < 4) issues.push(`only ${labels.length} city labels visible`);
  if (canvas) {
    const c = rect(canvas);
    for (const l of scene.phone ? labels : []) { const r = rect(l); if (r.left < c.left - 0.5 || r.right > c.right + 0.5 || r.top < c.top - 0.5 || r.bottom > c.bottom + 0.5) issues.push(`label "${l.textContent}" leaves the canvas (${Math.round(r.left)}..${Math.round(r.right)} of ${Math.round(c.left)}..${Math.round(c.right)})`); }
  }
  // At 320 wide the canvas is ~180px tall and five 44px labels cannot all clear the breadcrumb: there they only have to stay apart from each other (placeLabels falls back to that).
  for (const l of scene.phone && scene.view === 'square' && vw > 340 ? labels : []) for (const o of document.querySelectorAll('.game-stage-overlay > *')) {
    const a = rect(l), b = rect(o);
    if (b.width > 0 && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) issues.push(`label "${l.textContent}" is covered by the breadcrumb or shift chip`);
  }
  if (scene.phone && scene.view === 'square' && vw <= 340) { // too short for five 44px labels (about 180px of canvas): they may overlap, but none may be buried under another
    for (const l of labels) { const r = rect(l), cx = r.left + r.width / 2, cy = r.top + r.height / 2; if (labels.some(o => o !== l && rect(o).left < cx && cx < rect(o).right && rect(o).top < cy && cy < rect(o).bottom)) issues.push(`label "${l.textContent}" is buried under another label`); }
  }
  for (let i = 0; scene.phone && scene.view === 'square' && vw > 340 && i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
    const a = rect(labels[i]), b = rect(labels[j]);
    if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) issues.push(`labels "${labels[i].textContent}" and "${labels[j].textContent}" overlap`);
  }
  const strip = document.querySelector('.game-context-items'), cards = [...(strip?.querySelectorAll(':scope > button') ?? [])];
  if (strip && scene.phone) { // desktop keeps its scrolling card row
    if (strip.scrollWidth > strip.clientWidth + 1) issues.push(`destination cards scroll sideways (${strip.scrollWidth} > ${strip.clientWidth})`);
    for (const card of cards) {
      const b = rect(card);
      if (b.right > vw + 0.5 || b.left < -0.5) issues.push(`card "${card.textContent.slice(0, 24)}" leaves the page (${Math.round(b.left)}..${Math.round(b.right)} of ${vw})`);
      const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent.trim()) continue;
        const rg = document.createRange(); rg.selectNodeContents(n);
        if ([...rg.getClientRects()].some(x => x.width > 0 && (x.right > b.right + 0.5 || x.left < b.left - 0.5))) issues.push(`text "${n.textContent.trim().slice(0, 30)}" leaves its card`);
      }
    }
  }
  const here = canvas?.getBoundingClientRect(), drift = labels.map(l => { const [ax, ay] = (l.dataset.anchor ?? '').split(',').map(parseFloat), r = rect(l); return Number.isFinite(ax) && here ? Math.round(Math.hypot(r.left + r.width / 2 - here.left - ax, r.bottom - here.top - ay)) : 0; });
  if (!scene.phone && drift.some(d => d > 0)) issues.push(`desktop labels moved (${drift.join('/')}px): placement is phone-only`);
  return { issues, labels: labels.map(l => l.textContent).join(' / '), cards: cards.length, drift: Math.max(0, ...drift) };
};

export async function checkPhoneLabels({ browser, css, preflight, failures, rows }) {
  const script = await bundle();
  const shots = process.env.LAYOUT_SHOTS_DIR, tag = process.env.PHONE_LABELS_BEFORE === '1' ? 'before' : 'after';
  for (const [w, h] of [[1280, 800], [390, 844], [320, 640]]) for (const scale of [1, 1.25, 1.5]) for (const s of scenes) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const id = `${w}x${h} @${scale * 100}% ${s.name} phone labels`;
    await page.setContent(`<!doctype html><html style="--text-scale:${scale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}${css}</style></head><body><div id="root"></div></body></html>`);
    await page.addScriptTag({ content: script });
    await page.evaluate(p => window.mount(p), s.props);
    await page.waitForSelector('.game-hud');
    if (s.view === 'square') await page.waitForSelector('.viewport-world-label:not([hidden])');
    await page.waitForTimeout(250); // labels are placed on the next animation frame
    const r = await page.evaluate(probe, { ...s, phone: w < 761 });
    const issues = [...new Set(r.issues)];
    for (const i of issues) failures.push(`${id}: ${i}`);
    rows.push(`${id}: ${r.labels ? `labels ${r.labels} (moved up to ${r.drift}px from their buildings); ` : ''}${r.cards} card(s)${issues.length ? ' ✗ ' + issues.join('; ') : ' OK'}`);
    if (shots && (scale === 1 || scale === 1.5)) await page.screenshot({ path: `${shots}/${tag}-${s.slug}-${w}-${scale * 100}.png`, fullPage: w < 600 });
    await page.close();
  }
}

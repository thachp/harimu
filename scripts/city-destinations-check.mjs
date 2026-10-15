/** #378 check: the city destination cards, the dock tabs and the 3D buildings say the same thing.
 *  Bundles the real GameShell and GameViewport with the real cityDestinations() cards and the shipped CSS in headless Chromium at 1280x800 and 390x844, 100/125/150% text,
 *  for a visitor previewing Korund (market flag off), a Korund citizen, and a Kindle visitor (market flag off), and asserts:
 *  - Korund cards read Household / Assignment / State store / Government, never "Market" or "Workplace"; the dock tab labels and the 3D building labels agree with the cards
 *  - Kindle with the market off still has no Market card (#344), and Kindle keeps "Workplace"
 *  - the card text stays inside each card and the page never scrolls sideways
 *  Used by hud-layout-check.mjs (npm run test:layout). Screenshots: LAYOUT_SHOTS_DIR=docs/screenshots/378 (CITY_DESTINATIONS_BEFORE=1 names them "before"). */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const entry = `
  import React from 'react'; import { createRoot } from 'react-dom/client';
  import { GameShell } from './app/game-shell.tsx'; import { cityDestinations } from './lib/city-destinations.ts';
  window.mount = ({ cards: { nationId, showMarket }, ...props }) => { window.__root?.unmount(); window.__root = createRoot(document.getElementById('root'));
    window.__root.render(<GameShell {...props} contextItems={cityDestinations(nationId, showMarket).map(c => ({ ...c }))} onNavigate={() => {}} panel={<p>Panel</p>} />); };`;

async function bundle() {
  const result = await build({
    stdin: { resolveDir: root, loader: 'tsx', contents: entry }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', target: 'es2022', logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_HARIMU_TOPBAR_EMBLEM': '"false"', 'process.env.NEXT_PUBLIC_HARIMU_NATION_SYMBOLS': '"false"' }, alias: { '@': root.replace(/\/$/, '') }, loader: { '.css': 'empty' },
    plugins: [{ name: 'stubs', setup(b) {
      const stubs = { './game-timer': 'export function GameTimer(){return null}', './square-chat': 'export function SquareChat(){return null}', '@clerk/nextjs': 'export const useClerk=()=>({mountUserButton(){},unmountUserButton(){}})' };
      b.onResolve({ filter: /^(\.\/game-timer|\.\/square-chat|@clerk\/nextjs)$/ }, a => ({ path: a.path, namespace: 'stub' }));
      b.onResolve({ filter: /\.module\.css$/ }, () => ({ path: 'css-module', namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: a.path === 'css-module' ? 'export default new Proxy({}, { get: (_, k) => String(k) })' : stubs[a.path], loader: 'jsx', resolveDir: root }));
    } }],
  });
  return result.outputFiles[0].text;
}

const nations = [['kindle', 'Kindle Republic', 'Kindle', 'Forgehaven'], ['korund', 'Korund Union', 'Korund', 'Stonehearth']].map(([id, name, shortName, capital]) => ({ id, name, shortName, capital }));
const scene = (id, who) => {
  const nation = nations.find(n => n.id === id), citizen = who === 'citizen';
  const props = { nation, nations, capacity: 18, localDemo: false, currentCityName: nation.capital, view: 'square', contextTitle: 'City destinations', citizenNation: citizen ? nation : null, visitorSession: !citizen,
    marketOpen: false, cards: { nationId: id, showMarket: id === 'korund' } }; // market flag off: only Korund's State store stays (marketVisible)
  return { name: `${nation.shortName} ${who}`, slug: `${id}-${who}`, nationId: id, props };
};
const scenes = [scene('korund', 'visitor'), scene('korund', 'citizen'), scene('kindle', 'visitor')];

/** Runs in the page. */
const probe = scene => {
  const issues = [], vw = document.documentElement.clientWidth, rect = e => e.getBoundingClientRect(), text = e => e.textContent.trim();
  if (document.documentElement.scrollWidth > vw + 1) issues.push(`page scrolls sideways by ${document.documentElement.scrollWidth - vw}px`);
  const cards = [...document.querySelectorAll('.game-context-items > button')].map(b => text(b.querySelector('strong')));
  const tabs = [...document.querySelectorAll('#game-location-dock button span')].map(text);
  const labels = [...document.querySelectorAll('.viewport-world-label')].map(text);
  const korund = scene.nationId === 'korund';
  const want = korund ? ['Household', 'Assignment', 'State store', 'Government'] : ['Household', 'Workplace', 'Government'];
  if (cards.join('|') !== want.join('|')) issues.push(`cards are ${cards.join(' / ')}; want ${want.join(' / ')}`);
  if (korund) {
    for (const bad of ['Market', 'Workplace']) if (cards.includes(bad)) issues.push(`Korund card says "${bad}"`);
    for (const label of ['Assignment', 'State store']) if (!tabs.includes(label)) issues.push(`dock tab "${label}" missing (have ${tabs.join(' / ')})`);
    for (const label of ['Assignment board', 'State ration store']) if (!labels.includes(label)) issues.push(`3D building "${label}" missing (have ${labels.join(' / ')})`);
  } else if (cards.includes('Market') || tabs.includes('Market')) issues.push('Kindle shows a Market card or tab while the market is off (#344)');
  for (const card of document.querySelectorAll('.game-context-items > button')) {
    const b = rect(card), walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim()) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      if ([...rg.getClientRects()].some(x => x.width > 0 && (x.right > b.right + 0.5 || x.left < b.left - 0.5))) issues.push(`text "${n.textContent.trim().slice(0, 30)}" leaves its card`);
    }
  }
  return { issues, cards: cards.join(' / '), tabs: tabs.join(' / ') };
};

export async function checkCityDestinations({ browser, css, preflight, failures, rows }) {
  const script = await bundle();
  const shots = process.env.LAYOUT_SHOTS_DIR, tag = process.env.CITY_DESTINATIONS_BEFORE === '1' ? 'before' : 'after';
  for (const [w, h] of [[1280, 800], [390, 844]]) for (const scale of [1, 1.25, 1.5]) for (const s of scenes) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const id = `${w}x${h} @${scale * 100}% ${s.name} destination cards`;
    await page.setContent(`<!doctype html><html style="--text-scale:${scale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}${css}</style></head><body><div id="root"></div></body></html>`);
    await page.addScriptTag({ content: script });
    await page.evaluate(p => window.mount(p), s.props);
    await page.waitForSelector('.game-hud');
    await page.waitForSelector('.viewport-world-label:not([hidden])');
    const r = await page.evaluate(probe, s);
    const issues = [...new Set(r.issues)];
    for (const i of issues) failures.push(`${id}: ${i}`);
    rows.push(`${id}: cards ${r.cards}; tabs ${r.tabs}${issues.length ? ' ✗ ' + issues.join('; ') : ' OK'}`);
    if (shots && (scale === 1 || scale === 1.5)) await page.screenshot({ path: `${shots}/${tag}-${s.slug}-${w}-${scale * 100}.png`, fullPage: w < 600 });
    await page.close();
  }
}

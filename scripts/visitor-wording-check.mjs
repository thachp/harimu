/** #379 check: visitor wording is shown to visitors only, and the longer copy fits at phone width and big text.
 *  Bundles the real GameShell, the real GameViewport (WebGL city/globe), the real FirstVisitGuide and the real CountryScene with the shipped CSS in
 *  headless Chromium (1280x800 and 390x844, 100/125/150% text) and asserts, for a visitor (no citizen) and for a citizen:
 *  - the inspector header says "VISITOR PREVIEW" for a visitor and "CITIZEN LIFE" for a citizen; the city's household label says "Household" for a
 *    visitor and "Your household" for a citizen; the first-visit guide and country pins never call a visitor a citizen
 *  - guide, header and pin-caption text stays inside its box (no clipping), and the page never scrolls sideways. City NAMES on narrow pins are not
 *    checked here: "Forgehaven" overflows its 100px pin at 390 @150% today; that is the separate clipped-city-label issue (#378), not wording.
 *  Used by hud-layout-check.mjs (npm run test:layout). Screenshots: LAYOUT_SHOTS_DIR=docs/screenshots/379 (VISITOR_WORDING_BEFORE=1 names them "before"). */
import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const entry = `
  import React from 'react'; import { createRoot } from 'react-dom/client';
  import { GameShell } from './app/game-shell.tsx'; import { FirstVisitGuide } from './app/first-visit-guide.tsx'; import { CountryScene } from './app/country-scene.tsx';
  window.mount = ({ props, guide, country }) => { window.__root?.unmount(); window.__root = createRoot(document.getElementById('root'));
    window.__root.render(<GameShell {...props} onNavigate={() => {}}
      countryMap={country ? <CountryScene nationId="kindle" currentCityId="forgehaven" homeCityId={null} onTravel={() => {}} preview travelEnabled={false} /> : null}
      panel={guide ? <FirstVisitGuide stage={guide} onStageChange={() => {}} onDismiss={() => {}} onTryGuest={() => {}} /> : <p>Panel</p>} />); };`;

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

const nation = { id: 'kindle', name: 'Kindle Republic', capital: 'Forgehaven' };
const base = { nation, nations: [nation], capacity: 18, localDemo: false, currentCityName: 'Forgehaven', contextTitle: 'City destinations' };
const scenes = [
  { name: 'visitor City', slug: 'visitor-city', visitor: true, args: { props: { ...base, view: 'square', citizenNation: null } }, labels: ['Household'], header: 'VISITOR PREVIEW' },
  { name: 'citizen City', slug: 'citizen-city', visitor: false, args: { props: { ...base, view: 'square', citizenNation: nation } }, labels: ['Your household'], header: 'CITIZEN LIFE' },
  { name: 'visitor World guide 1', slug: 'visitor-guide-arrival', visitor: true, args: { props: { ...base, view: 'world', citizenNation: null, contextTitle: 'Nations' }, guide: 'arrival' }, header: 'NATION INSPECTION', guide: 'Welcome to Harimu' },
  { name: 'visitor World guide 2', slug: 'visitor-guide-government', visitor: true, args: { props: { ...base, view: 'world', citizenNation: null, contextTitle: 'Nations' }, guide: 'government' }, header: 'NATION INSPECTION', guide: 'Who runs the government' },
  { name: 'visitor Country', slug: 'visitor-country', visitor: true, args: { props: { ...base, view: 'country', citizenNation: null, contextTitle: 'Country travel' }, country: true }, pins: 'Presence shows in your own nation' },
];

/** Runs in the page. */
const probe = scene => {
  const issues = [], vw = document.documentElement.clientWidth, text = e => e?.textContent ?? '';
  if (document.documentElement.scrollWidth > vw + 1) issues.push(`page scrolls sideways by ${document.documentElement.scrollWidth - vw}px`);
  const header = text(document.querySelector('.game-inspector-title small'));
  if (scene.header && !header.includes(scene.header)) issues.push(`inspector header "${header}" lacks "${scene.header}"`);
  if (scene.visitor && /CITIZEN LIFE/.test(header)) issues.push('a visitor sees CITIZEN LIFE');
  const labels = [...document.querySelectorAll('.viewport-world-label')].map(text);
  for (const want of scene.labels ?? []) if (!labels.includes(want)) issues.push(`city label "${want}" missing (have ${labels.join(' / ') || 'none'})`);
  if (scene.visitor && labels.includes('Your household')) issues.push('a visitor sees "Your household"');
  const page = document.body.innerText;
  if (scene.visitor && /You are a citizen/.test(page)) issues.push('a visitor is told "You are a citizen"');
  if (scene.guide && !page.includes(scene.guide)) issues.push(`guide heading "${scene.guide}" missing`);
  if (scene.pins && ![...document.querySelectorAll('button small')].some(e => text(e) === scene.pins)) issues.push(`country pins lack "${scene.pins}"`);
  // Text must stay inside its own box: guide card, inspector header, country pins.
  const boxes = [...document.querySelectorAll('section[aria-labelledby="first-visit-title"], .game-inspector-title, [aria-label="Illustrative country map"] button small')];
  for (const box of boxes) {
    const b = box.getBoundingClientRect(), walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim()) continue;
      const rg = document.createRange(); rg.selectNodeContents(n);
      if ([...rg.getClientRects()].some(x => x.width > 0 && (x.right > b.right + 0.5 || x.left < b.left - 0.5))) issues.push(`text leaves its box: "${n.textContent.trim().slice(0, 40)}"`);
    }
    const clipped = [box, ...box.querySelectorAll('*')].find(e => e.clientWidth > 0 && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'visible');
    if (clipped) issues.push(`<${clipped.tagName.toLowerCase()}> clips its text`);
  }
  return { issues, header, labels: labels.join(' / '), boxes: boxes.length };
};

export async function checkVisitorWording({ browser, css, preflight, failures, rows }) {
  const script = await bundle();
  const full = css + await readFile(new URL('app/first-visit-guide.module.css', `file://${root}`), 'utf8') + await readFile(new URL('app/country-scene.module.css', `file://${root}`), 'utf8');
  const shots = process.env.LAYOUT_SHOTS_DIR, tag = process.env.VISITOR_WORDING_BEFORE === '1' ? 'before' : 'after';
  for (const [w, h] of [[1280, 800], [390, 844]]) for (const scale of [1, 1.25, 1.5]) for (const scene of scenes) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const id = `${w}x${h} @${scale * 100}% ${scene.name} wording`;
    await page.setContent(`<!doctype html><html style="--text-scale:${scale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}${full}</style></head><body><div id="root"></div></body></html>`);
    await page.addScriptTag({ content: script });
    await page.evaluate(a => window.mount(a), scene.args);
    await page.waitForSelector('.game-hud');
    if (scene.labels) await page.waitForSelector('.viewport-world-label');
    const r = await page.evaluate(probe, scene);
    for (const i of new Set(r.issues)) failures.push(`${id}: ${i}`);
    rows.push(`${id}: header "${r.header}"${r.labels ? `, labels ${r.labels}` : ''}, ${r.boxes} text box(es) checked${r.issues.length ? ' ✗ ' + [...new Set(r.issues)].join('; ') : ' OK'}`);
    if (shots && (scale === 1 || scale === 1.5) && ['visitor-city', 'citizen-city', 'visitor-guide-government', 'visitor-country'].includes(scene.slug)) await page.screenshot({ path: `${shots}/${tag}-${scene.slug}-${w}-${scale * 100}.png`, fullPage: w < 600 });
    await page.close();
  }
}

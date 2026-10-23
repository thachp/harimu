/** #528 check: on phones (<=760px wide) every control in the game frame is at least 44x44 CSS px, and nothing sits on top of the globe/city canvas.
 *  Bundles the real GameShell (with its Glossary link, Game settings button and notification slot), the real GameViewport (camera zoom/pan bar), the real account menu trigger and the real nation comparison
 *  with the shipped CSS in headless Chromium (320x640 and 390x844, 100/125/150% text), signed out (World) and as a citizen (City, Country), and measures:
 *  - every visible button, link and <summary> (top bar, breadcrumbs, view tabs, camera bar, citizen dock, "Compare all ten nations", "Rules and limits")
 *    is >= 44px wide and tall
 *  - the camera bar never overlaps the canvas (where the globe labels are drawn), so it cannot cover a label
 *  - top-bar controls stay on-screen and do not overlap each other, and the clock text never overlaps the identity text (HARIMU / nation line); the page never scrolls sideways
 *  At 1280x800 the desktop frame is unchanged: the camera bar stays an overlay and its buttons keep their desktop size.
 *  Used by hud-layout-check.mjs (npm run test:layout). Screenshots: LAYOUT_SHOTS_DIR=docs/screenshots/528 (PHONE_TAP_BEFORE=1 names them "before"). */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
const entry = `
  import React, { useEffect, useState } from 'react'; import { createRoot } from 'react-dom/client'; import { createPortal } from 'react-dom';
  import { GameShell } from './app/game-shell.tsx'; import GameViewport from './app/game-viewport.tsx'; import { AccountMenu } from './app/account-menu.tsx'; import { NationComparison } from './app/nation-comparison.tsx';
  const nations = [{ id: 'kindle', name: 'Kindle Republic' }, { id: 'korund', name: 'Korund' }, { id: 'aurelle', name: 'Aurelle' }];
  function RealViewport({ mode }) { const [stage, setStage] = useState(null); useEffect(() => setStage(document.querySelector('.game-stage')), []);
    return stage && mode ? createPortal(<GameViewport mode={mode} nationId={mode === 'world' ? 'atlas' : 'kindle'} nations={nations} selectedNationId="kindle" onSelect={() => {}} />, stage) : null; }
  window.mountShell = ({ props, signedIn }) => { window.__root?.unmount(); window.__root = createRoot(document.getElementById('root'));
    const mode = props.view === 'world' ? 'world' : props.view === 'country' ? null : 'city';
    window.__root.render(<><GameShell {...props} onNavigate={() => {}}
      panel={<><NationComparison nations={nations} /><details><summary>Rules and limits</summary><p>Each nation keeps its own rules.</p></details></>}
      socialDock={signedIn ? <nav className="citizen-dock" aria-label="Citizen communications"><button type="button">Chat</button><button type="button">News</button><button type="button">Civic inbox</button></nav> : null}
      accountControls={signedIn ? <><button type="button" className="game-glossary" aria-label="Open morning brief"><svg width="17" height="17" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 2.5h9v11h-9z M4.5 5.5h5 M4.5 8h5 M4.5 10.5h3" fill="none" stroke="currentColor" /></svg><span>Brief</span></button><div className="account-control"><AccountMenu /></div></> : <div className="account-control"><button className="account-sign-in" type="button">Sign in</button></div>} /><RealViewport mode={mode} /></>); };`;

async function bundle() {
  const result = await build({
    stdin: { resolveDir: root, loader: 'tsx', contents: entry },
    bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', target: 'es2022', logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_HARIMU_TOPBAR_EMBLEM': '"false"', 'process.env.NEXT_PUBLIC_HARIMU_NATION_SYMBOLS': '"false"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_CREST': '"false"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_TOPBAR': '"false"' , 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_PANEL': '\"false\"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_RAIL': '\"false\"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_WORLD': '\"false\"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_NATION': '\"false\"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_CITY': '\"false\"'}, alias: { '@': root.replace(/\/$/, '') }, loader: { '.css': 'empty' },
    plugins: [{ name: 'stubs', setup(b) {
      const stubs = { './game-viewport': 'export default function V(){return null}', './game-timer': 'export function GameTimer(){return null}', './square-chat': 'export function SquareChat(){return null}', '@clerk/nextjs': 'export const useClerk=()=>({mountUserButton(){},unmountUserButton(){}})' };
      b.onResolve({ filter: /^(\.\/game-viewport|\.\/game-timer|\.\/square-chat|@clerk\/nextjs)$/ }, a => ({ path: a.path, namespace: 'stub' }));
      b.onResolve({ filter: /\.module\.css$/ }, () => ({ path: 'css-module', namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: a.path === 'css-module' ? 'export default new Proxy({}, { get: (_, k) => String(k) })' : stubs[a.path], loader: 'jsx', resolveDir: root }));
    } }],
  });
  return result.outputFiles[0].text;
}

const nation = { id: 'kindle', name: 'Kindle Republic', capital: 'Forgehaven' };
const base = { nation, nations: [nation], capacity: 18, localDemo: false, worldClock: { gameDay: 12, latestTick: 140 }, inventory: { food: 6, materials: 2, knowledge: 2 }, walletMinor: 4000, currentCityName: 'Forgehaven', contextTitle: 'City destinations' };
const scenes = [
  { name: 'signed-out World', slug: 'world', signedIn: false, props: { ...base, view: 'world', citizenNation: null, worldClock: undefined, contextTitle: 'Nations' } },
  { name: 'citizen City', slug: 'city', signedIn: true, props: { ...base, view: 'square', citizenNation: nation, shiftSummary: { title: 'Support the savanna harvest' } } },
  { name: 'citizen Country', slug: 'country', signedIn: true, props: { ...base, view: 'country', citizenNation: nation, contextTitle: 'Country travel' } },
];

/** Runs in the page: every visible control under 44px, the camera bar against the canvas, top-bar overlap and sideways scroll. */
const probe = () => {
  const rect = e => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
  const overlap = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
  const vw = document.documentElement.clientWidth, issues = [], small = [];
  const name = e => (e.getAttribute('aria-label') || e.textContent.trim().replace(/\s+/g, ' ').slice(0, 28) || e.className);
  const controls = [...document.querySelectorAll('button, a[href], summary, [role=button]')].filter(e => {
    const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !e.closest('.game-hud-tip, .game-skip, [hidden]') && !(e.classList.contains('game-skip'));
  });
  for (const e of controls) { const r = rect(e); if (r.width < 43.5 || r.height < 43.5) small.push(`${name(e)} ${Math.round(r.width * 10) / 10}x${Math.round(r.height * 10) / 10}`); }
  if (document.documentElement.scrollWidth > vw + 1) issues.push(`page scrolls sideways by ${document.documentElement.scrollWidth - vw}px`);
  const hud = [...document.querySelectorAll('.game-hud summary, .game-hud button, .game-hud .game-identity')].filter(e => e.getBoundingClientRect().width > 0 && !e.closest('.game-hud-tip')).map(e => ({ e, r: rect(e), n: name(e) }));
  for (const it of hud) if (it.r.left < -0.5 || it.r.right > vw + 0.5) issues.push(`top-bar "${it.n}" leaves the screen`);
  for (let i = 0; i < hud.length; i++) for (let j = i + 1; j < hud.length; j++) if (!hud[i].e.contains(hud[j].e) && !hud[j].e.contains(hud[i].e) && overlap(hud[i].r, hud[j].r)) issues.push(`top-bar "${hud[i].n}" overlaps "${hud[j].n}"`);
  // Text, not boxes: a shrunken identity column keeps painting its words under the clock (QA3 on #552).
  const textRects = e => { const g = document.createTreeWalker(e, NodeFilter.SHOW_TEXT), out = []; for (let n = g.nextNode(); n; n = g.nextNode()) { if (!n.textContent.trim()) continue; const rg = document.createRange(); rg.selectNodeContents(n); out.push(...[...rg.getClientRects()].filter(x => x.width > 0 && x.height > 0)); } return out; };
  const idText = textRects(document.querySelector('.game-hud .game-identity')), clockEl = document.querySelector('.game-hud .game-clock');
  if (clockEl && getComputedStyle(clockEl).display !== 'none') for (const c of textRects(clockEl)) for (const t of idText) if (overlap(c, t)) { issues.push(`top-bar clock text overlaps the identity text ("HARIMU" / nation line)`); break; }
  for (const e of document.querySelectorAll('.game-hud .game-identity strong, .game-hud .game-identity span')) { const r = rect(e); if (r.width > 0 && (r.right > vw + 0.5)) issues.push('identity text leaves the screen'); }
  const bar = document.querySelector('.viewport-controls'), canvas = document.querySelector('.viewport-canvas');
  let camera = null;
  if (bar && canvas) {
    const b = rect(bar), c = rect(canvas); camera = { bar: `${Math.round(b.width)}x${Math.round(b.height)}`, overlapsCanvas: overlap(b, c) };
    if (vw <= 760 && camera.overlapsCanvas) issues.push(`camera bar (${camera.bar}) overlaps the canvas, so it can cover a globe label`);
    if (b.left < -0.5 || b.right > vw + 0.5) issues.push('camera bar leaves the screen');
  }
  const dockRows = new Set([...document.querySelectorAll('.game-dock button')].map(e => Math.round(e.getBoundingClientRect().top))).size;
  return { issues, small, camera, controls: controls.length, dockRows, hudHeight: Math.round(document.querySelector('.game-hud').getBoundingClientRect().height) };
};

export async function checkPhoneTapTargets({ browser, css: baseCss, preflight, failures, rows }) {
  const script = await bundle();
  const css = baseCss + await readFile(new URL('app/account-menu.module.css', `file://${root}`), 'utf8') + await readFile(new URL('app/nation-comparison.module.css', `file://${root}`), 'utf8'); // CSS-module class names stay as written in the bundle
  const shots = process.env.LAYOUT_SHOTS_DIR, tag = process.env.PHONE_TAP_BEFORE === '1' ? 'before' : 'after';
  for (const [w, h] of [[1280, 800], [390, 844], [320, 640]]) for (const scale of [1, 1.25, 1.5]) for (const scene of scenes) {
    const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 600 });
    const page = await context.newPage(); page.setDefaultTimeout(90000);
    const id = `${w}x${h} @${scale * 100}% ${scene.name} tap targets`;
    await page.setContent(`<!doctype html><html style="--text-scale:${scale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}${css}</style></head><body><div id="root"></div></body></html>`);
    await page.addScriptTag({ content: script });
    await page.evaluate(p => window.mountShell(p), { props: scene.props, signedIn: scene.signedIn });
    await page.waitForSelector('.game-hud');
    if (scene.signedIn) await page.evaluate(() => { document.getElementById('game-notification-slot').innerHTML = '<button class="game-notifications" type="button" aria-label="Notifications, 3 unread"><svg width="16" height="16"></svg><strong>3</strong></button>'; }); // the bell portals into the slot in the app
    if (scene.slug !== 'country') await page.waitForSelector('.viewport-controls');
    await page.evaluate(() => document.querySelectorAll('details').forEach(d => d.removeAttribute('open'))); // measure the summaries, not their open bodies
    const r = await page.evaluate(probe);
    if (w <= 760) { for (const s of r.small) failures.push(`${id}: control under 44px: ${s}`); for (const i of r.issues) failures.push(`${id}: ${i}`); }
    else for (const i of r.issues.filter(i => !i.startsWith('camera bar'))) failures.push(`${id}: ${i}`);
    rows.push(`${id}: ${r.controls} controls, ${w <= 760 ? `${r.small.length} under 44px` : 'desktop frame (not enforced)'}, top bar ${r.hudHeight}px, dock ${r.dockRows} row(s)${r.camera ? `, camera bar ${r.camera.bar}${r.camera.overlapsCanvas ? ' over canvas' : ' below canvas'}` : ''}${r.small.length && w <= 760 ? ' ✗ ' + r.small.join('; ') : ''}`);
    if (shots && scene.slug !== 'country' && (scale === 1 || scale === 1.5)) await page.screenshot({ path: `${shots}/${tag}-${scene.slug}-${w}-${scale * 100}.png`, fullPage: w < 600 });
    await context.close();
  }
}

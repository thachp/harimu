/** #82 check: the Overlays group with the real GameShell + GameViewport and the shipped CSS, Resources and Unrest on.
 *  1280x800 at 100/150% text: the (possibly two-row) camera bar has no overlapping or clipped controls, the legend clears every control,
 *  no label breaks mid-word, and every overlay and zoom control is at least 44px. 390x844 and 320x640 at 100/150%: the open popover
 *  never overlaps the top-left "World" chip, stays on-screen, and its controls are at least 44px.
 *  Used by hud-layout-check.mjs. Screenshots: LAYOUT_SHOTS_DIR=docs/screenshots/82. */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const entry = `import React from 'react'; import { createRoot } from 'react-dom/client'; import { GameShell } from './app/game-shell.tsx';
  const nation = { id: 'kindle', name: 'Kindle Republic', capital: 'Forgehaven' };
  window.mountOverlays = () => createRoot(document.getElementById('root')).render(<GameShell mapOverlays view="world" nation={nation} nations={[nation]} capacity={18} localDemo={false} inventory={{ food: 6, materials: 2, knowledge: 2 }} walletMinor={4000} citizenNation={null} contextTitle="Nations" onNavigate={() => {}} panel={<p>Kindle Republic</p>} />);`;

async function bundle() {
  const stubs = { './game-timer': 'export function GameTimer(){return null}', './square-chat': 'export function SquareChat(){return null}', '@clerk/nextjs': 'export const useUser=()=>({isSignedIn:false});export const useClerk=()=>({});export const SignInButton=()=>null;export const UserButton=()=>null;' };
  const result = await build({ stdin: { resolveDir: root, loader: 'tsx', contents: entry }, bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', target: 'es2022', logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}' }, loader: { '.css': 'empty' },
    plugins: [{ name: 'stubs', setup(b) {
      b.onResolve({ filter: /^(\.\/game-timer|\.\/square-chat|@clerk\/nextjs)$/ }, a => ({ path: a.path, namespace: 'stub' }));
      b.onResolve({ filter: /\.module\.css$/ }, () => ({ path: 'css-module', namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: a.path === 'css-module' ? 'export default new Proxy({}, { get: (_, k) => String(k) })' : stubs[a.path], loader: 'jsx', resolveDir: root }));
    } }] });
  return result.outputFiles[0].text;
}

/** Runs in the page. */
const probe = () => {
  const box = e => e.getBoundingClientRect(), vw = document.documentElement.clientWidth, issues = [];
  const overlap = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
  const shown = e => { const r = box(e); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
  const controls = [...document.querySelectorAll('.viewport-controls button')].filter(shown);
  for (const c of controls) { const r = box(c), n = c.textContent.trim() || c.getAttribute('aria-label');
    if (r.width < 44 || r.height < 44) issues.push(`"${n}" is ${Math.round(r.width)}x${Math.round(r.height)} (needs 44x44)`);
    if (r.left < 0 || r.right > vw + 0.5) issues.push(`"${n}" is off-screen`);
    if (c.scrollWidth > c.clientWidth + 1) issues.push(`"${n}" is clipped`); }
  const sheet = document.querySelector('.map-overlays-panel[data-sheet]'), covered = (a, b) => sheet && sheet.contains(a) !== sheet.contains(b); // the bottom sheet lies over the camera bar on purpose
  for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) if (!covered(controls[i], controls[j]) && overlap(box(controls[i]), box(controls[j]))) issues.push(`"${controls[i].textContent.trim()}" overlaps "${controls[j].textContent.trim() || controls[j].getAttribute('aria-label')}"`);
  const legend = document.querySelector('.map-overlays-legend');
  if (!legend) issues.push('legend missing');
  const popover = document.querySelector('.map-overlays[data-open="true"] .map-overlays-panel');
  if (legend && !popover) for (const c of controls) if (overlap(box(legend), box(c))) issues.push(`legend overlaps "${c.textContent.trim() || c.getAttribute('aria-label')}"`);
  if (legend && (box(legend).left < 0 || box(legend).right > vw + 0.5 || box(legend).top < 0)) issues.push('legend is off-screen');
  const midWord = [];
  for (const el of [...controls, ...document.querySelectorAll('.map-overlays-legend strong, .map-overlays-legend li, .map-overlays-legend span')].filter(shown)) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) for (const m of t.data.matchAll(/\S+/g)) {
      const range = document.createRange(); range.setStart(t, m.index); range.setEnd(t, m.index + m[0].length);
      if (new Set([...range.getClientRects()].filter(r => r.width > 0).map(r => Math.round(r.top))).size > 1) midWord.push(m[0]);
    }
  }
  for (const w of new Set(midWord)) issues.push(`"${w}" breaks mid-word`);
  const chip = document.querySelector('.game-breadcrumbs');
  if (popover) {
    const p = box(popover);
    if (!chip) issues.push('World chip missing');
    else if (overlap(p, box(chip))) issues.push(`popover overlaps the World chip (popover ${Math.round(p.left)},${Math.round(p.top)}; chip right ${Math.round(box(chip).right)}, bottom ${Math.round(box(chip).bottom)})`);
    if (p.left < 0 || p.right > vw + 0.5) issues.push('popover is off-screen');
    if (legend && (legend.getAttribute('role') !== 'region' || legend.tabIndex !== 0 || legend.getAttribute('aria-label') !== 'Overlay legend')) issues.push('legend scroll area is not a focusable region');
  }
  return { issues, controls: controls.length, mode: popover ? (popover.dataset.sheet ? 'bottom sheet' : 'beside chip') : 'bar' };
};

export async function checkMapOverlays({ browser, css, preflight, failures, rows }) {
  const script = await bundle(), shots = process.env.LAYOUT_SHOTS_DIR;
  for (const [w, h] of [[1280, 800], [390, 844], [320, 640]]) for (const scale of [1, 1.5]) {
    const page = await (await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 600 })).newPage();
    const id = `${w}x${h} @${scale * 100}% map overlays`;
    await page.setContent(`<!doctype html><html style="--text-scale:${scale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}${css}</style></head><body><div id="root"></div></body></html>`);
    await page.addScriptTag({ content: script }); await page.evaluate(() => window.mountOverlays());
    await page.waitForSelector('.map-overlays', { state: 'attached' });
    if (w <= 390) await page.click('.map-overlays-trigger');
    for (const name of ['Resources', 'Unrest']) await page.click(`.map-overlays-group button:text-is("${name}")`);
    await page.mouse.move(1, h - 1); await page.evaluate(() => document.activeElement?.blur()); await page.waitForTimeout(100);
    const r = await page.evaluate(probe);
    rows.push(`${id}: ${r.controls} controls, ${r.mode}${r.issues.length ? ' ✗ ' + r.issues.join('; ') : ''}`);
    for (const i of r.issues) failures.push(`${id}: ${i}`);
    if (shots && w !== 320) await page.screenshot({ path: `${shots}/overlays-${w}-${scale * 100}.png` });
    await page.context().close();
  }
}

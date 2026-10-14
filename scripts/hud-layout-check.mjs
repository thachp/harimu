/** #186 rendered HUD check: the world-clock TEXT (not its box) must never reach the Glossary link.
 *  Renders the real GameShell markup with the shipped CSS in headless Chromium and measures the clock text with a
 *  Range rect against the Glossary link at 1280x800 and 390x844 for text size 100/125/150%, for every clock label.
 *  Also asserts the HUD never runs into the dock and the page never scrolls sideways, and (#229) at 390 and 360 wide that
 *  no dock label breaks mid-word, spills out of its button, or makes the dock scroll sideways.
 *  Run: npm run test:layout   (CI installs Chromium for it; `npm test` stays browser-free). */
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { chromium } from 'playwright';
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

const browser = await chromium.launch({ args: ['--disable-gpu', '--disable-dev-shm-usage'] });
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
} finally { await browser.close(); }
console.log(rows.join('\n'));
if (failures.length) { console.error(`\nHUD layout check FAILED:\n${failures.join('\n')}`); process.exit(1); }
console.log('\nHUD layout check passed.');

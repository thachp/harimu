/** #200 rendered check for the city market board: the board is rendered inside the real inspector (market view) with the shipped CSS in
 *  headless Chromium at 1280x800, 390x844 and 360x740, text size 100/125/150%. Fails if text leaves its card, a word in a control or
 *  heading breaks mid-word, a button or field is under 44px tall, or the page scrolls sideways.
 *  Screenshots: LAYOUT_SHOTS_DIR=docs/screenshots/200 npm run test:layout   (CI installs Chromium for it; `npm test` stays browser-free). */
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { bookState, economyFixture } from './market-board-fixtures.mjs';
import { fontsBeforeShots } from './layout-standalone.mjs';
const require = createRequire(import.meta.url);
const React = require('react'); const { renderToStaticMarkup } = require('react-dom/server');
const root = new URL('../', import.meta.url);


// lib/market-board-copy.ts re-exports from './palace-coup-copy' (extensionless, for Next), which Node's own loader cannot follow, so
// a lib file that fails to load is transpiled here and its relative imports are resolved with the .ts extension.
function requireLib(path) {
  try { return require(path); } catch (e) {
    if (e.code !== 'ERR_MODULE_NOT_FOUND' && e.code !== 'MODULE_NOT_FOUND') throw e;
    const js = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
    const mod = { exports: {} };
    new Function('exports', 'require', 'module', js)(mod.exports, name => name.startsWith('.') ? requireLib(new URL(`${name}.ts`, `file://${path}`).pathname) : require(name), mod);
    return mod.exports;
  }
}

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
    if (name.startsWith('@/lib/')) return requireLib(new URL(`lib/${name.slice(6)}.ts`, root).pathname);
    if (name.startsWith('../lib/')) return requireLib(new URL(`lib/${name.slice(7)}.ts`, root).pathname);
    // Icons keep their real footprint (phosphor's CJS build can't be required here): an empty svg at the given size.
    if (name === '@phosphor-icons/react') return new Proxy({}, { get: () => p => React.createElement('svg', { width: p.size ?? '1em', height: p.size ?? '1em', 'aria-hidden': true }) });
    return require(name);
  }, mod);
  cache.set(rel, mod.exports); return mod.exports;
}

const nation = { id: 'kindle', name: 'Kindle Republic', capital: 'Forgehaven' };
const accountControls = React.createElement('span', { className: 'account-demo-label' }, 'Local demo');
const css = (await readFile(new URL('app/globals.css', root), 'utf8')).replace(/@import[^;]+;/g, '') + (await readFile(new URL('app/game-shell.css', root), 'utf8'));
const preflight = '*,::before,::after{box-sizing:border-box;margin:0;padding:0;border:0 solid}button{background:none;font:inherit;color:inherit}svg{display:block}input,select{font:inherit;color:inherit}';
const { GameShell } = await load('game-shell');
const { MarketBoard } = await load('market-board');
const noop = () => {};
const api = (book, extra = {}) => ({ book, busy: false, message: '', error: '', refresh: noop, place: noop, cancel: noop, ...extra });
const scenes = [
  { name: 'Busy book, my orders, escrow preview', slug: 'busy', book: bookState({ orders: [
      { side: 'buy', good: 'fruit', qty: 5, limit: 100 }, { side: 'sell', good: 'wood', qty: 10, remaining: 4, limit: 300 }, { side: 'buy', good: 'meat', qty: 2, limit: 250 }] }), economy: economyFixture({ fruit: 6, meat: 2 }) },
  { name: 'Empty book, short of Spark', slug: 'empty-short', book: bookState({ empty: true }), economy: economyFixture({ walletMinor: 50, fruit: 0, wood: 0 }) },
  { name: 'Fill notice and rejection', slug: 'notices', book: bookState({ orders: [{ side: 'sell', good: 'fruit', qty: 3, limit: 120 }] }), economy: economyFixture(),
    extra: { message: 'Your order traded 3 of 5 Fruit.', error: 'That order is no longer open. Refresh your open orders.' } },
];
const browser = fontsBeforeShots(await chromium.launch({ args: ['--disable-gpu', '--disable-dev-shm-usage'] })); // #905
const failures = []; const rows = [];
try {
  for (const sc of scenes) {
    const panel = React.createElement(MarketBoard, { api: api(sc.book, sc.extra), economy: sc.economy });
    const body = renderToStaticMarkup(React.createElement(GameShell, { view: 'market', nation, citizenNation: nation, nations: [nation], capacity: 18, localDemo: true, panel, onNavigate() {}, accountControls, worldClock: { gameDay: 12, latestTick: 140 } }));
    for (const [w, h] of [[1280, 800], [390, 844], [360, 740]]) for (const scale of [1, 1.25, 1.5]) {
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      await page.setContent(`<!doctype html><html style="--text-scale:${scale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}${css}</style></head><body>${body}</body></html>`);
      const r = await page.evaluate(() => {
        const issues = []; const card = document.querySelector('.market-board'); if (!card) return { issues, cards: 0, sw: 0, cw: 0 };
        const c = card.getBoundingClientRect();
        const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (!n.textContent.trim()) continue;
          const rg = document.createRange(); rg.selectNodeContents(n);
          const rs = [...rg.getClientRects()].filter(x => x.width > 0);
          if (rs.some(x => x.right > c.right + 0.5 || x.left < c.left - 0.5)) issues.push(`text leaves the board: "${n.textContent.trim().slice(0, 40)}"`);
          if (n.parentElement.closest('button, legend, h3, h4, h5, th, dt, dd, option')) for (const m of n.textContent.matchAll(/\S+/g)) {
            const wr = document.createRange(); wr.setStart(n, m.index); wr.setEnd(n, m.index + m[0].length);
            if (new Set([...wr.getClientRects()].filter(x => x.width > 0).map(x => Math.round(x.top))).size > 1) issues.push(`"${m[0]}" breaks mid-word`);
          }
        }
        for (const el of card.querySelectorAll('button, input:not([type=radio]), select')) { const b = el.getBoundingClientRect(); if (b.height < 43.5) issues.push(`${el.tagName.toLowerCase()} "${el.textContent || el.value}" is ${Math.round(b.height)}px tall (needs 44)`); if (b.right > c.right + 0.5) issues.push(`${el.tagName.toLowerCase()} overflows the board`); }
        const clipped = [...card.querySelectorAll('*')].find(el => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible'); if (clipped) issues.push(`<${clipped.tagName.toLowerCase()}> clips its content`);
        return { issues, cards: 1, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
      });
      const id = `${w}x${h} @${scale * 100}% board "${sc.name}"`;
      rows.push(`${id}: page ${r.sw}/${r.cw}${r.issues.length ? ' ✗ ' + [...new Set(r.issues)].join('; ') : ''}`);
      if (!r.cards) failures.push(`${id}: the board did not render`);
      for (const i of new Set(r.issues)) failures.push(`${id}: ${i}`);
      if (r.sw > r.cw) failures.push(`${id}: page scrolls sideways (${r.sw} > ${r.cw})`);
      if (process.env.LAYOUT_SHOTS_DIR && w !== 360 && (scale === 1 || scale === 1.5)) {
        if (w === 1280) await page.setViewportSize({ width: 1280, height: 1100 });
        await page.screenshot({ path: `${process.env.LAYOUT_SHOTS_DIR}/board-${sc.slug}-${w}-${scale * 100}.png`, fullPage: w < 600 });
        if (w === 1280) { await page.evaluate(() => { document.querySelector('.game-inspector-body').scrollTop = 1e6; }); await page.screenshot({ path: `${process.env.LAYOUT_SHOTS_DIR}/board-${sc.slug}-${w}-${scale * 100}-form.png` }); }
      }
      await page.close();
    }
  }
} finally { await browser.close(); }
console.log(rows.join('\n'));
if (failures.length) { console.error(`\nMarket board layout check FAILED:\n${failures.join('\n')}`); process.exit(1); }
console.log('\nMarket board layout check passed.');

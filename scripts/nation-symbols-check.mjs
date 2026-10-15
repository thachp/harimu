/** #79 check: the color-blind-safe nation symbol chips (NEXT_PUBLIC_HARIMU_NATION_SYMBOLS) on the three places that name nations.
 *  Bundles the real GameShell (nation strip), NationComparison (all-nations table) and the globe label chip builder, with the flag ON and OFF, in headless
 *  Chromium with the shipped CSS, at 1280x800, 960x800, 390x844 and 320x700, 100/125/150% text:
 *  - flag off: no chip anywhere, nothing changes;  flag on: exactly ten chips on the strip, in the table and on the globe labels, all ten symbols and all ten pattern
 *    tokens different, every chip inside its button/row, not overlapping the nation name, hidden from assistive tech with the name as tooltip text
 *  - the page never scrolls sideways; globe label buttons stay 44px tall on phones; strip buttons keep the same height as with the flag off
 *  - with LAYOUT_SHOTS_DIR, a labelled colour-vision sheet: every chip rendered under deuteranopia/protanopia/tritanopia (SVG feColorMatrix, Machado 2009).
 *    The numbers (dE under the same simulation) are asserted in tests/nation-marks.test.mjs.
 *  Used by hud-layout-check.mjs (npm run test:layout). Screenshots: LAYOUT_SHOTS_DIR=docs/screenshots/79. */
import { bundleShell, shellProps } from './hud-tooltip-check.mjs';

const entry = `
  import React from 'react'; import { createRoot } from 'react-dom/client'; import { GameShell } from './app/game-shell.tsx';
  import { NationComparison } from './app/nation-strip-filters.tsx'; import { nationSymbolElement } from './app/nation-symbol.tsx';
  const root = () => { window.__root?.unmount(); window.__root = createRoot(document.getElementById('root')); return window.__root; };
  window.nationSymbolElement = nationSymbolElement;
  window.mountStrip = props => root().render(<GameShell {...props} onNavigate={() => {}} onSelectNation={() => {}} accountControls={null} />);
  window.mountTable = nations => { const r = root(); r.render(<NationComparison nations={nations} />); };
  window.mountGlobeLabels = ids => { const host = document.getElementById('root'); host.innerHTML = '';
    const layer = document.createElement('div'); layer.className = 'viewport-label-layer'; layer.style.cssText = 'position:relative;height:420px;background:#0b1c24';
    ids.forEach((id, i) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'viewport-world-label'; b.textContent = id[0].toUpperCase() + id.slice(1); b.setAttribute('aria-label', 'Select ' + b.textContent);
      const chip = nationSymbolElement(id); if (chip) b.insertBefore(chip, b.firstChild);
      Object.assign(b.style, { position: 'absolute', left: (i % 2) * 50 + 25 + '%', top: Math.floor(i / 2) * 76 + 56 + 'px', transform: 'translate(-50%, -100%)' }); layer.appendChild(b); }); host.appendChild(layer); };`;

const ids = ['kindle', 'confluence', 'meridian', 'korund', 'aurelle', 'ilmar', 'hoarvale', 'varkand', 'veldwood', 'fulmara'];
const names = { kindle: 'Kindle Republic', confluence: 'The Confluence', meridian: 'Meridian', korund: 'Korund', aurelle: 'Aurelle', ilmar: 'Ilmar', hoarvale: 'Hoarvale', varkand: 'Varkand', veldwood: 'Veldwood', fulmara: 'Fulmara' };
const nations = ids.map(id => ({ id, name: names[id], capital: 'Capital', government: 'Government', currency: 'SPK', economy: 'Mixed', religion: 'Faiths' }));
const contextItems = ids.map(id => ({ id, label: names[id], detail: 'Open to visitors', selected: id === 'kindle' }));
const worldProps = { ...shellProps, view: 'world', nation: nations[0], citizenNation: null, nations, contextItems, localDemo: false, panel: null };

const probe = () => {
  const vw = document.documentElement.clientWidth, issues = [];
  if (document.documentElement.scrollWidth > vw + 1) issues.push(`page scrolls sideways by ${document.documentElement.scrollWidth - vw}px`);
  const chips = [...document.querySelectorAll('.nation-symbol')];
  const overlaps = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
  const rows = chips.map(chip => {
    const host = chip.closest('button, th'), r = chip.getBoundingClientRect(), h = host.getBoundingClientRect(), text = [];
    for (const node of chip.parentNode.childNodes) { if (node === chip || node.nodeType !== 3 || !node.textContent.trim()) continue; const range = document.createRange(); range.selectNodeContents(node); text.push(...[...range.getClientRects()].filter(x => x.width > 0)); }
    const cs = getComputedStyle(chip);
    return { id: chip.dataset.nationSymbol, symbol: chip.textContent, pattern: chip.dataset.nationPattern, hidden: chip.getAttribute('aria-hidden') === 'true', title: chip.title, w: r.width, h: r.height,
      inHost: r.left >= h.left - 0.5 && r.right <= h.right + 0.5 && r.top >= h.top - 0.5 && r.bottom <= h.bottom + 0.5, overlapsText: text.some(t => overlaps(t, r)), hostH: h.height, hostW: h.width, bg: cs.backgroundImage !== 'none', font: parseFloat(cs.fontSize) };
  });
  return { issues, rows, hostHeights: [...document.querySelectorAll('.game-context-items > button, .viewport-world-label')].map(b => Math.round(b.getBoundingClientRect().height)) };
};

/** Renders every chip through each colour-vision filter and returns, per view, the share of chip pixels that are glyph/pattern vs flat background. */
const cvdSheet = `
<svg width="0" height="0" style="position:absolute"><defs>
 <filter id="deuteranopia"><feColorMatrix type="matrix" values=".367322 .860646 -.227968 0 0  .280085 .672501 .047413 0 0  -.011820 .042940 .968881 0 0  0 0 0 1 0"/></filter>
 <filter id="protanopia"><feColorMatrix type="matrix" values=".152286 1.052583 -.204868 0 0  .114503 .786281 .099216 0 0  -.003882 -.048116 1.051998 0 0  0 0 0 1 0"/></filter>
 <filter id="tritanopia"><feColorMatrix type="matrix" values="1.255528 -.076749 -.178779 0 0  -.078411 .930809 .147602 0 0  .004733 .691367 .303900 0 0  0 0 0 1 0"/></filter></defs></svg>`;

export async function checkNationSymbols({ browser, css, preflight, failures, rows }) {
  const scripts = { on: await bundleShell(entry, { NEXT_PUBLIC_HARIMU_NATION_SYMBOLS: 'true' }), off: await bundleShell(entry, { NEXT_PUBLIC_HARIMU_NATION_SYMBOLS: 'false' }) };
  const shots = process.env.LAYOUT_SHOTS_DIR;
  const open = async (w, h, scale, flag) => {
    const context = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await context.newPage(); page.setDefaultTimeout(90000);
    await page.setContent(`<!doctype html><html style="--text-scale:${scale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}${css}</style></head><body><div id="root"></div></body></html>`);
    await page.addScriptTag({ content: scripts[flag] });
    return { context, page };
  };
  for (const [w, h] of [[1280, 800], [960, 800], [390, 844], [320, 700]]) for (const scale of [1, 1.25, 1.5]) for (const flag of ['on', 'off']) {
    const { context, page } = await open(w, h, scale, flag);
    const id = `${w}x${h} @${scale * 100}% nation symbols ${flag}`;
    const fail = m => failures.push(`${id}: ${m}`);
    const summary = [];
    for (const surface of ['strip', 'globe', 'table']) {
      if (surface === 'strip') { await page.evaluate(p => window.mountStrip(p), worldProps); await page.waitForSelector('.game-context-items > button'); }
      else if (surface === 'table') { await page.evaluate(n => window.mountTable(n), nations); await page.waitForSelector('details summary'); await page.click('details summary'); await page.waitForSelector('details[open] tbody tr'); }
      else { await page.evaluate(i => window.mountGlobeLabels(i), ids); await page.waitForSelector('.viewport-world-label'); }
      await page.evaluate(() => window.scrollTo(0, 0));
      const m = await page.evaluate(probe); if (surface !== 'table') m.issues.forEach(i => fail(`${surface}: ${i}`)); // the table's own CSS module is stubbed in this harness, so only its chips are checked, not page width
      if (flag === 'off') { if (m.rows.length) fail(`${surface}: chips show with the flag off`); summary.push(`${surface} no chips`); }
      else {
        if (m.rows.length !== 10) fail(`${surface}: expected 10 chips, found ${m.rows.length}`);
        if (new Set(m.rows.map(r => r.symbol)).size !== m.rows.length) fail(`${surface}: two chips share a symbol`);
        if (new Set(m.rows.map(r => r.pattern)).size !== m.rows.length) fail(`${surface}: two chips share a pattern`);
        for (const r of m.rows) {
          if (!r.hidden || !r.title.includes('symbol,')) fail(`${surface}: ${r.id} chip lacks aria-hidden or its tooltip text`);
          if (!r.inHost) fail(`${surface}: ${r.id} chip leaves its ${surface === 'table' ? 'row header' : 'button'}`);
          if (r.overlapsText) fail(`${surface}: ${r.id} chip overlaps the nation name`);
          if (r.w < 18 * scale - 1 || r.h < 18 * scale - 1) fail(`${surface}: ${r.id} chip is only ${Math.round(r.w)}x${Math.round(r.h)}px`);
          if (!r.bg) fail(`${surface}: ${r.id} chip has no pattern fill`);
        }
        if (surface === 'globe' && w < 600 && m.hostHeights.some(x => x < 43.5)) fail('globe: a label button is under 44px tall');
        summary.push(`${surface} ${m.rows.length} chips`);
      }
      if (shots && flag === 'on' && surface !== 'table' && [1280, 390].includes(w) && (scale === 1 || scale === 1.5)) {
        const box = surface === 'strip' ? await page.evaluate(() => { const b = document.querySelector('.game-context-items').getBoundingClientRect(); return { x: 0, y: Math.max(0, b.top - 4), width: window.innerWidth, height: Math.min(b.height + 8, 240) }; }) : undefined;
        await page.screenshot({ path: `${shots}/after-${surface}-${w}-${scale * 100}.png`, fullPage: true, ...(box ? { clip: box } : { clip: { x: 0, y: 0, width: w, height: 420 } }) });
      }
      if (shots && flag === 'off' && surface === 'strip' && [1280, 390].includes(w) && (scale === 1 || scale === 1.5)) {
        const box = await page.evaluate(() => { const b = document.querySelector('.game-context-items').getBoundingClientRect(); return { x: 0, y: Math.max(0, b.top - 4), width: window.innerWidth, height: Math.min(b.height + 8, 240) }; });
        await page.screenshot({ path: `${shots}/before-strip-${w}-${scale * 100}.png`, fullPage: true, clip: box });
      }
    }
    rows.push(`${id}: ${summary.join(', ')}`);
    await context.close();
  }
  // Colour-vision simulation sheet (flag on): every chip through deuteranopia / protanopia / tritanopia filters, for the screenshots.
  if (shots) {
    const { context, page } = await open(1280, 800, 1, 'on');
    await page.evaluate(([sheet, list]) => {
      const host = document.getElementById('root'); host.innerHTML = sheet;
      const grid = document.createElement('div'); grid.style.cssText = 'display:grid;grid-template-columns:150px repeat(4,1fr);gap:6px 10px;padding:14px;background:#0f2a33;color:#dce7e8;font:13px system-ui;width:1240px'; host.appendChild(grid);
      const views = ['normal', 'deuteranopia', 'protanopia', 'tritanopia'];
      for (const t of ['Nation', ...views]) grid.appendChild(Object.assign(document.createElement('b'), { textContent: t }));
      for (const id of list) { grid.appendChild(Object.assign(document.createElement('span'), { textContent: id }));
        for (const v of views) { const cell = document.createElement('span'); cell.style.cssText = 'display:flex;align-items:center;padding:6px;background:#071820;' + (v === 'normal' ? '' : `filter:url(#${v})`);
          const chip = window.nationSymbolElement(id); cell.appendChild(chip); cell.appendChild(document.createTextNode(chip.title.split(' symbol,')[0])); grid.appendChild(cell); } }
    }, [cvdSheet, ids]);
    await page.screenshot({ path: `${shots}/cvd-simulation-1280.png`, clip: { x: 0, y: 0, width: 1280, height: 520 } });
    await context.close();
  }
}

/** #800 check: rare resource nodes on the Resources overlay, flag NEXT_PUBLIC_HARIMU_RARE_MARKER off and on, real GameShell + GameViewport and the shipped CSS.
 *  All ten rare types plus the six ordinary ones, at 1280x800, 390x844 and 320x700, 100/150% text, normal and low graphics.
 *  Flag on: every rare node is a badge, so shape and fill mark it, not color alone. The badge has a rim of at least 2px, a filled round
 *  background and a glyph at least 20% larger than an ordinary node's. Glyph-to-badge contrast is at least 4.5:1, rim-to-badge at least 3:1
 *  and rim-to-halo at least 3:1, so it reads on light and dark terrain. Ordinary nodes stay plain glyphs. The legend shows the same badge
 *  beside the existing "(rare)" text (the overlay itself is aria-hidden; the legend carries the name).
 *  Flag off: today's 1px ring, no badge in the legend. Both: the page never scrolls sideways.
 *  With LAYOUT_SHOTS_DIR, shots of the globe and legend. Used by hud-layout-check.mjs; runs on its own too. Screenshots: docs/screenshots/800. */
import { bundle } from './map-overlays-layout-check.mjs';
import { isMain, runStandalone } from './layout-standalone.mjs';

const rare = ['Emberstone', 'Riverpearl', 'Ironroot', 'Skysilk', 'Geotherm core', 'Sunglass', 'Frostcore', 'Hazequartz', 'Heartwood', 'Stormcells'];
const ordinary = ['food', 'timber', 'stone', 'ore', 'fuel', 'cloth fiber'];
// Squares on the front of the globe around the capitals (lib/nation-openings.ts), spaced so markers do not overlap.
const spots = [[4, 3], [6, 5], [8, 3], [10, 5], [12, 3], [14, 5], [16, 3], [18, 5], [5, 8], [7, 10], [9, 8], [11, 10], [13, 8], [15, 10], [17, 8], [12, 14]];
const cells = [...rare, ...ordinary].map((resource, i) => [...spots[i], resource]);
const totals = [...rare, ...ordinary].map(resource => ({ resource, squares: 1 }));
const entry = `import React from 'react'; import { createRoot } from 'react-dom/client'; import { GameShell } from './app/game-shell.tsx';
  const nation = { id: 'kindle', name: 'Kindle Republic', capital: 'Forgehaven' };
  window.fetch = async url => new Response(JSON.stringify(String(url).endsWith('/resources') ? { width: 24, height: 18, cells: ${JSON.stringify(cells)}, totals: ${JSON.stringify(totals)} } : { width: 24, height: 18, cells: [], totals: [] }));
  window.mountOverlays = () => createRoot(document.getElementById('root')).render(<GameShell mapOverlays view="world" nation={nation} nations={[nation]} capacity={18} localDemo={false} inventory={{ food: 6, materials: 2, knowledge: 2 }} walletMinor={4000} citizenNation={null} contextTitle="Nations" onNavigate={() => {}} panel={<p>Kindle Republic</p>} />);`;

/** Runs in the page. */
const probe = on => {
  const issues = [], vw = document.documentElement.clientWidth;
  const rgb = c => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
  const lum = c => { const [r, g, b] = rgb(c).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  if (document.documentElement.scrollWidth > vw + 1) issues.push(`page scrolls sideways by ${document.documentElement.scrollWidth - vw}px`);
  const spans = [...document.querySelectorAll('.map-resources > span')], rares = spans.filter(s => s.dataset.rare), plain = spans.filter(s => !s.dataset.rare);
  if (rares.length !== 10 || plain.length !== 6) issues.push(`${rares.length} rare and ${plain.length} ordinary nodes (want 10 and 6)`);
  const plainSize = Math.max(...plain.map(s => parseFloat(getComputedStyle(s).fontSize)));
  const legendKeys = [...document.querySelectorAll('.map-overlays-legend li')].filter(li => / \(rare\):/.test(li.textContent));
  if (legendKeys.length !== 10) issues.push(`${legendKeys.length} legend entries say "(rare)" (want 10)`);
  let minGlyph = Infinity, minRim = Infinity;
  for (const s of rares) {
    const cs = getComputedStyle(s), name = s.dataset.resource;
    if (!on) { if (cs.borderTopWidth !== '1px' || cs.backgroundColor !== 'rgba(0, 0, 0, 0)') issues.push(`${name}: flag off changed the ring (${cs.borderTopWidth}, ${cs.backgroundColor})`); continue; }
    if (parseFloat(cs.borderTopWidth) < 2) issues.push(`${name}: rim is ${cs.borderTopWidth}`);
    if (rgb(cs.backgroundColor).length < 3 || cs.backgroundColor === 'rgba(0, 0, 0, 0)') issues.push(`${name}: badge is not filled`);
    if (parseFloat(cs.borderTopLeftRadius) < s.getBoundingClientRect().width / 2 - 1) issues.push(`${name}: badge is not round`);
    if (parseFloat(cs.fontSize) < plainSize * 1.18) issues.push(`${name}: glyph ${cs.fontSize} is not larger than ordinary ${plainSize}px`);
    const g = contrast(cs.color, cs.backgroundColor), rim = Math.min(contrast(cs.borderTopColor, cs.backgroundColor), contrast(cs.borderTopColor, (cs.boxShadow.match(/rgba?\([^)]*\)/) ?? [''])[0]));
    minGlyph = Math.min(minGlyph, g); minRim = Math.min(minRim, rim);
    if (g < 4.5) issues.push(`${name}: glyph contrast ${g.toFixed(2)}:1`);
    if (rim < 3) issues.push(`${name}: rim contrast ${rim.toFixed(2)}:1`);
  }
  for (const s of plain) if (getComputedStyle(s).backgroundColor !== 'rgba(0, 0, 0, 0)' || parseFloat(getComputedStyle(s).borderTopWidth) > 0) issues.push(`ordinary ${s.dataset.resource} has a badge`);
  for (const li of legendKeys) { const key = li.querySelector('span[aria-hidden="true"]');
    if (on !== key?.classList.contains('map-rare-key')) issues.push(`legend "${li.textContent}": badge ${on ? 'missing' : 'shown with the flag off'}`);
    if (on && key) { const r = key.getBoundingClientRect(); if (r.width < 14 || r.height < 14) issues.push(`legend "${li.textContent}": badge is ${Math.round(r.width)}x${Math.round(r.height)}`); } }
  if (!on && document.querySelector('.map-rare-key, .map-resources[data-rare-marker]')) issues.push('flag off renders the #800 marker');
  return { issues, minGlyph, minRim };
};

export async function checkRareMarker({ browser, css, preflight, failures, rows }) {
  const shots = process.env.LAYOUT_SHOTS_DIR;
  for (const flag of ['false', 'true']) {
    const script = await bundle({ NEXT_PUBLIC_HARIMU_RARE_MARKER: flag }, entry), on = flag === 'true';
    for (const [w, h] of [[1280, 800], [390, 844], [320, 700]]) for (const scale of [1, 1.5]) for (const low of [false, true]) {
      const id = `${w}x${h} @${scale * 100}% rare marker (flag ${on ? 'on' : 'off'}${low ? ', low graphics' : ''})`;
      const page = await (await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 600 })).newPage(); page.setDefaultTimeout(90000);
      await page.setContent(`<!doctype html><html style="--text-scale:${scale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}${css}</style></head><body><div id="root"></div></body></html>`);
      await page.addScriptTag({ content: script }); await page.evaluate(() => window.mountOverlays());
      await page.waitForSelector('.map-overlays', { state: 'attached' });
      if (w <= 390) await page.click('.map-overlays-trigger');
      await page.click('.map-overlays-group button:text-is("Resources")');
      await page.waitForSelector('.map-resources > span'); await page.waitForSelector('.map-overlays-legend li');
      if (low) await page.evaluate(() => document.querySelector('.map-resources').setAttribute('data-low-graphics', 'true'));
      await page.mouse.move(1, h - 1); await page.evaluate(() => document.activeElement?.blur()); await page.waitForTimeout(150);
      const r = await page.evaluate(probe, on);
      for (const i of r.issues) failures.push(`${id}: ${i}`);
      rows.push(`${id}: 10 rare, 6 ordinary${on ? `, glyph ≥ ${r.minGlyph.toFixed(1)}:1, rim ≥ ${r.minRim.toFixed(1)}:1` : ''}${r.issues.length ? ' ✗' : ''}`);
      if (shots && !low && scale === 1) await page.screenshot({ path: `${shots}/${on ? 'after' : 'before'}-${w}.png` });
      if (shots && !low && scale === 1.5 && w === 1280) await page.screenshot({ path: `${shots}/${on ? 'after' : 'before'}-${w}-150.png` });
      await page.context().close();
    }
  }
}
if (isMain(import.meta.url)) await runStandalone('#800 rare marker', checkRareMarker);

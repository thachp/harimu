/** #392 S5 check: World crest chips (NEXT_PUBLIC_HARIMU_UI_V2_WORLD) in the real GameShell World strip with the shipped CSS, all ten nations,
 *  at 1280x800, 390x844, 320x700 and 320x640, 100%, 125% and 150% text, plus a 7%-wider-glyph variant at 150%:
 *  every chip shows its crest (not overlapping the name) and its name without a mid-word split, stays at least 44px tall, keeps its badge inside it,
 *  the selected nation stays pressed, keyboard focus reaches every chip, and the page never scrolls sideways (the strip itself scrolls, as today).
 *  With LAYOUT_SHOTS_DIR: the strip at each size. Used by hud-layout-check.mjs. Screenshots: LAYOUT_SHOTS_DIR=docs/screenshots/392-s5. */
import { bundleShell, shellProps } from './hud-tooltip-check.mjs';
import { isMain, runStandalone } from './layout-standalone.mjs';

const names = { kindle: 'Kindle Republic', confluence: 'The Confluence', meridian: 'Meridian', korund: 'Korund', aurelle: 'Aurelle', ilmar: 'Ilmar', hoarvale: 'Hoarvale', varkand: 'Varkand', veldwood: 'Veldwood', fulmara: 'Fulmara' };
const badges = { kindle: 'Growing', korund: 'Growing', aurelle: 'Needs citizens' };
const contextItems = Object.entries(names).map(([id, label]) => ({ id, label, detail: `Capital · ${label}`, badge: badges[id] ?? 'Coming soon', selected: id === 'aurelle' }));

const probe = () => {
  const issues = [], vw = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > vw + 1) issues.push(`page scrolls sideways by ${document.documentElement.scrollWidth - vw}px`);
  const strip = document.querySelector('.game-world-v2'); if (!strip) return [...issues, 'no .game-world-v2 strip'];
  const chips = [...strip.querySelectorAll('.game-context-items>button')];
  if (chips.length !== 10) issues.push(`${chips.length} chips`);
  if (chips.filter(c => c.getAttribute('aria-pressed') === 'true').length !== 1) issues.push('not exactly one pressed chip');
  for (const c of chips) {
    c.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = c.getBoundingClientRect(), crest = c.querySelector('.nation-crest svg')?.getBoundingClientRect(), name = c.querySelector('strong').firstChild?.nextSibling;
    if (r.height < 43.5) issues.push(`${c.textContent} is ${Math.round(r.height)}px tall`);
    if (!crest || crest.width < 16) { issues.push(`${c.textContent}: no visible crest`); continue; }
    if (crest.left < r.left - 0.5 || crest.right > r.right + 0.5 || crest.top < r.top - 0.5 || crest.bottom > r.bottom + 0.5) issues.push(`${c.textContent}: crest outside the chip`);
    for (const node of [...c.querySelector('strong').childNodes].filter(n => n.nodeType === 3)) {
      const range = document.createRange(); range.selectNodeContents(node); const rects = [...range.getClientRects()];
      for (const t of rects) if (t.top < crest.bottom - 0.5 && t.bottom > crest.top + 0.5 && t.left < crest.right - 0.5 && t.right > crest.left + 0.5) issues.push(`${c.textContent}: name overlaps the crest`);
      for (const m of node.textContent.matchAll(/\S+/g)) { const w = document.createRange(); w.setStart(node, m.index); w.setEnd(node, m.index + m[0].length); if (new Set([...w.getClientRects()].map(x => Math.round(x.top))).size > 1) issues.push(`"${m[0]}" splits mid-word`); }
    }
    const badge = c.querySelector('.population-band-badge')?.getBoundingClientRect();
    if (badge && (badge.left < r.left - 0.5 || badge.right > r.right + 0.5 || badge.bottom > r.bottom + 0.5)) issues.push(`${c.textContent}: badge outside the chip`);
    void name;
  }
  return issues;
};

export async function checkUiV2World({ browser, css, preflight, failures, rows }) {
  const script = await bundleShell(undefined, { NEXT_PUBLIC_HARIMU_UI_V2_WORLD: 'true' }), shots = process.env.LAYOUT_SHOTS_DIR;
  for (const [w, h] of [[1280, 800], [390, 844], [320, 700], [320, 640]]) for (const scale of [1, 1.25, 1.5]) for (const wide of scale === 1.5 ? [false, true] : [false]) {
    const id = `${w}x${h} @${scale * 100}% S5 world chips${wide ? ' (wide glyphs)' : ''}`;
    const context = await browser.newContext({ viewport: { width: w, height: h } }), page = await context.newPage(); page.setDefaultTimeout(90000);
    await page.setContent(`<!doctype html><html style="--text-scale:${scale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}${css}${wide ? '*{letter-spacing:.07em!important}' : ''}</style></head><body><div id="root"></div></body></html>`);
    await page.addScriptTag({ content: script });
    await page.evaluate(p => window.mountShell(p), { ...shellProps, view: 'world', citizenNation: null, contextItems, contextTitle: 'Nations' }); await page.waitForSelector('.game-world-v2');
    for (const issue of await page.evaluate(probe)) failures.push(`${id}: ${issue}`);
    await page.evaluate(() => document.querySelector('.game-world-v2 .game-context-items').scrollLeft = 0);
    await page.focus('.game-world-v2 .game-context-items>button'); const seen = new Set();
    for (let i = 0; i < 10; i++) { seen.add(await page.evaluate(() => document.activeElement?.closest('.game-world-v2') ? document.activeElement.querySelector('.nation-crest')?.dataset.nationCrest : null)); await page.keyboard.press('Tab'); }
    if ([...seen].filter(Boolean).length !== 10) failures.push(`${id}: Tab reached ${[...seen].filter(Boolean).length} of 10 chips`);
    await page.evaluate(() => document.querySelector('.game-world-v2 .game-context-items').scrollLeft = 0);
    if (shots && !wide && h !== 640 && scale !== 1.25) await page.locator('.game-world-v2').screenshot({ path: `${shots}/s5-world-chips-${w}-${scale * 100}.png` });
    rows.push(`${id}: 10 crest chips fit`);
    await context.close();
  }
}
if (isMain(import.meta.url)) await runStandalone('S5 world chips', checkUiV2World); // QA2 #761: running this file alone runs the check

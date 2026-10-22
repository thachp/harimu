/** #392 S3 check: the UI v2 panel shape (NEXT_PUBLIC_HARIMU_UI_V2_PANEL) in the real GameShell side panel, World and City.
 *  At 1280x800 and 390x844, 100% and 150% text, plus a 7%-wider-glyph variant at 150% so the result does not depend on the machine's fonts:
 *  summary header (name + subtitle; the crest stays in the inspector header above), stats, chevron rows and the primary action all sit inside the panel; no word splits mid-word; rows and the
 *  primary action are at least 44px tall and fully clickable; the page never scrolls sideways. Rows and the primary action call their handlers.
 *  With LAYOUT_SHOTS_DIR: panel crops for World and City at each size. Used by hud-layout-check.mjs. Screenshots: LAYOUT_SHOTS_DIR=docs/screenshots/392-s3. */
import { readFile } from 'node:fs/promises';
import { bundleShell, shellProps } from './hud-tooltip-check.mjs';

const entry = `
  import React from 'react'; import { createRoot } from 'react-dom/client'; import { GameShell } from './app/game-shell.tsx'; import { PanelV2 } from './app/panel-v2.tsx';
  window.__hits = [];
  const hit = id => () => window.__hits.push(id);
  window.mount = ({ props, panel }) => { window.__root?.unmount(); window.__root = createRoot(document.getElementById('root'));
    window.__root.render(<GameShell {...props} onNavigate={() => {}} onSelectNation={() => {}} accountControls={null} panel={<><PanelV2 {...panel} rows={panel.rows.map(r => ({ ...r, onSelect: hit(r.id) }))} primary={{ ...panel.primary, onSelect: hit('primary') }} /><p>Existing panel content stays below.</p></>} />); };`;

// Existing content only (lore names, lib/city-destinations.ts rows, existing button labels).
const panels = {
  world: { view: 'world', panel: { nationId: 'aurelle', title: 'Aurelle', subtitle: 'Chartered monarchy', rowsLabel: 'Game locations', stats: [{ label: 'Population', value: 'Needs citizens' }, { label: 'Capital', value: 'Highspire' }, { label: 'Currency', value: 'Crown' }],
    rows: [{ id: 'country', label: 'Country travel' }, { id: 'square', label: 'Open City' }], primary: { label: 'Inspect national institutions' } } },
  city: { view: 'square', panel: { nationId: 'kindle', title: 'Forgehaven', subtitle: 'Kindle Republic', rowsLabel: 'City destinations', stats: [{ label: 'Status', value: 'Capital' }, { label: 'Capital', value: 'Forgehaven' }, { label: 'Currency', value: 'Spark' }],
    rows: [{ id: 'workplace', label: 'Workplace', detail: 'Contributions and earnings' }, { id: 'market', label: 'Market', detail: 'Goods and citizen listings' }, { id: 'government', label: 'Government', detail: 'Policy and petitions' }],
    primary: { label: 'Household' } } }, // QA3 #734: the Household destination is promoted to the primary action, not repeated as a row
};

const probe = () => {
  const issues = [], vw = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > vw + 1) issues.push(`page scrolls sideways by ${document.documentElement.scrollWidth - vw}px`);
  const panel = document.querySelector('.game-inspector .panel-v2'); if (!panel) return [...issues, 'no .panel-v2 in the side panel'];
  const box = panel.getBoundingClientRect(), inside = r => r.left >= box.left - 0.5 && r.right <= box.right + 0.5;
  if (!panel.querySelector('.panel-v2-summary h2')) issues.push('summary header has no title');
  for (const el of panel.querySelectorAll('h2, p, dt, dd, strong, small, .panel-v2-primary span')) {
    if (!inside(el.getBoundingClientRect())) issues.push(`"${el.textContent}" overflows the panel`);
    for (const node of [...el.childNodes].filter(n => n.nodeType === 3)) for (const m of node.textContent.matchAll(/\S+/g)) {
      const range = document.createRange(); range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
      if (new Set([...range.getClientRects()].map(r => Math.round(r.top))).size > 1) issues.push(`"${m[0]}" splits mid-word`);
    }
  }
  for (const b of panel.querySelectorAll('.panel-v2-rows button, .panel-v2-primary')) {
    b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); if (r.height < 44 - 0.5) issues.push(`"${b.textContent}" is ${Math.round(r.height)}px tall (< 44)`);
    if (!inside(r)) issues.push(`"${b.textContent}" button overflows the panel`);
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); if (!b.contains(top)) issues.push(`"${b.textContent}" is covered at its centre`);
  }
  return issues;
};

export async function checkUiV2Panel({ browser, css, preflight, failures, rows }) {
  const script = await bundleShell(entry, { NEXT_PUBLIC_HARIMU_UI_V2_PANEL: 'true', NEXT_PUBLIC_HARIMU_UI_V2_CREST: 'true' });
  const panelCss = await readFile(new URL('../app/panel-v2.css', import.meta.url), 'utf8');
  const shots = process.env.LAYOUT_SHOTS_DIR;
  for (const [w, h] of [[1280, 800], [390, 844]]) for (const scale of [1, 1.5]) for (const wide of scale === 1.5 ? [false, true] : [false]) {
    const context = await browser.newContext({ viewport: { width: w, height: h } }); const page = await context.newPage(); page.setDefaultTimeout(90000);
    await page.setContent(`<!doctype html><html style="--text-scale:${scale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}${css}${panelCss}${wide ? '*{letter-spacing:.07em!important}' : ''}</style></head><body><div id="root"></div></body></html>`);
    await page.addScriptTag({ content: script });
    for (const [name, { view, panel }] of Object.entries(panels)) {
      const id = `${w}x${h} @${scale * 100}% S3 panel ${name}${wide ? ' (wide glyphs)' : ''}`;
      await page.evaluate(a => window.mount(a), { props: { ...shellProps, view, nation: { ...shellProps.nation, id: panel.nationId, name: panel.title } }, panel });
      await page.waitForSelector('.panel-v2');
      for (const issue of await page.evaluate(probe)) failures.push(`${id}: ${issue}`);
      await page.evaluate(() => { window.__hits = []; });
      for (const b of await page.$$('.panel-v2-rows button, .panel-v2-primary')) { await b.scrollIntoViewIfNeeded(); await b.click(); }
      const hits = await page.evaluate(() => window.__hits), want = [...panel.rows.map(r => r.id), 'primary'];
      if (hits.join() !== want.join()) failures.push(`${id}: clicks reached ${hits.join()} instead of ${want.join()}`);
      if (shots && !wide) await page.locator('.game-inspector').screenshot({ path: `${shots}/s3-panel-${name}-${w}-${scale * 100}.png` });
      rows.push(`${id}: panel shape fits, rows and primary clickable`);
    }
    await context.close();
  }
}

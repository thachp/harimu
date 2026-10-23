/** #392 S7 check: City hotspots as icon pills with a leader dot (NEXT_PUBLIC_HARIMU_UI_V2_CITY), real GameShell + GameViewport + the S3 CitySummary panel,
 *  flag off and on, at 1280x800, 390x844, 320x700 and 320x640, 100/125/150% text.
 *  Flag on:
 *  - every City label is a pill with a decorative icon (dropped at 360px and below, where the canvas has no room) (aria-hidden SVG). Its text and "Select …" name are the same as with the flag off;
 *  - the pill text is never clipped and never splits mid-word;
 *  - pills are at least 32px tall on desktop and 44px on a phone, and visible pills sit inside the scene;
 *  - text-to-pill contrast is at least 4.5:1 and rim-to-pill at least 3:1;
 *  - on desktop a leader dot sits on the building, under the pill;
 *  - keyboard: Tab reaches a pill, its focus ring is at least 2px, and Enter selects the place;
 *  - the bottom "City destinations" strip is gone, and the panel's "City destinations" rows plus the Household primary carry every destination.
 *  No pill is covered at its centre unless its flag-off label already is: at 320 wide and 125/150% text the #377 placement lets labels touch on the ~180px canvas.
 *  S3 panel and S4 rail are on, as in preview.
 *  Flag off: today's labels and strip. Both: the page never scrolls sideways.
 *  With LAYOUT_SHOTS_DIR, shots go to docs/screenshots/392-s7. Used by hud-layout-check.mjs; runs on its own too. */
import { bundleShell, shellProps } from './hud-tooltip-check.mjs';
import { readFile } from 'node:fs/promises';
import { isMain, runStandalone } from './layout-standalone.mjs';

const entry = `
  import React from 'react'; import { createRoot } from 'react-dom/client'; import { GameShell } from './app/game-shell.tsx'; import { CitySummary } from './app/scene-panels-v2.tsx';
  import { cityDestinations } from './lib/city-destinations.ts';
  const nation = { id: 'kindle', name: 'Kindle Republic', capital: 'Forgehaven', currency: 'Spark', color: '#c7643a' };
  window.__views = []; window.__selected = null;
  window.mount = props => { window.__root?.unmount(); window.__root = createRoot(document.getElementById('root'));
    window.__root.render(<GameShell {...props} nation={nation} citizenNation={nation} nations={[nation]} onNavigate={v => window.__views.push(v)} onSelectNation={() => {}} onSelect={s => { window.__selected = s?.label ?? null; }} accountControls={null}
      contextTitle="City destinations" contextItems={cityDestinations('kindle', true).map(c => ({ ...c, onSelect: () => window.__views.push(c.id) }))}
      panel={<CitySummary cityName="Forgehaven" city={{ capital: true }} nation={nation} destinations={cityDestinations('kindle', true)} onView={v => window.__views.push(v)} />} />); };`;

/** Runs in the page. */
const probe = ({ on, phone }) => {
  const issues = [], vw = document.documentElement.clientWidth;
  const rgb = c => (c.match(/[\d.]+/g) ?? []).map(Number);
  const lum = c => { const [r, g, b] = rgb(c).slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  if (document.documentElement.scrollWidth > vw + 1) issues.push(`page scrolls sideways by ${document.documentElement.scrollWidth - vw}px`);
  const labels = [...document.querySelectorAll('.viewport-world-label')], pills = labels.filter(b => b.classList.contains('viewport-city-pill'));
  if (labels.length < 4) issues.push(`${labels.length} City labels`);
  const names = labels.map(b => `${b.textContent.trim()}|${b.getAttribute('aria-label')}`);
  if (on !== (pills.length === labels.length)) issues.push(`${pills.length} of ${labels.length} labels are pills with the flag ${on ? 'on' : 'off'}`);
  const stage = document.querySelector('.game-viewport')?.getBoundingClientRect();
  let minText = Infinity, minRim = Infinity;
  for (const b of pills) {
    const cs = getComputedStyle(b), name = b.textContent.trim(), icon = b.querySelector('.viewport-city-pill-icon');
    if (!icon || icon.getAttribute('aria-hidden') !== 'true' || !icon.querySelector('svg')) issues.push(`${name}: no decorative icon`);
    const compact = !!b.closest('[data-compact-pills]'); // #874: on a map too short for full pills each is its 44px icon only (then the icon shows at 320 too)
    if (icon && (getComputedStyle(icon).display === 'none') !== (vw <= 360 && !compact)) issues.push(`${name}: icon ${vw <= 360 && !compact ? 'shown at 320' : 'hidden'}`);
    if (compact && (Math.round(b.getBoundingClientRect().width) < 44 || Math.round(b.getBoundingClientRect().height) < 44)) issues.push(`${name}: compact pill under 44px`);
    if (b.getAttribute('aria-label') !== `Select ${name}`) issues.push(`${name}: named "${b.getAttribute('aria-label')}"`);
    const t = contrast(cs.color, cs.backgroundColor), rim = contrast(cs.borderTopColor, cs.backgroundColor); minText = Math.min(minText, t); minRim = Math.min(minRim, rim);
    if (t < 4.5) issues.push(`${name}: text contrast ${t.toFixed(2)}:1`); if (rim < 3) issues.push(`${name}: rim contrast ${rim.toFixed(2)}:1`);
    if (b.hidden) continue;
    const r = b.getBoundingClientRect();
    if (r.height < (phone ? 44 : 32) - 0.5) issues.push(`${name}: ${Math.round(r.height)}px tall`);
    if (b.scrollWidth > b.clientWidth + 1) issues.push(`${name}: text is clipped`);
    if (stage && (r.left < stage.left - 0.5 || r.right > stage.right + 0.5)) issues.push(`${name}: pill leaves the scene`);
    for (const node of [...b.childNodes].filter(n => n.nodeType === 3)) for (const m of node.textContent.matchAll(/\S+/g)) {
      const range = document.createRange(); range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
      if (new Set([...range.getClientRects()].map(x => Math.round(x.top))).size > 1) issues.push(`${name}: "${m[0]}" splits mid-word`);
    }
    const dot = b.querySelector('.viewport-city-pill-dot');
    if (!phone && (!dot || getComputedStyle(dot).display === 'none' || dot.getBoundingClientRect().top < r.bottom - 0.5)) issues.push(`${name}: no leader dot under the pill`);
  }
  const strip = document.querySelector('.game-context-strip');
  if (on) { const st = document.querySelector('.game-stage')?.getBoundingClientRect(), next = document.querySelector('.game-inspector')?.getBoundingClientRect();
    if (st && !phone && window.innerHeight - st.bottom > 2) issues.push(`${Math.round(window.innerHeight - st.bottom)}px empty below the scene`);
    if (st && next && phone && next.top - st.bottom > 2) issues.push(`${Math.round(next.top - st.bottom)}px empty between the scene and the panel`); }
  if (on === Boolean(strip)) issues.push(`bottom strip ${strip ? 'still shown' : 'missing'} with the flag ${on ? 'on' : 'off'}`);
  const panel = document.querySelector('.game-inspector .panel-v2');
  const rows = [...(panel?.querySelectorAll('.panel-v2-rows button') ?? [])].map(b => b.textContent);
  const primary = panel?.querySelector('.panel-v2-primary')?.textContent ?? '';
  for (const d of ['Workplace', 'Market', 'Government']) if (!rows.some(t => t.startsWith(d))) issues.push(`panel has no "${d}" row`);
  if (!primary.includes('Household')) issues.push('panel has no Household primary');
  const iconless = [...(panel?.querySelectorAll('.panel-v2-rows button, .panel-v2-primary') ?? [])].filter(b => !b.querySelector('.panel-v2-icon[aria-hidden="true"] svg')).length; // rows match the pills' icons
  if (on ? iconless : panel?.querySelector('.panel-v2-icon')) issues.push(on ? `${iconless} panel rows without the pill icon` : 'panel row icons with the flag off');
  const covered = labels.filter(b => !b.hidden).filter(b => { const r = b.getBoundingClientRect(), t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return t && !b.contains(t); }).map(b => b.textContent.trim());
  return { issues, names, minText, minRim, pills: pills.length, covered };
};

export async function checkUiV2City({ browser, css, preflight, failures, rows }) {
  const shots = process.env.LAYOUT_SHOTS_DIR, baseline = {}, extra = await readFile(new URL('../app/panel-v2.css', import.meta.url), 'utf8');
  for (const flag of ['false', 'true']) {
    const script = await bundleShell(entry, { NEXT_PUBLIC_HARIMU_UI_V2_CITY: flag, NEXT_PUBLIC_HARIMU_UI_V2_PANEL: 'true', NEXT_PUBLIC_HARIMU_UI_V2_RAIL: 'true' }, { realViewport: true }), on = flag === 'true'; // as in preview: S3 panel and S4 rail on
    for (const [w, h] of [[1280, 800], [390, 844], [320, 700], [320, 640]]) for (const scale of [1, 1.25, 1.5]) {
      const id = `${w}x${h} @${scale * 100}% S7 city (flag ${on ? 'on' : 'off'})`, fail = m => failures.push(`${id}: ${m}`), phone = w <= 760;
      const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: phone }), page = await context.newPage(); page.setDefaultTimeout(90000);
      await page.setContent(`<!doctype html><html style="--text-scale:${scale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}${css}${extra}</style></head><body><div id="root"></div></body></html>`);
      await page.addScriptTag({ content: script }); await page.evaluate(p => window.mount(p), { ...shellProps, view: 'square' });
      await page.waitForSelector('.viewport-world-label', { state: 'attached' }); if (on) await page.waitForSelector('.viewport-city-pill-icon svg', { state: 'attached' });
      await page.waitForTimeout(250);
      const r = await page.evaluate(probe, { on, phone });
      for (const i of r.issues) fail(i);
      const key = `${w}x${h}@${scale}`; if (!on) baseline[key] = r; else {
        if (baseline[key].names.join() !== r.names.join()) fail(`label text or names changed: ${r.names.join()} vs ${baseline[key].names.join()}`);
        for (const n of r.covered) if (!baseline[key].covered.includes(n)) fail(`${n}: pill is covered at its centre (its flag-off label is not)`); }
      if (on && scale === 1) { // keyboard: Tab to the first shown pill, ring visible, Enter selects
        const ok = await page.evaluate(() => { const b = [...document.querySelectorAll('.viewport-city-pill')].find(x => !x.hidden); if (!b) return 'no shown pill'; b.focus(); return document.activeElement === b ? '' : 'pill not focusable'; });
        if (ok) fail(ok);
        else {
          await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Tab');
          const ring = await page.evaluate(() => { const b = document.activeElement; const cs = getComputedStyle(b); return b.classList.contains('viewport-city-pill') ? { w: parseFloat(cs.outlineWidth), style: cs.outlineStyle, name: b.textContent.trim() } : null; });
          if (!ring || ring.w < 2 || ring.style === 'none') fail(`keyboard focus ring missing (${JSON.stringify(ring)})`);
          else { await page.keyboard.press('Enter'); await page.waitForTimeout(50); const sel = await page.evaluate(() => document.querySelector('.game-selection h2')?.textContent ?? document.querySelector('.game-inspector h2')?.textContent);
            if (!sel) fail(`Enter on "${ring.name}" selected nothing`); }
        }
      }
      rows.push(`${id}: ${r.names.length} labels, ${r.pills} pills${on ? `, text ≥ ${r.minText.toFixed(1)}:1, rim ≥ ${r.minRim.toFixed(1)}:1` : ''}${r.issues.length ? ' ✗' : ''}`);
      if (shots && h !== 640 && scale !== 1.25) await page.screenshot({ path: `${shots}/s7-city-${on ? 'on' : 'off'}-${w}-${scale * 100}.png` });
      await context.close();
    }
  }
}
if (isMain(import.meta.url)) await runStandalone('S7 city pills', checkUiV2City);

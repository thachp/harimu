/** #243 check: filler wire stories under their in-world byline (NEXT_PUBLIC_HARIMU_WIRE_BYLINES) in the real National news dialog, Kindle, Korund and Aurelle,
 *  flag off and on, at 1280x800, 390x844 and 320x700, 100/125/150% text. Flag on:
 *  - the nation's wire section follows the recorded articles, every story reads headline, byline, body in DOM order, and the byline reads "Wire: <service>" with the prefix visually hidden (ARC);
 *  - byline and headline text is never clipped and never splits mid-word; byline, headline and body text are at least 4.5:1 against the paper under them.
 *  Flag off: no wire section. Both: the dialog never scrolls sideways. With LAYOUT_SHOTS_DIR, shots go to docs/screenshots/243. Used by hud-layout-check.mjs; runs on its own too. */
import { bundleShell } from './hud-tooltip-check.mjs';
import { isMain, runStandalone } from './layout-standalone.mjs';

const entry = `
  import React from 'react'; import { createRoot } from 'react-dom/client'; import { NationalNewsControl } from './app/national-news.tsx';
  const titles = { kindle: ['Kindle Press', 'press'], korund: ['Korund State Media', 'state'], aurelle: ['Aurelle Court Gazette', 'court'] };
  window.mount = id => { window.__root?.unmount(); document.body.querySelectorAll('dialog').forEach(d => d.remove());
    const news = { nationId: id, title: titles[id][0], style: titles[id][1], fetchedAt: 1768489200000, statistics: { citizens: 2, completedShifts: 1, food: 4 },
      items: [{ id: 'r1', title: 'Citizenship recorded', text: '2 citizens joined the national register.', occurredAt: 1768489200000, source: 'system' }] };
    window.fetch = async url => String(url).includes('/api/news') ? new Response(JSON.stringify(news), { headers: { 'Content-Type': 'application/json' } }) : new Response('{}', { status: 404 });
    window.__root = createRoot(document.getElementById('root')); window.__root.render(<NationalNewsControl nationId={id} session="ready" />); };`;

/** Runs in the page. */
const probe = ({ on, byline }) => {
  const issues = [], dlg = document.querySelector('dialog.national-news-dialog');
  if (!dlg) return { issues: ['no news dialog'] };
  if (dlg.scrollWidth > dlg.clientWidth + 1) issues.push(`dialog scrolls sideways by ${dlg.scrollWidth - dlg.clientWidth}px`);
  if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) issues.push('page scrolls sideways');
  const wire = dlg.querySelector('.wire-stories');
  if (on !== Boolean(wire)) issues.push(`wire section ${wire ? 'shown' : 'missing'} with the flag ${on ? 'on' : 'off'}`);
  if (!wire) return { issues, stories: 0, min: Infinity };
  const items = dlg.querySelector('.national-news-items'); if (items && (items.compareDocumentPosition(wire) & Node.DOCUMENT_POSITION_FOLLOWING) === 0) issues.push('wire section is not after the recorded articles');
  const rgba = c => (c.match(/[\d.]+/g) ?? []).map(Number);
  const lum = c => rgba(c).slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ground = el => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor, a = rgba(c)[3]; if (a !== 0 && c !== 'transparent') return c; } return 'rgb(255,255,255)'; };
  let min = Infinity; const stories = [...wire.querySelectorAll('article')];
  for (const a of stories) {
    const h = a.querySelector('h4'), b = a.querySelector('.wire-byline'), p = a.querySelector('p:not(.wire-byline)'), name = h?.textContent ?? '?';
    if (!h || !b || !p || !(h.compareDocumentPosition(b) & 4) || !(b.compareDocumentPosition(p) & 4)) issues.push(`${name}: not headline, byline, body`);
    if (b && !b.textContent.startsWith(`Wire: ${byline}`)) issues.push(`${name}: byline reads "${b.textContent}"`); // ARC: announced as "Wire: <service>"
          const sr = b?.querySelector('.sr-only'), sb = sr?.getBoundingClientRect();
          if (!sr || sb.width > 1.5 || sb.height > 1.5 || getComputedStyle(sr).clipPath !== 'inset(50%)') issues.push(`${name}: "Wire:" prefix is visible or missing (${sb?.width}x${sb?.height} ${sr && getComputedStyle(sr).clipPath})`);
    for (const el of [h, b, p].filter(Boolean)) {
      const cs = getComputedStyle(el), k = (Math.max(lum(cs.color), lum(ground(el))) + 0.05) / (Math.min(lum(cs.color), lum(ground(el))) + 0.05); min = Math.min(min, k);
      if (k < 4.5) issues.push(`${name}: ${el.tagName.toLowerCase()} contrast ${k.toFixed(2)}:1`);
    }
    for (const el of [h, b].filter(Boolean)) {
      if (el.scrollWidth > el.clientWidth + 1) issues.push(`${name}: ${el === b ? 'byline' : 'headline'} clipped`);
      for (const node of [...el.childNodes].filter(n => n.nodeType === 3)) for (const m of node.textContent.matchAll(/[^\s-]+/g)) { // a break after a hyphen is a normal line break, not a split word
        const range = document.createRange(); range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
        if (new Set([...range.getClientRects()].map(x => Math.round(x.top))).size > 1) issues.push(`${name}: "${m[0]}" splits mid-word`);
      }
    }
  }
  return { issues, stories: stories.length, min };
};

export async function checkWireBylines({ browser, css, preflight, failures, rows }) {
  const shots = process.env.LAYOUT_SHOTS_DIR, bylines = { kindle: 'Kindle Press', korund: 'Korund State Media', aurelle: 'Court Gazette' };
  for (const flag of ['false', 'true']) {
    const script = await bundleShell(entry, { NEXT_PUBLIC_HARIMU_WIRE_BYLINES: flag }), on = flag === 'true';
    for (const [w, h] of [[1280, 800], [390, 844], [320, 700]]) for (const scale of [1, 1.25, 1.5]) {
      const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w <= 760 }), page = await context.newPage(); page.setDefaultTimeout(90000);
      await page.setContent(`<!doctype html><html style="--text-scale:${scale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}${css}</style></head><body><div id="root"></div></body></html>`);
      await page.addScriptTag({ content: script });
      for (const id of ['kindle', 'korund', 'aurelle']) {
        const label = `${w}x${h} @${scale * 100}% #243 wire ${id} (flag ${on ? 'on' : 'off'})`;
        await page.evaluate(n => window.mount(n), id); await page.click('button[aria-label="Open national news"]'); await page.waitForSelector('.national-news-items, .national-news'); await page.waitForTimeout(150);
        const r = await page.evaluate(probe, { on, byline: bylines[id] });
        for (const i of r.issues) failures.push(`${label}: ${i}`);
        rows.push(`${label}: ${r.stories} wire stories${on ? `, text ≥ ${r.min.toFixed(1)}:1` : ''}${r.issues.length ? ' ✗' : ''}`);
        if (shots && scale !== 1.25 && (on || id === 'kindle')) {
          if (on) await page.evaluate(() => document.querySelector('.wire-stories')?.scrollIntoView({ block: 'start' }));
          await page.screenshot({ path: `${shots}/243-${on ? 'on' : 'off'}-${id}-${w}-${scale * 100}.png` });
        }
        await page.evaluate(() => document.querySelector('dialog.national-news-dialog')?.close());
      }
      await context.close();
    }
  }
}
if (isMain(import.meta.url)) await runStandalone('#243 wire bylines', checkWireBylines);

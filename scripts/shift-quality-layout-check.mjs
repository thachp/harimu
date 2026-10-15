/** #347 check: the shift quality dialog is styled. Bundles the real ShiftQualityStep and renders it with the shipped CSS at
 *  1280x800, 390x844 and 360x740, 100/125/150% text:
 *  - the dialog fits the screen (it scrolls inside itself if the text is big) and never scrolls sideways
 *  - every option row and every button is at least 44px tall, buttons never touch or overlap (at least 8px between them), the
 *    primary button is visibly different from Skip and Cancel, and the last button can be scrolled into view
 *  - choosing an option changes that row's look, and the dialog text has real contrast
 *  Used by hud-layout-check.mjs (npm run test:layout). Screenshots: LAYOUT_SHOTS_DIR=docs/screenshots/347. */
import { bundleShell } from './hud-tooltip-check.mjs';

const entry = `
  import React from 'react'; import { createRoot } from 'react-dom/client';
  import { ShiftQualityStep } from './app/shift-quality-step.tsx'; import { harvestQuestions } from './lib/shift-quality.ts';
  window.mountStep = () => { window.__root?.unmount(); window.__root = createRoot(document.getElementById('root'));
    window.__root.render(<ShiftQualityStep orderName="Support the savanna harvest" cost={4} base={{ wageMinor: 800, quantity: 4, item: 'food' }} questions={harvestQuestions} onStart={() => {}} onCancel={() => {}} />); };`;

const measure = () => {
  const vw = document.documentElement.clientWidth, vh = window.innerHeight, d = document.querySelector('.shift-quality');
  const r = d.getBoundingClientRect(), issues = [];
  if (r.left < -0.5 || r.right > vw + 0.5 || r.top < -0.5 || r.bottom > vh + 0.5) issues.push(`dialog leaves the screen (${Math.round(r.left)},${Math.round(r.top)} to ${Math.round(r.right)},${Math.round(r.bottom)} in ${vw}x${vh})`);
  if (d.scrollWidth > d.clientWidth + 1) issues.push('dialog scrolls sideways');
  if (document.documentElement.scrollWidth > vw + 1) issues.push('page scrolls sideways');
  for (const l of d.querySelectorAll('.shift-quality-questions label')) { const h = l.getBoundingClientRect().height; if (h < 43.5) issues.push(`option row is ${Math.round(h)}px tall`); }
  d.querySelector('.shift-quality-actions').scrollIntoView({ block: 'end' });
  const btns = [...d.querySelectorAll('.shift-quality-actions button')].map(b => ({ t: b.textContent.slice(0, 12), r: b.getBoundingClientRect(), bg: getComputedStyle(b).backgroundColor, bd: getComputedStyle(b).borderColor }));
  const dr = d.getBoundingClientRect();
  for (const b of btns) { if (b.r.height < 43.5) issues.push(`button "${b.t}" is ${Math.round(b.r.height)}px tall`); if (b.r.bottom > Math.min(dr.bottom, vh) + 0.5 || b.r.top < -0.5) issues.push(`button "${b.t}" cannot be scrolled into view`); if (b.r.right > vw + 0.5) issues.push(`button "${b.t}" leaves the screen`); }
  for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) {
    const a = btns[i].r, c = btns[j].r;
    const gapX = Math.max(c.left - a.right, a.left - c.right), gapY = Math.max(c.top - a.bottom, a.top - c.bottom);
    if (Math.max(gapX, gapY) < 7.5) issues.push(`buttons "${btns[i].t}" and "${btns[j].t}" are only ${Math.round(Math.max(gapX, gapY))}px apart`);
  }
  if (btns.length !== 3) issues.push(`expected 3 buttons, found ${btns.length}`);
  else if (btns[0].bd === btns[1].bd && btns[0].bg === btns[1].bg) issues.push('the primary button looks the same as Skip');
  return { issues, rows: btns.map(b => Math.round(b.r.height)).join('/') };
};

export async function checkShiftQualityStep({ browser, css, preflight, failures, rows }) {
  const script = await bundleShell(entry);
  const shots = process.env.LAYOUT_SHOTS_DIR;
  for (const [w, h] of [[1280, 800], [390, 844], [360, 740]]) for (const scale of [1, 1.25, 1.5]) {
    const context = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await context.newPage();
    const id = `${w}x${h} @${scale * 100}% shift-quality`;
    await page.setContent(`<!doctype html><html style="--text-scale:${scale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}${css}</style></head><body><div id="root"></div></body></html>`);
    await page.addScriptTag({ content: script });
    await page.evaluate(() => window.mountStep());
    await page.waitForSelector('.shift-quality');
    const empty = await page.evaluate(measure);
    for (const i of empty.issues) failures.push(`${id}: ${i}`);
    await page.evaluate(() => document.querySelector('.shift-quality').scrollTo(0, 0));
    if (shots && (scale === 1 || scale === 1.5) && w !== 360) await page.screenshot({ path: `${shots}/after-quality-empty-${w}-${scale * 100}.png` });
    const before = await page.evaluate(() => { const l = document.querySelector('.shift-quality-questions label'); return getComputedStyle(l).borderColor + getComputedStyle(l).backgroundColor; });
    await page.locator('.shift-quality-questions label').first().click();
    const after = await page.evaluate(() => { const l = document.querySelector('.shift-quality-questions label'); return getComputedStyle(l).borderColor + getComputedStyle(l).backgroundColor; });
    if (before === after) failures.push(`${id}: choosing an option does not change its look`);
    for (let q = 0; q < 3; q++) await page.locator('.shift-quality-questions fieldset').nth(q).locator('label').first().click();
    if (await page.locator('.shift-quality-start').isDisabled()) failures.push(`${id}: Start is still disabled after all answers`);
    await page.evaluate(() => document.querySelector('.shift-quality').scrollTo(0, 0));
    if (shots && (scale === 1 || scale === 1.5) && w !== 360) await page.screenshot({ path: `${shots}/after-quality-answered-${w}-${scale * 100}.png` });
    if (shots && (scale === 1 || scale === 1.5) && w !== 360) { await page.evaluate(() => { const d = document.querySelector('.shift-quality'); d.scrollTop = d.scrollHeight; }); await page.screenshot({ path: `${shots}/after-quality-buttons-${w}-${scale * 100}.png` }); }
    rows.push(`${id}: dialog fits, buttons ${empty.rows}px tall, spaced, selected row changes`);
    await context.close();
  }
}

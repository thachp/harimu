/** #970: Korund ration coupons as a stamped booklet, flag NEXT_PUBLIC_HARIMU_KORUND_RATION_BOOKLET.
 *  Real CouponBook inside the Korund nation document, in the inspector column (30% at 1280, full width at 390),
 *  text 100% and 150%. Flag on: week header, one page per coupon, a stamp only on a used coupon, the Korund crest,
 *  4.5:1 text, 44px buttons, no sideways scroll, no mid-word breaks, and no animation (including reduced motion).
 *  Flag off: the plain list, no booklet, no stamp, no crest. Screenshots: LAYOUT_SHOTS_DIR=docs/screenshots/970. */
import { mkdir } from 'node:fs/promises';
import { bundleShell } from './hud-tooltip-check.mjs';
import { isMain, runStandalone } from './layout-standalone.mjs';

const entry = `
  import React from 'react'; import { createRoot } from 'react-dom/client';
  import { NationDocument } from './app/nation-document.tsx';
  import { CouponBook } from './app/korund-plan-panel.tsx';
  import { buildCoupons } from './lib/korund-coupons.ts';
  const coupons = buildCoupons(false, new Set(['clothing']), '2099-01-01T00:00:00.000Z');
  window.mountBook = () => { window.__root?.unmount(); window.__root = createRoot(document.getElementById('root'));
    window.__root.render(<NationDocument nationId="korund" className="citizen-market korund-plan" label="Korund assignment and ration account">
      <CouponBook now={Date.parse('2026-06-01T00:00:00.000Z')} gameWeek={4} coupons={coupons} walletMinor={800} clothing={1} goods={0} reason={null} onRedeem={() => {}} onFood={() => {}} />
    </NationDocument>); };`;

const probe = () => {
  const rgb = c => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
  const lum = c => { const [r, g, b] = rgb(c).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const parse = c => { const m = c.match(/[\d.]+/g) ?? []; return { rgb: m.slice(0, 3).map(Number), a: m.length > 3 ? Number(m[3]) : 1 }; };
  const opaque = el => { for (let e = el; e; e = e.parentElement) { const p = parse(getComputedStyle(e).backgroundColor); if (p.a > 0.9 && p.rgb.some(n => n > 0)) return `rgb(${p.rgb.join(',')})`; } return 'rgb(59,35,37)'; };
  const fade = (color, over, alpha) => { const c = parse(color), b = parse(over); const mix = c.rgb.map((v, i) => Math.round(v * alpha + b.rgb[i] * (1 - alpha))); return `rgb(${mix.join(',')})`; };
  const ratioOf = el => { const bg = opaque(el), alpha = Number(getComputedStyle(el).opacity); const color = alpha < 0.99 ? fade(getComputedStyle(el).color, bg, alpha) : getComputedStyle(el).color; return contrast(color, bg); };
  const vw = document.documentElement.clientWidth, issues = [];
  if (document.documentElement.scrollWidth > vw + 1) issues.push(`page scrolls sideways by ${document.documentElement.scrollWidth - vw}px`);
  const book = document.querySelector('.korund-ration-booklet');
  const plain = document.querySelector('.korund-coupons');
  if (!book) return { issues, booklet: false, heading: plain?.querySelector('h4')?.textContent ?? '', label: plain?.getAttribute('aria-label') ?? '', stamps: 0, crest: false, ratios: [] };
  if (book.scrollWidth > book.clientWidth + 1) issues.push('booklet scrolls sideways');
  const heading = book.querySelector('h4')?.textContent?.trim() ?? '';
  const pages = [...book.querySelectorAll('.korund-booklet-page')];
  if (pages.length !== 3) issues.push(`expected 3 coupon pages, found ${pages.length}`);
  for (const page of pages) {
    if (page.scrollWidth > page.clientWidth + 1) issues.push('a coupon page scrolls sideways');
    const stamped = !!page.querySelector('.korund-booklet-stamp');
    const used = /used this week/.test(page.textContent);
    if (stamped !== used) issues.push(`stamp ${stamped ? 'on' : 'off'} but used=${used} (${page.textContent.replace(/\s+/g, ' ').trim().slice(0, 48)})`);
    const stamp = page.querySelector('.korund-booklet-stamp');
    if (stamp && stamp.getAttribute('aria-hidden') !== 'true') issues.push('stamp is exposed to assistive tech');
  }
  const samples = [book.querySelector('h4'), book.querySelector('.korund-booklet-page-body span'), book.querySelector('.korund-booklet-stamp'), ...book.querySelectorAll('button')].filter(Boolean);
  const ratios = samples.map(el => ({ text: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 32), ratio: ratioOf(el) }));
  for (const sample of ratios) if (sample.ratio < 4.5) issues.push(`contrast ${sample.ratio.toFixed(2)} on "${sample.text}"`);
  for (const button of book.querySelectorAll('button')) {
    const r = button.getBoundingClientRect();
    if (r.width < 43.5 || r.height < 43.5) issues.push(`button "${button.textContent.trim().slice(0, 28)}" is ${Math.round(r.width)}x${Math.round(r.height)}`);
    if (r.right > vw + 0.5 || r.left < -0.5) issues.push(`button "${button.textContent.trim().slice(0, 28)}" leaves the screen`);
  }
  const walker = document.createTreeWalker(book, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) for (const m of node.textContent.matchAll(/\S+/g)) {
    const rg = document.createRange(); rg.setStart(node, m.index); rg.setEnd(node, m.index + m[0].length);
    if (new Set([...rg.getClientRects()].filter(x => x.width > 0).map(x => Math.round(x.top))).size > 1) issues.push(`"${m[0]}" breaks mid-word`);
  }
  const motion = [...book.querySelectorAll('*'), book].some(el => { const s = getComputedStyle(el); return s.animationName !== 'none' || (parseFloat(s.animationDuration) > 0.05 && s.animationName !== 'none'); });
  if (motion) issues.push('booklet is animating');
  const crest = book.querySelector('.nation-crest');
  return { issues, booklet: true, heading, label: book.getAttribute('aria-label') ?? '', stamps: book.querySelectorAll('.korund-booklet-stamp').length, crest: crest?.dataset.nationCrest === 'korund' && !!crest.querySelector('svg[aria-label]'), ratios, kicker: book.querySelector('.korund-booklet-kicker')?.textContent ?? '' };
};

export async function checkKorundRationBooklet({ browser, css, preflight, failures, rows }) {
  const shots = process.env.LAYOUT_SHOTS_DIR;
  if (shots) await mkdir(shots, { recursive: true });
  const on = await bundleShell(entry, { NEXT_PUBLIC_HARIMU_KORUND_RATION_BOOKLET: 'true' });
  const off = await bundleShell(entry, { NEXT_PUBLIC_HARIMU_KORUND_RATION_BOOKLET: 'false' });
  const fit = '.harimu-game{display:block;height:auto;min-height:0;overflow:visible}.game-inspector{position:relative;inset:auto;height:auto;width:var(--book-column,30%);margin-left:auto;grid-row:auto}.game-inspector-body{overflow:visible;height:auto}';
  for (const flag of ['true', 'false']) for (const [w, h] of [[1280, 800], [390, 844]]) for (const scale of flag === 'true' ? [1, 1.5] : [1]) {
    const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 600 });
    const page = await context.newPage();
    const id = `${w}x${h} @${scale * 100}% flag ${flag}`;
    const column = w <= 760 ? '100%' : '30%';
    await page.setContent(`<!doctype html><html style="--text-scale:${scale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}${css}${fit}</style></head><body><div class="harimu-game" style="--book-column:${column}"><aside class="game-inspector"><div class="game-inspector-body"><div id="root"></div></div></aside></div></body></html>`);
    await page.addScriptTag({ content: flag === 'true' ? on : off });
    await page.evaluate(() => window.mountBook());
    await page.waitForSelector('.korund-coupons');
    const result = await page.evaluate(probe);
    if (flag === 'false') {
      if (result.booklet || result.stamps || result.crest) failures.push(`${id}: flag off still restyles the book`);
      if (!/This week.s ration coupons/.test(result.heading)) failures.push(`${id}: flag off heading is "${result.heading}"`);
    } else {
      if (!result.booklet) failures.push(`${id}: booklet did not render`);
      if (result.heading !== 'Game week 4') failures.push(`${id}: header is "${result.heading}"`);
      if (!/This week.s ration coupons/.test(result.kicker ?? '')) failures.push(`${id}: missing the coupon heading`);
      if (result.stamps !== 1) failures.push(`${id}: expected 1 stamp, found ${result.stamps}`);
      if (!result.crest) failures.push(`${id}: Korund crest missing`);
      for (const issue of result.issues) failures.push(`${id}: ${issue}`);
      if (shots) await page.screenshot({ path: `${shots}/booklet-${w}-${scale * 100}.png`, fullPage: true });
    }
    if (result.label !== 'Weekly ration coupons') failures.push(`${id}: aria-label is "${result.label}"`);
    rows.push(`${id}: ${flag === 'true' ? `${result.heading} stamp ${result.stamps} contrast ${(result.ratios ?? []).map(s => s.ratio.toFixed(1)).join('/')}` : 'plain list'}`);
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setContent(`<!doctype html><html data-harimu-reduced-motion style="--text-scale:1.5"><head><style>${preflight}${css}${fit}</style></head><body><div class="harimu-game" style="--book-column:100%"><aside class="game-inspector"><div class="game-inspector-body"><div id="root"></div></div></aside></div></body></html>`);
  await page.addScriptTag({ content: on });
  await page.evaluate(() => window.mountBook());
  await page.waitForSelector('.korund-booklet-stamp');
  const reduced = await page.evaluate(probe);
  for (const issue of reduced.issues) failures.push(`reduced motion: ${issue}`);
  if (reduced.stamps !== 1) failures.push('reduced motion: stamp missing');
  rows.push('reduced motion @390 150%: no animation');
  await context.close();
}

if (isMain(import.meta.url)) await runStandalone('Korund ration booklet', checkKorundRationBooklet);

/** #1008: Aurelle royal decree as a sealed scroll, flag NEXT_PUBLIC_HARIMU_AURELLE_SEALED_SCROLLS.
 *  Real LeaderPanel in the inspector column (30% at 1280, full width at 390), text 100% and 150%.
 *  Flag on: parchment header, wax seal with the Aurelle crest, the same decree text, 4.5:1 text,
 *  a 44px summary, no sideways scroll, no mid-word breaks, and no animation (including reduced motion).
 *  Flag off: today's decree card, no seal. Screenshots: LAYOUT_SHOTS_DIR=docs/screenshots/1008. */
import { mkdir } from 'node:fs/promises';
import { bundleShell } from './hud-tooltip-check.mjs';
import { isMain, runStandalone } from './layout-standalone.mjs';

const entry = `
  import React from 'react'; import { createRoot } from 'react-dom/client';
  import { LeaderPanel } from './app/leader-panel.tsx';
  import { simulateGovernment } from './lib/government.ts';
  const snapshot = simulateGovernment({ nationId: 'aurelle', availableBudgetMinor: 0, foodSecurity: 35, petitionCounts: {} });
  window.mountDecree = () => { window.__root?.unmount(); window.__root = createRoot(document.getElementById('root'));
    window.__root.render(<LeaderPanel snapshot={snapshot} />); };`;

const probe = () => {
  const rgb = c => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
  const lum = c => { const [r, g, b] = rgb(c).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const parse = c => { const m = c.match(/[\d.]+/g) ?? []; return { rgb: m.slice(0, 3).map(Number), a: m.length > 3 ? Number(m[3]) : 1 }; };
  const opaque = el => { for (let e = el; e; e = e.parentElement) { const p = parse(getComputedStyle(e).backgroundColor); if (p.a > 0.9 && p.rgb.some(n => n > 0)) return `rgb(${p.rgb.join(',')})`; } return 'rgb(53,40,70)'; };
  const fade = (color, over, alpha) => { const c = parse(color), b = parse(over); const mix = c.rgb.map((v, i) => Math.round(v * alpha + b.rgb[i] * (1 - alpha))); return `rgb(${mix.join(',')})`; };
  const ratioOf = el => { const bg = opaque(el), alpha = Number(getComputedStyle(el).opacity); const color = alpha < 0.99 ? fade(getComputedStyle(el).color, bg, alpha) : getComputedStyle(el).color; return contrast(color, bg); };
  const vw = document.documentElement.clientWidth, issues = [];
  if (document.documentElement.scrollWidth > vw + 1) issues.push(`page scrolls sideways by ${document.documentElement.scrollWidth - vw}px`);
  const scroll = document.querySelector('.aurelle-sealed-scroll');
  const card = document.querySelector('[aria-label="Royal decree"]');
  if (!scroll) return { issues, scroll: false, label: card?.getAttribute('aria-label') ?? '', seal: false, crest: false, text: card?.textContent ?? '' };
  if (scroll.scrollWidth > scroll.clientWidth + 1) issues.push('scroll scrolls sideways');
  const seal = scroll.querySelector('.aurelle-scroll-seal');
  if (!seal) issues.push('wax seal missing');
  else if (seal.getAttribute('aria-hidden') !== 'true') issues.push('seal is exposed to assistive tech');
  const summary = scroll.querySelector('summary');
  if (summary) { const r = summary.getBoundingClientRect(); if (r.width < 43.5 || r.height < 43.5) issues.push(`summary is ${Math.round(r.width)}x${Math.round(r.height)}`); }
  const samples = [scroll.querySelector('.nation-document-masthead'), summary, scroll.querySelector('p')].filter(Boolean);
  const ratios = samples.map(el => ({ text: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 40), ratio: ratioOf(el) }));
  for (const sample of ratios) if (sample.ratio < 4.5) issues.push(`contrast ${sample.ratio.toFixed(2)} on "${sample.text}"`);
  const linesOf = range => new Set([...range.getClientRects()].filter(x => x.width > 0).map(x => Math.round(x.top)));
  const walker = document.createTreeWalker(scroll, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) for (const m of node.textContent.matchAll(/\S+/g)) {
    const rg = document.createRange(); rg.setStart(node, m.index); rg.setEnd(node, m.index + m[0].length);
    if (linesOf(rg).size < 2) continue;
    const atHyphen = [...m[0].matchAll(/-/g)].some(h => {
      const left = document.createRange(); left.setStart(node, m.index); left.setEnd(node, m.index + h.index + 1);
      const right = document.createRange(); right.setStart(node, m.index + h.index + 1); right.setEnd(node, m.index + m[0].length);
      const l = [...linesOf(left)], r = [...linesOf(right)];
      return l.length === 1 && r.length === 1 && l[0] !== r[0];
    });
    if (!atHyphen) issues.push(`"${m[0]}" breaks mid-word`);
  }
  const motion = [...scroll.querySelectorAll('*'), scroll].some(el => { const s = getComputedStyle(el); return s.animationName !== 'none' && parseFloat(s.animationDuration) > 0.05; });
  if (motion) issues.push('scroll is animating');
  const crest = scroll.querySelector('.nation-crest');
  return { issues, scroll: true, label: scroll.getAttribute('aria-label') ?? '', seal: !!seal, crest: crest?.dataset.nationCrest === 'aurelle', ratios, heading: scroll.querySelector('.nation-document-masthead')?.textContent?.trim() ?? '' };
};

export async function checkAurelleSealedScrolls({ browser, css, preflight, failures, rows }) {
  const shots = process.env.LAYOUT_SHOTS_DIR;
  if (shots) await mkdir(shots, { recursive: true });
  const on = await bundleShell(entry, { NEXT_PUBLIC_HARIMU_AURELLE_SEALED_SCROLLS: 'true' });
  const off = await bundleShell(entry, { NEXT_PUBLIC_HARIMU_AURELLE_SEALED_SCROLLS: 'false' });
  const fit = '.harimu-game{display:block;height:auto;min-height:0;overflow:visible}.game-inspector{position:relative;inset:auto;height:auto;width:var(--scroll-column,30%);margin-left:auto;grid-row:auto}.game-inspector-body{overflow:visible;height:auto}';
  for (const flag of ['true', 'false']) for (const [w, h] of [[1280, 800], [390, 844]]) for (const scale of flag === 'true' ? [1, 1.5] : [1]) {
    const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 600 });
    const page = await context.newPage();
    const id = `${w}x${h} @${scale * 100}% flag ${flag}`;
    const column = w <= 760 ? '100%' : '30%';
    await page.setContent(`<!doctype html><html style="--text-scale:${scale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}${css}${fit}</style></head><body><div class="harimu-game" style="--scroll-column:${column}"><aside class="game-inspector"><div class="game-inspector-body"><div id="root"></div></div></aside></div></body></html>`);
    await page.addScriptTag({ content: flag === 'true' ? on : off });
    await page.evaluate(() => window.mountDecree());
    await page.waitForSelector('[aria-label="Royal decree"]');
    if (flag === 'true') await page.click('.aurelle-sealed-scroll summary');
    const result = await page.evaluate(probe);
    if (flag === 'false') {
      if (result.scroll || result.seal || result.crest) failures.push(`${id}: flag off still restyles the decree`);
      if (!/Royal decree/.test(result.text ?? '')) failures.push(`${id}: flag off lost the decree`);
    } else {
      if (!result.scroll) failures.push(`${id}: sealed scroll did not render`);
      if (!/Royal scroll/.test(result.heading ?? '')) failures.push(`${id}: header is "${result.heading}"`);
      if (!result.seal) failures.push(`${id}: wax seal missing`);
      if (!result.crest) failures.push(`${id}: Aurelle crest missing`);
      for (const issue of result.issues) failures.push(`${id}: ${issue}`);
      if (shots) await page.screenshot({ path: `${shots}/scroll-${w}-${scale * 100}.png`, fullPage: true });
    }
    if (result.label !== 'Royal decree') failures.push(`${id}: aria-label is "${result.label}"`);
    rows.push(`${id}: ${flag === 'true' ? `sealed scroll contrast ${(result.ratios ?? []).map(s => s.ratio.toFixed(1)).join('/')}` : 'plain decree'}`);
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setContent(`<!doctype html><html data-harimu-reduced-motion style="--text-scale:1.5"><head><style>${preflight}${css}${fit}</style></head><body><div class="harimu-game" style="--scroll-column:100%"><aside class="game-inspector"><div class="game-inspector-body"><div id="root"></div></div></aside></div></body></html>`);
  await page.addScriptTag({ content: on });
  await page.evaluate(() => window.mountDecree());
  await page.waitForSelector('.aurelle-scroll-seal');
  const reduced = await page.evaluate(probe);
  for (const issue of reduced.issues) failures.push(`reduced motion: ${issue}`);
  if (!reduced.seal) failures.push('reduced motion: seal missing');
  rows.push('reduced motion @390 150%: no animation');
  await context.close();
}

if (isMain(import.meta.url)) await runStandalone('Aurelle sealed scrolls', checkAurelleSealedScrolls);

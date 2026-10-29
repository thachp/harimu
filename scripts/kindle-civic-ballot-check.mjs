/** #1009: Kindle Assembly and presidential ballots as a civic form, flag NEXT_PUBLIC_HARIMU_KINDLE_CIVIC_BALLOT.
 *  Real panels in the inspector column (30% at 1280, full width at 390), text 100% and 150%.
 *  Flag on: numbered fieldsets, 44px radio targets, a Review and cast row, Kindle tokens, no sideways scroll,
 *  no mid-word breaks, and no animation (including reduced motion). Flag off: today's radios and selects.
 *  Screenshots: LAYOUT_SHOTS_DIR (ballot-1280-100.png and the 390 / 150% set). */
import { mkdir } from 'node:fs/promises';
import { bundleShell } from './hud-tooltip-check.mjs';
import { isMain, runStandalone } from './layout-standalone.mjs';

const entry = `
  import React from 'react'; import { createRoot } from 'react-dom/client';
  import { AssemblyPanel } from './app/assembly-ballot.tsx';
  import { RankedBallot } from './app/ranked-ballot.tsx';
  import { kindleParties } from './lib/kindle-parties.ts';
  const parties = kindleParties.map(p => ({ id: p.id, name: p.name, ideology: p.ideology, color: p.color, blurb: p.blurb, ai: true }));
  const assembly = { enabled: true, nationId: 'kindle', id: 'kindle-assembly-account-poc-1', scope: 'preview-citizen', status: 'open', opensAt: 1, closesAt: 2000000000, seats: { perDistrict: 6, up: 3 }, districts: [], parties, yourDistrict: { id: 'forgehaven', name: 'Forgehaven' }, voted: false, privacyReady: true, privacyReason: '', result: null, headlines: [] };
  const election = { nationId: 'kindle', id: 'kindle-presidential-poc-1', candidates: [
    { id: 'ines-varro', name: 'Ines Varro', platform: 'Full employment and cautious trade.' },
    { id: 'tobin-achterberg', name: 'Tobin Achterberg', platform: 'Lower levies and open markets.' },
    { id: 'mara-quell', name: 'Mara Quell', platform: 'Public housing and dock building.' },
  ], status: 'open', opensAt: 1760000000, closesAt: 1760259200, voted: false, result: null, privacyReady: true, privacyReason: '', verification: { countedActionsEligible: true, reason: 'Verified fixture human.' } };
  window.__election = election;
  window.mountBallots = () => { window.__root?.unmount(); window.__root = createRoot(document.getElementById('root'));
    window.__root.render(<div>
      <AssemblyPanel snapshot={assembly} selected="steady-hand" onSelect={() => {}} onVote={() => {}} reason={null} />
      <RankedBallot />
    </div>); };`;

const probe = tokens => {
  const rgb = c => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
  const lum = c => { const [r, g, b] = rgb(c).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const hex = value => { const n = Number.parseInt(value.slice(1), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`; };
  const vw = document.documentElement.clientWidth, issues = [];
  if (document.documentElement.scrollWidth > vw + 1) issues.push(`page scrolls sideways by ${document.documentElement.scrollWidth - vw}px`);
  const forms = [...document.querySelectorAll('.kindle-civic-ballot')];
  if (forms.length !== 2) return { issues, forms: forms.length, radios: document.querySelectorAll('input[type="radio"]').length, selects: document.querySelectorAll('select').length };
  const doc = forms[0].closest('[data-nation-theme]');
  const style = doc ? getComputedStyle(doc) : null;
  for (const [name, hexColor] of [['--nation-paper', tokens.paper], ['--nation-ink', tokens.ink], ['--nation-accent', tokens.accent], ['--nation-edge', tokens.edge]]) {
    const got = style?.getPropertyValue(name).trim().toLowerCase();
    if (got !== hexColor) issues.push(`${name} is ${got || 'missing'}`);
  }
  if (document.querySelectorAll('.kindle-civic-field').length !== 4) issues.push(`expected 4 numbered fields, found ${document.querySelectorAll('.kindle-civic-field').length}`);
  if (document.querySelectorAll('.kindle-civic-review-title').length !== 2) issues.push('Review and cast row missing');
  for (const title of document.querySelectorAll('.kindle-civic-review-title')) if (!title.textContent.includes('Review and cast')) issues.push('review title changed');
  const radios = [...document.querySelectorAll('.kindle-civic-choice input')];
  if (radios.length !== 12) issues.push(`expected 12 civic radios, found ${radios.length}`);
  for (const input of radios) {
    const label = input.closest('label'), box = input.getBoundingClientRect(), hit = label.getBoundingClientRect();
    if (box.width < 43.5 || box.height < 43.5) issues.push(`radio is ${Math.round(box.width)}x${Math.round(box.height)}`);
    if (hit.height < 43.5 || hit.width < 43.5) issues.push(`choice hit target is ${Math.round(hit.width)}x${Math.round(hit.height)}`);
    if (!input.labels?.length && label?.tagName !== 'LABEL') issues.push('radio has no label');
    if (hit.right > vw + 0.5 || hit.left < -0.5) issues.push('a choice leaves the screen');
  }
  for (const button of document.querySelectorAll('.kindle-civic-ballot button')) {
    const r = button.getBoundingClientRect();
    if (r.width < 43.5 || r.height < 43.5) issues.push(`button "${button.textContent.trim().slice(0, 28)}" is ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  const samples = ['.kindle-civic-field legend', '.kindle-civic-choice span', '.kindle-civic-review-title', '.kindle-civic-summary', '.kindle-civic-ballot button'].flatMap(sel => [...document.querySelectorAll(sel)]).slice(0, 8);
  for (const el of samples) {
    const ratio = contrast(getComputedStyle(el).color, hex(tokens.paper));
    if (ratio < 4.5) issues.push(`contrast ${ratio.toFixed(2)} on "${el.textContent.replace(/\s+/g, ' ').trim().slice(0, 32)}"`);
  }
  for (const form of forms) {
    if (form.scrollWidth > form.clientWidth + 1) issues.push('a civic form scrolls sideways');
    const walker = document.createTreeWalker(form, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) for (const m of node.textContent.matchAll(/\S+/g)) {
      const rg = document.createRange(); rg.setStart(node, m.index); rg.setEnd(node, m.index + m[0].length);
      if (new Set([...rg.getClientRects()].filter(x => x.width > 0).map(x => Math.round(x.top))).size > 1) issues.push(`"${m[0]}" breaks mid-word`);
    }
  }
  const motion = [...document.querySelectorAll('.kindle-civic-ballot, .kindle-civic-ballot *')].some(el => { const s = getComputedStyle(el); return s.animationName !== 'none' && parseFloat(s.animationDuration) > 0.05; });
  if (motion) issues.push('civic form is animating');
  return { issues, forms: forms.length, radios: radios.length, reviews: document.querySelectorAll('.kindle-civic-review').length };
};

export async function checkKindleCivicBallot({ browser, css, preflight, failures, rows }) {
  const shots = process.env.LAYOUT_SHOTS_DIR;
  if (shots) await mkdir(shots, { recursive: true });
  const on = await bundleShell(entry, { NEXT_PUBLIC_HARIMU_KINDLE_CIVIC_BALLOT: 'true' });
  const off = await bundleShell(entry, { NEXT_PUBLIC_HARIMU_KINDLE_CIVIC_BALLOT: 'false' });
  const tokens = { paper: '#f1eddc', ink: '#18343e', accent: '#246c60', edge: '#7c9189' };
  const fit = '.harimu-game{display:block;height:auto;min-height:0;overflow:visible}.game-inspector{position:relative;inset:auto;height:auto;width:var(--book-column,30%);margin-left:auto;grid-row:auto}.game-inspector-body{overflow:visible;height:auto}';
  for (const flag of ['true', 'false']) for (const [w, h] of [[1280, 800], [390, 844]]) for (const scale of flag === 'true' ? [1, 1.5] : [1]) {
    const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 600 });
    const page = await context.newPage();
    const id = `${w}x${h} @${scale * 100}% flag ${flag}`;
    const column = w <= 760 ? '100%' : '30%';
    await page.setContent(`<!doctype html><html style="--text-scale:${scale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}${css}${fit}</style></head><body><div class="harimu-game" style="--book-column:${column}"><aside class="game-inspector"><div class="game-inspector-body"><div id="root"></div></div></aside></div></body></html>`);
    await page.addScriptTag({ content: flag === 'true' ? on : off });
    await page.evaluate(() => { window.fetch = async () => ({ ok: true, status: 200, json: async () => window.__election }); window.mountBallots(); });
    if (flag === 'true') {
      await page.waitForSelector('.kindle-civic-ballot input[name="rank-0"]');
      await page.click('input[name="rank-0"][value="ines-varro"]');
      await page.click('input[name="rank-1"][value="tobin-achterberg"]');
      await page.click('input[name="rank-2"][value="mara-quell"]');
      const result = await page.evaluate(probe, tokens);
      if (result.forms !== 2) failures.push(`${id}: expected 2 civic forms, found ${result.forms}`);
      for (const issue of result.issues) failures.push(`${id}: ${issue}`);
      const summary = await page.locator('.ranked-ballot:not(.assembly-ballot) .kindle-civic-summary').innerText();
      if (!/Ines Varro/.test(summary) || !/Tobin Achterberg/.test(summary) || !/Mara Quell/.test(summary)) failures.push(`${id}: review summary is "${summary}"`);
      if (shots) await page.screenshot({ path: `${shots}/ballot-${w}-${scale * 100}.png`, fullPage: true });
      rows.push(`${id}: forms ${result.forms} radios ${result.radios}`);
    } else {
      await page.waitForSelector('select');
      const plain = await page.evaluate(() => ({ civic: document.querySelectorAll('.kindle-civic-ballot').length, selects: document.querySelectorAll('select').length, radios: document.querySelectorAll('input[type="radio"]').length, review: document.body.textContent.includes('Review and cast') }));
      if (plain.civic || plain.review || plain.selects !== 3 || plain.radios !== 3) failures.push(`${id}: flag off changed the ballots ${JSON.stringify(plain)}`);
      rows.push(`${id}: plain`);
    }
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setContent(`<!doctype html><html data-harimu-reduced-motion style="--text-scale:1.5"><head><style>${preflight}${css}${fit}</style></head><body><div class="harimu-game" style="--book-column:100%"><aside class="game-inspector"><div class="game-inspector-body"><div id="root"></div></div></aside></div></body></html>`);
  await page.addScriptTag({ content: on });
  await page.evaluate(() => { window.fetch = async () => ({ ok: true, status: 200, json: async () => window.__election }); window.mountBallots(); });
  await page.waitForSelector('.kindle-civic-choice input');
  const reduced = await page.evaluate(probe, tokens);
  for (const issue of reduced.issues) failures.push(`reduced motion: ${issue}`);
  await page.focus('.kindle-civic-choice input');
  const order = [];
  for (let i = 0; i < 6; i++) { order.push(await page.evaluate(() => `${document.activeElement?.tagName}:${document.activeElement?.getAttribute('type') ?? ''}`)); await page.keyboard.press('Tab'); }
  if (!order.some(item => item === 'INPUT:radio') || !order.includes('BUTTON:submit')) failures.push(`tab order missed a radio or the cast button (${order.join(' ')})`);
  rows.push('reduced motion @390 150%: no animation; tab reaches a radio and Cast ballot');
  await context.close();
}

if (isMain(import.meta.url)) await runStandalone('Kindle civic ballot', checkKindleCivicBallot);

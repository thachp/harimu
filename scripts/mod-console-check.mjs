/** #880 check: the read-only mod console (app/admin/mod) with a stubbed AI review queue, at 1280x800, 390x844, 320x700 and 320x640, 100/125/150% text.
 *  Keyboard only: type the token, Tab to Load, press Enter; the status line announces the result and the captioned table appears. Asserts every control is
 *  at least 44px and shows a 2px focus ring of at least 3:1; text is at least 4.5:1; nothing is clipped; the page never scrolls sideways (the table scrolls in
 *  its own focusable region). The page's flag gating is pinned in tests/mod-console.test.mjs. With LAYOUT_SHOTS_DIR, shots go to docs/screenshots/880. */
import { build } from 'esbuild';
import { isMain, runStandalone } from './layout-standalone.mjs';

const root = new URL('../', import.meta.url).pathname.replace(/\/$/, '');
const entry = `import React from 'react'; import { createRoot } from 'react-dom/client'; import { ModConsole } from './app/admin/mod/mod-console.tsx';
  const items = [1, 2, 3].map(i => ({ id: 'q' + i, created_at: 1792800000 + i * 60, source: 'notable', nation_id: ['kindle', 'korund', 'aurelle'][i - 1], persona: 'Notable ' + i, output_text: 'A long reply that wraps across several lines in the output column so a reviewer can read it in full without a sideways scroll. '.repeat(i), filter_result: i === 1 ? 'flagged' : 'pass', filter_detail: i === 1 ? 'keyword' : null, reason: i === 1 ? 'flagged' : 'sample', reviewed_at: i === 3 ? 1792900000 : null, reviewer_note: i === 3 ? 'ok' : null }));
  window.__calls = 0; const deny = location.hash === '#deny';
  createRoot(document.getElementById('root')).render(<ModConsole loadQueue={async () => { window.__calls++; return deny ? { panel: 'ai-review-queue', ok: false, status: 401, error: 'A server credential is required.' } : { panel: 'ai-review-queue', ok: true, items }; }} />);`;

const lum = c => { const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const probe = () => {
  const issues = [], vw = document.documentElement.clientWidth, bg = 'rgb(11, 32, 41)';
  if (document.documentElement.scrollWidth > vw + 1) issues.push(`page scrolls sideways by ${document.documentElement.scrollWidth - vw}px`);
  if (!document.querySelector('table caption')) issues.push('no captioned table after Load');
  if (!/^3 entries$/.test(document.querySelector('[role=status]')?.textContent ?? '')) issues.push(`status: "${document.querySelector('[role=status]')?.textContent}"`);
  const texts = [...document.querySelectorAll('h1, label, th, td, caption, [role=status], button, input, select')].map(el => [el.textContent.trim().slice(0, 20) || el.tagName, getComputedStyle(el).color]);
  return { issues, texts, bg, controls: [...document.querySelectorAll('input, select, button, [role=region]')].map(el => { const r = el.getBoundingClientRect(); return [el.tagName, Math.round(r.height), Math.round(r.right)]; }) };
};

export async function checkModConsole({ browser, preflight, failures, rows }) {
  const out = await build({ stdin: { contents: entry, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, outdir: '/out', format: 'iife', jsx: 'automatic', loader: { '.module.css': 'local-css' },
    alias: { '@': root }, define: { 'process.env.NODE_ENV': '"production"', 'process.env.NEXT_PUBLIC_HARIMU_MOD_CONSOLE': '"true"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_CREST': '"false"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_TOPBAR': '"false"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_PANEL': '"false"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_RAIL': '"false"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_WORLD': '"false"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_NATION': '"false"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_CITY': '"false"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_MOBILE': '"false"', 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_HOUSEHOLD': '"false"', 'process.env.NEXT_PUBLIC_HARIMU_NATION_SKIN': '"false"', 'process.env.NEXT_PUBLIC_HARIMU_WIRE_BYLINES': '"false"', 'process.env.NEXT_PUBLIC_HARIMU_RARE_MARKER': '"false"', 'process.env.NEXT_PUBLIC_HARIMU_TOPBAR_COUNTDOWN': '"false"', 'process.env.NEXT_PUBLIC_HARIMU_TOPBAR_EMBLEM': '"false"', 'process.env.NEXT_PUBLIC_HARIMU_NATION_SYMBOLS': '"false"' }, logLevel: 'silent' });
  const js = out.outputFiles.find(f => f.path.endsWith('.js')).text, css = out.outputFiles.find(f => f.path.endsWith('.css'))?.text ?? '', shots = process.env.LAYOUT_SHOTS_DIR;
  { // ARC (#880): no data before the server accepts the token: nothing loads or renders before Load, and a refused token renders no table or rows
    const context = await browser.newContext(), page = await context.newPage(), issues = [];
    await page.setContent(`<!doctype html><html><head><style>${preflight}${css}</style></head><body><div id="root"></div></body></html>`); await page.evaluate(() => { location.hash = '#deny'; });
    await page.addScriptTag({ content: js }); await page.waitForSelector('input[type=password]');
    if (await page.evaluate(() => window.__calls || document.querySelector('table, tbody tr'))) issues.push('data requested or shown before Load');
    await page.fill('input[type=password]', 'wrong-token-1234567'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
    const after = await page.evaluate(() => ({ calls: window.__calls, table: !!document.querySelector('table'), status: document.querySelector('[role=status]')?.textContent }));
    if (after.calls !== 1 || after.table || after.status !== '401: A server credential is required.') issues.push(`refused token: ${JSON.stringify(after)}`);
    for (const i of issues) failures.push(`token gate: ${i}`); rows.push(`token gate (refused 401)${issues.length ? ' ✗' : ''}`); await context.close();
  }
  for (const [w, h] of [[1280, 800], [390, 844], [320, 700], [320, 640]]) for (const scale of [1, 1.25, 1.5]) {
    const id = `${w}x${h} @${scale * 100}% mod console`, context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w <= 760 }), page = await context.newPage(); page.setDefaultTimeout(30000);
    await page.setContent(`<!doctype html><html style="--text-scale:${scale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}${css}</style></head><body><div id="root"></div></body></html>`);
    await page.addScriptTag({ content: js }); await page.waitForSelector('input[type=password]');
    const issues = [], ring = async () => page.evaluate(() => { const el = document.activeElement, cs = getComputedStyle(el); return { tag: el.tagName, w: parseFloat(cs.outlineWidth), style: cs.outlineStyle, color: cs.outlineColor }; });
    await page.keyboard.press('Tab'); let r = await ring(); if (r.tag !== 'INPUT') issues.push(`first Tab lands on ${r.tag}`);
    await page.keyboard.type('a-staff-token-1234');
    for (const want of ['SELECT', 'SELECT', 'SELECT', 'INPUT', 'BUTTON']) { await page.keyboard.press('Tab'); r = await ring();
      if (r.tag !== want) issues.push(`Tab order: ${r.tag}, expected ${want}`); if (r.w < 2 || r.style === 'none' || (lum(r.color) + 0.05) / (lum('rgb(11, 32, 41)') + 0.05) < 3) issues.push(`${r.tag} focus ring ${JSON.stringify(r)}`); }
    await page.keyboard.press('Enter'); await page.waitForSelector('table', { timeout: 5000 }).catch(() => {});
    const p = await page.evaluate(probe); issues.push(...p.issues);
    for (const [name, color] of p.texts) if ((lum(color) + 0.05) / (lum(p.bg) + 0.05) < 4.5) issues.push(`"${name}" contrast under 4.5:1 (${color})`);
    for (const [tag, height, right] of p.controls) { if (tag !== 'DIV' && height < 44) issues.push(`${tag} is ${height}px tall`); if (right > w + 1) issues.push(`${tag} runs off the page`); }
    for (const i of issues) failures.push(`${id}: ${i}`); rows.push(`${id}${issues.length ? ' ✗' : ''}`);
    if (shots && h !== 640 && scale !== 1.25) await page.evaluate(() => document.fonts.ready).then(() => page.waitForTimeout(300)).then(() => page.screenshot({ path: `${shots}/mod-console-${w}-${scale * 100}.png`, fullPage: true }));
    await context.close();
  }
}
if (isMain(import.meta.url)) await runStandalone('Mod console', checkModConsole);

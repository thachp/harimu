/** #85 check: nation skin PoC on the top bar (NEXT_PUBLIC_HARIMU_NATION_SKIN), real GameShell, flag off and on, for a Kindle, Korund and Aurelle citizen and a guest,
 *  at 1280x800, 390x844 and 320x700, 100/125/150% text. Flag on:
 *  - the bar carries data-nation-skin for the three citizens and none for the guest, and the three bars look different (ground color);
 *  - layout is identical: the bar and every element in it keep the flag-off box (position and size), and the bar text is unchanged;
 *  - every visible text in the bar has at least 4.5:1 against the ground under it; a keyboard focus ring (at least 2px) shows on the first bar control;
 *  - QA1 on #819: for every focusable control in the bar, the rendered pixels just outside and just inside its focus ring (ground, chips and the nation motif strips)
 *    are at least 3:1 against the ring color (sampled from a screenshot with the control focused, straight edges only, corners skipped);
 *  - ARC on #819: a hovered resource chip's border (the nation accent) is at least 3:1 against the bar.
 *  Both: the page never scrolls sideways. With LAYOUT_SHOTS_DIR, shots of the bar go to docs/screenshots/85. Used by hud-layout-check.mjs; runs on its own too. */
import { bundleShell, shellProps } from './hud-tooltip-check.mjs';
import { isMain, runStandalone } from './layout-standalone.mjs';

const entry = `
  import React from 'react'; import { createRoot } from 'react-dom/client'; import { GameShell } from './app/game-shell.tsx';
  const nations = { kindle: { id: 'kindle', name: 'Kindle Republic', capital: 'Forgehaven', currency: 'Spark' }, korund: { id: 'korund', name: 'Korund', capital: 'Ironhold', currency: 'Labor Notes' },
    aurelle: { id: 'aurelle', name: 'Kingdom of Aurelle', capital: 'Highspire', currency: 'Aurelle crown' } };
  window.mount = (props, id) => { window.__root?.unmount(); window.__root = createRoot(document.getElementById('root'));
    const nation = nations[id ?? 'kindle'];
    window.__root.render(<GameShell {...props} nation={nation} citizenNation={id ? nation : undefined} nations={Object.values(nations)} onNavigate={() => {}} onSelectNation={() => {}} accountControls={null} panel={null} />); };`;

/** Runs in the page. */
const probe = () => {
  const issues = [], vw = document.documentElement.clientWidth, bar = document.querySelector('header.game-hud');
  const rgba = c => (c.match(/[\d.]+/g) ?? []).map(Number);
  const lum = c => { const [r, g, b] = rgba(c).slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const ground = el => { for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor, a = rgba(c)[3]; if (c && a !== 0 && !(a === undefined && c === 'transparent')) return c; } return 'rgb(0,0,0)'; };
  if (document.documentElement.scrollWidth > vw + 1) issues.push(`page scrolls sideways by ${document.documentElement.scrollWidth - vw}px`);
  if (!bar) return { issues: ['no top bar'] };
  const boxes = [bar, ...bar.querySelectorAll('*')].map(e => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(v => Math.round(v)).join(','); });
  let min = Infinity;
  const walker = document.createTreeWalker(bar, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement; if (!n.textContent.trim() || !el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') continue;
    if (el.closest('[role=tooltip],.game-hud-tip')) continue;
    const c = contrast(getComputedStyle(el).color, ground(el)); min = Math.min(min, c);
    if (c < 4.5) issues.push(`"${n.textContent.trim().slice(0, 20)}" contrast ${c.toFixed(2)}:1`);
  }
  return { issues, boxes, text: bar.innerText.replace(/\s+/g, ' ').trim(), skin: bar.dataset.nationSkin ?? null, bg: getComputedStyle(bar).backgroundColor, min };
};

/** Runs in the page: ring geometry of the focused control, in CSS px relative to the bar. */
const ringOf = () => {
  const el = document.activeElement, bar = document.querySelector('header.game-hud'); if (!el || !bar.contains(el)) return null;
  const t = el.matches('details') ? el.querySelector('summary') : el, cs = getComputedStyle(t), r = t.getBoundingClientRect(), b = bar.getBoundingClientRect();
  if (cs.outlineStyle === 'none' || !parseFloat(cs.outlineWidth) || !r.width) return null;
  return { name: (t.getAttribute('aria-label') || t.textContent).trim().slice(0, 24), color: cs.outlineColor, w: parseFloat(cs.outlineWidth), off: parseFloat(cs.outlineOffset), radius: parseFloat(cs.borderTopLeftRadius) || 0,
    x: r.left - b.left, y: r.top - b.top, width: r.width, height: r.height };
};
/** Runs in the page: decode the bar screenshot and return the worst ring-to-neighbour contrast along the ring's straight edges. */
const ringContrast = async ([png, ring]) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + png; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); const px = g.getImageData(0, 0, c.width, c.height).data;
  const lum = ([r, gg, b]) => [r, gg, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const L = lum((ring.color.match(/[\d.]+/g) ?? []).map(Number).slice(0, 3));
  let worst = Infinity, at = null;
  const sample = (x, y) => { x = Math.floor(x); y = Math.floor(y); if (x < 0 || y < 0 || x >= c.width || y >= c.height) return; const i = (y * c.width + x) * 4, p = [px[i], px[i + 1], px[i + 2]], l = lum(p), k = (Math.max(L, l) + 0.05) / (Math.min(L, l) + 0.05); if (k < worst) { worst = k; at = `${x},${y} rgb(${p})`; } };
  for (const d of [ring.off + ring.w + 0.5, ring.off - 0.5]) { // the pixel row just outside the ring, and just inside it
    if (d < -Math.min(ring.width, ring.height) / 2) continue;
    const x0 = ring.x - d, y0 = ring.y - d, x1 = ring.x + ring.width + d, y1 = ring.y + ring.height + d, skip = ring.radius + Math.abs(d) + 2;
    for (let x = x0 + skip; x <= x1 - skip; x++) { sample(x, y0); sample(x, y1); }
    for (let y = y0 + skip; y <= y1 - skip; y++) { sample(x0, y); sample(x1, y); }
  }
  return { worst, at };
};

export async function checkNationSkin({ browser, css, preflight, failures, rows }) {
  const shots = process.env.LAYOUT_SHOTS_DIR, baseline = {};
  for (const flag of ['false', 'true']) {
    const script = await bundleShell(entry, { NEXT_PUBLIC_HARIMU_NATION_SKIN: flag }), on = flag === 'true';
    for (const [w, h] of [[1280, 800], [390, 844], [320, 700]]) for (const scale of [1, 1.25, 1.5]) {
      const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w <= 760 }), page = await context.newPage(); page.setDefaultTimeout(90000);
      await page.setContent(`<!doctype html><html style="--text-scale:${scale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}${css}</style></head><body><div id="root"></div></body></html>`);
      await page.addScriptTag({ content: script });
      const grounds = new Set();
      for (const id of ['kindle', 'korund', 'aurelle', null]) {
        let minRing = Infinity, rings = 0;
        const label = `${w}x${h} @${scale * 100}% #85 skin ${id ?? 'guest'} (flag ${on ? 'on' : 'off'})`, fail = m => failures.push(`${label}: ${m}`);
        await page.evaluate(([p, n]) => window.mount(p, n), [{ ...shellProps, view: 'square', citizenNation: undefined }, id]); await page.waitForSelector('header.game-hud'); await page.waitForTimeout(100);
        const r = await page.evaluate(probe);
        for (const i of r.issues) fail(i);
        const want = on && id ? id : null; if (r.skin !== want) fail(`data-nation-skin is ${r.skin}, expected ${want}`);
        const key = `${w}x${h}@${scale}/${id}`; if (!on) baseline[key] = r; else {
          if (baseline[key].text !== r.text) fail(`bar text changed: "${r.text}" vs "${baseline[key].text}"`);
          const moved = r.boxes.findIndex((b, i) => b !== baseline[key].boxes[i]); if (moved >= 0 || r.boxes.length !== baseline[key].boxes.length) fail(`layout changed at element ${moved}: ${r.boxes[moved]} vs ${baseline[key].boxes[moved]}`);
          if (id) grounds.add(r.bg); }
        if (on && id && scale === 1) {
          await page.keyboard.press('Tab');
          const ring = await page.evaluate(() => { const b = document.activeElement; if (!b?.closest('header.game-hud')) return null; const cs = getComputedStyle(b.matches('details') ? b.querySelector('summary') : b); return { w: parseFloat(cs.outlineWidth), style: cs.outlineStyle, shadow: cs.boxShadow }; });
          if (ring && (ring.style === 'none' || ring.w < 2) && (!ring.shadow || ring.shadow === 'none')) fail(`keyboard focus ring missing (${JSON.stringify(ring)})`);
        }
        if (on && id) { // QA1 on #819: focus ring contrast against every neighbouring pixel, for each focusable control in the bar
          await page.keyboard.press('Tab'); const sel = 'header.game-hud :is(a,button,summary,[tabindex]:not([tabindex="-1"]))', count = await page.evaluate(s => document.querySelectorAll(s).length, sel);
          for (let k = 0; k < count; k++) {
            await page.evaluate(([s, k]) => document.querySelectorAll(s)[k].focus(), [sel, k]);
            const ring = await page.evaluate(ringOf); if (!ring) continue; rings++;
            const png = (await page.locator('header.game-hud').screenshot({ animations: 'disabled' })).toString('base64');
            const { worst, at } = await page.evaluate(ringContrast, [png, ring]); minRing = Math.min(minRing, worst);
            if (worst < 3) fail(`focus ring on "${ring.name}" is ${worst.toFixed(2)}:1 against ${at}`);
          }
          if (!rings) fail('no focus ring measured');
          await page.evaluate(() => document.activeElement?.blur()); const chip = page.locator('header.game-hud .game-resources>:is(.game-hud-help,.game-wallet-button)').first();
          if (await chip.isVisible()) { await chip.hover(); await page.waitForTimeout(50); // ARC on #819: the hover border is the nation accent at >= 3:1 against the bar
            const k = await page.evaluate(() => { const lum = c => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
              const el = document.querySelector('header.game-hud .game-resources>:is(.game-hud-help,.game-wallet-button)'), a = lum(getComputedStyle(el).borderTopColor), b = lum(getComputedStyle(document.querySelector('header.game-hud')).backgroundColor); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); });
            if (k < 3) fail(`chip hover border is ${k.toFixed(2)}:1 against the bar`); }
        }
        await page.evaluate(() => document.activeElement?.blur()); await page.mouse.move(0, h - 1);

        rows.push(`${label}: text ≥ ${r.min.toFixed(1)}:1${on && id ? `, ring ≥ ${minRing.toFixed(1)}:1` : ''}${r.issues.length ? ' ✗' : ''}`);
        if (shots && scale !== 1.25 && (on || id === 'kindle')) await page.locator('header.game-hud').screenshot({ path: `${shots}/85-${on ? 'on' : 'off'}-${id ?? 'guest'}-${w}-${scale * 100}.png` });
      }
      if (on && grounds.size !== 3) failures.push(`${w}x${h} @${scale * 100}% #85: the three nation bars share a ground (${[...grounds].join(' | ')})`);
      await context.close();
    }
  }
}
if (isMain(import.meta.url)) await runStandalone('#85 nation skin', checkNationSkin);

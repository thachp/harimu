/** #85 check: nation skin PoC on the top bar (NEXT_PUBLIC_HARIMU_NATION_SKIN), real GameShell, flag off and on, for a Kindle, Korund and Aurelle citizen and a guest,
 *  at 1280x800, 390x844 and 320x700, 100/125/150% text. Flag on:
 *  - the bar carries data-nation-skin for the three citizens and none for the guest, and the three bars look different (ground color);
 *  - layout is identical: the bar and every element in it keep the flag-off box (position and size), and the bar text is unchanged;
 *  - every visible text in the bar has at least 4.5:1 against the ground under it; a keyboard focus ring (at least 2px) shows on the first bar control.
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
        await page.evaluate(() => document.activeElement?.blur()); await page.mouse.move(0, h - 1);
        rows.push(`${label}: text ≥ ${r.min.toFixed(1)}:1${r.issues.length ? ' ✗' : ''}`);
        if (shots && scale !== 1.25 && (on || id === 'kindle')) await page.locator('header.game-hud').screenshot({ path: `${shots}/85-${on ? 'on' : 'off'}-${id ?? 'guest'}-${w}-${scale * 100}.png` });
      }
      if (on && grounds.size !== 3) failures.push(`${w}x${h} @${scale * 100}% #85: the three nation bars share a ground (${[...grounds].join(' | ')})`);
      await context.close();
    }
  }
}
if (isMain(import.meta.url)) await runStandalone('#85 nation skin', checkNationSkin);

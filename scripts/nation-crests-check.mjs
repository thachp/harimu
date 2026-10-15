/** #392 S1 check: the nation crest (NEXT_PUBLIC_HARIMU_UI_V2_CREST) in the nation inspector header.
 *  Bundles the real GameShell with the flag ON and OFF in headless Chromium with the shipped CSS, at 1280x800 and 390x844 (plus 960x800 and 320x700), 100/125/150% text,
 *  once per nation (all ten):
 *  - flag off: no crest, and the header is exactly as before;  flag on: one crest per header, svg with a text alternative naming the nation and its emblem
 *  - the crest sits inside the header, does not overlap the title or the collapse button, scales with text size, keeps a 7:8 shield box
 *  - the collapse button is still reachable and 44px on phones; the page never scrolls sideways; the header grows by no more than the crest needs
 *  With LAYOUT_SHOTS_DIR: before/after header crops at 1280 and 390, 100% and 150% text, plus a sheet of all ten crests.
 *  Used by hud-layout-check.mjs (npm run test:layout). Screenshots: LAYOUT_SHOTS_DIR=docs/screenshots/509. */
import { bundleShell, shellProps } from './hud-tooltip-check.mjs';

const entry = `
  import React from 'react'; import { createRoot } from 'react-dom/client'; import { GameShell } from './app/game-shell.tsx'; import { NationCrest } from './app/nation-crest.tsx';
  const root = () => { window.__root?.unmount(); window.__root = createRoot(document.getElementById('root')); return window.__root; };
  window.mountShell = props => root().render(<GameShell {...props} onNavigate={() => {}} onSelectNation={() => {}} accountControls={null} />);
  window.mountSheet = ids => root().render(<div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 18, padding: 20, background: '#102934', color: '#dce7e8', font: '13px system-ui', width: 760 }}>
    {ids.map(([id, name]) => <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}><NationCrest id={id} size={56} force /><span>{name}</span></div>)}</div>);`;

const ids = ['kindle', 'confluence', 'meridian', 'korund', 'aurelle', 'ilmar', 'hoarvale', 'varkand', 'veldwood', 'fulmara'];
const names = { kindle: 'Kindle Republic', confluence: 'The Confluence', meridian: 'Meridian', korund: 'Korund', aurelle: 'Aurelle', ilmar: 'Ilmar', hoarvale: 'Hoarvale', varkand: 'Varkand', veldwood: 'Veldwood', fulmara: 'Fulmara' };
const propsFor = id => ({ ...shellProps, view: 'nation', nation: { ...shellProps.nation, id, name: names[id] }, citizenNation: null, nations: ids.map(i => ({ ...shellProps.nation, id: i, name: names[i] })) });

const probe = () => {
  const issues = [], vw = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > vw + 1) issues.push(`page scrolls sideways by ${document.documentElement.scrollWidth - vw}px`);
  const head = document.querySelector('.game-inspector-title'); if (!head) return { issues: [...issues, 'no inspector header'], crests: 0 };
  const h = head.getBoundingClientRect(), crests = [...head.querySelectorAll('.nation-crest')], title = head.querySelector('h1').getBoundingClientRect(), small = head.querySelector('small').getBoundingClientRect(), btn = head.querySelector('button').getBoundingClientRect();
  const overlaps = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
  const out = { issues, crests: crests.length, headH: h.height, btnW: btn.width, btnH: btn.height, btnIn: btn.right <= h.right + 0.5 && btn.left >= h.left - 0.5, titleH: title.height };
  if (crests[0]) {
    const c = crests[0], r = c.getBoundingClientRect(), svg = c.querySelector('svg'), cs = getComputedStyle(c);
    Object.assign(out, { w: r.width, ch: r.height, inHead: r.left >= h.left - 0.5 && r.right <= h.right + 0.5 && r.top >= h.top - 0.5 && r.bottom <= h.bottom + 0.5, hitsTitle: overlaps(r, title) || overlaps(r, small), hitsBtn: overlaps(r, btn),
      label: svg?.getAttribute('aria-label') || '', role: svg?.getAttribute('role'), id: c.dataset.nationCrest, paths: svg?.querySelectorAll('path').length || 0, field: cs.getPropertyValue('--crest-field').trim(), clip: cs.clipPath });
  }
  return out;
};

export async function checkNationCrests({ browser, css, preflight, failures, rows }) {
  const scripts = { on: await bundleShell(entry, { NEXT_PUBLIC_HARIMU_UI_V2_CREST: 'true' }), off: await bundleShell(entry, { NEXT_PUBLIC_HARIMU_UI_V2_CREST: 'false' }) };
  const shots = process.env.LAYOUT_SHOTS_DIR;
  const open = async (w, h, scale, flag) => {
    const context = await browser.newContext({ viewport: { width: w, height: h } });
    const page = await context.newPage(); page.setDefaultTimeout(90000);
    await page.setContent(`<!doctype html><html style="--text-scale:${scale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}${css}</style></head><body><div id="root"></div></body></html>`);
    await page.addScriptTag({ content: scripts[flag] });
    return { context, page };
  };
  for (const [w, h] of [[1280, 800], [960, 800], [390, 844], [320, 700]]) for (const scale of [1, 1.25, 1.5]) {
    const base = {}; // header height per nation with the flag off
    for (const flag of ['off', 'on']) {
      const { context, page } = await open(w, h, scale, flag);
      const id = `${w}x${h} @${scale * 100}% nation crest ${flag}`, fail = m => failures.push(`${id}: ${m}`), summary = [];
      for (const nation of ids) {
        await page.evaluate(p => window.mountShell(p), propsFor(nation)); await page.waitForSelector('.game-inspector-title h1');
        const m = await page.evaluate(probe); m.issues.forEach(i => fail(`${nation}: ${i}`));
        if (!m.btnIn || (w < 600 && m.btnH < 43.5)) fail(`${nation}: collapse button is clipped or under 44px (${Math.round(m.btnW)}x${Math.round(m.btnH)})`);
        if (flag === 'off') { base[nation] = m.headH; if (m.crests) fail(`${nation}: crest shows with the flag off`); continue; }
        if (m.crests !== 1) { fail(`${nation}: expected 1 crest in the header, found ${m.crests}`); continue; }
        if (m.id !== nation || m.role !== 'img' || !m.label.startsWith(names[nation]) || !/crest: /.test(m.label)) fail(`${nation}: crest lacks its text alternative ("${m.label}")`);
        if (m.paths !== 3) fail(`${nation}: crest should draw shield, inset and motif (found ${m.paths} paths)`);
        if (!m.inHead) fail(`${nation}: crest leaves the header`);
        if (m.hitsTitle || m.hitsBtn) fail(`${nation}: crest overlaps the ${m.hitsTitle ? 'title' : 'collapse button'}`);
        if (Math.abs(m.w * 8 / 7 - m.ch) > 1.5) fail(`${nation}: crest is ${Math.round(m.w)}x${Math.round(m.ch)}, not a 7:8 shield`);
        if (m.w < 44 * scale * 7 / 8 - 2) fail(`${nation}: crest is only ${Math.round(m.w)}px wide at ${scale * 100}% text`);
        if (m.headH - base[nation] > 44 * scale * 8 / 7 + 2) fail(`${nation}: header grew ${Math.round(m.headH - base[nation])}px with the crest`);
        summary.push(nation);
      }
      rows.push(`${id}: ${flag === 'off' ? 'no crest in any header' : summary.length + ' crests ok'}`);
      if (shots && [1280, 390].includes(w) && (scale === 1 || scale === 1.5)) {
        for (const nation of ['kindle', 'fulmara']) {
          await page.evaluate(p => window.mountShell(p), propsFor(nation)); await page.waitForSelector('.game-inspector-title h1');
          const box = await page.evaluate(() => { const b = document.querySelector('.game-inspector-title').getBoundingClientRect(); return { x: Math.max(0, b.left), y: b.top + window.scrollY, width: Math.min(b.width, window.innerWidth), height: b.height }; });
          await page.screenshot({ path: `${shots}/${flag === 'on' ? 'after' : 'before'}-header-${nation}-${w}-${scale * 100}.png`, fullPage: true, clip: box });
        }
      }
      await context.close();
    }
  }
  if (shots) { // all ten crests, enlarged, with their names
    const { context, page } = await open(800, 400, 1, 'on');
    await page.evaluate(l => window.mountSheet(l), ids.map(i => [i, names[i]])); await page.waitForSelector('.nation-crest svg');
    await page.screenshot({ path: `${shots}/crests-all-ten.png`, clip: { x: 0, y: 0, width: 800, height: 260 } });
    await context.close();
  }
}

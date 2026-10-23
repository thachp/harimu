/** #779 check: nation fact-list labels (Government, Economy, Official faith stance, Population, Treasury, Stability) never split mid-word.
 *  Covers all ten nations' real facts at 1280x800, 390x844 and 320x700, 100/125/150% text, with NEXT_PUBLIC_HARIMU_UI_V2_NATION off and on.
 *  With the flag off, the system picker buttons (Capital, Currency, Trade, ...) must not split mid-word either (#786, same root cause as #779).
 *  Also checks that every label and value stays inside the panel and the page never scrolls sideways.
 *  With LAYOUT_SHOTS_DIR it saves fact-list shots (docs/screenshots/779). Used by hud-layout-check.mjs and runs on its own too. */
import { readFile } from 'node:fs/promises';
import { bundleShell, shellProps } from './hud-tooltip-check.mjs';
import { isMain, runStandalone } from './layout-standalone.mjs';

const entry = `
  import React from 'react'; import { createRoot } from 'react-dom/client'; import { GameShell } from './app/game-shell.tsx'; import { NationInstitutions } from './app/nation-institutions.tsx';
  window.mount = ({ props, nation }) => { window.__root?.unmount(); window.__root = createRoot(document.getElementById('root')); const noop = () => {};
    window.__root.render(<GameShell {...props} onNavigate={noop} onSelectNation={noop} accountControls={null} panel={<NationInstitutions nation={nation} capacity={10} workOrders={[]} workPending={false} onWorldView={noop} onHousehold={noop} onWorkplace={noop} onCommitWork={noop} />} />); };`;
// Names, capitals and facts as in app/page.tsx.
const lore = [['kindle', 'Kindle Republic', 'Forgehaven', 'Liberal democracy', 'Market capitalism', 'Secular pluralism'],
  ['confluence', 'The Confluence', 'Meetwater', 'Single-party socialist state', 'Socialist-oriented market', 'Registered faiths'],
  ['meridian', 'Meridian', 'Steamgate', 'Party-state', 'State capitalism with SEZs', 'State-supervised associations'],
  ['korund', 'Korund', 'Stonehearth', 'Full communism; leader for life', 'Central planning', 'State atheism'],
  ['aurelle', 'Aurelle', 'Highspire', 'Absolute hereditary monarchy', 'Royal charters and fiefs', 'Kinward Rite state church'],
  ['ilmar', 'Ilmar Sanctum', 'Mirrorhall', 'Theocracy', 'Endowment economy', 'Lumen Canon theocracy'],
  ['hoarvale', 'Hoarvale', 'Rimehall', 'Constitutional monarchy', 'Coordinated market', 'Ceremonial Kinward establishment'],
  ['varkand', 'Varkand', 'Watchfast', 'Military junta', 'Arsenal command economy', 'Regulated tolerance'],
  ['veldwood', 'Veldwood', 'Ringhall', 'Federal direct democracy', 'Social democracy', 'Secular pluralism'],
  ['fulmara', 'Fulmara', 'Arcport', 'Mercantile oligarchic republic', 'Chartered-company capitalism', 'Chartered pluralism']];
const nations = lore.map(([id, name, capital, government, economy, religion]) => ({ id, name, shortName: name, capital, motto: '', government, economy, religion, currency: 'Crown · CRN', population: '1,000', treasury: '10,000', stability: 70, tradeStatus: 'Open corridor' }));

const probe = pickerToo => {
  const issues = [], vw = document.documentElement.clientWidth, panel = document.querySelector('.game-inspector');
  if (document.documentElement.scrollWidth > vw + 1) issues.push(`page scrolls sideways by ${document.documentElement.scrollWidth - vw}px`);
  const box = panel.getBoundingClientRect(), labels = [...document.querySelectorAll('.nation-inspector dl dt')];
  if (labels.length < 6) issues.push(`only ${labels.length} fact labels`);
  for (const dt of labels) for (const node of [...dt.childNodes].filter(n => n.nodeType === 3)) for (const m of node.textContent.matchAll(/\S+/g)) {
    const range = document.createRange(); range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
    if (new Set([...range.getClientRects()].map(r => Math.round(r.top))).size > 1) issues.push(`label "${dt.textContent}" splits "${m[0]}" mid-word`);
  }
  for (const el of document.querySelectorAll('.nation-inspector dl dt, .nation-inspector dl dd')) {
    const r = el.getBoundingClientRect(); if (r.left < box.left - 0.5 || r.right > box.right + 0.5) issues.push(`"${el.textContent}" overflows the panel`);
    if (el.scrollWidth > el.clientWidth + 1) issues.push(`"${el.textContent}" is clipped`);
  }
  if (pickerToo) {
    const picker = [...document.querySelectorAll('.nation-inspector-systems button')];
    if (picker.length < 5) issues.push(`only ${picker.length} system picker buttons`);
    for (const b of picker) for (const node of [...b.childNodes].filter(n => n.nodeType === 3)) for (const m of node.textContent.matchAll(/\S+/g)) {
      const range = document.createRange(); range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
      if (new Set([...range.getClientRects()].map(r => Math.round(r.top))).size > 1) issues.push(`picker "${b.textContent}" splits "${m[0]}" mid-word`);
      const r = b.getBoundingClientRect(); if (r.left < box.left - 0.5 || r.right > box.right + 0.5) issues.push(`picker "${b.textContent}" overflows the panel`);
    }
  }
  return issues;
};

export async function checkNationFactLabels({ browser, css, preflight, failures, rows }) {
  const shots = process.env.LAYOUT_SHOTS_DIR, extra = await readFile(new URL('../app/nation-institutions.css', import.meta.url), 'utf8');
  for (const flag of ['false', 'true']) {
    const script = await bundleShell(entry, { NEXT_PUBLIC_HARIMU_UI_V2_NATION: flag });
    for (const [w, h] of [[1280, 800], [390, 844], [320, 700]]) for (const scale of [1, 1.25, 1.5]) {
      const id = `${w}x${h} @${scale * 100}% fact labels (flag ${flag === 'true' ? 'on' : 'off'})`, fail = m => failures.push(`${id}: ${m}`);
      const context = await browser.newContext({ viewport: { width: w, height: h } }), page = await context.newPage(); page.setDefaultTimeout(90000);
      await page.setContent(`<!doctype html><html style="--text-scale:${scale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}${css}${extra}</style></head><body><div id="root"></div></body></html>`);
      await page.addScriptTag({ content: script });
      for (const nation of nations) {
        await page.evaluate(a => window.mount(a), { props: { ...shellProps, view: 'nation', nation: { id: nation.id, name: nation.name, capital: nation.capital } }, nation });
        await page.waitForSelector('.nation-inspector dl');
        for (const issue of await page.evaluate(probe, flag === 'false')) fail(`${nation.id}: ${issue}`);
        if (shots && flag === 'false' && nation.id === 'hoarvale' && scale !== 1.25) { const dl = page.locator('.nation-inspector dl').first(); await dl.scrollIntoViewIfNeeded(); await page.locator('.game-inspector').screenshot({ path: `${shots}/facts-${w}-${scale * 100}.png` }); }
      }
      rows.push(`${id}: 10 nations, no fact label${flag === 'false' ? ' or picker button' : ''} splits mid-word`);
      await context.close();
    }
  }
}
if (isMain(import.meta.url)) await runStandalone('#779 fact labels', checkNationFactLabels);

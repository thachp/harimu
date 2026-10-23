/** #392 S6 check: the Nation panel (NEXT_PUBLIC_HARIMU_UI_V2_NATION) in the real GameShell side panel, all ten nations, at 1280x800, 390x844, 320x700 and 320x640,
 *  100/125/150% text, plus a 7%-wider-glyph variant at 150%:
 *  - "Explore {nation}" reads exactly that, its accessible name is "Explore {nation}: open the nation map", and a long one wraps: never truncated, no ellipsis,
 *    no clipped text, no mid-word split, fully inside the panel (Content, #392 S6)
 *  - the institution rows and the primary action are at least 44px tall, uncovered, and a row press selects its system (one pressed at a time)
 *  - the page never scrolls sideways. With LAYOUT_SHOTS_DIR: panel shots. Used by hud-layout-check.mjs; runs on its own too. Screenshots: docs/screenshots/392-s6. */
import { readFile } from 'node:fs/promises';
import { bundleShell, shellProps } from './hud-tooltip-check.mjs';
import { isMain, runStandalone } from './layout-standalone.mjs';

const entry = `
  import React from 'react'; import { createRoot } from 'react-dom/client'; import { GameShell } from './app/game-shell.tsx'; import { NationPanel } from './app/nation-panel-v2.tsx';
  window.mount = ({ props, nation }) => { window.__root?.unmount(); window.__root = createRoot(document.getElementById('root')); const noop = () => {};
    window.__root.render(<GameShell {...props} onNavigate={noop} onSelectNation={noop} accountControls={null} panel={<NationPanel nation={nation} capacity={10} workOrders={[]} workPending={false} onWorldView={noop} onHousehold={noop} onWorkplace={noop} onCommitWork={noop} onNationMap={() => { window.__explored = nation.shortName; }} />} />); };`;
// Lore names, capitals and mottos as in app/page.tsx (sample facts elsewhere).
const lore = [['kindle', 'Kindle Republic', 'Kindle', 'Forgehaven', 'Anyone can rise - and anyone can fall.'], ['confluence', 'The Confluence', 'Confluence', 'Meetwater', 'Many rivers, one current.'],
  ['meridian', 'Meridian', 'Meridian', 'Steamgate', 'Order today, prosperity tomorrow.'], ['korund', 'Korund', 'Korund', 'Stonehearth', 'Nobody falls through the stone.'],
  ['aurelle', 'Aurelle', 'Aurelle', 'Highspire', 'Land in order.'], ['ilmar', 'Ilmar Sanctum', 'Ilmar', 'Mirrorhall', 'Every duty is a step toward the light.'],
  ['hoarvale', 'Hoarvale', 'Hoarvale', 'Rimehall', 'The Crown endures; governments answer to you.'], ['varkand', 'Varkand', 'Varkand', 'Watchfast', 'Order first. Everything else after.'],
  ['veldwood', 'Veldwood', 'Veldwood', 'Ringhall', 'Every voice, every season.'], ['fulmara', 'Fulmara', 'Fulmara', 'Arcport', 'Fortune is the franchise.']];
const nations = lore.map(([id, name, shortName, capital, motto]) => ({ id, name, shortName, capital, motto, government: 'Government', economy: 'Economy', currency: 'Crown · CRN', religion: 'Faith', population: '1,000', treasury: '10,000', stability: 70, tradeStatus: 'Open corridor' }));

const probe = shortName => {
  const issues = [], vw = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > vw + 1) issues.push(`page scrolls sideways by ${document.documentElement.scrollWidth - vw}px`);
  const panel = document.querySelector('.game-inspector .panel-v2'); if (!panel) return [...issues, 'no .panel-v2'];
  const box = panel.getBoundingClientRect(), btn = panel.querySelector('.panel-v2-primary'), label = btn?.querySelector('span');
  if (!btn) return [...issues, 'no primary action'];
  if (label.textContent !== `Explore ${shortName}`) issues.push(`primary reads "${label.textContent}"`);
  if (btn.getAttribute('aria-label') !== `Explore ${shortName}: open the nation map`) issues.push(`primary is named "${btn.getAttribute('aria-label')}"`);
  const cs = getComputedStyle(label);
  if (cs.textOverflow === 'ellipsis' || cs.whiteSpace === 'nowrap') issues.push(`primary label may truncate (${cs.textOverflow}, ${cs.whiteSpace})`);
  if (label.scrollWidth > label.clientWidth + 1 || label.scrollHeight > label.clientHeight + 1) issues.push('primary label is clipped');
  for (const node of [...label.childNodes].filter(n => n.nodeType === 3)) for (const m of node.textContent.matchAll(/\S+/g)) {
    const range = document.createRange(); range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
    if (new Set([...range.getClientRects()].map(r => Math.round(r.top))).size > 1) issues.push(`"${m[0]}" splits mid-word`);
  }
  for (const b of [...panel.querySelectorAll('.panel-v2-rows button'), btn]) {
    b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect();
    if (r.height < 43.5) issues.push(`"${b.textContent}" is ${Math.round(r.height)}px tall`);
    if (r.left < box.left - 0.5 || r.right > box.right + 0.5) issues.push(`"${b.textContent}" overflows the panel`);
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); if (top && !b.contains(top)) issues.push(`"${b.textContent}" is covered`);
  }
  return issues;
};

export async function checkUiV2Nation({ browser, css, preflight, failures, rows }) {
  const script = await bundleShell(entry, { NEXT_PUBLIC_HARIMU_UI_V2_NATION: 'true' }), shots = process.env.LAYOUT_SHOTS_DIR;
  const extra = (await readFile(new URL('../app/panel-v2.css', import.meta.url), 'utf8')) + (await readFile(new URL('../app/nation-institutions.css', import.meta.url), 'utf8'));
  for (const [w, h] of [[1280, 800], [390, 844], [320, 700], [320, 640]]) for (const scale of [1, 1.25, 1.5]) for (const wide of scale === 1.5 ? [false, true, 'squeezed'] : [false]) {
    // 'squeezed': the primary action is forced narrow, so a name has to wrap; it must wrap to more lines, never truncate (Content, #392 S6)
    const id = `${w}x${h} @${scale * 100}% S6 nation panel${wide === 'squeezed' ? ' (squeezed primary)' : wide ? ' (wide glyphs)' : ''}`, fail = m => failures.push(`${id}: ${m}`);
    const context = await browser.newContext({ viewport: { width: w, height: h } }), page = await context.newPage(); page.setDefaultTimeout(90000);
    await page.setContent(`<!doctype html><html style="--text-scale:${scale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}${css}${extra}${wide === 'squeezed' ? '.game-inspector .panel-v2 button.panel-v2-primary{width:200px!important}' : wide ? '*{letter-spacing:.07em!important}' : ''}</style></head><body><div id="root"></div></body></html>`);
    await page.addScriptTag({ content: script });
    let lines = 0;
    for (const nation of nations) {
      await page.evaluate(a => window.mount(a), { props: { ...shellProps, view: 'nation', nation: { id: nation.id, name: nation.name, capital: nation.capital } }, nation });
      await page.waitForSelector('.panel-v2-primary');
      for (const issue of await page.evaluate(probe, nation.shortName)) fail(`${nation.id}: ${issue}`);
      lines = Math.max(lines, await page.evaluate(() => { const s = document.querySelector('.panel-v2-primary span'); return Math.round(s.getBoundingClientRect().height / parseFloat(getComputedStyle(s).lineHeight)); }));
      if (nation.id === 'confluence') {
        const rowsEl = await page.$$('.panel-v2-rows button'); await rowsEl[2].click();
        const pressed = await page.evaluate(() => [...document.querySelectorAll('.panel-v2-rows button')].map(b => b.getAttribute('aria-pressed')).join());
        if (pressed !== 'false,false,true,false,false') fail(`row press selects ${pressed}`);
        if (!await page.evaluate(() => document.querySelector('.nation-inspector article h3')?.textContent === 'Trade corridor')) fail('the pressed row did not show its system');
        await page.click('.panel-v2-primary'); if (await page.evaluate(() => window.__explored) !== 'Confluence') fail('Explore did not open the nation map');
        if (shots && !wide && h !== 640 && scale !== 1.25) await page.locator('.game-inspector').screenshot({ path: `${shots}/s6-nation-${w}-${scale * 100}.png` });
      }
    }
    if (wide === 'squeezed' && lines < 2) fail(`the squeezed primary did not wrap (${lines} line)`);
    rows.push(`${id}: 10 nations, Explore never truncated (max ${lines} line(s)), rows select`);
    await context.close();
  }
}
if (isMain(import.meta.url)) await runStandalone('S6 nation panel', checkUiV2Nation);

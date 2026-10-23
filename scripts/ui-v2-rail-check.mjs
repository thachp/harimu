/** #392 S4 check: the zoom rail (NEXT_PUBLIC_HARIMU_UI_V2_RAIL) in the real GameShell with the shipped CSS, at 1280x800, 390x844, 320x700 and 320x640, 100%, 125% and 150% text,
 *  in the World, Country, City and Household views (plus a 7%-wider-glyph variant at 150%, so the result does not depend on the machine's fonts):
 *  - the rail has World / Nation / City, exactly one with aria-current, every button at least 44x44 and uncovered, no label split mid-word
 *  - the rail never overlaps the stage (where the canvas labels sit; #377, #392 320px note), the top tabs or the HUD, and the page never scrolls sideways
 *  - the top tabs keep only Household, Work, Market, Civic; there is no breadcrumb; arrow keys move focus along the rail
 *  With LAYOUT_SHOTS_DIR: full-page shots per size, City view, plus World at 1280. Used by hud-layout-check.mjs. Screenshots: LAYOUT_SHOTS_DIR=docs/screenshots/392-s4. */
import { bundleShell, shellProps } from './hud-tooltip-check.mjs';
import { isMain, runStandalone } from './layout-standalone.mjs';

const probe = () => {
  const issues = [], vw = document.documentElement.clientWidth, rect = s => document.querySelector(s)?.getBoundingClientRect();
  if (document.documentElement.scrollWidth > vw + 1) issues.push(`page scrolls sideways by ${document.documentElement.scrollWidth - vw}px`);
  const rail = document.querySelector('.game-zoom-rail'); if (!rail) return [...issues, 'no rail'];
  const r = rail.getBoundingClientRect(), overlaps = (a, b) => a && b && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
  for (const [name, sel] of [['stage', '.game-stage'], ['top tabs', '#game-location-dock'], ['HUD', '.game-hud'], ['shift chip', '.game-shift-chip']]) if (overlaps(r, rect(sel))) issues.push(`rail overlaps the ${name}`);
  if (document.querySelector('.game-breadcrumbs')) issues.push('breadcrumb still shown');
  const tabs = [...document.querySelectorAll('#game-location-dock button')].map(b => b.getAttribute('aria-label'));
  if (tabs.join() !== 'Open Household,Open Work,Open Market,Open Civic') issues.push(`top tabs are ${tabs.join()}`);
  const buttons = [...rail.querySelectorAll('button')];
  if (buttons.map(b => b.textContent).join() !== 'World,Nation,City') issues.push(`rail levels ${buttons.map(b => b.textContent).join()}`);
  if (rail.getAttribute('aria-label') !== 'Zoom level') issues.push(`rail named "${rail.getAttribute('aria-label')}"`);
  for (const b of buttons) if (b.hasAttribute('aria-label')) issues.push(`"${b.textContent}" has its own aria-label (QA1 #755: just the level name)`);
  if (buttons.filter(b => b.hasAttribute('aria-current')).length !== 1) issues.push('not exactly one current level');
  for (const b of buttons) {
    const br = b.getBoundingClientRect(); if (br.width < 43.5 || br.height < 43.5) issues.push(`"${b.textContent}" is ${Math.round(br.width)}x${Math.round(br.height)} (< 44)`);
    if (br.right > vw + 0.5 || br.left < -0.5) issues.push(`"${b.textContent}" is off screen`);
    const top = document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2); if (top && !b.contains(top)) issues.push(`"${b.textContent}" is covered`);
    const span = b.querySelector('span'), range = document.createRange(); range.selectNodeContents(span);
    if (new Set([...range.getClientRects()].map(x => Math.round(x.top))).size > 1) issues.push(`"${b.textContent}" splits`);
  }
  return issues;
};

export async function checkUiV2Rail({ browser, css, preflight, failures, rows }) {
  const script = await bundleShell(undefined, { NEXT_PUBLIC_HARIMU_UI_V2_RAIL: 'true' }), shots = process.env.LAYOUT_SHOTS_DIR;
  for (const [w, h] of [[1280, 800], [390, 844], [320, 700], [320, 640]]) for (const scale of [1, 1.25, 1.5]) for (const wide of scale === 1.5 ? [false, true] : [false]) {
    const context = await browser.newContext({ viewport: { width: w, height: h } }), page = await context.newPage(); page.setDefaultTimeout(90000);
    await page.setContent(`<!doctype html><html style="--text-scale:${scale}"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${preflight}${css}${wide ? '*{letter-spacing:.07em!important}' : ''}</style></head><body><div id="root"></div><form id="world-tab-form"></form></body></html>`);
    await page.addScriptTag({ content: script });
    for (const view of ['world', 'country', 'square', 'household']) {
      const id = `${w}x${h} @${scale * 100}% S4 rail ${view}${wide ? ' (wide glyphs)' : ''}`;
      await page.evaluate(p => window.mountShell(p), { ...shellProps, view, shiftSummary: { title: 'Forge shift' } }); await page.waitForSelector('.game-zoom-rail');
      for (const issue of await page.evaluate(probe)) failures.push(`${id}: ${issue}`);
      if (view === 'square') {
        await page.focus('.game-zoom-rail button'); await page.keyboard.press('ArrowDown');
        const focused = await page.evaluate(() => document.activeElement?.textContent);
        if (focused !== 'Nation') failures.push(`${id}: ArrowDown from World focused "${focused}"`);
        await page.keyboard.press('End'); if (await page.evaluate(() => document.activeElement?.textContent) !== 'City') failures.push(`${id}: End did not focus City`);
      }
      if (shots && !wide && h !== 640 && scale !== 1.25 && (view === 'square' || view === 'world' && w === 1280)) await page.screenshot({ path: `${shots}/s4-rail-${view === 'square' ? 'city' : view}-${w}-${scale * 100}.png`, fullPage: w < 600 });
      rows.push(`${id}: rail fits, beside the stage, tabs are places only`);
    }
    await context.close();
  }
}
if (isMain(import.meta.url)) await runStandalone('S4 zoom rail', checkUiV2Rail); // QA2 #761: running this file alone runs the check

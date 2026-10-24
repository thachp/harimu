/** Runs one layout check on its own (QA2 #761: a check module run directly used to exit 0 without checking anything).
 *  Usage, at the bottom of a check module:  if (isMain(import.meta.url)) await runStandalone('S5 world chips', checkFn);
 *  Builds the same CSS and preflight as hud-layout-check.mjs, prints every row and failure, and exits 1 on any failure. */
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

export const isMain = url => !!process.argv[1] && url === pathToFileURL(process.argv[1]).href;
export async function runStandalone(name, check) {
  const root = new URL('../', import.meta.url);
  const css = (await readFile(new URL('app/globals.css', root), 'utf8')).replace(/@import[^;]+;/g, '') + (await readFile(new URL('app/game-shell.css', root), 'utf8'));
  const preflight = '*,::before,::after{box-sizing:border-box;margin:0;padding:0;border:0 solid}button{background:none;font:inherit;color:inherit}svg{display:block}';
  const browser = fontsBeforeShots(await chromium.launch({ args: ['--disable-gpu', '--disable-dev-shm-usage'] })), failures = [], rows = [];
  try { await check({ browser, css, preflight, failures, rows }); } finally { await browser.close(); }
  for (const row of rows) console.log(`  ${row}`);
  if (failures.length) { console.error(`${name} check FAILED (${failures.length}):\n${[...new Set(failures)].join('\n')}`); process.exit(1); }
  if (!rows.length) { console.error(`${name} check ran no cases`); process.exit(1); }
  console.log(`${name} check passed: ${rows.length} case(s).`);
}

/** #905: wait for web fonts before every screenshot. Under Inter, a capture taken before Chromium has loaded the system font comes out with no text.
 *  Wraps every page the browser opens (browser.newPage and context.newPage) and every locator's screenshot (QA1: the element shots), so each check gets
 *  this without editing its own capture code. The wait is bounded (QA1): a font load that never settles is logged after `timeoutMs` and the shot goes ahead. */
export async function fontsSettled(page, timeoutMs = 5000) {
  let timer;
  try {
    const done = await Promise.race([page.evaluate(() => document.fonts.ready.then(() => true)), new Promise(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); })]);
    if (!done) console.warn(`#905: fonts not ready after ${timeoutMs}ms; taking the screenshot anyway`);
    else await page.waitForTimeout(300);
  } catch (error) { console.warn(`#905: font wait failed (${error?.message ?? error}); taking the screenshot anyway`); } finally { clearTimeout(timer); }
}
export function fontsBeforeShots(browser, timeoutMs = 5000) {
  const wrapLocators = page => { // one patch per Locator prototype; chained locators (first(), locator(), getBy…) share it
    if (typeof page.locator !== 'function') return;
    const proto = Object.getPrototypeOf(page.locator('html'));
    if (!proto || proto === Object.prototype || typeof proto.screenshot !== 'function' || proto.__fontsWrapped) return; proto.__fontsWrapped = true;
    const shot = proto.screenshot; proto.screenshot = async function (options) { await fontsSettled(this.page(), timeoutMs); return shot.call(this, options); };
  };
  const wrapPage = page => { const shot = page.screenshot.bind(page); page.screenshot = async options => { await fontsSettled(page, timeoutMs); return shot(options); }; wrapLocators(page); return page; };
  const wrapContext = context => { const open = context.newPage.bind(context); context.newPage = async () => wrapPage(await open()); return context; };
  const newContext = browser.newContext.bind(browser), newPage = browser.newPage.bind(browser);
  browser.newContext = async options => wrapContext(await newContext(options));
  browser.newPage = async options => wrapPage(await newPage(options));
  return browser;
}

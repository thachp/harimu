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
  const browser = await chromium.launch({ args: ['--disable-gpu', '--disable-dev-shm-usage'] }), failures = [], rows = [];
  try { await check({ browser, css, preflight, failures, rows }); } finally { await browser.close(); }
  for (const row of rows) console.log(`  ${row}`);
  if (failures.length) { console.error(`${name} check FAILED (${failures.length}):\n${[...new Set(failures)].join('\n')}`); process.exit(1); }
  if (!rows.length) { console.error(`${name} check ran no cases`); process.exit(1); }
  console.log(`${name} check passed: ${rows.length} case(s).`);
}

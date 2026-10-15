import { readFile } from 'node:fs/promises'; import { chromium } from 'playwright';
import { checkUiV2Topbar } from '/workspace/harimu-ux/scripts/ui-v2-topbar-check.mjs';
const root = new URL('file:///workspace/harimu-ux/');
const css = (await readFile(new URL('app/globals.css', root), 'utf8')).replace(/@import[^;]+;/g, '') + (await readFile(new URL('app/game-shell.css', root), 'utf8'));
const preflight = '*,::before,::after{box-sizing:border-box;margin:0;padding:0;border:0 solid}button{background:none;font:inherit;color:inherit}svg{display:block}';
const browser = await chromium.launch({ args: ['--disable-gpu', '--disable-dev-shm-usage'] }); const failures = [], rows = [];
try { await checkUiV2Topbar({ browser, css, preflight, failures, rows }); } finally { await browser.close(); }
console.log(rows.join('\n')); console.log(failures.length ? 'FAILED\n' + [...new Set(failures)].slice(0,40).join('\n') : 'PASSED');

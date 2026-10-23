import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fontsBeforeShots } from '../scripts/layout-standalone.mjs';

const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');

test('#905: every layout-check browser waits for document.fonts.ready before a screenshot', async () => {
  for (const f of ['scripts/layout-standalone.mjs', 'scripts/hud-layout-check.mjs', 'scripts/market-board-layout-check.mjs']) assert.match(await read(f), /fontsBeforeShots\(await chromium\.launch\(/, f);
  const order = [], page = { screenshot: async () => order.push('shot'), evaluate: async () => order.push('fonts'), waitForTimeout: async () => order.push('settle') };
  const browser = fontsBeforeShots({ newPage: async () => page, newContext: async () => ({ newPage: async () => page }) });
  await (await (await browser.newContext()).newPage()).screenshot({});
  assert.deepEqual(order, ['fonts', 'settle', 'shot']);
});

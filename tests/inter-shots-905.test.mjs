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

test('QA1: locator screenshots wait for fonts too, including chained locators', async () => {
  const order = [];
  class Locator { constructor(page) { this._page = page; } page() { return this._page; } first() { return new Locator(this._page); } async screenshot() { order.push('element shot'); } }
  const page = { screenshot: async () => order.push('shot'), evaluate: async () => { order.push('fonts'); return true; }, waitForTimeout: async () => order.push('settle'), locator() { return new Locator(page); } };
  const browser = fontsBeforeShots({ newPage: async () => page, newContext: async () => ({ newPage: async () => page }) });
  const p = await browser.newPage();
  await p.locator('.game-inspector').screenshot({}); await p.locator('header').first().screenshot({});
  assert.deepEqual(order, ['fonts', 'settle', 'element shot', 'fonts', 'settle', 'element shot']);
});

test('QA1: a font load that never settles, or a failed wait, is bounded and logged; the shot still happens', async () => {
  const warn = console.warn, logged = []; console.warn = m => logged.push(m);
  try {
    for (const evaluate of [() => new Promise(() => {}), async () => { throw new Error('page closed'); }]) {
      const order = [], page = { screenshot: async () => order.push('shot'), evaluate, waitForTimeout: async () => order.push('settle') };
      const browser = fontsBeforeShots({ newPage: async () => page, newContext: async () => ({ newPage: async () => page }) }, 50);
      const started = Date.now(); await (await browser.newPage()).screenshot({});
      assert.ok(Date.now() - started < 2000, 'bounded'); assert.deepEqual(order, ['shot']);
    }
    assert.match(logged[0], /fonts not ready after 50ms/); assert.match(logged[1], /font wait failed \(page closed\)/);
  } finally { console.warn = warn; }
});

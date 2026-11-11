/** #392: citizen resource bar. NEXT_PUBLIC_HARIMU_RESOURCE_BAR is a HARIMU_UI_PACK key.
 *  Preview on, production off. Flag off keeps today's chips. A read that is missing is not shown. Visitors stay on the unlock line. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { citizenHudResources, resourceBarEnabled, resourceBarItems } from '../lib/resource-bar.ts';

const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const key = 'NEXT_PUBLIC_HARIMU_RESOURCE_BAR';
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const lum = hex => { const c = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722; };
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const kindle = { nationId: 'kindle', capacity: 18, currencyCode: 'SPK', walletMinor: 650, inventory: { food: 8, materials: 2, knowledge: 1 } };

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK, preview on and production off', async () => {
  assert.equal(resourceBarEnabled('true'), true);
  for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(resourceBarEnabled(value), false);
  const preview = strip(await read('wrangler.jsonc')), prod = strip(await read('wrangler.prod.jsonc'));
  assert.equal(preview.vars[key], undefined); assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_UI_PACK[key], 'true'); assert.equal(prod.vars.HARIMU_UI_PACK[key], 'false');
  assert.equal(expandFlagPacks(preview.vars)[key], 'true'); assert.equal(expandFlagPacks(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv(preview.vars)[key], 'true'); assert.equal(varsForProcessEnv(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv({ HARIMU_UI_PACK: preview.vars.HARIMU_UI_PACK, [key]: 'false' })[key], 'false', 'a direct string wins');
  assert.ok(FLAG_PACKS.HARIMU_UI_PACK.includes(key));
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 58);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 58/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), new RegExp(key));
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), new RegExp(key));
  assert.match(await read('lib/resource-bar.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_RESOURCE_BAR/);
  const shell = await read('app/game-shell.tsx');
  assert.equal((shell.match(/resourceBarEnabled\(\)/g) || []).length, 1);
});

test('chips use the citizen and household reads, and a missing read is omitted', () => {
  assert.deepEqual(resourceBarItems(kindle).map(item => `${item.value} ${item.label}`), ['18 WC', '6.50 SPK', '8 Food', '2 Mat.', '1 Know.']);
  assert.deepEqual(resourceBarItems(kindle).map(item => item.name), ['Work capacity, 18 WC', 'Wallet, 6.50 SPK', 'Food, 8', 'Materials, 2', 'Knowledge, 1']);
  const aurelle = resourceBarItems({ nationId: 'aurelle', capacity: 12, currencyCode: 'CRN', walletMinor: 800, inventory: { food: 3, materials: 0, knowledge: 0 } });
  assert.deepEqual(aurelle.map(item => item.label), ['WC', 'CRN', 'Food']);
  assert.equal(aurelle.find(item => item.id === 'wallet').value, '8.00');
  const korund = resourceBarItems({ nationId: 'korund', capacity: 4, currencyCode: 'LN', walletMinor: 0, inventory: { food: 0, materials: 0, knowledge: 0 } });
  assert.deepEqual(korund.map(item => `${item.value} ${item.label}`), ['4 WC', '0.00 LN', '0 Food']);
  const other = resourceBarItems({ nationId: 'hoarvale', capacity: 9, currencyCode: 'SPK', walletMinor: 100, inventory: { food: 5, materials: 5, knowledge: 5 } });
  assert.deepEqual(other.map(item => item.id), ['wc']);
  const confluence = resourceBarItems({ nationId: 'confluence', capacity: 11, currencyCode: 'CUR', walletMinor: 250, inventory: { food: 4, materials: 1, knowledge: 1 } });
  assert.deepEqual(confluence.map(item => `${item.value} ${item.label}`), ['11 WC', '2.50 CUR']);
  assert.equal(confluence.find(item => item.id === 'wallet').name, 'Wallet, 2.50 CUR');
  assert.deepEqual(resourceBarItems({ nationId: 'confluence', capacity: 11, currencyCode: 'SPK', walletMinor: 250 }).map(item => item.id), ['wc'], 'Spark is not Confluence Current');
  assert.deepEqual(resourceBarItems({ nationId: 'confluence', capacity: 11, currencyCode: 'CUR' }).map(item => item.id), ['wc'], 'a missing Current balance is omitted');
  for (const id of ['meridian', 'ilmar', 'hoarvale', 'varkand', 'veldwood', 'fulmara']) {
    assert.deepEqual(resourceBarItems({ nationId: id, capacity: 6, currencyCode: 'CUR', walletMinor: 100, inventory: { food: 1, materials: 1, knowledge: 1 } }).map(item => item.id), ['wc'], id);
  }
  const waiting = resourceBarItems({ nationId: 'kindle', capacity: 18, currencyCode: 'SPK', walletMinor: undefined, inventory: undefined });
  assert.deepEqual(waiting.map(item => item.id), ['wc']);
  assert.deepEqual(resourceBarItems({ nationId: 'kindle', capacity: Number.NaN, inventory: { food: Number.NaN, materials: 1, knowledge: null } }).map(item => item.id), ['materials']);
});

test('styles meet AA, show focus, and stay scoped to the bar', async () => {
  const css = await read('app/resource-bar.css');
  assert.ok(contrast('#f3ecd6', '#0d2530') >= 4.5, 'paper value on the chip');
  assert.ok(contrast('#f1d58a', '#0d2530') >= 4.5, 'gold label and icon on the chip');
  assert.ok(contrast('#f3ecd6', '#071820') >= 4.5, 'focus outline on the header');
  assert.match(css, /background:var\(--s2-chip\)/);
  assert.match(css, /color:var\(--s2-paper\)/);
  assert.match(css, /color:var\(--s2-gold\)/);
  assert.match(css, /#d0ad54/);
  assert.match(css, />summary:focus-visible/);
  assert.match(css, /\.game-wallet-button:focus-visible/);
  assert.match(css, /focus-visible\{outline:2px solid var\(--s2-paper\);outline-offset:2px\}/);
  assert.doesNotMatch(css, /outline:\s*none|@keyframes|\banimation\s*:|\btransition\s*:/);
  const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(?:^|\}|\{)([^{}@]+)\{/g)].map(m => m[1].trim()).filter(Boolean);
  for (const sel of rules) for (const part of sel.split(',')) assert.match(part.trim(), /\.game-resource-bar\b/, part);
});

const builds = {};
const render = async (flag, props) => {
  builds[flag] ??= await (await import('../scripts/hud-tooltip-check.mjs')).bundleShell(
    `import React from 'react'; import { renderToStaticMarkup } from 'react-dom/server'; import { GameShell } from './app/game-shell.tsx';
     globalThis.__renderShell = props => renderToStaticMarkup(<GameShell {...props} onNavigate={() => {}} onSelectNation={() => {}} accountControls={null} />);`,
    { NEXT_PUBLIC_HARIMU_RESOURCE_BAR: flag });
  class MessageChannel { constructor() { const port1 = { onmessage: null, close() {} }; this.port1 = port1; this.port2 = { postMessage: data => setTimeout(() => port1.onmessage?.({ data }), 0), close() {} }; } }
  const sandbox = { MessageChannel, console, TextEncoder, TextDecoder, setTimeout, clearTimeout, queueMicrotask, URL, URLSearchParams };
  sandbox.globalThis = sandbox; sandbox.window = sandbox; sandbox.self = sandbox;
  vm.runInNewContext(builds[flag], sandbox);
  const { shellProps } = await import('../scripts/hud-tooltip-check.mjs');
  return sandbox.__renderShell({ ...shellProps, localDemo: false, ...props });
};
const barOf = html => html.match(/<div class="game-resources game-resource-bar"[\s\S]*?(?=<div class="game-account")/)[0];
const names = html => [...html.matchAll(/<(?:summary|button)([^>]*)>/g)].map(m => m[1].match(/aria-label="([^"]*)"/)?.[1]).filter(Boolean);

test('flag on shows real chips with accessible names; flag off and visitors stay unchanged', async () => {
  const off = await render('false', { citizenNation: { id: 'kindle', name: 'Kindle' }, currencyCode: 'SPK', walletMinor: 650, inventory: { food: 8, materials: 2, knowledge: 1 }, capacity: 18 });
  const on = await render('true', { citizenNation: { id: 'kindle', name: 'Kindle' }, currencyCode: 'SPK', walletMinor: 650, inventory: { food: 8, materials: 2, knowledge: 1 }, capacity: 18, onOpenWallet() {} });
  assert.equal(off.includes('game-resource-bar'), false);
  assert.match(off, /<span>Mat\.<\/span>/);
  assert.match(on, /class="game-resources game-resource-bar"/);
  assert.deepEqual(names(barOf(on)), ['Work capacity, 18 WC', 'Open wallet · 6.50 SPK', 'Food, 8', 'Materials, 2', 'Knowledge, 1']);
  const aurelle = await render('true', { citizenNation: { id: 'aurelle', name: 'Aurelle' }, currencyCode: 'CRN', walletMinor: 800, inventory: { food: 3, materials: 0, knowledge: 0 }, capacity: 12 });
  const bar = barOf(aurelle);
  assert.match(bar, /aria-label="Wallet, 8\.00 CRN"/);
  assert.match(bar, /<strong>3<\/strong><span>Food<\/span>/);
  assert.doesNotMatch(bar, /Mat\.|Know\./);
  const held = await render('true', { citizenNation: { id: 'hoarvale', name: 'Hoarvale' }, currencyCode: 'SPK', walletMinor: 100, inventory: { food: 5, materials: 5, knowledge: 5 }, capacity: 9 });
  assert.deepEqual(names(barOf(held)), ['Work capacity, 9 WC']);
  const current = await render('true', { citizenNation: { id: 'confluence', name: 'Confluence' }, currencyCode: 'CUR', walletMinor: 250, inventory: { food: 4, materials: 1, knowledge: 1 }, capacity: 11 });
  assert.deepEqual(names(barOf(current)), ['Work capacity, 11 WC', 'Wallet, 2.50 CUR']);
  assert.doesNotMatch(barOf(current), /Food|Mat\.|Know\.|SPK|Loading/);
  const sparkOff = await render('false', { citizenNation: { id: 'confluence', name: 'Confluence' }, currencyCode: null, walletMinor: undefined, inventory: { food: 4, materials: 1, knowledge: 1 }, capacity: 11 });
  const offResources = sparkOff.match(/<div class="game-resources"[\s\S]*?(?=<div class="game-account")/)[0];
  assert.equal(sparkOff.includes('game-resource-bar'), false);
  assert.doesNotMatch(offResources, />SPK<|>CUR<|<strong>Loading<\/strong>/);
  assert.match(offResources, /<strong>4<\/strong><span>Food<\/span>/);
  const currentOff = await render('false', { citizenNation: { id: 'confluence', name: 'Confluence' }, currencyCode: 'CUR', walletMinor: 250, inventory: { food: 4, materials: 1, knowledge: 1 }, capacity: 11 });
  assert.match(currentOff, /<strong>2\.50<\/strong>/);
  assert.match(currentOff, />CUR</);
  assert.doesNotMatch(currentOff, /SPK/);
  const visitorOff = await render('false', { citizenNation: undefined, localDemo: false });
  const visitorOn = await render('true', { citizenNation: undefined, localDemo: false });
  assert.equal(visitorOn, visitorOff);
  assert.match(visitorOn, /Resources unlock after citizenship/);
  assert.equal(visitorOn.includes('game-resource-bar'), false);
});

test('the page reads citizen ledgers and does not invent Aurelle or Korund stock', async () => {
  const page = await read('app/page.tsx');
  assert.match(page, /citizenHudResources\(\{ nationId: citizenNation\?\.id, economy, aurellePlan, korundPlan, nationWorkPlan \}, resourceBarEnabled\(\)\)/);
  assert.doesNotMatch(page, /materials:\s*0|knowledge:\s*0/);
  assert.doesNotMatch(page, /citizenNation\?\.id === 'korund' \? 'LN' : 'SPK'/);
  const economy = { walletMinor: 650, inventory: [{ item: 'food', quantity: 8 }, { item: 'materials', quantity: 2 }, { item: 'knowledge', quantity: 1 }] };
  const plans = { aurellePlan: { walletMinor: 800, foodQuantity: 3 }, korundPlan: { walletMinor: 0, foodQuantity: 0 }, nationWorkPlan: { walletMinor: 250, currency: { code: 'CUR' } } };
  assert.deepEqual(citizenHudResources({ nationId: 'kindle', economy, ...plans }, true), { currencyCode: 'SPK', walletMinor: 650, inventory: { food: 8, materials: 2, knowledge: 1 } });
  assert.deepEqual(citizenHudResources({ nationId: 'aurelle', economy, ...plans }, true), { currencyCode: 'CRN', walletMinor: 800, inventory: { food: 3 } });
  assert.deepEqual(citizenHudResources({ nationId: 'korund', economy, ...plans }, true), { currencyCode: 'LN', walletMinor: 0, inventory: { food: 0 } });
  assert.deepEqual(citizenHudResources({ nationId: 'confluence', economy, ...plans }, true), { currencyCode: 'CUR', walletMinor: 250, inventory: undefined });
  assert.deepEqual(citizenHudResources({ nationId: 'confluence', economy, nationWorkPlan: { walletMinor: 250, currency: { code: 'SPK' } } }, true).currencyCode, null);
  assert.deepEqual(citizenHudResources({ nationId: 'veldwood', economy }, true), { currencyCode: null, walletMinor: undefined, inventory: undefined });
  const aurelleOff = citizenHudResources({ nationId: 'aurelle', economy, ...plans }, false);
  assert.equal(aurelleOff.currencyCode, 'CRN');
  assert.deepEqual(aurelleOff.inventory, { food: 3, materials: 0, knowledge: 0 });
  const heldOff = citizenHudResources({ nationId: 'hoarvale', economy }, false);
  assert.equal(heldOff.currencyCode, null);
  assert.equal(heldOff.walletMinor, undefined);
  assert.deepEqual(heldOff.inventory, { food: 8, materials: 2, knowledge: 1 });
  assert.deepEqual(citizenHudResources({ economy }, false), { currencyCode: 'SPK', walletMinor: 650, inventory: { food: 8, materials: 2, knowledge: 1 } });
});

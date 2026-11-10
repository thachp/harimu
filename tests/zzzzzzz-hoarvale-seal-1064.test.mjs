/** #1064: Hoarvale Civic bills show a frost-blue Royal Assent seal only when
 *  NEXT_PUBLIC_HARIMU_HOARVALE_ROYAL_ASSENT is exactly "true". The rows are the bills
 *  already on the government read (assent status and date from #1089). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { displayTimestamp } from '../lib/display-preferences.ts';
import { HOARVALE_ASSENT_SAMPLE_AT, simulateGovernment } from '../lib/government.ts';
import { nationCrest } from '../lib/nation-crests.ts';
import { nationMark } from '../lib/nation-themes.ts';
import { componentModule } from './helpers/component-module.mjs';

const read = p => readFile(new URL(`../${p}`, import.meta.url), 'utf8');
const key = 'NEXT_PUBLIC_HARIMU_HOARVALE_ROYAL_ASSENT';
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const withFlag = (value, run) => {
  const prev = process.env[key];
  if (value === undefined) delete process.env[key]; else process.env[key] = value;
  try { return run(); } finally { if (prev === undefined) delete process.env[key]; else process.env[key] = prev; }
};
const { GovernmentPanel } = await import(await componentModule(fileURLToPath(new URL('../app/government-panel.tsx', import.meta.url))));
const { hoarvaleRoyalAssentEnabled } = await import(await componentModule(fileURLToPath(new URL('../app/hoarvale-royal-assent.tsx', import.meta.url))));
const noop = () => {};
const civic = (nationId, flag, snapshot = null) => withFlag(flag, () => renderToStaticMarkup(React.createElement(GovernmentPanel, {
  snapshot, nationId, localDemo: true, pending: false, error: null, verification: null, onPetition: noop,
})));
const hoarvale = (now = HOARVALE_ASSENT_SAMPLE_AT) => simulateGovernment({
  nationId: 'hoarvale', availableBudgetMinor: 1, foodSecurity: 80, petitionCounts: {}, hoarvaleAssent: true, now,
});
const lum = hex => { const c = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722; };
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK, preview on and production off', async () => {
  assert.equal(hoarvaleRoyalAssentEnabled('true'), true);
  for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(hoarvaleRoyalAssentEnabled(value), false);
  const preview = strip(await read('wrangler.jsonc')), prod = strip(await read('wrangler.prod.jsonc'));
  assert.equal(preview.vars[key], undefined); assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_UI_PACK[key], 'true'); assert.equal(prod.vars.HARIMU_UI_PACK[key], 'false');
  assert.equal(expandFlagPacks(preview.vars)[key], 'true'); assert.equal(expandFlagPacks(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv(preview.vars)[key], 'true'); assert.equal(varsForProcessEnv(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv({ HARIMU_UI_PACK: preview.vars.HARIMU_UI_PACK, [key]: 'false' })[key], 'false', 'a direct string wins');
  assert.ok(FLAG_PACKS.HARIMU_UI_PACK.includes(key));
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 44);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), /NEXT_PUBLIC_HARIMU_HOARVALE_ROYAL_ASSENT/);
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), /NEXT_PUBLIC_HARIMU_HOARVALE_ROYAL_ASSENT/);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 44/);
  assert.match(await read('app/hoarvale-royal-assent.tsx'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_HOARVALE_ROYAL_ASSENT/);
  assert.match(await read('app/hoarvale-royal-assent.tsx'), /key=\{index\}/);
  assert.match(await read('app/government-panel.tsx'), /HoarvaleRoyalAssentBills nationId=\{snapshot\.nationId\} bills=\{snapshot\.bills\}/);
  assert.doesNotMatch(await read('app/hoarvale-royal-assent.tsx'), /Moot tax|hoarvaleCivicBills|role="status"/);
  assert.match(await read('app/hoarvale-royal-assent.tsx'), /useDisplayTimestamp\(\)/);
  assert.match(await read('app/hoarvale-royal-assent.tsx'), /<time className="hoarvale-assent-date" dateTime=\{dated\.dateTime\}>/);
  assert.doesNotMatch(await read('app/hoarvale-royal-assent.tsx'), /secondsUntilAssent|HARIMU_HOARVALE_AUTO_ASSENT/);
});

test('seal styles use the Hoarvale crest and mark, carry a pattern, and do not animate', async () => {
  const css = await read('app/globals.css');
  const block = css.slice(css.indexOf('/* #1064'));
  assert.match(block, /data-assent="pending"/); assert.match(block, /data-assent="withheld"/);
  assert.match(block, /135deg/); assert.match(block, /dashed/); assert.match(block, /90deg/);
  assert.match(block, /min-width:0/); assert.match(block, /flex-wrap:wrap/); assert.match(block, /44px/);
  assert.match(block, /font-size:calc\(17px \* var\(--text-scale, 1\)\)/);
  assert.match(block, /font-size:calc\(15px \* var\(--text-scale, 1\)\)/);
  assert.match(block, /font-size:calc\(18px \* var\(--text-scale, 1\)\)/);
  assert.match(block, /\.hoarvale-assent-date\{min-width:0;color:var\(--hv-ink\);font-size:calc\(15px \* var\(--text-scale, 1\)\)/);
  assert.match(block, /:is\(h3,h4,p,\.hoarvale-assent-label,\.hoarvale-assent-date\)\{color:var\(--hv-ink,#14323a\)\}/);
  assert.doesNotMatch(block, /font-size:\s*\d+(\.\d+)?px/);
  assert.doesNotMatch(block, /\b(animation|transition)\s*:/);
  const crest = nationCrest('hoarvale'), mark = nationMark('hoarvale');
  assert.equal(crest.field, '#3f7898'); assert.equal(crest.palette[0], 'Ice blue');
  assert.equal(mark.pattern, 'chevrons'); assert.equal(mark.symbol, '✚');
  assert.ok(contrast('#ffffff', crest.field) >= 4.5, 'white seal mark on frost');
  assert.ok(contrast('#14323a', '#f4f7f8') >= 4.5, 'ink on paper');
});

test('flag off and a non-Hoarvale nation leave the Civic panel unchanged', () => {
  const bills = hoarvale();
  assert.ok(bills?.bills?.length);
  for (const flag of ['false', undefined]) {
    const off = civic('hoarvale', flag, bills);
    assert.doesNotMatch(off, /hoarvale-bills|Royal Assent|Awaiting Royal Assent/);
    assert.match(off, /Food security reserve/);
  }
  const kindle = simulateGovernment({ nationId: 'kindle', availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} });
  const other = civic('kindle', 'true', kindle);
  assert.doesNotMatch(other, /hoarvale-bills|Royal Assent/);
  assert.match(other, /Food security reserve/);
  assert.equal(civic('aurelle', 'true', simulateGovernment({ nationId: 'aurelle', availableBudgetMinor: 0, foodSecurity: 80, petitionCounts: {} })).includes('hoarvale-bills'), false);
  const bare = { ...bills, bills: [] };
  assert.doesNotMatch(civic('hoarvale', 'true', bare), /hoarvale-bills/);
});

test('flag on: the government read’s bills differ by icon, pattern and text', () => {
  const page = civic('hoarvale', 'true', hoarvale());
  assert.match(page, /aria-label="Moot bills"/);
  assert.match(page, /Frostcore export guidance/); assert.match(page, /Mint inflation band/); assert.match(page, /Tenure pay steps/);
  assert.doesNotMatch(page, /Moot tax/);
  assert.match(page, /data-assent="assented"/); assert.match(page, /data-nation-pattern="chevrons"/); assert.match(page, /✚/);
  const rowFor = (html, title) => {
    const start = html.indexOf(`<h4>${title}</h4>`);
    assert.ok(start >= 0, title);
    return html.slice(html.lastIndexOf('<li', start), html.indexOf('</li>', start));
  };
  const stamp = seconds => ({ iso: new Date(seconds * 1000).toISOString(), label: displayTimestamp(seconds * 1000) });
  const expectDate = (row, title, text, seconds) => {
    const dated = stamp(seconds);
    assert.match(row, new RegExp(`<time class="hoarvale-assent-date" dateTime="${dated.iso}">${dated.label}</time>`));
    assert.equal(row.match(/aria-label="([^"]*)"/)[1], `${title}. ${text}. ${dated.label}`);
  };
  const minted = hoarvale().bills.find(bill => bill.title === 'Mint inflation band');
  const tenure = hoarvale().bills.find(bill => bill.title === 'Tenure pay steps');
  const frost = hoarvale().bills.find(bill => bill.title === 'Frostcore export guidance');
  assert.equal(frost.assentAt, null);
  assert.equal(typeof minted.assentAt, 'number');
  assert.equal(typeof tenure.assentAt, 'number');
  const mintRow = rowFor(page, 'Mint inflation band');
  const frostRow = rowFor(page, 'Frostcore export guidance');
  const tenureRow = rowFor(page, 'Tenure pay steps');
  expectDate(mintRow, 'Mint inflation band', 'Royal Assent', minted.assentAt);
  expectDate(tenureRow, 'Tenure pay steps', 'Royal Assent withheld', tenure.assentAt);
  assert.doesNotMatch(frostRow, /<time\b|dateTime=/);
  assert.match(page, /class="hoarvale-assent-label">Royal Assent</);
  assert.match(page, /data-assent="pending"/); assert.match(page, /data-nation-pattern="open-ring"/); assert.match(page, /○/);
  assert.match(frostRow, /aria-label="Frostcore export guidance\. Awaiting Royal Assent"/);
  assert.match(page, />Awaiting Royal Assent</);
  assert.match(page, /data-assent="withheld"/); assert.match(page, /data-nation-pattern="cross"/); assert.match(page, /×/);
  assert.match(tenureRow, /data-assent="withheld"/);
  assert.match(page, />Royal Assent withheld</);
  const start = page.indexOf('class="hoarvale-bills"');
  const sealed = page.slice(start, page.indexOf('</section>', start));
  assert.doesNotMatch(sealed, /role="status"/);
  assert.match(page, /--hv-frost:#3f7898/); assert.match(page, /--hv-accent:#8ac1c6/);
  assert.equal((page.match(/hoarvale-assent-seal/g) ?? []).length, 3);
  assert.equal((sealed.match(/<time\b/g) ?? []).length, 2);
  const renamed = { ...hoarvale(), bills: [{ id: 'sentinel', title: 'Sentinel bill', passedAt: 1, assentStatus: 'pending', assentAt: null }] };
  const custom = civic('hoarvale', 'true', renamed);
  assert.match(custom, /Sentinel bill/); assert.match(custom, /Awaiting Royal Assent/);
  assert.doesNotMatch(custom, /Frostcore export guidance|Mint inflation band|Tenure pay steps/);
  const customStart = custom.indexOf('class="hoarvale-bills"');
  assert.doesNotMatch(custom.slice(customStart, custom.indexOf('</section>', customStart)), /<time\b|dateTime=/);
  const undated = { ...hoarvale(), bills: [
    { id: 'bare', title: 'Bare assent', passedAt: 1, assentStatus: 'assented', assentAt: null },
    { id: 'omitted', title: 'Omitted date', passedAt: 1, assentStatus: 'withheld' },
    { id: 'bad', title: 'Bad clock', passedAt: 1, assentStatus: 'assented', assentAt: Number.NaN },
  ] };
  const blank = civic('hoarvale', 'true', undated);
  const blankStart = blank.indexOf('class="hoarvale-bills"');
  const blankSealed = blank.slice(blankStart, blank.indexOf('</section>', blankStart));
  assert.match(blankSealed, /Bare assent/); assert.match(blankSealed, /Omitted date/); assert.match(blankSealed, /Bad clock/);
  assert.doesNotMatch(blankSealed, /<time\b|dateTime=|Time unavailable/);
});

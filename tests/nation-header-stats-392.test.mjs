/** #392 UI 41: Nation panel header stats. NEXT_PUBLIC_HARIMU_NATION_HEADER_STATS is HARIMU_UI_PACK entry 39.
 *  Preview on, production off. Flag on shows Stability, Capital and Currency chips from the nation record.
 *  A missing value is left out, and the row is left out when all three are missing. Flag off is today's overview and fact rows. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { cityCurrencyParts } from '../lib/city-header-stats.ts';
import { nationHeaderStats, nationHeaderStatsEnabled, NATION_HEADER_STATS_FLAG } from '../lib/nation-header-stats.ts';

const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const key = NATION_HEADER_STATS_FLAG;
const lum = hex => { const c = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722; };
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const header = html => html.match(/<dl class="panel-v2-header-stats">[\s\S]*?<\/dl>/)?.[0] ?? '';
const chips = html => [...html.matchAll(/<div><dt>([\s\S]*?)<\/dt><dd>([\s\S]*?)<\/dd><\/div>/g)].map(([, dt, dd]) => ({
  label: dt.replace(/<[^>]+>/g, '').trim(),
  value: dd.replace(/<small[\s\S]*$/, '').replace(/<[^>]+>/g, '').trim(),
  detail: dd.match(/<small>([^<]*)<\/small>/)?.[1] ?? '',
}));
const aurelle = { id: 'aurelle', name: 'Aurelle', motto: "Win the crown's favor - or take the crown.", stability: 72, capital: 'Highspire', currency: 'Crown (CRN) · gold-backed', government: 'Absolute hereditary monarchy', economy: 'Royal charters and fiefs', religion: 'Kinward Rite state church' };
const korund = { id: 'korund', name: 'Korund', motto: 'Nobody falls through the stone.', stability: 68, capital: 'Stonehearth', currency: 'Labor Note (LN) + ration coupons', government: 'Full communism; leader for life', economy: 'Central planning', religion: 'State atheism' };

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK entry 39, preview on and production off', async () => {
  const previous = process.env[key];
  try {
    delete process.env[key];
    assert.equal(nationHeaderStatsEnabled(), false);
    assert.equal(nationHeaderStatsEnabled('true'), true);
    for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(nationHeaderStatsEnabled(value), false);
    process.env[key] = 'true';
    assert.equal(nationHeaderStatsEnabled(), true);
  } finally {
    if (previous === undefined) delete process.env[key]; else process.env[key] = previous;
  }
  const preview = strip(await read('wrangler.jsonc')), prod = strip(await read('wrangler.prod.jsonc'));
  assert.equal(preview.vars[key], undefined); assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_UI_PACK[key], 'true'); assert.equal(prod.vars.HARIMU_UI_PACK[key], 'false');
  assert.equal(expandFlagPacks(preview.vars)[key], 'true'); assert.equal(expandFlagPacks(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv(preview.vars)[key], 'true'); assert.equal(varsForProcessEnv(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv({ HARIMU_UI_PACK: preview.vars.HARIMU_UI_PACK, [key]: 'false' })[key], 'false', 'a direct string wins');
  assert.ok(FLAG_PACKS.HARIMU_UI_PACK.includes(key));
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 62);
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.at(38), key, 'entry 39');
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 62/);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /#392 nation header stats/);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), new RegExp(key));
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), new RegExp(key));
  assert.match(await read('lib/nation-header-stats.ts'), /try \{ return process\.env\.NEXT_PUBLIC_HARIMU_NATION_HEADER_STATS/);
  assert.match(await read('app/nation-overview.tsx'), /nationHeaderStatsEnabled\(\)/);
  assert.match(await read('app/nation-overview.tsx'), /<HeaderStatChips /);
  assert.match(await read('app/panel-v2.tsx'), /export function HeaderStatChips/);
  assert.doesNotMatch(await read('app/nation-overview.tsx'), /panel-v2-header-stats/);
  assert.doesNotMatch(await read('app/page.tsx'), /NATION_HEADER_STATS|nationHeaderStatsEnabled/);
});

test('currency parts name every nation, and chips use the nation record', async () => {
  const currencies = [...(await read('app/page.tsx')).matchAll(/currency: '([^']*)'/g)].map(m => m[1]);
  const expected = {
    'Spark (SPK) · free float': ['Spark', 'SPK · free float'],
    'Current (CUR) · managed band': ['Current', 'CUR · managed band'],
    'Gauge (GAU) · crawling peg': ['Gauge', 'GAU · crawling peg'],
    'Labor Note (LN) + ration coupons': ['Labor Note', 'LN + ration coupons'],
    'Crown (CRN) · gold-backed': ['Crown', 'CRN · gold-backed'],
    'Prism (PRM) · Canon rules': ['Prism', 'PRM · Canon rules'],
    'Rime (RIM) · inflation band': ['Rime', 'RIM · inflation band'],
    'Ward (WRD) · hard peg': ['Ward', 'WRD · hard peg'],
    'Bough (BGH) · Citizen Dividend': ['Bough', 'BGH · Citizen Dividend'],
    'Charge (CHG) · shareholder bank': ['Charge', 'CHG · shareholder bank'],
  };
  assert.deepEqual(currencies, Object.keys(expected));
  for (const [currency, [value, detail]] of Object.entries(expected)) {
    const parts = cityCurrencyParts(currency);
    assert.ok(parts?.value, currency);
    assert.equal(parts.value, value, currency);
    assert.equal(parts.detail, detail, currency);
    assert.doesNotMatch(parts.value, /[()·]|^\s|\s$/, `${currency} name`);
  }
  assert.deepEqual(nationHeaderStats(aurelle), [
    { id: 'stability', label: 'Stability', value: '72' },
    { id: 'capital', label: 'Capital', value: 'Highspire' },
    { id: 'currency', label: 'Currency', value: 'Crown', detail: 'CRN · gold-backed' },
  ]);
  assert.deepEqual(nationHeaderStats(korund).find(stat => stat.id === 'currency'), { id: 'currency', label: 'Currency', value: 'Labor Note', detail: 'LN + ration coupons' });
  assert.deepEqual(nationHeaderStats({ stability: 0, capital: 'Stonehearth' }).map(stat => stat.id), ['stability', 'capital']);
  assert.deepEqual(nationHeaderStats({ stability: Number.NaN, capital: '  ', currency: '' }), []);
  assert.deepEqual(nationHeaderStats({}), []);
});

const bundle = async (entry, define) => {
  const { build } = await import('esbuild');
  const out = await build({ entryPoints: [new URL(`../${entry}`, import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') }, define });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
};

test('flag on shows the chips and hides the repeated overview and fact rows; flag off is unchanged', async () => {
  const offMod = await bundle('app/nation-overview.tsx', { 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_CREST': '"false"', 'process.env.NEXT_PUBLIC_HARIMU_NATION_HEADER_STATS': '"false"' });
  const onMod = await bundle('app/nation-overview.tsx', { 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_CREST': '"false"', 'process.env.NEXT_PUBLIC_HARIMU_NATION_HEADER_STATS': '"true"' });
  const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
  const view = (mod, nation) => renderToStaticMarkup(React.createElement(mod.NationOverview, { nation, government: { nationId: nation.id, roles: [{ name: 'Sovereign' }] }, onExplore() {}, onCivic() {} }));
  const off = view(offMod, aurelle), on = view(onMod, aurelle), korundOn = view(onMod, korund);
  const none = view(onMod, { id: 'fulmara' });
  const noCapital = view(onMod, { ...aurelle, capital: ' ' });
  assert.match(off, /<header class="nation-overview-head">/);
  assert.doesNotMatch(off, /panel-v2-header-stats|nation-overview-head-chips/);
  assert.match(off, /<dt>Stability<\/dt><dd>72 \/ 100<\/dd>/);
  assert.match(off, /<dt>Capital<\/dt><dd>Highspire<\/dd>/);
  assert.match(off, /<dt>Currency<\/dt><dd>Crown \(CRN\) · gold-backed<\/dd>/);
  assert.match(on, /<header class="nation-overview-head nation-overview-head-chips">[\s\S]*<dl class="panel-v2-header-stats">/);
  assert.deepEqual(chips(header(on)), [
    { label: 'Stability', value: '72', detail: '' },
    { label: 'Capital', value: 'Highspire', detail: '' },
    { label: 'Currency', value: 'Crown', detail: 'CRN · gold-backed' },
  ]);
  assert.match(header(on), /aria-hidden="true"/);
  assert.doesNotMatch(on, /nation-overview-stats|72 \/ 100|Crown \(CRN\) · gold-backed/);
  assert.match(on, /<dt>Government<\/dt><dd>Absolute hereditary monarchy<\/dd>/);
  assert.match(on, /<dt>Economy<\/dt><dd>Royal charters and fiefs<\/dd>/);
  assert.match(on, /<dt>Faith<\/dt><dd>Kinward Rite state church<\/dd>/);
  assert.deepEqual(chips(header(korundOn)).find(chip => chip.label === 'Currency'), { label: 'Currency', value: 'Labor Note', detail: 'LN + ration coupons' });
  assert.deepEqual(chips(header(noCapital)).map(chip => chip.label), ['Stability', 'Currency']);
  assert.equal(header(none), '');
  assert.doesNotMatch(none, /<dt>/);
  const facts = await bundle('app/nation-panel-v2.tsx', { 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_NATION': '"true"', 'process.env.NEXT_PUBLIC_HARIMU_NATION_FACT_ROWS': '"true"', 'process.env.NEXT_PUBLIC_HARIMU_NATION_HEADER_STATS': '"true"' });
  const factsOff = await bundle('app/nation-panel-v2.tsx', { 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_NATION': '"true"', 'process.env.NEXT_PUBLIC_HARIMU_NATION_FACT_ROWS': '"true"', 'process.env.NEXT_PUBLIC_HARIMU_NATION_HEADER_STATS': '"false"' });
  const bare = await bundle('app/nation-panel-v2.tsx', { 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_NATION': '"true"', 'process.env.NEXT_PUBLIC_HARIMU_NATION_FACT_ROWS': '"false"', 'process.env.NEXT_PUBLIC_HARIMU_NATION_HEADER_STATS': '"true"' });
  const nation = { ...aurelle, shortName: 'Aurelle', population: '924k', treasury: 'CRN 74.6m', tradeStatus: 'Royal charter' };
  const noop = () => {};
  const panel = (mod) => renderToStaticMarkup(React.createElement(mod.NationPanel, { nation, capacity: 10, workOrders: [], workPending: false, onWorldView: noop, onHousehold: noop, onWorkplace: noop, onCommitWork: noop, onNationMap: noop }));
  const onFacts = panel(facts).match(/<dl class="panel-v2-stats[^"]*">[\s\S]*?<\/dl>/)[0];
  const offFacts = panel(factsOff).match(/<dl class="panel-v2-stats[^"]*">[\s\S]*?<\/dl>/)[0];
  const bareHtml = panel(bare);
  assert.match(offFacts, /Capital/); assert.match(offFacts, /Currency/);
  assert.match(onFacts, /Government/); assert.match(onFacts, /Economy/);
  assert.doesNotMatch(onFacts, /Capital|Currency/);
  assert.doesNotMatch(bareHtml, /class="panel-v2-stats/);
  assert.match(bareHtml, /<strong>Capital<\/strong>/); assert.match(bareHtml, /<strong>Currency<\/strong>/);
  assert.match(panel(facts), /<dt>Stability<\/dt><dd>72 \/ 100<\/dd>/);
  const css = await read('app/panel-v2.css');
  const chipCss = css.slice(css.indexOf('/* #392 city header stats'), css.indexOf('.panel-v2 dl.panel-v2-stats'));
  assert.match(chipCss, /\.nation-overview/);
  assert.match(chipCss, /flex-wrap:wrap/);
  assert.match(chipCss, /overflow-wrap:anywhere/);
  assert.match(chipCss, /white-space:normal/);
  assert.doesNotMatch(chipCss, /white-space:nowrap|overflow-x:auto|overflow-x:scroll/);
  assert.match(await read('app/nation-overview.css'), /\.nation-overview-head-chips\{flex-wrap:wrap\}/);
  assert.ok(contrast('#f1d58a', '#071820') >= 4.5, 'label on the chip');
  assert.ok(contrast('#f3ecd6', '#071820') >= 4.5, 'value on the chip');
  assert.ok(contrast('#e7f2ef', '#071820') >= 4.5, 'currency detail on the chip');
});

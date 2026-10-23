/** #392 S10 (#870): Work and Market panel heads in the S3 shape, flag NEXT_PUBLIC_HARIMU_UI_V2_PANEL. The real WorkSummary and MarketSummary rendered from a build
 *  with the flag off and one with it on (same assertions); every pre-existing Work and Market action in page.tsx is still there (heads are added, nothing removed). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');

const build = async flag => {
  const { build } = await import('esbuild');
  const out = await build({ entryPoints: [new URL('../app/scene-panels-v2.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent', alias: { '@': new URL('..', import.meta.url).pathname.replace(/\/$/, '') },
    define: { 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_PANEL': JSON.stringify(flag) } });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
  return (name, props) => renderToStaticMarkup(React.createElement(mod[name], props));
};
const noop = () => {};

for (const flag of ['false', 'true']) test(`flag ${flag}: Work and Market heads show only with the flag on, existing copy and data only`, async () => {
  const render = await build(flag), on = flag === 'true';
  const work = render('WorkSummary', { capacity: 18, contributions: 3, onMarket: noop });
  assert.equal(work.includes('class="panel-v2"'), on);
  for (const t of ['<h2>Workplace</h2>', 'Contributions and earnings', '<dt>WC</dt><dd>18 / 24</dd>', '<dt>Available contributions</dt><dd>3</dd>', 'Your work shifts', 'Take your earnings to market']) assert.equal(work.includes(t), on, t);
  assert.equal(render('WorkSummary', { capacity: 18, contributions: 3 }).includes('panel-v2-primary'), false, 'no market primary while the market is closed');
  const market = render('MarketSummary', { nation: { name: 'Kindle Republic', currency: 'Spark' }, walletMinor: 4000, food: 6, board: true, listings: true, onHousehold: noop });
  assert.equal(market.includes('class="panel-v2"'), on);
  for (const t of ['<h2>Market</h2>', 'Goods and citizen listings', '<dt>Wallet</dt><dd>40.00 Spark</dd>', '<dt>Food</dt><dd>6</dd>', 'Kindle starter market', 'City market board', 'Kindle citizen listings', 'Return to household']) assert.equal(market.includes(t), on, t);
  const other = render('MarketSummary', { nation: { name: 'Gauge Union', currency: 'Gauge (GAU)' }, walletMinor: undefined, food: null, board: false, listings: false, onHousehold: noop });
  assert.doesNotMatch(other, /Wallet|Food|City market board|Kindle citizen listings/, 'no other nation\'s data; rows only for sections that render');
});

test('page.tsx: heads added above every pre-existing Work and Market action (none removed), data passed, never the flag', async () => {
  const page = await read('app/page.tsx');
  for (const a of ['<WorkShiftBoard ', 'onClaim={(id) => void runWork(\'claim-work\'', 'onClick={() => void commitWork(order)}', 'Take your earnings to market</button>', '<CitizenMarket ', '<MarketBoard ', '<PlayerMarket ', 'Return to household</button>', '<KindleTradingNote '])
    assert.ok(page.includes(a), a);
  assert.match(page, /<WorkSummary capacity=\{capacity\}/); assert.match(page, /<MarketSummary nation=\{citizenNation\} walletMinor=\{householdWalletMinor\(citizenNation\.id, economy\?\.walletMinor\)\}/);
  assert.match(page, /\{viewMode === 'workplace' && [^\n]*<>\n\s*<WorkSummary [^\n]*\n\s*<WorkShiftBoard /, 'Work head at the top');
  assert.match(page, /\{viewMode === 'market' && marketShown [^\n]*<>\n\s*<MarketSummary [^\n]*\n[^\n]*\n\s*<CitizenMarket /, 'Market head at the top');
  assert.doesNotMatch(page, /<(Work|Market)Summary[^>]*enabled=/);
});

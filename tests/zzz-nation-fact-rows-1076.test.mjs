/** #1076: Nation panel fact rows. Flag on: Capital, Government, Economy, Currency from the Nation record in app/page.tsx.
 *  Flag off: today's Capital and Currency (currency still cut at ' · '). Icons are decorative. The zz- prefix sorts this file last
 *  so Node's --test-shard round-robin does not move earlier files between Postgres shards. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { expandFlagPacks, FLAG_PACKS, varsForProcessEnv } from '../lib/flag-pack.mjs';
import { nationFactRowsEnabled } from '../lib/nation-fact-rows.ts';

const read = f => readFile(new URL(`../${f}`, import.meta.url), 'utf8');
const key = 'NEXT_PUBLIC_HARIMU_NATION_FACT_ROWS';
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const nationsFrom = src => [...src.matchAll(/id: '([^']+)'[\s\S]*?government: '([^']*)'[\s\S]*?economy: '([^']*)'[\s\S]*?currency: '([^']*)'[\s\S]*?capital: '([^']*)'/g)]
  .map(([, id, government, economy, currency, capital]) => ({ id, government, economy, currency, capital, name: id, shortName: id, motto: 'M', religion: 'R', population: '1', treasury: '2', stability: 3, tradeStatus: 'T' }));

const panel = async factRows => {
  const { build } = await import('esbuild');
  const out = await build({ entryPoints: [new URL('../app/nation-panel-v2.tsx', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic',
    packages: 'external', loader: { '.css': 'empty' }, logLevel: 'silent',
    define: { 'process.env.NEXT_PUBLIC_HARIMU_UI_V2_NATION': '"true"', 'process.env.NEXT_PUBLIC_HARIMU_NATION_FACT_ROWS': JSON.stringify(factRows) } });
  const code = out.outputFiles[0].text.replace(/from "([^".][^"]*)"/g, (_, m) => `from "${import.meta.resolve(m)}"`);
  const mod = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server'), noop = () => {};
  return nation => renderToStaticMarkup(React.createElement(mod.NationPanel, { nation, capacity: 10, workOrders: [], workPending: false, onWorldView: noop, onHousehold: noop, onWorkplace: noop, onCommitWork: noop, onNationMap: noop }));
};
const statsOf = html => {
  const block = html.match(/<dl class="(panel-v2-stats[^"]*)">([\s\S]*?)<\/dl>/);
  assert.ok(block, 'header fact list is a dl');
  const pairs = [...block[2].matchAll(/<dt>(?:<span class="panel-v2-icon" aria-hidden="true">[\s\S]*?<\/span>)?([^<]*)<\/dt><dd>([^<]*)<\/dd>/g)].map(m => [m[1], m[2]]);
  const icons = [...block[2].matchAll(/<span class="panel-v2-icon" aria-hidden="true">/g)].length;
  return { className: block[1], pairs, icons, html: block[2] };
};
const buttons = html => [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(m => `${m[1].includes('aria-label') ? m[1] : ''} ${m[2].replace(/<[^>]+>/g, '')}`.replace(/\s+/g, ' ').trim());

test('flag is on only for the exact string "true", inside HARIMU_UI_PACK, preview on and production off', async () => {
  assert.equal(nationFactRowsEnabled('true'), true);
  for (const value of [undefined, '', 'false', 'TRUE', '1', ' true']) assert.equal(nationFactRowsEnabled(value), false);
  const preview = strip(await read('wrangler.jsonc')), prod = strip(await read('wrangler.prod.jsonc'));
  assert.equal(preview.vars[key], undefined); assert.equal(prod.vars[key], undefined);
  assert.equal(preview.vars.HARIMU_UI_PACK[key], 'true'); assert.equal(prod.vars.HARIMU_UI_PACK[key], 'false');
  assert.equal(expandFlagPacks(preview.vars)[key], 'true'); assert.equal(expandFlagPacks(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv(preview.vars)[key], 'true'); assert.equal(varsForProcessEnv(prod.vars)[key], 'false');
  assert.equal(varsForProcessEnv({ HARIMU_UI_PACK: preview.vars.HARIMU_UI_PACK, [key]: 'false' })[key], 'false', 'a direct string wins');
  assert.ok(FLAG_PACKS.HARIMU_UI_PACK.includes(key));
  assert.equal(FLAG_PACKS.HARIMU_UI_PACK.length, 61);
  assert.match(await read('tests/wrangler-prod-501b.test.mjs'), /NEXT_PUBLIC_HARIMU_NATION_FACT_ROWS/);
  assert.match(await read('tests/flag-off-audit-384.test.mjs'), /NEXT_PUBLIC_HARIMU_NATION_FACT_ROWS/);
  assert.match(await read('tests/text-bindings-988.test.mjs'), /HARIMU_UI_PACK\.length, 61/);
});

test('flag on: four real rows for all ten nations; flag off: Capital and Currency; icons are aria-hidden', async () => {
  const nations = nationsFrom(await read('app/page.tsx'));
  assert.deepEqual(nations.map(n => n.id), ['kindle', 'confluence', 'meridian', 'korund', 'aurelle', 'ilmar', 'hoarvale', 'varkand', 'veldwood', 'fulmara']);
  const onPanel = await panel('true'), offPanel = await panel('false');
  for (const nation of nations) {
    const shown = nation.currency.split(' · ')[0];
    const onHtml = onPanel(nation), offHtml = offPanel(nation);
    const on = statsOf(onHtml), off = statsOf(offHtml);
    assert.equal(on.className, 'panel-v2-stats panel-v2-facts', nation.id);
    assert.deepEqual(on.pairs, [['Capital', nation.capital], ['Government', nation.government], ['Economy', nation.economy], ['Currency', shown]], nation.id);
    assert.equal(on.icons, 4, nation.id);
    assert.match(on.html, /<dt><span class="panel-v2-icon" aria-hidden="true">/, `${nation.id}: the icon sits inside the dt`);
    assert.doesNotMatch(on.html, /<div><span class="panel-v2-icon"/, `${nation.id}: the icon is not a sibling of the dt`);
    assert.equal(off.className, 'panel-v2-stats', nation.id);
    assert.deepEqual(off.pairs, [['Capital', nation.capital], ['Currency', shown]], nation.id);
    assert.equal(off.icons, 0, nation.id);
    for (const block of [on.html, off.html]) assert.doesNotMatch(block, /Stability|Treasury|Population/, nation.id);
    assert.match(onHtml, /<dt>Stability<\/dt>/, 'the lower example profile still lists Stability');
    assert.equal(buttons(onHtml).join('|'), buttons(offHtml).join('|'), `${nation.id}: keyboard order unchanged`);
  }
  const aurelle = nations.find(n => n.id === 'aurelle'), korund = nations.find(n => n.id === 'korund');
  assert.equal(aurelle.government, 'Absolute hereditary monarchy');
  assert.equal(korund.currency.split(' · ')[0], 'Labor Note (LN) + ration coupons');
});

test('fact-row CSS keeps labels whole, lets values wrap, and adds no animation', async () => {
  const rules = (await read('app/panel-v2.css')).split('\n').filter(line => line.includes('panel-v2-facts')).join('\n');
  assert.match(rules, /grid-template-columns:minmax\(0,1fr\)/);
  assert.match(rules, /minmax\(min-content,max-content\)/);
  assert.match(rules, /\.panel-v2 \.panel-v2-facts dt\{[^}]*overflow-wrap:normal;word-break:normal;hyphens:manual/);
  assert.match(rules, /\.panel-v2 \.panel-v2-facts dd\{[^}]*overflow-wrap:break-word;word-break:normal/);
  assert.doesNotMatch(rules, /animation|transition|@keyframes/);
  assert.match(await read('app/panel-v2.css'), /#1076[\s\S]*No animation/);
  assert.match(await read('app/panel-v2.tsx'), /aria-hidden="true"/);
});

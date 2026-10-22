/** #487: Confluence staple on a fixed price band (display only), behind HARIMU_CONFLUENCE_ENABLED + QA allowlist. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';

const qa = { HARIMU_QA_TEST_CITIZENS: 'true', NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW: 'true', HARIMU_QA_TEST_CITIZEN_IDS: 'alice' };

test('pure board: band around a fixed price; null with the flag off, for a non-allowlisted account, another nation or no user', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const m = await r.importModule('lib/confluence-price-band.ts');
  const on = { ...qa, HARIMU_CONFLUENCE_ENABLED: 'true' };
  assert.deepEqual(m.confluencePriceBoard('confluence', 'alice', on), { nationId: 'confluence', currency: 'CUR', staple: 'Rice', unit: 'bowl', priceMinor: 100, floorMinor: 95, ceilingMinor: 105, bandPct: 5 });
  const b = m.confluencePriceBoard('confluence', 'alice', on); assert.ok(b.floorMinor <= b.priceMinor && b.priceMinor <= b.ceilingMinor);
  assert.equal(m.confluencePriceBoard('confluence', 'alice', { ...on, HARIMU_CONFLUENCE_ENABLED: 'false' }), null);
  assert.equal(m.confluencePriceBoard('confluence', 'alice', qa), null, 'flag unset');
  assert.equal(m.confluencePriceBoard('confluence', 'bob', on), null, 'not allowlisted');
  assert.equal(m.confluencePriceBoard('confluence', null, on), null);
  for (const n of ['kindle', 'korund', 'aurelle', 'meridian', null]) assert.equal(m.confluencePriceBoard(n, 'alice', on), null, String(n));
});

test('GET /api/citizen: the board appears only for an allowlisted Confluence citizen with the flag on; live nations never get the key', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  await r.call('world', null);
  for (const [k, v] of Object.entries(qa)) r.setFixtureEnv(k, v);
  await r.db.prepare("UPDATE citizens SET nation_id='confluence' WHERE clerk_user_id='alice'").run();
  r.setFixtureEnv('HARIMU_CONFLUENCE_ENABLED', 'false');
  assert.equal('confluencePriceBoard' in (await r.call('citizen', 'alice')).data, false, 'flag off: no key');
  r.setFixtureEnv('HARIMU_CONFLUENCE_ENABLED', 'true');
  assert.equal((await r.call('citizen', 'alice')).data.confluencePriceBoard.priceMinor, 100);
  await r.db.prepare("UPDATE citizens SET nation_id='kindle' WHERE clerk_user_id='alice'").run();
  assert.equal('confluencePriceBoard' in (await r.call('citizen', 'alice')).data, false, 'a live nation never sees it');
});

test('wiring: production keeps the flag "false"; the board renders only in the Confluence market view and has no trade action', async () => {
  const prod = await readFile(new URL('../wrangler.prod.jsonc', import.meta.url), 'utf8');
  assert.match(prod, /"HARIMU_CONFLUENCE_ENABLED"\s*:\s*"false"/);
  const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /citizenNation\.id === 'confluence' && <ConfluencePriceBoard board=\{priceBoard\} \/>/, '#688: Confluence market view only; null board shows the empty state');
  const ui = await readFile(new URL('../app/confluence-price-board.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(ui, /onClick|<button|ActionButton/, 'read-only');
  assert.match(ui, /from '@\/lib\/confluence-market-copy'/, '#688: wording comes from Content\'s copy module');
  assert.doesNotMatch(ui, /stay inside/);
});

test('render (#688): Content copy rows with the 1.00 CUR price and its ±5% band; the empty state with no board', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const m = await r.importModule('lib/confluence-price-band.ts');
  const { loadApp } = await import('./helpers/component-module.mjs');
  const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
  const { ConfluencePriceBoard } = await loadApp('confluence-price-board');
  const html = renderToStaticMarkup(React.createElement(ConfluencePriceBoard, { board: m.confluencePriceBoard('confluence', 'alice', { ...qa, HARIMU_CONFLUENCE_ENABLED: 'true' }) }));
  for (const text of ['Banded price board', 'Rice, per bowl', '<dt>Posted state price</dt><dd>1.00 CUR per bowl</dd>', '<dt>State price band</dt><dd>0.95 CUR to 1.05 CUR (±5%)</dd>',
    'The state sets a band for each staple and posts a price inside it.', 'This board shows the posted state price. Buying is not open here yet.']) assert.ok(html.includes(text), `${text}\n${html}`);
  assert.doesNotMatch(html, /\{(staple|portion|price|floor|ceiling|band)\}|No posted state price yet/, 'every placeholder filled; no empty state');
  const title = (await import('../lib/confluence-market-copy.ts')).priceBoard.title;
  assert.ok(html.includes(`<h3 id="confluence-price-board-heading">${title}</h3>`), 'QA1 nit: title comes from the copy module');
  assert.doesNotMatch(await readFile(new URL('../app/confluence-price-board.tsx', import.meta.url), 'utf8'), /Banded price board/, 'title not hardcoded');
  const empty = renderToStaticMarkup(React.createElement(ConfluencePriceBoard, { board: null }));
  assert.ok(empty.includes('Banded price board') && empty.includes('No posted state price yet.'), empty);
  assert.doesNotMatch(empty, /<dl>|CUR/, 'empty state shows no figures');
});

test('gating (#688 follow-up): flag off or not allowlisted renders nothing; on + allowlisted + no price shows the empty state', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const { loadApp } = await import('./helpers/component-module.mjs');
  const React = (await import('react')).default, { renderToStaticMarkup } = await import('react-dom/server');
  const { ConfluencePriceBoard } = await loadApp('confluence-price-board');
  const render = board => renderToStaticMarkup(React.createElement(ConfluencePriceBoard, board === undefined ? {} : { board }));
  const m = await r.importModule('lib/confluence-price-band.ts');
  const sent = (user, flag) => { const b = m.confluencePriceBoard('confluence', user, { ...qa, HARIMU_CONFLUENCE_ENABLED: flag }); return b ?? undefined; }; // route omits the key when null
  assert.equal(render(sent('alice', 'false')), '', 'flag off: nothing, no empty state');
  assert.equal(render(sent('bob', 'true')), '', 'not allowlisted: nothing');
  assert.equal(render(undefined), '');
  const empty = render(null);
  assert.ok(empty.includes('No posted state price yet.'), 'on + allowlisted + no price: empty state');
  assert.ok(render(sent('alice', 'true')).includes('1.00 CUR per bowl'));
  const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /useState<PriceBoard \| null \| undefined>\(undefined\)/);
  assert.match(page, /setPriceBoard\(snapshot\.confluencePriceBoard\);/, 'absent key stays undefined, never coerced to null');
});

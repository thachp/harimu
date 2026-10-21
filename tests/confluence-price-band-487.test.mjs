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
  assert.match(page, /citizenNation\.id === 'confluence' && priceBoard && <ConfluencePriceBoard board=\{priceBoard\} \/>/);
  const ui = await readFile(new URL('../app/confluence-price-board.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(ui, /onClick|<button|ActionButton/, 'read-only');
});

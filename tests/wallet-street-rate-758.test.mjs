/** #758 Korund wallet rumored street rate (docs 12.8 Display row, 12.9), behind HARIMU_WALLET_STREET_RATE_ENABLED. Read-only, display only (12.10). */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';

async function setup(t, on = true, backend = 'sqlite') {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  await r.db.prepare("UPDATE citizens SET nation_id='korund'").run(); await r.call('world', null);
  await r.db.prepare(`INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES ('carol','korund','carol',18,0,'Good standing',?,?)`).bind(new Date(r.now).toISOString(), new Date(r.now).toISOString()).run();
  r.setFixtureEnv('HARIMU_GRAY_MARKET_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_WALLET_STREET_RATE_ENABLED', on ? 'true' : undefined);
  return r;
}
async function trade(r, seller = 'alice', buyer = 'bob', askRate = 120) {
  const id = randomUUID(); assert.equal((await r.call('citizen', seller, { action: 'korund-start-work', requestId: id })).status, 200);
  r.setNow(r.now + 7200 * 1000); assert.equal((await r.call('citizen', seller, { action: 'korund-claim-work', shiftId: id })).status, 200);
  assert.equal((await r.call('citizen', seller, { action: 'korund-gray-post-offer', requestId: randomUUID(), amountMinor: 500, askRate })).status, 200);
  const offerId = (await plan(r, buyer)).gray.offers[0].id;
  assert.equal((await r.call('citizen', buyer, { action: 'korund-gray-accept-offer', requestId: randomUUID(), offerId })).status, 200);
}
const plan = async (r, user = 'alice') => (await r.call('citizen', user)).data.korundPlan;
async function sqlDuring(r, fn) {
  const seen = [], prepare = r.db.prepare.bind(r.db);
  r.db.prepare = sql => { seen.push(sql.replace(/\s+/g, ' ').trim()); return prepare(sql); };
  try { await fn(); } finally { r.db.prepare = prepare; }
  return seen;
}
const isHeardQuery = sql => /AS heard$/.test(sql);
const isWrite = sql => /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|REPLACE)/i.test(sql);

test('copy: the line is always labeled a rumor, never official as a claim', async () => {
  const text = await readFile(new URL('../lib/gray-market-text.ts', import.meta.url), 'utf8');
  assert.match(text, /export const walletRumorTag = 'rumor, not official';/);
  assert.match(text, /`Rumored street rate: about \$\{rate\(hundredths\)\} \(\$\{walletRumorTag\}\)`/);
  assert.match(text, /`Rumored street rate: no recent trades \(\$\{walletRumorTag\}\)`/);
});

for (const backend of ['sqlite', 'postgres']) {
  test(`${backend}: flag on, a Korund citizen who traded sees the published rumor; one who never traded sees nothing`, async t => {
    const r = await setup(t, true, backend);
    assert.equal((await plan(r)).streetRate, null, 'before any trade: hidden');
    await trade(r);
    const a = await plan(r), b = await plan(r, 'bob');
    assert.equal(typeof a.streetRate.rumoredRate, 'number');
    assert.equal(a.streetRate.rumoredRate, a.gray.rumoredRate, 'same value as the #43 published rumor (no new math)');
    assert.deepEqual(b.streetRate, a.streetRate, 'buyer heard too');
    assert.equal((await plan(r, 'carol')).streetRate, null, 'never traded: hidden');
  });
}

test('flag off: no streetRate field and no street-rate query (spy) vs a flag-on baseline', async t => {
  const on = await setup(t); await trade(on);
  assert.ok((await sqlDuring(on, () => plan(on))).some(isHeardQuery));
  const off = await setup(t, false); await trade(off);
  assert.equal((await sqlDuring(off, () => plan(off))).filter(isHeardQuery).length, 0);
  assert.equal('streetRate' in (await plan(off)), false);
});

test('QA1 on #775: street-rate flag on but gray market flag off shows no line and runs no street-rate query', async t => {
  const r = await setup(t); await trade(r);
  assert.ok((await plan(r)).streetRate, 'baseline: both flags on');
  r.setFixtureEnv('HARIMU_GRAY_MARKET_ENABLED', undefined);
  assert.equal((await sqlDuring(r, () => plan(r))).filter(isHeardQuery).length, 0);
  assert.equal('streetRate' in (await plan(r)), false);
});

test('Korund only: a citizen who traded then left Korund gets no field or query', async t => {
  const r = await setup(t); await trade(r);
  await r.db.prepare("UPDATE citizens SET nation_id='kindle' WHERE clerk_user_id='alice'").run();
  assert.equal((await plan(r))?.streetRate, undefined);
  assert.equal((await sqlDuring(r, () => plan(r))).filter(isHeardQuery).length, 0);
});

test('GET makes no writes', async t => {
  const r = await setup(t); await trade(r); await plan(r);
  const sql = await sqlDuring(r, async () => { for (let i = 0; i < 3; i++) await plan(r); });
  assert.ok(sql.some(isHeardQuery)); assert.deepEqual(sql.filter(isWrite), []);
});

test('12.10: the street rate is never read by a settlement, conversion or command path', async () => {
  const importers = [];
  for (const dir of ['lib', 'app/api']) for (const f of await readdir(new URL(`../${dir}/`, import.meta.url), { recursive: true }))
    if (/\.tsx?$/.test(f) && /wallet-street-rate/.test(await readFile(new URL(`../${dir}/${f}`, import.meta.url), 'utf8'))) importers.push(`${dir}/${f}`);
  assert.deepEqual(importers.sort(), ['lib/korund.ts'], 'only the Korund read model imports it');
  const korund = await readFile(new URL('../lib/korund.ts', import.meta.url), 'utf8');
  const exec = korund.slice(korund.indexOf('export async function executeKorund'));
  assert.doesNotMatch(exec, /readWalletStreetRate|streetRate/, 'executeKorund never reads it');
  assert.equal((korund.match(/readWalletStreetRate\(/g) ?? []).length, 1);
  const panel = await readFile(new URL('../app/korund-plan-panel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /\{plan\.streetRate && /); assert.match(panel, /walletStreetRateLine\(plan\.streetRate\.rumoredRate\)/);
});

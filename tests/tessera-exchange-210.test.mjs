/** #210: the Clearing House kiosk is the citizen Tessera source (docs 12.5 / 12.8), replacing the 50 TSR starter grant. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';

const kiosk = (r, user, tesseraMinor, requestId = randomUUID(), origin) => r.call('world/registry', user, { action: 'buy-tessera', tesseraMinor, requestId }, origin);
const ledgerTessera = async (r, user) => (await r.call('world/registry', user)).data.tesseraMinor;
async function earn(r, user) { // one real Kindle harvest shift: 800 SPK minor
  await r.call('citizen', user, { action: 'commit-work', workOrderId: 'harvest' });
  const shift = (await r.call('citizen', user)).data.shifts.find(s => !s.claimedAt); r.setNow(Date.parse(shift.completesAt));
  assert.equal((await r.call('citizen', user, { action: 'claim-work', shiftId: shift.id })).status, 200);
  return (await r.call('citizen', user)).data.economy.walletMinor;
}
async function runtime(t) { const r = await localRuntime(); t.after(() => r.close()); r.setSquarePurchase(true); r.setTesseraExchange(true); return r; } // #626: the exchange has its own flag (the squares test below needs both)

test('a Kindle citizen earns Tessera at the kiosk: SPK debit and TSR credit at the official rate, recorded and shown in the wallet', async t => {
  const r = await runtime(t);
  const spark = await earn(r, 'alice');
  const res = await kiosk(r, 'alice', 100);
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(res.data.boughtTesseraMinor, 100); assert.equal(res.data.costSparkMinor, 400, '1 SPK = 0.25 TSR');
  assert.equal(res.data.tesseraMinor, 100); assert.equal(res.data.sparkMinor, spark - 400);
  const row = await r.db.prepare('SELECT clerk_user_id,nation_id,spark_minor,tessera_minor FROM citizen_tessera_exchanges').first();
  assert.deepEqual({ ...row }, { clerk_user_id: 'alice', nation_id: 'kindle', spark_minor: 400, tessera_minor: 100 });
  assert.equal(await ledgerTessera(r, 'alice'), 100);
  const economy = (await r.call('citizen', 'alice')).data.economy;
  assert.equal(economy.tesseraMinor, 100); assert.equal(economy.walletMinor, spark - 400);
  const tx = economy.transactions.find(x => x.kind === 'tessera-buy');
  assert.equal(tx.amountMinor, -400); assert.equal(tx.reason, 'Clearing House kiosk · bought 1.00 TSR · paid 4.00 SPK', "Content's #325 history row, amount and cost with units");
  assert.equal(economy.transactions.reduce((a, x) => a + x.amountMinor, 0), economy.walletMinor, 'history reconciles with the balance');
});

test('kiosk Tessera buys a World Registry square; no starter grant is involved', async t => {
  const r = await runtime(t);
  await r.db.prepare("INSERT INTO citizen_economy_events(id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES ('seed','alice','sell','food',-1,10000,0)").run();
  assert.equal((await kiosk(r, 'alice', 2500)).status, 200);
  assert.equal((await r.call('world/registry', 'alice', { action: 'buy-square', x: 9, y: 8, requestId: randomUUID() })).status, 200);
  assert.equal(await ledgerTessera(r, 'alice'), 0);
  assert.equal(Number((await r.db.prepare("SELECT COUNT(*) AS n FROM citizen_tessera_ledger WHERE reason='starter-grant'").first()).n), 0);
});

test('insufficient Spark, replay, request reuse, concurrency: never double-credits or overdraws', async t => {
  const r = await runtime(t);
  const spark = await earn(r, 'alice'); // 800 SPK minor buys at most 200 TSR minor
  const broke = await kiosk(r, 'alice', 300);
  assert.equal(broke.status, 409); assert.equal(broke.data.reason, 'insufficient_spark'); assert.match(broke.data.error, /3\.00 TSR costs 12\.00 SPK; you hold 8\.00 SPK/);
  const id = randomUUID();
  const [a, b] = await Promise.all([kiosk(r, 'alice', 100, id), kiosk(r, 'alice', 100, id)]);
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  assert.equal((await kiosk(r, 'alice', 100, id)).data.replay, true);
  assert.equal((await kiosk(r, 'alice', 200, id)).data.reason, 'request_reused');
  assert.equal((await kiosk(r, 'bob', 100, id)).data.reason, 'request_reused');
  assert.equal(await ledgerTessera(r, 'alice'), 100, 'one credit for one request id');
  const race = await Promise.all([kiosk(r, 'alice', 100), kiosk(r, 'alice', 100)]); // 400 SPK left: room for exactly one
  assert.deepEqual(race.map(x => x.status).sort(), [200, 409]);
  const economy = (await r.call('citizen', 'alice')).data.economy;
  assert.equal(economy.walletMinor, spark - 800); assert.ok(economy.walletMinor >= 0); assert.equal(economy.tesseraMinor, 200);
});

test('gate, nation rules, validation and origin', async t => {
  const r = await runtime(t);
  await earn(r, 'alice');
  r.setTesseraExchange(false); assert.equal((await kiosk(r, 'alice', 100)).data.reason, 'disabled'); r.setTesseraExchange(true);
  await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='bob'").run();
  const korund = await kiosk(r, 'bob', 100); assert.equal(korund.status, 403); assert.equal(korund.data.reason, 'non_convertible');
  await r.db.prepare("UPDATE citizens SET nation_id='aurelle' WHERE clerk_user_id='bob'").run();
  assert.equal((await kiosk(r, 'bob', 100)).data.reason, 'no_kiosk');
  assert.equal((await kiosk(r, 'nobody', 100)).data.reason, 'no_kiosk');
  for (const amount of [0, 99, 10001, 1.5, '100', -100]) assert.equal((await kiosk(r, 'alice', amount)).status, 400, String(amount));
  assert.equal((await kiosk(r, 'alice', 100, 'x')).status, 400);
  assert.equal((await kiosk(r, 'alice', 100, randomUUID(), 'https://foreign.invalid')).status, 403);
  assert.equal((await r.call('world/registry', null, { action: 'buy-tessera', tesseraMinor: 100, requestId: randomUUID() })).status, 401);
  assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM citizen_tessera_exchanges').first()).n), 0, 'nothing written by any rejection');
  const listing = (await r.call('world/registry', 'alice')).data;
  assert.deepEqual(listing.kiosk, { open: true, sparkPerTessera: 4, minTesseraMinor: 100, maxTesseraMinor: 10000 });
});

test('the placeholder grant is removed from code; the wallet panel offers the kiosk only while it is open', async () => {
  const registry = await readFile(new URL('../lib/world-registry.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(registry, /TEMP_STARTER_GRANT|'starter-grant',\?/);
  const panel = await readFile(new URL('../app/wallet-panel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /@\/lib\/kiosk-text/); assert.doesNotMatch(panel, /Currency exchange is not available yet/);
  const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /onBuyTessera=\{kioskOpen \? buyTessera : undefined\}/);
});

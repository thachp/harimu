/** #210 follow-up: Content's #325 Clearing House copy is wired into the wallet kiosk, receipts, refusals and history.
 *  Values are pre-formatted strings with units ("5.00 TSR", "20.00 SPK"); the copy adds no unit after them. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { localRuntime } from './helpers/local-runtime.mjs';
import { loadApp, componentModule } from './helpers/component-module.mjs';
import { describeTransaction } from '../lib/wallet.ts';
import { sparkPerTessera, kioskMinTesseraMinor, kioskMaxTesseraMinor } from '../lib/tessera-exchange.ts';
import { readFile } from 'node:fs/promises';

const text = html => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');
const K = await import(await componentModule(new URL('../lib/kiosk-text.ts', import.meta.url).pathname));
const { WalletPanel } = await loadApp('wallet-panel');
const noop = () => {};
const panel = props => text(renderToStaticMarkup(React.createElement(WalletPanel, { sparkMinor: 5000, tesseraMinor: 0, transactions: [], onClose: noop, ...props })));
const kiosk = (r, user, tesseraMinor, requestId = randomUUID()) => r.call('world/registry', user, { action: 'buy-tessera', tesseraMinor, requestId });

test('formatters carry units and stay within the 24-character placeholder cap', () => {
  assert.equal(K.tsr(500), '5.00 TSR'); assert.equal(K.spk(2000), '20.00 SPK');
  assert.equal(K.kioskBuyLabel(500), 'Buy 5.00 TSR');
  assert.equal(K.kioskRateLine(0.25), 'Official rate: 1 SPK = 0.25 TSR');
  assert.equal(K.kioskReceipt(500, 2000), 'Bought 5.00 TSR at the Clearing House kiosk for 20.00 SPK.');
  assert.equal(K.kioskHistoryRow(500, 2000), 'Clearing House kiosk · bought 5.00 TSR · paid 20.00 SPK');
  assert.equal(K.kioskHistoryRow(500, -2000), 'Clearing House kiosk · bought 5.00 TSR · paid 20.00 SPK', 'a debit is shown as the amount paid');
  for (const v of [K.tsr(10000), K.spk(400000), 'Official rate: 1 SPK = 0.25 TSR'.slice(15)]) assert.ok(v.length <= 24, v);
  for (const t of [K.kioskReceipt(500, 2000), K.kioskHistoryRow(500, 2000), K.kioskBuyLabel(100)]) assert.doesNotMatch(t, /\{|TSR (TSR|SPK)|SPK (TSR|SPK)/, t);
});

test('the wallet kiosk shows #325 copy: header, explainer, official rate, buy buttons with amount and cost, coming-soon line', () => {
  const open = panel({ onBuyTessera: async () => null });
  assert.match(open, /Clearing House kiosk/);
  assert.match(open, /Tessera is the neutral unit for world trade and land\. Buy it here with Spark\. The Clearing House runs on system rules, with no officials\./);
  assert.match(open, /Official rate: 1 SPK = 0\.25 TSR/);
  for (const [amount, cost] of [['1.00 TSR', '4.00 SPK'], ['5.00 TSR', '20.00 SPK'], ['25.00 TSR', '100.00 SPK']]) assert.match(open, new RegExp(`Buy ${amount.replace('.', '\\.')} · ${cost.replace('.', '\\.')}`));
  assert.match(open, /Converting back, and Crown, are coming soon\./);
  assert.doesNotMatch(open, /No fee in this preview|Buy Tessera with Spark at the official rate/);
});

test('kiosk closed: the panel shows the #325 closed line', () => {
  assert.match(panel({}), /The Clearing House kiosk is closed right now\./);
  assert.doesNotMatch(panel({}), /not open yet/);
});

test('real refusals map to the #325 refusal lines with pre-formatted values', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const values = { amount: K.tsr(500), cost: K.spk(2000), min: K.tsr(100), max: K.tsr(10000) };
  // Flag off: closed.
  const closed = await kiosk(r, 'alice', 500);
  assert.equal(closed.data.reason, 'disabled'); assert.equal(K.kioskRefusal(closed.data.reason, values), 'The Clearing House kiosk is closed right now.');
  r.setSquarePurchase(true);
  // No Spark yet: insufficient.
  const poor = await kiosk(r, 'alice', 500);
  assert.equal(poor.data.reason, 'insufficient_spark'); assert.equal(K.kioskRefusal(poor.data.reason, values), 'You do not have enough Spark for 5.00 TSR.');
  // Out of range (server validation).
  const range = await kiosk(r, 'alice', 1);
  assert.equal(range.status, 400); assert.equal(range.data.reason, 'out_of_range'); assert.equal(K.kioskRefusal(range.data.reason, values), 'That amount is out of range. Choose between 1.00 TSR and 100.00 TSR.');
  // A missing request id is not an amount problem: it must not say "out of range".
  const noId = await r.call('world/registry', 'alice', { action: 'buy-tessera', tesseraMinor: 500 });
  assert.equal(noId.status, 400); assert.equal(noId.data.reason, 'bad_request');
  assert.equal(K.kioskRefusal(noId.data.reason, values), 'The kiosk could not read that request. Try again.'); assert.doesNotMatch(K.kioskRefusal(noId.data.reason, values), /range|Choose/);
  assert.equal((await r.call('world/registry', 'alice', { action: 'buy-tessera', tesseraMinor: 500, requestId: 'x' })).data.reason, 'bad_request');
  assert.equal((await r.call('world/registry', 'alice', { action: 'buy-tessera', tesseraMinor: 1.5, requestId: randomUUID() })).data.reason, 'out_of_range');
  // Korund: State Media notice, never the Kindle kiosk.
  await r.call('citizen', 'bob'); await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='bob'").run();
  const korund = await kiosk(r, 'bob', 500);
  assert.equal(korund.data.reason, 'non_convertible'); assert.match(K.kioskRefusal(korund.data.reason, values), /^Korund State Media: The Labor Note cannot be converted\./);
  // Another nation: no kiosk yet.
  await r.call('citizen', 'carol'); await r.db.prepare("UPDATE citizens SET nation_id='aurelle' WHERE clerk_user_id='carol'").run();
  const other = await kiosk(r, 'carol', 500);
  assert.equal(other.data.reason, 'no_kiosk'); assert.equal(K.kioskRefusal(other.data.reason, values), 'No Clearing House kiosk serves your nation yet.');
  assert.equal(K.kioskRefusal('request_reused', values), null, 'unmapped reasons keep the server message');
  assert.equal(K.kioskRefusal(undefined, values), null);
});

test('wallet history shows the #325 row with amount and cost after a real purchase; the fallback formatter is only for direct callers', async t => {
  const r = await localRuntime(); t.after(() => r.close()); r.setSquarePurchase(true);
  await r.call('citizen', 'alice', { action: 'commit-work', workOrderId: 'harvest' });
  const shift = (await r.call('citizen', 'alice')).data.shifts.find(s => !s.claimedAt); r.setNow(Date.parse(shift.completesAt));
  assert.equal((await r.call('citizen', 'alice', { action: 'claim-work', shiftId: shift.id })).status, 200);
  assert.equal((await kiosk(r, 'alice', 100)).status, 200);
  const tx = (await r.call('citizen', 'alice')).data.economy.transactions.find(x => x.kind === 'tessera-buy');
  assert.equal(tx.reason, 'Clearing House kiosk · bought 1.00 TSR · paid 4.00 SPK');
  assert.match(panel({ transactions: [tx] }), /Clearing House kiosk · bought 1\.00 TSR · paid 4\.00 SPK/);
  assert.equal(describeTransaction({ id: 'x', kind: 'tessera-buy', amount_minor: -400, item: null, quantity: 100, occurred_at: 0 }), 'Clearing House kiosk · bought 1.00 TSR');
});

test('the client fallback kiosk numbers (4 / 100 / 10000) are pinned to lib/tessera-exchange, so they cannot drift', async () => {
  assert.deepEqual([sparkPerTessera, kioskMinTesseraMinor, kioskMaxTesseraMinor], [4, 100, 10000]);
  const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  const fallback = page.match(/kioskRules = useRef\(\{ minTesseraMinor: (\d+), maxTesseraMinor: (\d+), sparkPerTessera: (\d+) \}\)/);
  assert.ok(fallback, 'page keeps a fallback until the registry GET answers');
  assert.deepEqual(fallback.slice(1).map(Number), [kioskMinTesseraMinor, kioskMaxTesseraMinor, sparkPerTessera]);
  const panel = await readFile(new URL('../app/wallet-panel.tsx', import.meta.url), 'utf8');
  const offers = JSON.parse(panel.match(/kioskOffers = (\[[\d, ]+\])/)[1]);
  for (const offer of offers) assert.ok(offer >= kioskMinTesseraMinor && offer <= kioskMaxTesseraMinor, `offer ${offer} is inside the server range`);
  assert.ok(Math.abs(1 / sparkPerTessera - 0.25) < 1e-9, 'matches the 0.25 TSR per SPK display rate');
});

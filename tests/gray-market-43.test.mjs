/** #43 Korund gray market PoC: smuggled foreign cash (FC) <-> Labor Notes (LN) offers, flag off by default, Korund only. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';
import { componentModule } from './helpers/component-module.mjs';
import { validGrayOffer, grayCashFor, rumoredRate, graySeed, GRAY_AMOUNT_CAP_MINOR, GRAY_OFFER_LIFETIME_SECONDS, GRAY_STARTING_GRANT_MINOR, GRAY_RUMOR_WINDOW_SECONDS, GAME_DAY_SECONDS, GRAY_RUMOR_NOISE, GRAY_RUMOR_NUDGE, GRAY_RATE_MAX, GRAY_RATE_MIN } from '../lib/gray-market-rules.ts';
import { laborNoteSql, laborNoteBinds, laborNoteParams } from '../lib/korund-wallet.ts';

async function gray(t, on = true) {
  const r = await localRuntime(); t.after(() => r.close());
  await r.db.prepare("UPDATE citizens SET nation_id='korund'").run(); await r.call('world', null);
  r.setFixtureEnv('HARIMU_GRAY_MARKET_ENABLED', on ? 'true' : undefined);
  return r;
}
const post = (r, user, amountMinor, askRate, requestId = randomUUID()) => r.call('citizen', user, { action: 'korund-gray-post-offer', requestId, amountMinor, askRate });
const accept = (r, user, offerId, requestId = randomUUID()) => r.call('citizen', user, { action: 'korund-gray-accept-offer', requestId, offerId });
const view = async (r, user) => (await r.call('citizen', user)).data.korundPlan;
const count = async (r, table, where = '') => Number((await r.db.prepare(`SELECT COUNT(*) AS n FROM ${table} ${where}`).first()).n);
async function shift(r, user) {
  const id = randomUUID(); assert.equal((await r.call('citizen', user, { action: 'korund-start-work', requestId: id })).status, 200);
  r.setNow(r.now + 7200 * 1000); assert.equal((await r.call('citizen', user, { action: 'korund-claim-work', shiftId: id })).status, 200);
}

test('rules: offer terms are whole numbers inside the cap; the FC price is fixed from amount and rate', () => {
  assert.deepEqual(validGrayOffer({ amountMinor: 500, askRate: 110 }), { amountMinor: 500, askRate: 110 });
  assert.equal(GRAY_AMOUNT_CAP_MINOR, 5000);
  for (const bad of [{ amountMinor: 0, askRate: 100 }, { amountMinor: 5001, askRate: 100 }, { amountMinor: 1.5, askRate: 100 }, { amountMinor: '5', askRate: 100 }, { amountMinor: 100, askRate: 0 }, { amountMinor: 100, askRate: 10001 }, { amountMinor: 100 }, {}])
    assert.equal(validGrayOffer(bad), null, JSON.stringify(bad));
  assert.equal(grayCashFor(500, 100), 500); assert.equal(grayCashFor(500, 110), 550); assert.equal(grayCashFor(1, 1), 1, 'rounded up to a whole minor unit');
  assert.equal(GRAY_OFFER_LIFETIME_SECONDS, 2 * GAME_DAY_SECONDS, 'offers last 2 game days (2 real hours each)'); assert.equal(GRAY_STARTING_GRANT_MINOR, 1000);
});

test('rules: no rumor until a trade; then the noisy average of the last 5 trades within 7 game days, never exactly the last price', () => {
  const now = 1_000_000, point = (i, askRate, ago) => ({ offerId: `offer-${i}`, askRate, tradedAt: now - ago });
  assert.equal(rumoredRate([], now), null);
  assert.equal(rumoredRate([point(1, 100, GRAY_RUMOR_WINDOW_SECONDS + 1)], now), null, 'a trade older than 7 game days is forgotten');
  assert.ok(rumoredRate([point(1, 100, GRAY_RUMOR_WINDOW_SECONDS)], now) !== null, 'on the edge still counts');
  // many seeds: always within +/-10% of the average (plus the one-step nudge), and never the last price
  for (let i = 0; i < 300; i++) {
    const at = now + i * GAME_DAY_SECONDS, ptAt = (j, askRate, ago) => ({ offerId: `offer-${j}`, askRate, tradedAt: at - ago });
    const trades = [ptAt(i, 100 + (i % 7), 10), ptAt(i + 1000, 120, 20), ptAt(i + 2000, 140, 30)];
    const average = (trades[0].askRate + 120 + 140) / 3, rate = rumoredRate(trades, at);
    assert.ok(rate >= Math.floor(average * 0.9) - 1 && rate <= Math.ceil(average * 1.1) + 1, `${rate} vs ${average}`);
    assert.notEqual(rate, trades[0].askRate, 'never exactly the last trade');
  }
  const six = [...Array(6)].map((_, i) => point(i, i === 5 ? 9000 : 100, i * 10));
  const r1 = rumoredRate(six, now); assert.ok(r1 < 200, 'only the latest 5 trades are averaged (the 6th, 9000, is ignored)');
  assert.equal(rumoredRate(six, now), r1, 'deterministic: the same inputs give the same rumor (seeded noise)');
  assert.equal(graySeed('a'), graySeed('a')); assert.notEqual(graySeed('a'), graySeed('b'));
  const spread = new Set([...Array(40)].map((_, i) => rumoredRate([point(1, 1000, 10)], now + i * GAME_DAY_SECONDS))); assert.ok(spread.size > 5, 'the noise varies by game day');
});

test('rumor nudge (QA1): with one trade, when the noisy figure lands exactly on the trade rate it is moved by at least 1% (floor 1); disabling the nudge fails this test', () => {
  const now = 5_000_000, unnudged = (offerId, askRate, at) => Math.max(1, Math.round(askRate * (1 + GRAY_RUMOR_NOISE * (2 * (graySeed(`${offerId}:${Math.floor(at / GAME_DAY_SECONDS)}`) / 0x100000000) - 1))));
  const hits = [];
  for (const askRate of [2, 5, 9, 100, 5000]) for (let day = 0; day < 400; day++) {
    const at = now + day * GAME_DAY_SECONDS, trade = { offerId: 'only-trade', askRate, tradedAt: at - 60 };
    if (unnudged('only-trade', askRate, at) === askRate) hits.push({ askRate, at, trade });
  }
  assert.ok(hits.length >= 10, `the branch is reachable (${hits.length} hits)`);
  for (const { askRate, at, trade } of hits) {
    const rumor = rumoredRate([trade], at), step = Math.max(1, Math.round(askRate * GRAY_RUMOR_NUDGE));
    assert.notEqual(rumor, askRate, `rate ${askRate}: never exactly the one trade's rate`);
    assert.equal(Math.abs(rumor - askRate), step, `rate ${askRate}: moved by max(1, 1% of the rate)`); assert.ok(rumor >= 1);
  }
});

test('rumored rate is clamped to the offer rate range, even for trades at the limits', () => {
  for (const askRate of [GRAY_RATE_MAX, GRAY_RATE_MAX - 1, GRAY_RATE_MIN]) for (let day = 0; day < 300; day++) {
    const at = 1_000_000 + day * GAME_DAY_SECONDS, rumor = rumoredRate([{ offerId: `edge-${askRate}`, askRate, tradedAt: at - 60 }], at);
    assert.ok(rumor >= GRAY_RATE_MIN && rumor <= GRAY_RATE_MAX, `rate ${askRate} day ${day}: ${rumor}`);
    assert.notEqual(rumor, askRate, 'a single trade is never echoed back');
  }
});

test('flag off (code default; the preview wrangler value is "true"): nothing visible, actions 404, no rows', async t => {
  const r = await gray(t, false);
  const plan = await view(r, 'alice');
  assert.equal(plan.gray, undefined); assert.equal(plan.available, true);
  for (const body of [{ action: 'korund-gray-post-offer', requestId: randomUUID(), amountMinor: 100, askRate: 100 }, { action: 'korund-gray-accept-offer', requestId: randomUUID(), offerId: randomUUID() }]) {
    const res = await r.call('citizen', 'alice', body); assert.equal(res.status, 404); assert.equal(res.data.reason, 'disabled'); assert.equal(res.data.korundPlan.gray, undefined);
  }
  for (const table of ['gray_offers', 'gray_trades', 'gray_cash_grants']) assert.equal(await count(r, table), 0, table);
  await shift(r, 'alice'); assert.equal((await view(r, 'alice')).walletMinor, 800, 'Korund work and wallet are untouched');
  const cfg = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.deepEqual([...cfg.matchAll(/"HARIMU_GRAY_MARKET_ENABLED"\s*:\s*"([^"]*)"/g)].map(x => x[1]), ['true']);
});

test('Korund citizens only: a Kindle citizen sees no gray market and is rejected', async t => {
  const r = await gray(t);
  await r.db.prepare("UPDATE citizens SET nation_id='kindle' WHERE clerk_user_id='bob'").run();
  assert.ok((await view(r, 'alice')).gray, 'a Korund citizen has it'); assert.equal((await view(r, 'bob')).gray, undefined, 'a Kindle citizen does not');
  const rejected = await post(r, 'bob', 100, 100); assert.equal(rejected.status, 403); assert.equal(rejected.data.reason, 'korund_only');
  assert.equal((await accept(r, 'bob', randomUUID())).status, 403);
  for (const table of ['gray_offers', 'gray_trades', 'gray_cash_grants']) assert.equal(await count(r, table), 0, table);
});

test('reads never write: the starting grant is shown as pending, and recorded once by the first action', async t => {
  const r = await gray(t);
  const first = (await view(r, 'alice')).gray;
  assert.equal(first.cashMinor, GRAY_STARTING_GRANT_MINOR); assert.equal(first.grantPending, true); assert.equal(first.rumoredRate, null); assert.deepEqual(first.offers, []); assert.equal(first.myOffer, null);
  await view(r, 'alice'); await view(r, 'bob');
  for (const table of ['gray_offers', 'gray_trades', 'gray_cash_grants']) assert.equal(await count(r, table), 0, `reads wrote to ${table}`);
  await shift(r, 'alice');
  assert.equal((await post(r, 'alice', 300, 100)).status, 200);
  assert.equal(await count(r, 'gray_cash_grants'), 1);
  const after = (await view(r, 'alice')).gray; assert.equal(after.grantPending, false); assert.equal(after.cashMinor, GRAY_STARTING_GRANT_MINOR);
  const refused = await post(r, 'alice', 100, 100); assert.equal(refused.status, 409); assert.equal(await count(r, 'gray_cash_grants'), 1, 'one grant per citizen, ever');
  assert.equal((await view(r, 'alice')).walletMinor, 800, 'the grant is FC: it never adds Labor Notes');
});

test('post and accept: both balances update, the rumor appears, and it is not exactly the trade price', async t => {
  const r = await gray(t);
  await shift(r, 'alice');                                   // alice: 8.00 LN
  const offerId = randomUUID();
  const posted = await post(r, 'alice', 500, 120, offerId); assert.equal(posted.status, 200, JSON.stringify(posted.data));
  const mine = posted.data.korundPlan.gray.myOffer; assert.equal(mine.status, 'open'); assert.equal(mine.amountMinor, 500); assert.equal(mine.askRate, 120); assert.equal(mine.cashMinor, 600);
  const board = (await view(r, 'bob')).gray; assert.deepEqual(board.offers.map(o => [o.id, o.amountMinor, o.askRate, o.cashMinor]), [[offerId, 500, 120, 600]]);
  assert.equal(board.rumoredRate, null, 'no rumor before a trade'); assert.equal((await view(r, 'alice')).gray.offers.length, 0, 'your own offer is not on your board');
  const accepted = await accept(r, 'bob', offerId); assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
  const [a, b] = [(await view(r, 'alice')), (await view(r, 'bob'))];
  assert.equal(a.walletMinor, 300); assert.equal(b.walletMinor, 500, 'LN moved from poster to buyer');
  assert.equal(a.gray.cashMinor, GRAY_STARTING_GRANT_MINOR + 600); assert.equal(b.gray.cashMinor, GRAY_STARTING_GRANT_MINOR - 600, 'FC moved from buyer to poster');
  assert.equal(a.gray.myOffer.status, 'accepted'); assert.deepEqual(b.gray.offers, [], 'a taken offer leaves the board');
  assert.ok(Number.isInteger(a.gray.rumoredRate) && a.gray.rumoredRate > 0); assert.notEqual(a.gray.rumoredRate, 120, 'the rumor is not exactly the last trade price');
  assert.ok(Math.abs(a.gray.rumoredRate - 120) <= 13, 'but it stays near it (+/-10%)');
  assert.equal(await count(r, 'gray_trades'), 1);
  assert.equal(b.gray.cashMinor + a.gray.cashMinor, 2 * GRAY_STARTING_GRANT_MINOR, 'FC is only moved between the two, never created or converted');
});

test('offer rules: one open offer per citizen, the cap, enough Labor Notes, not your own, enough FC', async t => {
  const r = await gray(t);
  await shift(r, 'alice');
  for (const [amount, rate] of [[0, 100], [5001, 100], [100, 0], [100.5, 100]]) { const res = await post(r, 'alice', amount, rate); assert.equal(res.status, 400); assert.equal(res.data.reason, 'out_of_range'); }
  assert.equal(await count(r, 'gray_offers'), 0);
  const poor = await post(r, 'bob', 100, 100); assert.equal(poor.status, 409); assert.equal(poor.data.reason, 'insufficient_ln', 'bob holds no Labor Notes');
  const tooMany = await post(r, 'alice', 900, 100); assert.equal(tooMany.data.reason, 'insufficient_ln');
  const offerId = randomUUID(); assert.equal((await post(r, 'alice', 800, 100, offerId)).status, 200);
  const second = await post(r, 'alice', 100, 100); assert.equal(second.status, 409); assert.equal(second.data.reason, 'offer_open'); assert.equal(await count(r, 'gray_offers'), 1);
  const own = await accept(r, 'alice', offerId); assert.equal(own.status, 409); assert.equal(own.data.reason, 'own_offer');
  assert.equal((await accept(r, 'bob', randomUUID())).status, 404, 'unknown offer');
  // a buyer who cannot cover the FC price is refused and nothing changes
  const dear = randomUUID(); await r.db.prepare('DELETE FROM gray_offers').run(); assert.equal((await post(r, 'alice', 800, 10000, dear)).status, 200);
  const short = await accept(r, 'bob', dear); assert.equal(short.status, 409); assert.equal(short.data.reason, 'insufficient_cash'); assert.equal(await count(r, 'gray_trades'), 0);
  assert.equal((await view(r, 'alice')).walletMinor, 800);
});

test('offers expire lazily after 2 game days: reads only filter, the row stays, the poster may post again', async t => {
  const r = await gray(t);
  await shift(r, 'alice');
  const offerId = randomUUID(); assert.equal((await post(r, 'alice', 400, 100, offerId)).status, 200);
  r.setNow(r.now + (GRAY_OFFER_LIFETIME_SECONDS - 60) * 1000); assert.equal((await view(r, 'bob')).gray.offers.length, 1, 'still open just before it expires');
  r.setNow(r.now + 120 * 1000);
  const late = (await view(r, 'bob')).gray; assert.equal(late.offers.length, 0, 'expired offers drop off the board');
  assert.equal((await view(r, 'alice')).gray.myOffer.status, 'expired'); assert.equal(await count(r, 'gray_offers'), 1, 'the read did not delete or change the row');
  const tooLate = await accept(r, 'bob', offerId); assert.equal(tooLate.status, 409); assert.equal(tooLate.data.reason, 'expired'); assert.equal(await count(r, 'gray_trades'), 0);
  assert.equal((await post(r, 'alice', 400, 100)).status, 200, 'an expired offer no longer blocks a new one'); assert.equal(await count(r, 'gray_offers'), 2);
});

test('idempotent request ids: replays change nothing, a foreign or cross-used id is request_reused (409)', async t => {
  const r = await gray(t);
  await shift(r, 'alice'); await shift(r, 'bob');
  const offerId = randomUUID();
  assert.equal((await post(r, 'alice', 300, 100, offerId)).status, 200);
  const replay = await post(r, 'alice', 300, 100, offerId); assert.equal(replay.status, 200); assert.equal(replay.data.replayed, true); assert.equal(await count(r, 'gray_offers'), 1);
  const changed = await post(r, 'alice', 4000, 900, offerId); assert.equal(changed.status, 200, 'a retry never rewrites the terms'); assert.equal((await view(r, 'alice')).gray.myOffer.amountMinor, 300);
  const stolen = await post(r, 'bob', 300, 100, offerId); assert.equal(stolen.status, 409); assert.equal(stolen.data.reason, 'request_reused');
  const acceptId = randomUUID();
  assert.equal((await accept(r, 'bob', offerId, acceptId)).status, 200);
  const again = await accept(r, 'bob', offerId, acceptId); assert.equal(again.status, 200); assert.equal(again.data.replayed, true); assert.equal(await count(r, 'gray_trades'), 1);
  assert.equal((await view(r, 'bob')).walletMinor, 800 + 300, 'a replayed accept does not pay twice');
  const other = await accept(r, 'alice', offerId, acceptId); assert.equal(other.status, 409); assert.equal(other.data.reason, 'request_reused');
  assert.equal((await post(r, 'bob', 100, 100, acceptId)).data.reason, 'request_reused', 'an accept id cannot be reused as an offer id');
  assert.equal((await accept(r, 'alice', randomUUID(), offerId)).data.reason, 'request_reused', 'an offer id cannot be reused as an accept id');
  assert.equal((await post(r, 'bob', 100, 100, 'x')).status, 400, 'a request id must be a UUID');
});

const addCitizen = (r, user) => r.db.prepare(`INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at)
  VALUES (?,'korund',?,18,1240,'Good standing',?,?)`).bind(user, `Private ${user}`, new Date(r.now).toISOString(), new Date(r.now).toISOString()).run();

test('race-safe accept: two buyers take one offer at once and exactly one trade settles; the unique index backs it', async t => {
  const r = await gray(t); await addCitizen(r, 'carol');
  await shift(r, 'alice');
  const offerId = randomUUID(); assert.equal((await post(r, 'alice', 500, 100, offerId)).status, 200);
  const results = await Promise.all([accept(r, 'bob', offerId), accept(r, 'carol', offerId)]);
  assert.deepEqual(results.map(x => x.status).sort(), [200, 409], JSON.stringify(results.map(x => x.data.reason)));
  assert.equal(results.find(x => x.status === 409).data.reason, 'taken');
  assert.equal(await count(r, 'gray_trades'), 1, 'one trade per offer');
  const buyers = (await view(r, 'bob')).walletMinor + (await view(r, 'carol')).walletMinor; assert.equal(buyers, 500, 'only one buyer received the 5.00 LN');
  assert.equal((await view(r, 'alice')).walletMinor, 300, 'alice gave 5.00 LN once');
  const fc = (await Promise.all(['alice', 'bob', 'carol'].map(u => view(r, u)))).reduce((sum, p) => sum + p.gray.cashMinor, 0);
  assert.equal(fc, 3 * GRAY_STARTING_GRANT_MINOR, 'FC is only moved, never created');
  await assert.rejects(r.db.prepare('INSERT INTO gray_trades(offer_id,request_id,seller_id,buyer_id,amount_minor,cash_minor,ask_rate,traded_at) VALUES (?,?,?,?,1,1,100,1)').bind(offerId, randomUUID(), 'alice', 'carol').run(), /UNIQUE|unique|constraint|duplicate|23505/i);
});

test('race-safe FC: one buyer cannot overdraw FC by accepting two offers at once, and one poster cannot hold two open offers', async t => {
  const r = await gray(t); await addCitizen(r, 'carol');
  await shift(r, 'alice'); await shift(r, 'carol');
  const o1 = randomUUID(), o2 = randomUUID();
  assert.equal((await post(r, 'alice', 800, 100, o1)).status, 200); assert.equal((await post(r, 'carol', 800, 100, o2)).status, 200);   // each costs 8.00 FC; bob holds 10.00
  const both = await Promise.all([accept(r, 'bob', o1), accept(r, 'bob', o2)]);
  assert.equal(both.filter(x => x.status === 200).length, 1, 'only one of the two fits in bob\'s 10.00 FC'); assert.equal(await count(r, 'gray_trades'), 1);
  assert.ok((await view(r, 'bob')).gray.cashMinor >= 0);
  // concurrent posts by one citizen: at most one stays open
  const d = await gray(t); await shift(d, 'alice');
  const posts = await Promise.all([post(d, 'alice', 100, 100), post(d, 'alice', 200, 100), post(d, 'alice', 300, 100)]);
  assert.ok(posts.filter(x => x.status === 200).length <= 1); assert.ok(await count(d, 'gray_offers') <= 1, 'never two open offers');
});

test('the LN formula is shared: Labor Notes sold cannot be spent on coupons, Labor Notes bought can', async t => {
  const r = await gray(t);
  await shift(r, 'alice');                                    // alice 8.00 LN
  const offerId = randomUUID(); assert.equal((await post(r, 'alice', 700, 100, offerId)).status, 200);
  assert.equal((await accept(r, 'bob', offerId)).status, 200);  // alice 1.00 LN, bob 7.00 LN
  const spend = (user, coupon) => r.call('citizen', user, { action: 'korund-redeem-coupon', requestId: randomUUID(), coupon });
  const broke = await spend('alice', 'clothing'); assert.equal(broke.status, 409, 'alice sold her Labor Notes: 1.00 LN left cannot pay 2.00 LN');
  assert.equal((await view(r, 'alice')).walletMinor, 100);
  const bought = await spend('bob', 'clothing'); assert.equal(bought.status, 200, 'bob never worked a shift, but the Labor Notes he bought pay the coupon');
  assert.equal((await view(r, 'bob')).walletMinor, 500, 'wallet = wages - coupons + trades, in one formula');
  assert.equal(await count(r, 'korund_settlements', "WHERE clerk_user_id='bob'"), 0);
});

test('static: one shared LN function; no inline copy of the wage-minus-coupons formula in korund.ts or korund-coupons.ts', async () => {
  const korund = await readFile(new URL('../lib/korund.ts', import.meta.url), 'utf8'), coupons = await readFile(new URL('../lib/korund-coupons.ts', import.meta.url), 'utf8');
  for (const [name, text] of [['korund.ts', korund], ['korund-coupons.ts', coupons]]) {
    if (name === 'korund.ts') { assert.match(text, /from '\.\/korund-wallet'/, name); assert.match(text, /laborNoteSql\(/, name); }
    else assert.doesNotMatch(text, /SUM\(wage_minor\)/, 'the coupon SQL takes the shared expression, it does not restate it');
    assert.doesNotMatch(text.replace(/korundCouponSpendSql[^\n]*/, ''), /SUM\(wage_minor\) FROM korund_settlements WHERE clerk_user_id=\?\),0\)-COALESCE/, `${name} still copies the LN formula`);
  }
  assert.match(korund, /laborNoteBinds\(userId\)/);
  const sql = laborNoteSql('?'); assert.equal((sql.match(/\?/g) ?? []).length, laborNoteParams); assert.deepEqual(laborNoteBinds('u'), ['u', 'u', 'u', 'u', 'u']);
  assert.match(sql, /korund_settlements/); assert.match(sql, /korund_coupon_redemptions/); assert.match(sql, /gray_trades WHERE buyer_id/); assert.match(sql, /gray_trades WHERE seller_id/);
  assert.equal(laborNoteSql('c.id').includes('?'), false);
});

test('FC is never convertible: the gray market code touches no Tessera, official settlement or Labor Note ledger directly', async () => {
  const code = text => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/.*$/gm, '');
  const text = code(await readFile(new URL('../lib/gray-market.ts', import.meta.url), 'utf8'));
  assert.doesNotMatch(text, /tessera|korund_settlements|korund_coupon_redemptions|citizen_economy|wallet_minor|INSERT INTO korund_/i);
  assert.doesNotMatch(text, /exchange|convert/i, 'no conversion path');
});

test('the panel: the gray market is a collapsed, optional entry shown only when the server sends it; copy is #314 via the adapter, PoC warning lines only', async () => {
  const panel = await readFile(new URL('../app/korund-plan-panel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /plan\.gray && onGray \? <GrayMarket/); assert.match(panel, /<details className="korund-gray-market"/); assert.match(panel, /from '@\/lib\/gray-market-text'/);
  assert.doesNotMatch(panel, /gray-market-copy/, 'the panel talks to the adapter only');
  const text = await readFile(new URL('../lib/gray-market-text.ts', import.meta.url), 'utf8');
  assert.match(text, /from '\.\/gray-market-copy'/); assert.doesNotMatch(text, /GRAY_MARKET_WARNING_DEFERRED|streetWhispers/, 'no Suspicion or seizure lines in the PoC');
  const live = value => value.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/.*$/gm, '');
  // #749 adds the private Suspicion band (flag-gated, copy from lib/korund-suspicion-copy.ts). #797 adds exactly one flag-gated seizure notice line
  // (the server sends gray.seizure only with HARIMU_GRAY_SEIZURE_ENABLED on); penalties stay out of scope.
  const seizureLine = '{gray.seizure && <p role="status">{gray.seizure}</p>}';
  assert.equal(live(panel).split(seizureLine).length, 2, '#797: one seizure notice line');
  assert.doesNotMatch(live(panel).replace(seizureLine, '') + live(text), /seiz|penalt|checkpoint/i);
  const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8'); assert.match(page, /onGray=\{startGrayAction\}/);
  assert.match(panel, /Asking rate/); assert.match(panel, /<dt>Amount<\/dt>/, 'offer cards show amount and rate as separate fields');
});

test('#314 copy through the adapter: the rumored rate is one pre-formatted approximate {rate}, kept apart from an offer\'s {askRate}', async () => {
  const T = await import(await componentModule(new URL('../lib/gray-market-text.ts', import.meta.url).pathname));
  assert.equal(T.ln(500), '5.00 LN'); assert.equal(T.fc(1050), '10.50 FC'); assert.equal(T.rate(120), '1.20 FC per LN');
  const rumor = T.rumorLine(133); assert.match(rumor, /about 1\.33 FC per LN/); assert.doesNotMatch(rumor, /\{/); assert.equal((rumor.match(/1\.33/g) ?? []).length, 1, 'one figure, not a range');
  const posted = T.postedLine(500, 120); assert.match(posted, /5\.00 LN/); assert.match(posted, /asking rate of 1\.20 FC per LN/); assert.doesNotMatch(posted, /\{/);
  assert.match(T.acceptedLine(500, 120), /5\.00 LN at your asking rate of 1\.20 FC per LN/); assert.match(T.expiredLine, /expired/i); assert.ok(T.noOffersLine.length > 0);
  for (const value of [T.ln(5000), T.fc(1000000), T.rate(10000)]) assert.ok(value.length <= T.grayText.maxName, `${value} fits the copy name cap`);
  assert.deepEqual(T.grayText.warning, ['The gray market is illegal in Korund.', 'It is optional. Trade only if you accept the risk.']);
  assert.equal(T.grayText.label, 'Gray market');
});

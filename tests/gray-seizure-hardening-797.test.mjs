/** Follow-up to #797 (ARC rulings on #801): courier-only, server-side bundle, overspend race re-check, and mutant-killing tests for the
 *  10.00 LN / half cap, the one-per-game-day limit and the sink destination. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

const GAME_DAY = 7200, hit = () => 0;
async function setup(t) {
  const r = await localRuntime(); t.after(() => r.close());
  await r.db.prepare("UPDATE citizens SET nation_id='korund'").run(); await r.call('world', null);
  return { r, m: await r.importModule('lib/gray-seizure.ts'), now: Math.floor(r.now / 1000) };
}
/** A settled trade written directly (alice sells `amount` LN to bob, the courier). */
async function seedTrade(r, amount, at) {
  const id = randomUUID();
  await r.db.prepare('INSERT INTO gray_offers(id,clerk_user_id,amount_minor,ask_rate,cash_minor,created_at,expires_at) VALUES (?,?,?,?,?,?,?)').bind(id, 'alice', amount, 100, amount, at - 10, at + 99999).run();
  await r.db.prepare('INSERT INTO gray_trades(offer_id,request_id,seller_id,buyer_id,amount_minor,cash_minor,ask_rate,traded_at) VALUES (?,?,?,?,?,?,?,?)').bind(id, randomUUID(), 'alice', 'bob', amount, amount, 100, at).run();
  return id;
}
const ln = async (r, user) => Number((await r.db.prepare(`SELECT ${(await r.importModule('lib/korund-wallet.ts')).laborNoteSql('?')} AS n`).bind(user, user, user, user, user).first()).n);
const totalLn = async r => { let s = 0; for (const u of ['alice', 'bob']) s += await ln(r, u); return s; };

test('cap: exactly half the bundle, at most exactly 10.00 LN', async t => {
  const { r, m, now } = await setup(t);
  const cases = [[1, 1], [3, 1], [100, 50], [1999, 999], [2000, 1000], [2001, 1000], [5000, 1000]];
  for (const [i, [bundle, want]] of cases.entries()) {
    const id = await seedTrade(r, bundle, now + i * GAME_DAY);
    assert.equal(await m.rollSeizure(r.db, 'bob', id, now + i * GAME_DAY, hit), want, `bundle ${bundle}`);
  }
  assert.equal(m.graySeizureConfig.capMinor, 1000); assert.equal(m.graySeizureConfig.shareBps, 5000);
});

test('one per game day: a second hit the same game day seizes nothing; the next game day can', async t => {
  const { r, m } = await setup(t);
  const day = Math.floor(Math.floor(r.now / 1000) / GAME_DAY) * GAME_DAY + 10 * GAME_DAY;
  assert.equal(await m.rollSeizure(r.db, 'bob', await seedTrade(r, 100, day), day, hit), 50);
  assert.equal(await m.rollSeizure(r.db, 'bob', await seedTrade(r, 100, day + GAME_DAY - 1), day + GAME_DAY - 1, hit), 0, 'last second of the same game day');
  assert.equal(await m.rollSeizure(r.db, 'bob', await seedTrade(r, 100, day + GAME_DAY), day + GAME_DAY, hit), 50, 'first second of the next game day');
  const rows = (await r.db.prepare("SELECT game_day FROM gray_seizures WHERE clerk_user_id='bob' ORDER BY game_day").all()).results.map(x => Number(x.game_day));
  assert.deepEqual(rows, [day / GAME_DAY, day / GAME_DAY + 1]);
});

test('destination: seized LN lands only in gray_seizures; the courier loses it, nobody (seller included) is credited', async t => {
  const { r, m, now } = await setup(t);
  const id = await seedTrade(r, 100, now);
  const [alice, bob, total] = [await ln(r, 'alice'), await ln(r, 'bob'), await totalLn(r)];
  assert.equal(await m.rollSeizure(r.db, 'bob', id, now, hit), 50);
  assert.equal(await ln(r, 'bob'), bob - 50); assert.equal(await ln(r, 'alice'), alice, 'seller not credited');
  assert.equal(await totalLn(r), total - 50, 'destroyed: total LN falls by the seized amount');
  assert.deepEqual((await r.db.prepare('SELECT offer_id, clerk_user_id, amount_minor FROM gray_seizures').all()).results.map(x => [x.offer_id, x.clerk_user_id, Number(x.amount_minor)]), [[id, 'bob', 50]]);
});

test('courier only, server-side bundle: the seller is never seized and the amount comes from gray_trades', async t => {
  const { r, m, now } = await setup(t);
  const id = await seedTrade(r, 100, now);
  assert.equal(await m.rollSeizure(r.db, 'alice', id, now, hit), 0, 'seller is out of scope');
  assert.equal(m.rollSeizure.length >= 3 && !/bundle/i.test(m.rollSeizure.toString().split('{')[0]), true, 'no caller-supplied bundle parameter');
  assert.equal(await m.rollSeizure(r.db, 'bob', randomUUID(), now, hit), 0, 'unknown trade: nothing');
  assert.equal(await m.rollSeizure(r.db, 'bob', id, now, hit), 50);
});

/** Commits a coupon redemption of `price` LN for the courier just before the seizure's conditional insert runs (after the roll). */
async function couponBeforeInsert(t, price) {
  const { r, m, now } = await setup(t);
  const id = await seedTrade(r, 100, now); // courier holds 100; the seizure takes 50
  const prepare = r.db.prepare.bind(r.db);
  r.db.prepare = sql => {
    const stmt = prepare(sql);
    if (!/^\s*INSERT INTO gray_seizures/.test(sql)) return stmt;
    return { bind: (...a) => { const b = stmt.bind(...a); return { run: async () => {
      await prepare("INSERT INTO korund_coupon_redemptions(id,clerk_user_id,game_week,coupon,item,quantity,price_minor,occurred_at) VALUES (?, 'bob', 1, 'goods', 'x', 1, ?, ?)").bind(randomUUID(), price, now).run();
      return b.run(); } }; } };
  };
  let seized; try { seized = await m.rollSeizure(r.db, 'bob', id, now, hit); } finally { r.db.prepare = prepare; }
  return { seized, rows: (await r.db.prepare('SELECT amount_minor FROM gray_seizures').all()).results.map(x => Number(x.amount_minor)), balance: await ln(r, 'bob') };
}

test('atomic guard: a coupon committed between the roll and the insert leaves too little, so no seizure row is ever written', async t => {
  const r = await couponBeforeInsert(t, 60); assert.equal(r.seized, 0); assert.deepEqual(r.rows, []); assert.equal(r.balance, 40);
});

test('boundary (QA3, adapted to the single conditional insert): one short of the amount writes nothing; exactly the amount seizes to 0', async t => {
  const short = await couponBeforeInsert(t, 51);
  assert.equal(short.seized, 0); assert.deepEqual(short.rows, []); assert.equal(short.balance, 49, 'balance 49 < 50: nothing seized');
  const exact = await couponBeforeInsert(t, 50);
  assert.equal(exact.seized, 50); assert.deepEqual(exact.rows, [50]); assert.equal(exact.balance, 0, 'balance 50 >= 50: seized to exactly 0');
});

test('no re-check or delete: the seizure path is one conditional INSERT ... SELECT', async t => {
  const { r } = await setup(t);
  const src = (await import('node:fs')).readFileSync('lib/gray-seizure.ts', 'utf8');
  assert.doesNotMatch(src, /DELETE FROM gray_seizures/); assert.match(src, /\$\{laborNoteSql\('\?'\)\}>=\?/);
  assert.ok(r);
});

test('concurrent seizures and coupon redemptions never take the balance below 0', async t => {
  const { r, m, now } = await setup(t);
  const { executeKorund } = await r.importModule('lib/korund.ts');
  // Six trades of 100 (600 LN) minus a 450 spend already on the books: 150 LN, against six concurrent seizures of 50 (300) and a 200 clothing coupon.
  const ids = []; for (let i = 0; i < 6; i++) ids.push(await seedTrade(r, 100, now));
  await r.db.prepare("INSERT INTO korund_coupon_redemptions(id,clerk_user_id,game_week,coupon,item,quantity,price_minor,occurred_at) VALUES (?, 'bob', 999, 'goods', 'x', 1, 450, ?)").bind(randomUUID(), now).run();
  assert.equal(await ln(r, 'bob'), 150);
  const base = now + 100 * GAME_DAY;
  const results = await Promise.all([...ids.map((id, i) => m.rollSeizure(r.db, 'bob', id, base + i * GAME_DAY, hit)),
    executeKorund(r.db, 'bob', { action: 'korund-redeem-coupon', requestId: randomUUID(), coupon: 'clothing' }, base)]);
  const seized = results.slice(0, 6).reduce((a, b) => a + b, 0), balance = await ln(r, 'bob');
  assert.ok(balance >= 0, `balance ${balance} must never be negative`);
  assert.ok(seized <= 150 && seized % 50 === 0, `seized ${seized}`);
  assert.equal(balance, 150 - seized - (results[6].status === 200 ? 200 : 0), 'ledger adds up');
});

test('trade key (QA3): rolling an already-seized offer again on a later game day returns 0, keeps one row, leaves the balance alone', async t => {
  const { r, m, now } = await setup(t);
  const id = await seedTrade(r, 100, now);
  assert.equal(await m.rollSeizure(r.db, 'bob', id, now, hit), 50);
  const balance = await ln(r, 'bob');
  assert.equal(await m.rollSeizure(r.db, 'bob', id, now + 3 * GAME_DAY, hit), 0, 'same offer, later game day: no second seizure, no error');
  assert.deepEqual((await r.db.prepare('SELECT offer_id, amount_minor FROM gray_seizures').all()).results.map(x => [x.offer_id, Number(x.amount_minor)]), [[id, 50]]);
  assert.equal(await ln(r, 'bob'), balance);
});

test('offer filter (QA3): an earlier 5000 trade for the same courier never sizes a later 100 bundle', async t => {
  const { r, m, now } = await setup(t);
  await seedTrade(r, 5000, now - 60);
  const later = await seedTrade(r, 100, now);
  assert.equal(await m.rollSeizure(r.db, 'bob', later, now, hit), 50, 'half of the later 100 bundle, not the 1000 cap of the earlier 5000');
});

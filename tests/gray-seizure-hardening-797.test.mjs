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

test('overspend race: a coupon redemption committed between the seizure insert and its re-check withdraws the seizure', async t => {
  const { r, m, now } = await setup(t);
  const id = await seedTrade(r, 100, now);
  const prepare = r.db.prepare.bind(r.db);
  r.db.prepare = sql => {
    const stmt = prepare(sql);
    if (!/^\s*INSERT INTO gray_seizures/.test(sql)) return stmt;
    return { bind: (...a) => { const b = stmt.bind(...a); return { run: async () => { const out = await b.run();
      await prepare("INSERT INTO korund_coupon_redemptions(id,clerk_user_id,game_week,coupon,item,quantity,price_minor,occurred_at) VALUES (?, 'bob', 1, 'goods', 'x', 1, 60, ?)").bind(randomUUID(), now).run();
      return out; } }; } };
  };
  try { assert.equal(await m.rollSeizure(r.db, 'bob', id, now, hit), 0); } finally { r.db.prepare = prepare; }
  assert.deepEqual((await r.db.prepare('SELECT * FROM gray_seizures').all()).results, [], 'seizure withdrawn (fail closed)');
});

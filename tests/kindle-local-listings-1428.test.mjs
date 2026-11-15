/** #1428: fixed-lot listings follow the citizen's current city when HARIMU_CITY_LOCAL_BOOKS_ENABLED is on. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { FLAG_PACKS } from '../lib/flag-pack.mjs';
import { localRuntime } from './helpers/local-runtime.mjs';

const BOOKS = 'HARIMU_CITY_LOCAL_BOOKS_ENABLED';
const TAX = 'HARIMU_KINDLE_SALES_TAX_ENABLED';

test('no new flag binding; local books stays at GRAY indexOf 91', () => {
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf(BOOKS), 91);
  const preview = JSON.parse(readFileSync('wrangler.jsonc', 'utf8').replace(/^\s*\/\/.*$/gm, ''));
  const prod = JSON.parse(readFileSync('wrangler.prod.jsonc', 'utf8').replace(/^\s*\/\/.*$/gm, ''));
  assert.equal(preview.vars[BOOKS], undefined);
  assert.equal(prod.vars[BOOKS], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[BOOKS], 'true');
  assert.equal(prod.vars.HARIMU_GRAY_PACK[BOOKS], 'false');
});

test('migration 0131 backfills existing rows to kindle', async () => {
  const lite = new DatabaseSync(':memory:');
  lite.exec(`CREATE TABLE citizens (clerk_user_id TEXT PRIMARY KEY);
    INSERT INTO citizens VALUES ('bob');
    CREATE TABLE player_listings (id TEXT PRIMARY KEY, seller_id TEXT NOT NULL, item TEXT NOT NULL, quantity INTEGER NOT NULL, unit_minor INTEGER NOT NULL, created_at INTEGER NOT NULL);
    INSERT INTO player_listings VALUES ('old','bob','food',1,100,1);`);
  lite.exec(readFileSync('drizzle/0131_player_listing_city.sql', 'utf8'));
  assert.equal(lite.prepare("SELECT city_id FROM player_listings WHERE id='old'").get().city_id, 'kindle');
  lite.close();
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite(); await pg.waitReady;
  await pg.exec(`CREATE TABLE player_listings (id TEXT PRIMARY KEY, seller_id TEXT NOT NULL, item TEXT NOT NULL, quantity BIGINT NOT NULL, unit_minor BIGINT NOT NULL, created_at BIGINT NOT NULL);
    INSERT INTO player_listings VALUES ('old','bob','food',1,100,1);`);
  await pg.exec(readFileSync('db/postgres/0131_player_listing_city.sql', 'utf8'));
  assert.equal((await pg.query("SELECT city_id FROM player_listings WHERE id='old'")).rows[0].city_id, 'kindle');
  await pg.close();
});

async function board(t, { books, tax = false, backend }) {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  r.setFixtureEnv(BOOKS, books ? 'true' : 'false');
  r.setFixtureEnv(TAX, tax ? 'true' : undefined);
  await r.call('citizen', 'alice'); await r.call('citizen', 'bob');
  await r.db.batch([
    r.db.prepare("INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES (?,?,'buy','food',5,-1,1)").bind(randomUUID(), 'alice'),
    r.db.prepare("INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES (?,?,'sell','fixture-cash',-1,1,1)").bind(randomUUID(), 'alice'),
    r.db.prepare("INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES (?,?,'sell','fixture-cash',-1,50000,1)").bind(randomUUID(), 'bob'),
  ]);
  const at = (u, city) => r.db.prepare('INSERT INTO citizen_city_locations (user_id,nation_id,home_city_id,current_city_id,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET current_city_id=excluded.current_city_id').bind(u, 'kindle', city, city, 1).run();
  const list = (u, qty = 2, price = 1000) => r.call('citizen', u, { action: 'create-listing', requestId: randomUUID(), item: 'food', quantity: qty, unitMinor: price });
  const buy = (u, listingId) => r.call('citizen', u, { action: 'buy-listing', requestId: randomUUID(), listingId });
  const cancel = (u, listingId) => r.call('citizen', u, { action: 'cancel-listing', requestId: randomUUID(), listingId });
  const lots = async u => (await r.call('citizen', u)).data.playerMarket.listings;
  const food = async u => Number((await r.db.prepare('SELECT quantity FROM citizen_inventory_balances WHERE clerk_user_id=? AND item=?').bind(u, 'food').first())?.quantity ?? 0);
  const cityOf = async id => (await r.db.prepare('SELECT city_id FROM player_listings WHERE id=?').bind(id).first()).city_id;
  const open = rows => rows.find(lot => lot.mine && lot.status === 'open');
  return { r, at, list, buy, cancel, lots, food, cityOf, open };
}

for (const backend of ['sqlite', 'postgres']) {
  test(`${backend}: a Forgehaven lot fills only in Forgehaven, and Brasswell Port stays separate`, async t => {
    const { r, at, list, buy, lots, cityOf, open } = await board(t, { backend, books: true });
    await at('alice', 'forgehaven'); await at('bob', 'tarrek-foundry');
    const created = await list('alice');
    assert.equal(created.status, 200, JSON.stringify(created.data));
    const id = open(created.data.playerMarket.listings).id;
    assert.equal(await cityOf(id), 'forgehaven');
    assert.equal((await lots('bob')).some(lot => lot.id === id), false);
    assert.equal((await buy('bob', id)).status, 409);
    await at('bob', 'forgehaven');
    assert.equal((await lots('bob')).some(lot => lot.id === id), true);
    assert.equal((await buy('bob', id)).status, 200);
    const port = await board(t, { backend, books: true });
    await port.at('alice', 'brasswell-port'); await port.at('bob', 'forgehaven');
    const posted = await port.list('alice', 1, 500);
    const portId = open(posted.data.playerMarket.listings).id;
    assert.equal(await port.cityOf(portId), 'brasswell-port');
    assert.equal((await port.lots('bob')).some(lot => lot.id === portId), false);
    assert.equal((await port.buy('bob', portId)).status, 409);
    await port.at('bob', 'brasswell-port');
    assert.equal((await port.buy('bob', portId)).status, 200);
    assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM player_fills').first()).n), 1);
  });

  test(`${backend}: flag off is one kindle board, and turning the flag off does not leak city lots`, async t => {
    const off = await board(t, { backend, books: false });
    await off.at('alice', 'forgehaven'); await off.at('bob', 'tarrek-foundry');
    const created = await off.list('alice');
    const id = off.open(created.data.playerMarket.listings).id;
    assert.equal(await off.cityOf(id), 'kindle');
    assert.equal((await off.lots('bob')).some(lot => lot.id === id), true);
    assert.equal((await off.buy('bob', id)).status, 200);

    const swapped = await board(t, { backend, books: true });
    await swapped.at('alice', 'forgehaven'); await swapped.at('bob', 'tarrek-foundry');
    const local = await swapped.list('alice', 1, 400);
    const localId = swapped.open(local.data.playerMarket.listings).id;
    swapped.r.setFixtureEnv(BOOKS, 'false');
    assert.equal((await swapped.lots('bob')).some(lot => lot.id === localId), false, 'the Forgehaven lot stays off the shared board');
    const aliceShared = await swapped.list('alice', 1, 400);
    assert.equal(aliceShared.status, 200, JSON.stringify(aliceShared.data));
    const sharedId = aliceShared.data.playerMarket.listings.find(lot => lot.mine && lot.status === 'open' && lot.id !== localId).id;
    assert.equal(await swapped.cityOf(sharedId), 'kindle');
    assert.equal((await swapped.lots('bob')).some(lot => lot.id === sharedId), true);
    assert.equal((await swapped.lots('bob')).some(lot => lot.id === localId), false);
    assert.equal((await swapped.buy('bob', sharedId)).status, 200);
  });

  test(`${backend}: cancel reclaims escrow after a Korund enroll; Forgehaven tax follows the sales-tax flag`, async t => {
    const { r, at, list, cancel, food, open } = await board(t, { backend, books: true });
    await at('alice', 'forgehaven');
    const created = await list('alice', 2, 1000);
    assert.equal(created.status, 200, JSON.stringify(created.data));
    const id = open(created.data.playerMarket.listings).id;
    const held = await food('alice');
    assert.equal((await list('alice', 6, 100)).status, 409, 'the open lot still holds its goods');
    const enrolled = await r.call('citizen', 'alice', { action: 'enroll', nationId: 'korund', expectedNationId: 'kindle' });
    assert.equal(enrolled.status, 200, JSON.stringify(enrolled.data));
    assert.equal((await cancel('alice', id)).status, 200);
    assert.equal(await food('alice'), held + 2, 'cancel returned the escrow after the Korund enroll');

    const taxed = await board(t, { backend, books: true, tax: true });
    await taxed.at('alice', 'forgehaven'); await taxed.at('bob', 'forgehaven');
    const lot = open((await taxed.list('alice', 2, 1000)).data.playerMarket.listings).id;
    assert.equal((await taxed.buy('bob', lot)).status, 200);
    assert.equal(Number((await taxed.r.db.prepare('SELECT tax_minor FROM player_fill_sales_tax').first()).tax_minor), 100);
    const untaxed = await board(t, { backend, books: true, tax: false });
    await untaxed.at('alice', 'forgehaven'); await untaxed.at('bob', 'forgehaven');
    const plain = open((await untaxed.list('alice', 2, 1000)).data.playerMarket.listings).id;
    assert.equal((await untaxed.buy('bob', plain)).status, 200);
    assert.equal(Number((await untaxed.r.db.prepare('SELECT COUNT(*) AS n FROM player_fill_sales_tax').first()).n), 0);
  });

  test(`${backend}: a non-owner cannot cancel a Kindle lot`, async t => {
    const { r, at, list, cancel, lots, food, open } = await board(t, { backend, books: true });
    await at('alice', 'forgehaven'); await at('bob', 'forgehaven');
    const created = await list('alice', 2, 1000);
    assert.equal(created.status, 200, JSON.stringify(created.data));
    const id = open(created.data.playerMarket.listings).id;
    const held = await food('alice');
    const refused = await cancel('bob', id);
    assert.equal(refused.status, 409);
    assert.equal((await lots('alice')).find(lot => lot.id === id).status, 'open');
    assert.equal(Number((await r.db.prepare('SELECT COUNT(*) AS n FROM player_cancellations WHERE listing_id=?').bind(id).first()).n), 0);
    assert.equal(await food('alice'), held, 'the owner\'s escrow is unchanged');
  });
}

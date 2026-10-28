/** #781 domestic home-city move behind HARIMU_HOME_CITY_MOVE_ENABLED: same nation only, a 10 SPK sink fee charged once per request id, a 7-real-day cooldown. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';
import { citiesForNation } from '../lib/cities.ts';

const kindle = citiesForNation('kindle'), capital = kindle[0].id, tarrek = kindle[1].id, third = kindle[2].id;
const foreign = citiesForNation('korund').find(c => !c.capital).id;
const epoch = Date.UTC(2026, 0, 15, 12);

async function world(t, { on = true, backend = 'sqlite', cash = 5000 } = {}) {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_HOME_CITY_MOVE_ENABLED', on ? 'true' : undefined);
  r.setFixtureEnv('HARIMU_LEDGER_RECONCILIATION_ENABLED', 'true');
  await r.call('citizen', 'alice');
  if (cash) await r.db.prepare("INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES (?,?,'sell','fixture-cash',-1,?,1)").bind(randomUUID(), 'alice', cash).run();
  const wallet = async () => Number((await r.db.prepare("SELECT balance FROM citizen_wallet_balances WHERE clerk_user_id='alice'").first()).balance);
  const move = (cityId, requestId = randomUUID()) => r.call('city-home', 'alice', { cityId, requestId });
  const home = async () => (await r.call('city', 'alice')).data.homeCityId;
  const moves = async () => Number((await r.db.prepare('SELECT COUNT(*) AS n FROM home_city_moves').first()).n);
  return { r, wallet, move, home, moves };
}

test('fee and cooldown are named constants: 10 SPK and 7 real days', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const { homeMoveFeeMinor, homeMoveCooldownSeconds } = await r.importModule('lib/home-move.ts');
  assert.equal(homeMoveFeeMinor, 1000); assert.equal(homeMoveCooldownSeconds, 604800);
});

for (const backend of ['sqlite', 'postgres']) {
  test(`${backend}: a move charges the fee once, survives the city read, and a replay never charges again`, async t => {
    const { r, wallet, move, home, moves } = await world(t, { backend });
    assert.equal(await home(), capital);
    const w0 = await wallet(), id = randomUUID();
    const res = await move(tarrek, id);
    assert.equal(res.status, 200, JSON.stringify(res.data)); assert.equal(res.data.homeCityId, tarrek); assert.equal(res.data.replayed, false);
    assert.equal(res.data.nextMoveAt, epoch / 1000 + 604800);
    assert.equal(await wallet(), w0 - 1000);
    assert.equal(await home(), tarrek, 'GET /api/city no longer resets a valid non-capital home to the capital');
    const again = await move(tarrek, id);
    assert.equal(again.status, 200); assert.equal(again.data.replayed, true);
    assert.equal(await wallet(), w0 - 1000, 'charged exactly once'); assert.equal(await moves(), 1);
    const g = await r.call('city-home', 'alice'); assert.equal(g.status, 200); assert.equal(g.data.feeMinor, 1000); assert.equal(g.data.nextMoveAt, epoch / 1000 + 604800);
  });

  test(`${backend}: cooldown boundary: one second before is refused and free, exactly 7 days later is allowed`, async t => {
    const { r, wallet, move, home } = await world(t, { backend });
    assert.equal((await move(tarrek)).status, 200);
    r.setNow(epoch + (604800 - 1) * 1000);
    const w1 = await wallet(), early = await move(third);
    assert.equal(early.status, 409); assert.equal(early.data.reason, 'cooldown'); assert.equal(early.data.nextMoveAt, epoch / 1000 + 604800);
    assert.equal(await wallet(), w1); assert.equal(await home(), tarrek);
    r.setNow(epoch + 604800 * 1000);
    const ok = await move(third); assert.equal(ok.status, 200, JSON.stringify(ok.data));
    assert.equal(await wallet(), w1 - 1000); assert.equal(await home(), third);
  });

  test(`${backend}: refusals charge nothing: foreign city, unknown city, current home, insufficient funds`, async t => {
    const { wallet, move, home, moves } = await world(t, { backend, cash: 999 });
    const w0 = await wallet();
    for (const [city, status, reason] of [[foreign, 403, 'not_your_nation'], ['atlantis', 403, 'not_your_nation'], [capital, 409, 'already_home'], [tarrek, 402, 'funds']]) {
      const res = await move(city); assert.equal(res.status, status, city); assert.equal(res.data.reason, reason);
    }
    assert.equal(await wallet(), w0); assert.equal(await moves(), 0); assert.equal(await home(), capital);
  });
}

test('a changed nation, or a home no longer in the nation, still resets to the capital', async t => {
  const { r, move, home } = await world(t);
  assert.equal((await move(tarrek)).status, 200);
  await r.db.prepare("UPDATE citizen_city_locations SET home_city_id='nowhere' WHERE user_id='alice'").run();
  assert.equal(await home(), capital, 'unknown city resets');
  await r.db.prepare("UPDATE citizen_city_locations SET home_city_id=?, nation_id='korund' WHERE user_id='alice'").bind(tarrek).run();
  assert.equal(await home(), capital, 'nation change resets');
  await r.db.prepare("UPDATE citizen_city_locations SET home_city_id=? WHERE user_id='alice'").bind(third).run();
  assert.equal(await home(), capital, 'a home with no move row is still reset (flag-off behaviour)');
});

test('a request id reused by another citizen is a conflict and charges nobody', async t => {
  const { r, move } = await world(t);
  await r.call('citizen', 'bob');
  const id = randomUUID(); assert.equal((await move(tarrek, id)).status, 200);
  const res = await r.call('city-home', 'bob', { cityId: tarrek, requestId: id });
  assert.equal(res.status, 409); assert.equal(res.data.reason, 'request_conflict');
});

test('flag off: GET and POST are 404 before auth with zero DB statements; the city read keeps today\'s behaviour', async t => {
  const { r, home } = await world(t, { on: false });
  const prepare = r.db.prepare.bind(r.db), batch = r.db.batch.bind(r.db); let calls = 0;
  r.db.prepare = sql => { calls++; return prepare(sql); }; r.db.batch = s => { calls++; return batch(s); };
  const post = await r.call('city-home', 'alice', { cityId: tarrek, requestId: randomUUID() });
  const get = await r.call('city-home', 'alice'); const anon = await r.call('city-home', null, { cityId: tarrek, requestId: randomUUID() });
  r.db.prepare = prepare; r.db.batch = batch;
  assert.deepEqual([post.status, get.status, anon.status], [404, 404, 404]); assert.equal(calls, 0);
  assert.equal(await home(), capital);
});

test('the control is mounted with the city scene and names fee, cooldown date and refusal reasons', async () => {
  const card = await readFile(new URL('../app/home-move-card.tsx', import.meta.url), 'utf8');
  for (const s of ['Make this my home city', "cooldown", "funds", "not_your_nation", '/api/city/home']) assert.ok(card.includes(s), s);
  assert.match(await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8'), /<HomeMoveCard /);
});

test('funds boundary: a wallet of exactly the fee can move and ends at zero', async t => {
  const { wallet, move } = await world(t, { cash: 1000 - 0 });
  const w0 = await wallet(); assert.equal(w0, 1000);
  const res = await move(tarrek); assert.equal(res.status, 200, JSON.stringify(res.data)); assert.equal(await wallet(), 0);
});

// ARC ruling on #781: 10 units of the nation's own wallet currency; no wallet currency (Aurelle: Royal Favor is not money) is 403 not_open_yet.
for (const backend of ['sqlite', 'postgres']) {
  test(`${backend}: Korund pays 10 LN from the labor-note wallet; Spark is untouched; LN shortfall is refused`, async t => {
    const { r, move } = await world(t, { backend });
    const at = new Date(r.now).toISOString();
    for (const id of ['kim', 'kip']) await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,'korund',?,18,0,'Good standing',?,?)").bind(id, id, at, at).run();
    const settle = async (user, i) => { const id = randomUUID(), iso = new Date((1 + i) * 1000).toISOString();
      await r.db.prepare('INSERT INTO work_shifts VALUES (?,?,?,?,?,?,?,?,?)').bind(id, user, 'aurelle-food-estate', 'Korund fixture', '4 state food', 4, iso, iso, iso).run();
      await r.db.prepare('INSERT INTO korund_settlements(shift_id,clerk_user_id,wage_minor,food_output,settled_at) VALUES (?,?,800,4,?)').bind(id, user, 1 + i).run();
      await r.db.prepare("INSERT INTO labor_note_issuances(id,shift_id,clerk_user_id,amount_minor,source,issued_at) VALUES (?,?,?,800,'korund-brigade-wage',?)").bind('ln-wage:' + id, id, user, 1 + i).run(); }; // #957
    await settle('kim', 0); await settle('kim', 1); await settle('kip', 2);
    const { laborNoteSql, laborNoteBinds } = await r.importModule('lib/korund-wallet.ts');
    const ln = async u => Number((await r.db.prepare(`SELECT ${laborNoteSql('?')} AS n`).bind(...laborNoteBinds(u)).first()).n);
    const spk = async u => Number((await r.db.prepare('SELECT balance FROM citizen_wallet_balances WHERE clerk_user_id=?').bind(u).first()).balance);
    const krel = citiesForNation('korund').find(c => !c.capital).id;
    const g = await r.call('city-home', 'kim'); assert.equal(g.data.currency, 'LN');
    const spk0 = await spk('kim');
    const ok = await r.call('city-home', 'kim', { cityId: krel, requestId: randomUUID() });
    assert.equal(ok.status, 200, JSON.stringify(ok.data)); assert.equal(ok.data.currency, 'LN');
    assert.equal(await ln('kim'), 1600 - 1000); assert.equal(await spk('kim'), spk0, 'no Spark charged');
    const poor = await r.call('city-home', 'kip', { cityId: krel, requestId: randomUUID() });
    assert.equal(poor.status, 402); assert.equal(poor.data.reason, 'funds'); assert.equal(await ln('kip'), 800);
    const row = await r.db.prepare("SELECT currency FROM home_city_moves WHERE clerk_user_id='kim'").first(); assert.equal(row.currency, 'LN');
    await move(tarrek); // plus an SPK move, so both sink legs hold rows
    const rec = await (await r.importModule('lib/ledger-reconciliation.ts')).reconcileLedger(r.db);
    assert.equal(rec.mismatchCount, 0, JSON.stringify(rec)); // QA2: reconciliation is clean with SPK and LN move rows present
  });

  test(`${backend}: Kindle pays in SPK; Aurelle has no wallet currency and is refused not_open_yet with nothing charged`, async t => {
    const { r, move } = await world(t, { backend });
    const ok = await move(tarrek); assert.equal(ok.data.currency, 'SPK');
    assert.equal((await r.db.prepare("SELECT currency FROM home_city_moves WHERE clerk_user_id='alice'").first()).currency, 'SPK');
    const at = new Date(r.now).toISOString();
    await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES ('ava','aurelle','ava',18,0,'Good standing',?,?)").bind(at, at).run();
    await r.db.prepare("INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES (?,?,'sell','fixture-cash',-1,5000,1)").bind(randomUUID(), 'ava').run();
    const vale = citiesForNation('aurelle').find(c => !c.capital).id;
    const res = await r.call('city-home', 'ava', { cityId: vale, requestId: randomUUID() });
    assert.equal(res.status, 403); assert.equal(res.data.reason, 'not_open_yet');
    assert.equal(Number((await r.db.prepare("SELECT COUNT(*) AS n FROM home_city_moves WHERE clerk_user_id='ava'").first()).n), 0);
    assert.equal((await r.call('city-home', 'ava')).data.currency, null);
  });
}

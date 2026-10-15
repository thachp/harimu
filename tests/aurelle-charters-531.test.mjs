/** #531: Aurelle guild charter PoC. Grant, renew, lapse, revoke, short Favor, double request, retry idempotency, races and the flag-off no-op, on SQLite and PGlite,
 *  plus the Postgres 0054 migration applied over the real 0028 table. Costs and terms are the [ASSUMPTION]s in lib/aurelle-charter-rules.ts. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { localRuntime } from './helpers/local-runtime.mjs';

const DAY = 86400000;
const call = (r, user, body) => r.call('aurelle/charters', user, body);
const ask = (r, user, action, requestId = randomUUID()) => call(r, user, { action, requestId });
async function scene(t, backend, shifts = 30, enabled = true) {
  const r = await localRuntime(backend ? { backend } : {}); t.after(() => r.close());
  if (enabled) r.setFixtureEnv('HARIMU_AURELLE_CHARTERS_ENABLED', 'true');
  for (const [k, v] of [['HARIMU_QA_TEST_CITIZENS', 'true'], ['NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW', 'true'], ['HARIMU_QA_TEST_CITIZEN_IDS', 'qa']]) r.setFixtureEnv(k, v);
  const at = new Date(r.now).toISOString(), iso = new Date(r.now - DAY).toISOString();
  for (const id of ['ava', 'pauper']) await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,'aurelle',?,18,0,'Good standing',?,?)").bind(id, id, at, at).run();
  for (let n = 0; n < shifts; n++) { // each settled shift earns 2 Royal Favor (30 shifts = 60)
    const id = randomUUID();
    await r.db.batch([r.db.prepare('INSERT INTO work_shifts VALUES (?,?,?,?,?,?,?,?,?)').bind(id, 'ava', 'aurelle-food-estate', 'Estate fixture', '4 state food', 4, iso, iso, iso),
      r.db.prepare('INSERT INTO aurelle_settlements VALUES (?,?,?,?,?,?)').bind(id, 'ava', 800, 4, 2, Math.floor(r.now / 1000))]);
  }
  return r;
}
const count = async (r, table, where = '1=1') => Number((await r.db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).first()).n);
const spends = async r => (await r.db.prepare("SELECT reason,amount FROM aurelle_favor_spends WHERE clerk_user_id='ava' ORDER BY spent_at,reason").all()).results.map(x => ({ ...x }));
const read = async r => (await call(r, 'ava')).data;

for (const backend of ['sqlite', 'postgres']) {
  test(`flag off: 404, no writes, plan read unchanged (${backend})`, async t => {
    const r = await scene(t, backend, 30, false);
    for (const res of [await call(r, 'ava'), await ask(r, 'ava', 'request-charter'), await call(r, 'qa', { action: 'revoke-charter', targetUserId: 'ava' }), await call(r, undefined)]) assert.equal(res.status, 404);
    assert.equal(await count(r, 'aurelle_charters'), 0); assert.equal(await count(r, 'aurelle_favor_spends'), 0);
    const plan = (await r.call('citizen', 'ava')).data.aurellePlan;
    assert.deepEqual(plan.charter, { id: 'food-estate', name: 'Highspire food-estate charter', active: true }); assert.equal(plan.favor, 60);
  });

  test(`grant, retry, double request, reused id, short Favor, non-Aurelle (${backend})`, async t => {
    const r = await scene(t, backend);
    assert.deepEqual((await read(r)).charter, null);
    const id = randomUUID(), granted = await ask(r, 'ava', 'request-charter', id);
    assert.equal(granted.status, 200); assert.equal(granted.data.charter.active, true); assert.equal(granted.data.favor, 40);
    assert.equal(Date.parse(granted.data.charter.expiresAt) - Date.parse(granted.data.charter.grantedAt), 7 * DAY);
    assert.deepEqual(await spends(r), [{ reason: 'charter-grant', amount: 20 }]);
    const before = [await count(r, 'aurelle_charters'), await count(r, 'aurelle_favor_spends')];
    const state = await read(r); assert.equal(state.favor, 40); assert.deepEqual([await count(r, 'aurelle_charters'), await count(r, 'aurelle_favor_spends')], before, 'reads never write');
    const retry = await ask(r, 'ava', 'request-charter', id); assert.equal(retry.status, 200); assert.equal(retry.data.replay, true); assert.equal(retry.data.favor, 40);
    const double = await ask(r, 'ava', 'request-charter'); assert.equal(double.status, 409); assert.equal(double.data.reason, 'already_active');
    assert.equal((await ask(r, 'pauper', 'request-charter', id)).data.reason, 'request_reused');
    assert.equal((await ask(r, 'ava', 'renew-charter', id)).data.reason, 'request_reused');
    const short = await ask(r, 'pauper', 'request-charter'); assert.equal(short.status, 409); assert.equal(short.data.reason, 'insufficient_royal_favor');
    assert.equal((await ask(r, 'alice', 'request-charter')).data.reason, 'not_aurelle');
    assert.equal((await call(r, 'ava', { action: 'request-charter', requestId: 'x' })).status, 400);
    assert.deepEqual(await spends(r), [{ reason: 'charter-grant', amount: 20 }]); assert.equal(await count(r, 'aurelle_charters'), 1);
  });

  test(`renew window, renew, lapse, re-request, balance never negative (${backend})`, async t => {
    const r = await scene(t, backend), start = r.now;
    await ask(r, 'ava', 'request-charter');
    const early = await ask(r, 'ava', 'renew-charter'); assert.equal(early.data.reason, 'too_early');
    r.setNow(start + 5.5 * DAY); // inside the last 2 days of the 7-day term
    const id = randomUUID(), renewed = await ask(r, 'ava', 'renew-charter', id);
    assert.equal(renewed.status, 200, JSON.stringify(renewed.data)); assert.equal(Date.parse(renewed.data.charter.expiresAt), start + 14 * DAY); assert.equal(renewed.data.favor, 30);
    assert.equal((await ask(r, 'ava', 'renew-charter', id)).data.replay, true);
    assert.equal((await read(r)).charter.expiresAt, new Date(start + 14 * DAY).toISOString(), 'a retried renew does not extend twice');
    assert.equal((await ask(r, 'ava', 'renew-charter')).data.reason, 'too_early');
    r.setNow(start + 15 * DAY); // lapsed by the clock, nothing written
    const lapsed = (await read(r)).charter; assert.equal(lapsed.active, false); assert.equal(lapsed.revoked, false);
    assert.equal((await ask(r, 'ava', 'renew-charter')).data.reason, 'not_active');
    const again = await ask(r, 'ava', 'request-charter'); assert.equal(again.status, 200); assert.equal(again.data.charter.active, true); assert.equal(again.data.favor, 10);
    assert.deepEqual(await spends(r), [{ reason: 'charter-grant', amount: 20 }, { reason: 'charter-renew', amount: 10 }, { reason: 'charter-grant', amount: 20 }]);
    r.setNow(start + 25 * DAY); assert.equal((await ask(r, 'ava', 'request-charter')).data.reason, 'insufficient_royal_favor');
    assert.equal((await read(r)).favor, 10); assert.equal(await count(r, 'aurelle_charters'), 1);
  });

  test(`revoke is QA-only, idempotent, and allows a new grant (${backend})`, async t => {
    const r = await scene(t, backend);
    await ask(r, 'ava', 'request-charter');
    assert.equal((await call(r, 'ava', { action: 'revoke-charter', targetUserId: 'ava' })).status, 404, 'a citizen cannot revoke');
    assert.equal((await read(r)).charter.active, true);
    assert.equal((await call(r, 'qa', { action: 'revoke-charter' })).status, 400);
    for (let n = 0; n < 2; n++) { const res = await call(r, 'qa', { action: 'revoke-charter', targetUserId: 'ava' }); assert.equal(res.status, 200); assert.equal(res.data.charter.active, false); assert.equal(res.data.charter.revoked, true); }
    assert.equal((await ask(r, 'ava', 'renew-charter')).data.reason, 'not_active');
    const regrant = await ask(r, 'ava', 'request-charter'); assert.equal(regrant.status, 200); assert.equal(regrant.data.charter.active, true); assert.equal(regrant.data.charter.revoked, false);
    assert.equal((await spends(r)).length, 2); assert.equal((await read(r)).favor, 20);
  });

  test(`the Favor guard uses the decayed balance when HARIMU_FAVOR_DECAY_ENABLED is on (${backend})`, async t => {
    const r = await scene(t, backend, 12); // 24 Favor
    r.setFixtureEnv('HARIMU_FAVOR_DECAY_ENABLED', 'true'); r.setNow(r.now + 13 * DAY);
    const faded = await ask(r, 'ava', 'request-charter'); assert.equal(faded.status, 409); assert.equal(faded.data.reason, 'insufficient_royal_favor', 'Favor earned 13 of 14 days ago has faded below the price');
    assert.equal(await count(r, 'aurelle_favor_spends'), 0);
    r.setFixtureEnv('HARIMU_FAVOR_DECAY_ENABLED', 'false'); assert.equal((await ask(r, 'ava', 'request-charter')).status, 200, 'flat rule: still 24');
  });

  test(`trade right: a charter holder may take a household meal hourly, others every 2 hours; flag off ignores the charter (${backend})`, async t => {
    const r = await scene(t, backend), start = r.now, citizen = (body, user = 'ava') => r.call('citizen', user, body), HOUR = 3600000;
    const meal = (user, requestId = randomUUID()) => citizen({ action: 'aurelle-household-meal', requestId }, user);
    assert.equal((await citizen({ action: 'aurelle-buy-food', requestId: randomUUID(), quantity: 2 })).status, 200); assert.equal((await citizen({ action: 'aurelle-buy-food', requestId: randomUUID(), quantity: 2 })).status, 200);
    assert.equal((await meal('ava')).status, 200); r.setNow(start + 1.5 * HOUR);
    assert.equal((await meal('ava')).status, 409, 'no charter: still the 2-hour cooldown');
    await ask(r, 'ava', 'request-charter'); r.setFixtureEnv('HARIMU_AURELLE_CHARTERS_ENABLED', 'false');
    assert.equal((await meal('ava')).status, 409, 'flag off: the charter is ignored'); r.setFixtureEnv('HARIMU_AURELLE_CHARTERS_ENABLED', 'true');
    assert.equal((await r.call('citizen', 'ava')).data.aurellePlan.mealReadyAt, new Date(start + HOUR).toISOString(), 'the plan shows the hourly cooldown for a holder');
    assert.equal((await meal('ava')).status, 200, 'holder: 1-hour cooldown'); assert.equal(await count(r, 'aurelle_meals', "clerk_user_id='ava'"), 2);
  });

  test(`concurrent requests with different ids charge once (${backend})`, async t => {
    const r = await scene(t, backend);
    const results = await Promise.all([ask(r, 'ava', 'request-charter'), ask(r, 'ava', 'request-charter')]);
    assert.deepEqual(results.map(x => x.status).sort(), [200, 409]);
    assert.deepEqual(await spends(r), [{ reason: 'charter-grant', amount: 20 }]); assert.equal(await count(r, 'aurelle_charters'), 1); assert.equal((await read(r)).favor, 40);
  });
}

test('Postgres 0054 widens the spends reason CHECK over the real 0028 table and keeps rows', async () => {
  const db = new PGlite(); await db.exec('CREATE TABLE citizens(clerk_user_id TEXT PRIMARY KEY)');
  await db.exec(await readFile(new URL('../db/postgres/0028_aurelle_favor_spends.sql', import.meta.url), 'utf8'));
  await db.exec("INSERT INTO citizens VALUES ('u'); INSERT INTO aurelle_favor_spends VALUES ('old','u',10,'leave-kinward',1)");
  await assert.rejects(db.exec("INSERT INTO aurelle_favor_spends VALUES ('x','u',10,'charter-grant',2)"));
  const migration = await readFile(new URL('../db/postgres/0054_aurelle_charters.sql', import.meta.url), 'utf8');
  await db.exec(migration); await db.exec(migration); // re-runnable
  await db.exec("INSERT INTO aurelle_favor_spends VALUES ('g','u',20,'charter-grant',2),('n','u',10,'charter-renew',3)");
  await assert.rejects(db.exec("INSERT INTO aurelle_favor_spends VALUES ('b','u',1,'bogus',4)"));
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM aurelle_favor_spends')).rows[0].n, 3);
  await db.exec("INSERT INTO aurelle_charters VALUES ('u','market-stall','g',2,9,NULL)");
  await assert.rejects(db.exec("INSERT INTO aurelle_charters VALUES ('u','market-stall','h',2,9,NULL)"), 'one charter row per citizen');
  await db.close();
});

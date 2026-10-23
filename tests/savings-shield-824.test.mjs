/** #824 Kindle Dormant Savings Shield (docs §12.8), flag HARIMU_SAVINGS_SHIELD_ENABLED: once per absence on a Welcome back from Dormant or Archived,
 *  min(SPK balance, cap) x 1/2 x the Price Index rise, a transfer from the Kindle treasury welfare line. SQLite + PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { localRuntime } from './helpers/local-runtime.mjs';
const D = 86400;
const rules = await (async () => { const r = await localRuntime(); try { return await r.importModule('lib/savings-shield.ts'); } finally { await r.close(); } })();

test('rules: cap 240 SPK; half the rise on min(balance, cap); flat or falling index pays 0; integer floor', () => {
  const { shieldCreditMinor: c, SHIELD_CAP_MINOR } = rules;
  assert.equal(SHIELD_CAP_MINOR, 24000);
  assert.equal(c(10000, 100, 110), 500); assert.equal(c(10000, 100, 100), 0); assert.equal(c(10000, 110, 100), 0, 'deflation pays 0');
  assert.equal(c(50000, 100, 110), 1200, 'only the cap is covered'); assert.equal(c(24000, 100, 110), 1200); assert.equal(c(23999, 100, 110), 1199);
  assert.equal(c(-500, 100, 120), 0); assert.equal(c(10000, 0, 120), 0); assert.equal(c(999, 100, 100.1), 0, 'floor'); assert.equal(c(1000, 100, 100.2), 1);
  assert.equal(c(10000, 100, 110, 4000), 200, 'cap is a parameter');
});

async function world(t, { backend = 'sqlite', shield = true, verified = true, rise = true, cash = 10000, treasury = 100000, idleDays = 40, nation = 'kindle' } = {}) {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  r.setDormancy(true); r.setFixtureEnv('HARIMU_SAVINGS_SHIELD_ENABLED', shield ? 'true' : undefined);
  r.setFixtureEnv('HARIMU_ACCOUNT_ELECTION_POC_ENABLED', verified ? 'true' : 'false'); r.setFixtureEnv('NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW', 'true'); r.setFixtureEnv('HARIMU_LEDGER_RECONCILIATION_ENABLED', 'true');
  await r.call('citizen', 'alice');
  if (nation !== 'kindle') await r.db.prepare('UPDATE citizens SET nation_id = ? WHERE clerk_user_id = ?').bind(nation, 'alice').run();
  const now = Math.floor(r.now / 1000), last = now - idleDays * D;
  if (cash) await r.db.prepare("INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES (?,?,'sell','fixture-cash',-1,?,1)").bind(randomUUID(), 'alice', cash).run();
  await r.db.prepare("UPDATE economy_funds SET initial_minor = ? WHERE id = 'kindle-treasury'").bind(treasury).run();
  // The money supply is seeded before the absence; a 10% emergency issuance just after it starts makes the Price Index rise during the absence.
  await r.db.prepare("INSERT INTO spark_issuances VALUES ('spark-seed','spark-seed',1,'seed',0,100000,0,100000,'Reserve Board',?,NULL)").bind(last - 3600).run();
  if (rise) await r.db.prepare("INSERT INTO spark_issuances VALUES ('i1','i1',2,'emergency',1000,10000,100000,110000,'Reserve Board',?,'spark-seed')").bind(last + D).run();
  const setLast = at => r.db.prepare('UPDATE citizens SET last_active_at = ? WHERE clerk_user_id = ?').bind(new Date(at * 1000).toISOString(), 'alice').run();
  await setLast(last);
  const wallet = async () => Number((await r.db.prepare("SELECT balance FROM citizen_wallet_balances WHERE clerk_user_id='alice'").first()).balance);
  const econ = await r.importModule('lib/economy.ts');
  const treasuryNow = async () => Number((await r.db.prepare(econ.kindleTreasuryBalanceSql).first()).balance);
  const rows = async () => (await r.db.prepare('SELECT status, credit_minor, reason FROM savings_shield_credits').all()).results.map(x => ({ ...x, credit_minor: Number(x.credit_minor) }));
  const board = await r.importModule('lib/spark-supply.ts');
  const expected = async balance => rules.shieldCreditMinor(balance, (await board.readReserveBoard(r.db, last)).priceIndex, (await board.readReserveBoard(r.db, now)).priceIndex);
  return { r, now, last, setLast, wallet, treasuryNow, rows, expected, beat: () => r.call('citizen/heartbeat', 'alice', {}) };
}

for (const backend of ['sqlite', 'postgres']) {
  test(`${backend}: a Dormant return pays once: wallet credit equals treasury debit, Welcome back shows it, replay pays nothing, reconciliation balanced`, async t => {
    const w = await world(t, { backend });
    const credit = await w.expected(10000); assert.ok(credit > 0 && credit < 1000, `credit ${credit}`);
    const w0 = await w.wallet(), t0 = await w.treasuryNow();
    const res = await w.beat(); assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.welcomeBack.status, 'dormant'); assert.deepEqual(res.data.welcomeBack.shield, { creditMinor: credit });
    assert.equal(await w.wallet(), w0 + credit); assert.equal(await w.treasuryNow(), t0 - credit, 'paid from the treasury, not new money');
    assert.deepEqual(await w.rows(), [{ status: 'paid', credit_minor: credit, reason: 'paid' }]);
    await w.setLast(w.last); w.r.setNow(w.r.now + 2 * 3600 * 1000); // the same absence reported again
    const again = await w.beat(); assert.equal(again.data.welcomeBack.shield, undefined, 'second return for the same absence pays nothing');
    assert.equal(await w.wallet(), w0 + credit); assert.equal((await w.rows()).length, 1);
    const rec = await (await w.r.importModule('lib/ledger-reconciliation.ts')).reconcileLedger(w.r.db);
    assert.equal(rec.mismatchCount, 0, JSON.stringify(rec));
  });

  test(`${backend}: the cap, a flat index, an unverified account and a short treasury`, async t => {
    const cap = await world(t, { backend, cash: 50000 });
    const capCredit = await cap.expected(24000); assert.equal(await cap.expected(50000), capCredit, 'above the cap pays on the cap only');
    assert.deepEqual((await cap.beat()).data.welcomeBack.shield, { creditMinor: capCredit });
    const flat = await world(t, { backend, rise: false });
    const f = await flat.beat(); assert.equal(f.data.welcomeBack.shield, undefined);
    assert.deepEqual(await flat.rows(), [{ status: 'skipped', credit_minor: 0, reason: 'no_index_rise' }]);
    const unverified = await world(t, { backend, verified: false });
    assert.equal((await unverified.beat()).data.welcomeBack.shield, undefined); assert.deepEqual(await unverified.rows(), [], 'unverified: no row');
    const poor = await world(t, { backend, treasury: 0 }); const p0 = await poor.wallet(); // kills the mutant that drops the WHERE treasury guard
    assert.equal((await poor.beat()).data.welcomeBack.shield, undefined);
    assert.deepEqual(await poor.rows(), [{ status: 'skipped', credit_minor: 0, reason: 'treasury_short' }]); assert.equal(await poor.wallet(), p0);
  });
}

for (const backend of ['sqlite', 'postgres']) {
  test(`${backend}: two concurrent returns for the same absence: exactly one pays and shows the shield; wallet and treasury change once`, async t => {
    const w = await world(t, { backend });
    const credit = await w.expected(10000); assert.ok(credit > 0);
    const w0 = await w.wallet(), t0 = await w.treasuryNow();
    const { applySavingsShield } = await w.r.importModule('lib/savings-shield.ts');
    const both = await Promise.all([0, 1].map(() => applySavingsShield(w.r.db, 'alice', w.last, w.now, true)));
    assert.deepEqual(both.map(x => x.replayed).sort(), [false, true], JSON.stringify(both));
    const shown = both.filter(x => x.status === 'paid' && !x.replayed); // the route shows the line only for this case
    assert.equal(shown.length, 1); assert.equal(shown[0].creditMinor, credit);
    assert.equal(await w.wallet(), w0 + credit); assert.equal(await w.treasuryNow(), t0 - credit);
    assert.deepEqual(await w.rows(), [{ status: 'paid', credit_minor: credit, reason: 'paid' }]);
    // Through the route: two concurrent heartbeats for the same absence show the line at most once.
    const r2 = await world(t, { backend }); const a0 = await r2.wallet();
    const res = await Promise.all([r2.beat(), r2.beat()]);
    assert.equal(res.filter(x => x.data.welcomeBack?.shield).length, 1, JSON.stringify(res.map(x => x.data)));
    assert.equal(await r2.wallet(), a0 + credit); assert.equal((await r2.rows()).length, 1);
  });
}

test('a top-up during dormancy does not raise the credit (inflows since the absence began are excluded)', async t => {
  const w = await world(t, {}); const credit = await w.expected(10000); assert.ok(credit > 0);
  await w.r.db.prepare("INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES (?,?,'sell','top-up',-1,?,?)").bind(randomUUID(), 'alice', 14000, w.last + 2 * D).run();
  assert.deepEqual((await w.beat()).data.welcomeBack.shield, { creditMinor: credit }, 'paid on the 100 SPK held at dormancy, not the 240 after the top-up');
  const only = await world(t, { cash: 0 });
  await only.r.db.prepare("INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES (?,?,'sell','top-up',-1,?,?)").bind(randomUUID(), 'alice', 14000, only.last + 2 * D).run();
  assert.equal((await only.beat()).data.welcomeBack.shield, undefined);
  assert.deepEqual(await only.rows(), [{ status: 'skipped', credit_minor: 0, reason: 'no_balance' }]);
});

for (const backend of ['sqlite', 'postgres']) {
  test(`${backend}: the conditional insert guard: a treasury of exactly the credit pays and ends at 0; one minor short records treasury_short`, async t => {
    const probe = await world(t, { backend }); const credit = await probe.expected(10000);
    const exact = await world(t, { backend, treasury: credit });
    assert.deepEqual((await exact.beat()).data.welcomeBack.shield, { creditMinor: credit }); assert.equal(await exact.treasuryNow(), 0);
    const short = await world(t, { backend, treasury: credit - 1 }); const s0 = await short.wallet();
    assert.equal((await short.beat()).data.welcomeBack.shield, undefined); assert.equal(await short.treasuryNow(), credit - 1, 'never commits negative');
    assert.equal(await short.wallet(), s0); assert.deepEqual(await short.rows(), [{ status: 'skipped', credit_minor: 0, reason: 'treasury_short' }]);
  });
}

test('thresholds and scope: Away (29 days) and Korund pay nothing; exactly 30 days (Dormant) and Archived pay', async t => {
  for (const [idleDays, nation, paid] of [[29, 'kindle', false], [30, 'kindle', true], [181, 'kindle', true], [40, 'korund', false]]) {
    const w = await world(t, { idleDays, nation });
    const res = await w.beat(); assert.equal(Boolean(res.data.welcomeBack?.shield), paid, `${idleDays}d ${nation}`);
    assert.equal((await w.rows()).length, paid ? 1 : 0);
  }
});

test('flag off: a Dormant return writes no shield row, reads no treasury, and the Welcome back has no shield line', async t => {
  const w = await world(t, { shield: false });
  const prepare = w.r.db.prepare.bind(w.r.db), seen = []; w.r.db.prepare = q => { seen.push(q); return prepare(q); };
  const res = await w.beat(); w.r.db.prepare = prepare;
  assert.equal(res.data.welcomeBack.status, 'dormant'); assert.equal('shield' in res.data.welcomeBack, false);
  assert.deepEqual(seen.filter(q => /savings_shield|spark_issuances|kindle-treasury/.test(q)), []);
  assert.deepEqual(await w.rows(), []);
});

test('Welcome back copy: the shield line only when paid', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../app/welcome-back.tsx', import.meta.url), 'utf8');
  assert.match(src, /data\.shield && data\.shield\.creditMinor > 0/); assert.match(src, /Savings Shield: \+\$\{\(creditMinor \/ 100\)\.toFixed\(2\)\} SPK/);
});

/** #759 Korund weekly quota shortfall (docs 12.11 step 3), behind HARIMU_KORUND_SHORTFALL_ENABLED. Derived on read: no table, no migration, no GET write. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';
import { korundShortfall, shortfallPercent, korundShortfallCopy, korundWorkUnit } from '../lib/korund-coupons.ts';

const W = 50400;
test('rules: percent missed, none at or over target or before a closed week; copy never says punishment', () => {
  assert.equal(shortfallPercent(30, 40), 25); assert.equal(shortfallPercent(39, 40), 3); assert.equal(shortfallPercent(0, 40), 100);
  assert.equal(shortfallPercent(40, 40), 0); assert.equal(shortfallPercent(52, 40), 0);
  assert.equal(korundShortfall(1, 40), null); assert.equal(korundShortfall(0, 10), null);
  assert.deepEqual(korundShortfall(2, 30).ledger, { bonusMinor: 0, reason: 'quota_shortfall' });
  assert.equal(korundShortfallCopy.notice(korundWorkUnit, 25), `Inspection: ${korundWorkUnit} finished last week 25% short of its quota.`);
  assert.equal(korundShortfallCopy.ledger, 'No bonus withheld (work-unit bonus not yet active).', 'follow-up: natural bonus line');
  assert.doesNotMatch(korundShortfallCopy.ledger, /0\.00 LN|Week \d/);
  assert.equal(korundShortfallCopy.press(korundWorkUnit), `Plan inspectors visit the ${korundWorkUnit} after a weekly shortfall.`);
  for (const s of [korundShortfallCopy.notice('X', 5), korundShortfallCopy.ledger, korundShortfallCopy.press('X')]) assert.doesNotMatch(s, /punish|suspicion/i);
});

async function setup(t, on = true, pglite = false) {
  const r = await localRuntime(pglite ? { backend: 'postgres' } : { backend: 'sqlite' }); t.after(() => r.close());
  await r.db.prepare("UPDATE citizens SET nation_id='korund'").run(); await r.call('world', null);
  r.setFixtureEnv('HARIMU_KORUND_SHORTFALL_ENABLED', on ? 'true' : undefined);
  const epoch = Number((await r.db.prepare("SELECT epoch_seconds FROM world_clock WHERE id='main'").first()).epoch_seconds);
  return { r, epoch };
}
async function settle(r, user, at, shifts) {
  for (let i = 0; i < shifts; i++) {
    const id = randomUUID(), iso = new Date((at + i) * 1000).toISOString();
    await r.db.prepare('INSERT INTO work_shifts VALUES (?,?,?,?,?,?,?,?,?)').bind(id, user, 'aurelle-food-estate', 'Korund fixture', '4 state food', 4, iso, iso, iso).run();
    await r.db.prepare('INSERT INTO korund_settlements(shift_id,clerk_user_id,wage_minor,food_output,settled_at) VALUES (?,?,800,4,?)').bind(id, user, at + i).run();
  }
}
const plan = async (r, user = 'alice') => (await r.call('citizen', user)).data.korundPlan;
async function sqlDuring(r, fn) {
  const seen = [], prepare = r.db.prepare.bind(r.db);
  r.db.prepare = sql => { seen.push(sql.replace(/\s+/g, ' ').trim()); return prepare(sql); };
  try { await fn(); } finally { r.db.prepare = prepare; }
  return seen;
}
const isShortfallQuery = sql => /SUM\(food_output\),0\) AS n FROM korund_settlements WHERE settled_at>=\? AND settled_at<\?/.test(sql);
const isWrite = sql => /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|REPLACE)/i.test(sql);

for (const pglite of [false, true]) {
  const db = pglite ? 'PGlite' : 'SQLite';
  test(`${db}: unit under quota at rollover gives one notice and one zero-bonus line per member; re-reads add nothing; met week gives none`, async t => {
    const { r, epoch } = await setup(t, true, pglite);
    await settle(r, 'alice', epoch + 100, 2); await settle(r, 'bob', epoch + 200, 5); // week 1: unit 28 of 40 -> 30% short
    r.setNow((epoch + 1000) * 1000); assert.equal((await plan(r)).shortfall, null, 'week 1 open: no closed week yet');
    r.setNow((epoch + W + 100) * 1000);
    const s = (await plan(r)).shortfall;
    assert.equal(s.week, 1); assert.equal(s.percent, 30); assert.equal(s.unitFood, 28); assert.deepEqual(s.ledger, { bonusMinor: 0, reason: 'quota_shortfall' });
    assert.deepEqual((await plan(r)).shortfall, s, 'idempotent re-read');
    assert.deepEqual((await plan(r, 'bob')).shortfall, s, 'each member sees the same one line');
    await settle(r, 'bob', epoch + W + 200, 10); r.setNow((epoch + 2 * W + 100) * 1000); // week 2: unit 40 -> met
    assert.equal((await plan(r)).shortfall, null, 'at quota: no inspection');
  });
}

test('week boundaries: a shift at epoch+W-1 counts for week 1, one at exactly epoch+W does not; read at exactly epoch+W', async t => {
  const { r, epoch } = await setup(t);
  await settle(r, 'bob', epoch + 200, 9); await settle(r, 'alice', epoch + W - 1, 1); // week 1 = 40 only with the W-1 shift
  await settle(r, 'alice', epoch + W, 1);                                            // week 2
  r.setNow((epoch + W) * 1000); assert.equal((await plan(r)).shortfall, null, 'W-1 shift completes week 1; W shift not double-counted');
  await r.db.prepare('DELETE FROM korund_settlements WHERE settled_at=?').bind(epoch + W - 1).run();
  assert.equal((await plan(r)).shortfall.percent, 10, 'without the W-1 shift, week 1 is 36: the W shift is not pulled back into week 1');
  r.setNow((epoch + W - 1) * 1000); assert.equal((await plan(r)).shortfall, null, '1 second before rollover week 1 is still open');
});

test('flag off: no shortfall field and no shortfall query (spy), against a flag-on baseline', async t => {
  const on = await setup(t); await settle(on.r, 'alice', on.epoch + 100, 1); on.r.setNow((on.epoch + W + 100) * 1000);
  assert.ok((await sqlDuring(on.r, () => plan(on.r))).some(isShortfallQuery), 'baseline reads it');
  const off = await setup(t, false); await settle(off.r, 'alice', off.epoch + 100, 1); off.r.setNow((off.epoch + W + 100) * 1000);
  assert.equal((await sqlDuring(off.r, () => plan(off.r))).filter(isShortfallQuery).length, 0);
  assert.equal('shortfall' in (await plan(off.r)), false);
});

test('Korund only: a citizen who left Korund gets no shortfall field or query', async t => {
  const { r, epoch } = await setup(t); await settle(r, 'alice', epoch + 100, 1); r.setNow((epoch + W + 100) * 1000);
  assert.ok((await plan(r, 'bob')).shortfall);
  await r.db.prepare("UPDATE citizens SET nation_id='kindle' WHERE clerk_user_id='bob'").run();
  assert.equal((await plan(r, 'bob'))?.shortfall, undefined);
  assert.equal((await sqlDuring(r, () => plan(r, 'bob'))).filter(isShortfallQuery).length, 0);
});

test('GET makes no writes and leaves no ledger row; no player Suspicion change', async t => {
  const { r, epoch } = await setup(t); await settle(r, 'alice', epoch + 100, 1); r.setNow((epoch + W + 100) * 1000); await plan(r);
  const sql = await sqlDuring(r, async () => { for (let i = 0; i < 3; i++) await plan(r); });
  assert.ok(sql.some(isShortfallQuery)); assert.deepEqual(sql.filter(isWrite), []);
  assert.equal(sql.filter(q => /suspicion/i.test(q) && isWrite(q)).length, 0);
});

test('panel renders the shortfall only from korundShortfallCopy and only when present', async () => {
  const panel = await readFile(new URL('../app/korund-plan-panel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /\{plan\.shortfall && /); assert.match(panel, /korundShortfallCopy\.notice\(/); assert.match(panel, /korundShortfallCopy\.ledger\}/);
  assert.doesNotMatch(panel, /Inspection:|punish/i);
});

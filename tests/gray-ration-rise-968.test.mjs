/** #968: a #776 ration cut adds one shortage line on the rumored street rate, behind HARIMU_GRAY_RATION_RISE_ENABLED.
 *  Display only. The #736 cap and #749 Suspicion stay. No migration. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';
import { GRAY_DAILY_VOLUME_CAP_MINOR } from '../lib/gray-market-rules.ts';
import { suspicionLevelWithGray, undergroundConfig as cfg } from '../lib/underground-rules.ts';

const W = 50400, CAP = GRAY_DAILY_VOLUME_CAP_MINOR, LINE = 'Street talk: rations are short, so this street is busier.';
const OFFER = '11111111-1111-4111-8111-111111111111', ACCEPT = '22222222-2222-4222-8222-222222222222';

test('assumption: the rise is one shortage line; the panel shows it; trades never read it', async () => {
  const rate = await readFile(new URL('../lib/wallet-street-rate.ts', import.meta.url), 'utf8');
  assert.match(rate, /export const GRAY_RATION_RISE_LINES = 1/); assert.match(rate, /\[ASSUMPTION\]/);
  assert.match(rate, new RegExp(LINE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))); assert.doesNotMatch(LINE, /\d/);
  assert.equal(CAP, 15000); assert.equal(cfg.graySuspicionStep, 2); assert.equal(cfg.graySuspicionDailyCap, 4);
  assert.equal(suspicionLevelWithGray([], [1_000], 1_000), 2, 'a trade still adds the same Suspicion');
  const panel = await readFile(new URL('../app/korund-plan-panel.tsx', import.meta.url), 'utf8');
  assert.match(panel, /className="gray-ration-shortage"/); assert.match(panel, /plan\.streetRate\.shortage/);
  assert.match(panel, /walletStreetRateLine\(plan\.streetRate\.rumoredRate\)/);
  const korund = await readFile(new URL('../lib/korund.ts', import.meta.url), 'utf8');
  const exec = korund.slice(korund.indexOf('export async function executeKorund'));
  assert.doesNotMatch(exec, /streetShortageLine|grayRationRise|shortage/);
  assert.match(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'), /"HARIMU_GRAY_RATION_RISE_ENABLED": "true"/);
  assert.match(await readFile(new URL('../wrangler.prod.jsonc', import.meta.url), 'utf8'), /"HARIMU_GRAY_RATION_RISE_ENABLED": "false"/);
});

async function setup(t, { rise = true, cap = false, suspicion = false, backend = 'sqlite' } = {}) {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  await r.db.prepare("UPDATE citizens SET nation_id='korund'").run(); await r.call('world', null);
  const epoch = Number((await r.db.prepare("SELECT epoch_seconds FROM world_clock WHERE id='main'").first()).epoch_seconds);
  const iso = new Date(epoch * 1000).toISOString();
  await r.db.prepare(`INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES ('carol','korund','carol',18,0,'Good standing',?,?)`).bind(iso, iso).run();
  r.setFixtureEnv('HARIMU_GRAY_MARKET_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_WALLET_STREET_RATE_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_KORUND_RATION_CUT_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_GRAY_RATION_RISE_ENABLED', rise ? 'true' : undefined);
  r.setFixtureEnv('HARIMU_GRAY_DAILY_CAP_ENABLED', cap ? 'true' : undefined);
  r.setFixtureEnv('HARIMU_GRAY_SUSPICION_ENABLED', suspicion ? 'true' : undefined);
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
async function trade(r) {
  assert.equal((await r.call('citizen', 'alice', { action: 'korund-gray-post-offer', requestId: OFFER, amountMinor: 500, askRate: 120 })).status, 200);
  assert.equal((await r.call('citizen', 'bob', { action: 'korund-gray-accept-offer', requestId: ACCEPT, offerId: OFFER })).status, 200);
}
const quiet = async (r, epoch) => { await settle(r, 'alice', epoch + 200, 1); r.setNow((epoch + 1000) * 1000); await trade(r); };
const cutWeek = async (r, epoch) => { await settle(r, 'bob', epoch + 100, 1); await settle(r, 'alice', epoch + W + 50, 1); r.setNow((epoch + W + 100) * 1000); };
const isWrite = sql => /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|REPLACE)/i.test(sql);
const padVolume = async (r, minor) => {
  const at = Math.floor(r.now / 1000) - 60;
  for (let left = minor; left > 0; left -= 5000) {
    const n = Math.min(5000, left);
    await r.db.prepare('INSERT INTO gray_offers(id,clerk_user_id,amount_minor,ask_rate,cash_minor,created_at,expires_at) VALUES (?,?,?,?,?,?,?)').bind(randomUUID(), 'alice', n, 100, n, at, at + 1).run();
  }
};

test('no cut = today\'s behaviour: the rise flag adds no line, offer, or rate', async t => {
  const on = await setup(t), off = await setup(t, { rise: false });
  await quiet(on.r, on.epoch); await quiet(off.r, off.epoch);
  const a = await plan(on.r), b = await plan(off.r);
  assert.equal(a.rationCut, null); assert.equal(b.rationCut, null);
  assert.equal('shortage' in a.gray, false); assert.deepEqual(a.gray, b.gray); assert.deepEqual(a.streetRate, b.streetRate);
  assert.equal((await plan(on.r, 'carol')).streetRate, null);
});

for (const backend of ['sqlite', 'postgres']) {
  test(`${backend}: a ration cut shows the shortage line; the rumor and the board stay the same size`, async t => {
    const on = await setup(t, { rise: true, backend }), off = await setup(t, { rise: false, backend });
    await cutWeek(on.r, on.epoch); await cutWeek(off.r, off.epoch); await trade(on.r); await trade(off.r);
    const a = await plan(on.r), b = await plan(off.r);
    assert.ok(a.rationCut?.withdrawn.includes('goods')); assert.equal(a.gray.shortage, LINE); assert.equal(a.streetRate.shortage, LINE);
    assert.equal('shortage' in b.gray, false); assert.equal('shortage' in b.streetRate, false);
    assert.equal(a.gray.rumoredRate, b.gray.rumoredRate); assert.equal(a.gray.offers.length, b.gray.offers.length); assert.equal(a.gray.offers.length, 0);
    assert.equal(a.streetRate.rumoredRate, b.streetRate.rumoredRate); assert.equal(a.gray.dailyCapMinor, b.gray.dailyCapMinor);
    const carol = await plan(on.r, 'carol'); assert.equal(carol.gray.shortage, LINE); assert.equal(carol.streetRate, null, 'unheard wallet stays hidden');
    assert.equal('shortage' in (await plan(off.r, 'carol')).gray, false);
    const seen = [], prepare = on.r.db.prepare.bind(on.r.db);
    on.r.db.prepare = sql => { seen.push(sql); return prepare(sql); };
    await plan(on.r); on.r.db.prepare = prepare;
    assert.deepEqual(seen.filter(isWrite), []);
  });
}

test('caps still enforced, and Suspicion still applies, while the rise is showing', async t => {
  const { r, epoch } = await setup(t, { cap: true, suspicion: true });
  await cutWeek(r, epoch); await trade(r);
  const g = (await plan(r)).gray;
  assert.equal(g.shortage, LINE); assert.equal(g.dailyCapMinor, CAP); assert.equal(g.dailyRemainingMinor, CAP - 500); assert.match(g.suspicion.line, /Low/);
  await padVolume(r, CAP - 500);
  const over = await r.call('citizen', 'alice', { action: 'korund-gray-post-offer', requestId: randomUUID(), amountMinor: 1, askRate: 100 });
  assert.equal(over.status, 409); assert.equal(over.data.reason, 'daily_cap');
  assert.equal((await plan(r)).gray.dailyRemainingMinor, 0); assert.equal((await plan(r)).gray.shortage, LINE);
});

test('flag off: a ration cut withdraws coupons and still caps trades, with no shortage line', async t => {
  const { r, epoch } = await setup(t, { rise: false, cap: true, suspicion: true });
  await cutWeek(r, epoch); await trade(r);
  const p = await plan(r);
  assert.ok(p.rationCut.withdrawn.includes('goods')); assert.equal('shortage' in p.gray, false); assert.equal('shortage' in p.streetRate, false);
  assert.equal(p.gray.dailyCapMinor, CAP); assert.match(p.gray.suspicion.line, /Low/);
  await padVolume(r, CAP - 500);
  const over = await r.call('citizen', 'alice', { action: 'korund-gray-post-offer', requestId: randomUUID(), amountMinor: 1, askRate: 100 });
  assert.equal(over.status, 409); assert.equal(over.data.reason, 'daily_cap');
});

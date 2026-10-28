/** #958: one-way-trades risk reason from player_fills + gray_trades (docs §20). Flag HARIMU_RISK_SCORING_ENABLED. Human review only. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { scoreRisk, riskScoring as cfg, oneWayTradeSources, riskSweepSql, countedActSources } from '../lib/risk-scoring.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const H = 3600, DAY = 86400;
const iso = sec => new Date(sec * 1000).toISOString();

test('scoreRisk: one-way-trades points stack with other reasons; off is zero', () => {
  assert.deepEqual(scoreRisk({ accountAgeSeconds: null, civicActCount: 0, oneWayTrades: true }), { score: cfg.oneWayTradePoints, reasons: ['one-way-trades'], civicActCount: 0 });
  const stacked = scoreRisk({ accountAgeSeconds: 1, civicActCount: 3, clerkEmailRisk: true, oneWayTrades: true });
  assert.equal(stacked.score, cfg.newAccountPoints + cfg.denseBasePoints + cfg.clerkEmailPoints + cfg.oneWayTradePoints);
  assert.deepEqual(stacked.reasons, ['new-account', 'dense-civic-acts', 'clerk-email', 'one-way-trades']);
  assert.deepEqual(scoreRisk({ accountAgeSeconds: null, civicActCount: 0, oneWayTrades: false }).reasons, []);
});

test('trade sources are code constants over player_fills and gray_trades only', () => {
  assert.deepEqual(oneWayTradeSources.map(s => s.name), ['player-fills', 'gray-trades']);
  const sql = riskSweepSql(countedActSources);
  assert.match(sql, /player_fills/); assert.match(sql, /gray_trades/);
  assert.match(sql, /one-way-trades/); assert.doesNotMatch(sql, /\?.*env|request/i);
  for (const s of oneWayTradeSources) assert.doesNotMatch(s.sql, /[?;]|--|\/\*/);
});

async function world(backend) {
  const r = await localRuntime({ backend });
  const now = Math.floor(r.now / 1000);
  await r.db.prepare("UPDATE citizens SET created_at=? WHERE clerk_user_id IN ('alice','bob')").bind(iso(now - 10 * DAY)).run();
  const add = (id) => r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,'kindle',?,18,0,'Good standing',?,?)").bind(id, id, iso(now - 10 * DAY), iso(now - 10 * DAY)).run();
  for (const id of ['feeder', 'sink', 'peer_a', 'peer_b', 'low_a', 'low_b']) await add(id);
  const fill = async (id, buyer, seller, at) => {
    await r.db.prepare("INSERT INTO player_listings (id,seller_id,item,quantity,unit_minor,created_at) VALUES (?,?,'food',1,100,?)").bind(id, seller, at - 1).run();
    await r.db.prepare("INSERT INTO player_fills (request_id,listing_id,buyer_id,seller_id,item,quantity,amount_minor,filled_at) VALUES (?,?,?,?,'food',1,100,?)").bind(id, id, buyer, seller, at).run();
  };
  // one-way: feeder → sink three times (sink receives)
  for (let i = 0; i < 3; i++) await fill(`ow${i}`, 'feeder', 'sink', now - H + i);
  // balanced two-way: peer_a ↔ peer_b three each
  for (let i = 0; i < 3; i++) { await fill(`ab${i}`, 'peer_a', 'peer_b', now - H + i); await fill(`ba${i}`, 'peer_b', 'peer_a', now - H + i); }
  // below floor: only two one-way
  for (let i = 0; i < 2; i++) await fill(`lo${i}`, 'low_a', 'low_b', now - H + i);
  // gray one-way reinforces sink (same direction)
  await r.db.prepare('INSERT INTO gray_offers(id,clerk_user_id,amount_minor,ask_rate,cash_minor,created_at,expires_at) VALUES (?,?,?,?,?,?,?)')
    .bind('gow1', 'sink', 100, 100, 100, now - H, now + DAY).run();
  await r.db.prepare('INSERT INTO gray_trades(offer_id,request_id,seller_id,buyer_id,amount_minor,cash_minor,ask_rate,traded_at) VALUES (?,?,?,?,?,?,?,?)')
    .bind('gow1', 'grq1', 'sink', 'feeder', 100, 100, 100, now - H).run();
  return { r, now, w: await r.importModule('lib/risk-scoring.ts') };
}

const scored = async r => (await r.db.prepare("SELECT clerk_user_id, reasons FROM risk_scores WHERE score>0 ORDER BY clerk_user_id").all()).results;

for (const backend of ['sqlite', 'postgres']) {
  test(`#958 sweep (${backend}): one-way pair flags receiver; balanced and below-floor do not`, async t => {
    const { r, now, w } = await world(backend); t.after(() => r.close());
    await w.runRiskScoring(r.db, now);
    const rows = await scored(r);
    assert.ok(rows.some(x => x.clerk_user_id === 'sink' && String(x.reasons).includes('one-way-trades')), `sink flagged: ${JSON.stringify(rows)}`);
    assert.equal(rows.some(x => x.clerk_user_id === 'feeder' && String(x.reasons).includes('one-way-trades')), false);
    assert.equal(rows.some(x => ['peer_a', 'peer_b', 'low_a', 'low_b'].includes(x.clerk_user_id) && String(x.reasons).includes('one-way-trades')), false);
  });
}

test('advanceWorld: flag off does not sweep; flag on records one-way-trades', async t => {
  const { r, now, w } = await world('sqlite'); t.after(() => r.close());
  const sim = await r.importModule('lib/world-simulation.ts');
  const prepare = r.db.prepare.bind(r.db), seen = [];
  r.db.prepare = q => { seen.push(q); return prepare(q); };
  try { await sim.advanceWorld(r.db, now, {}); } finally { r.db.prepare = prepare; }
  assert.equal(seen.filter(q => /risk_scores|player_fills|gray_trades/.test(q) && /INSERT INTO risk_scores/.test(q)).length, 0);
  await sim.advanceWorld(r.db, now, { riskScoring: true });
  const sink = (await scored(r)).find(x => x.clerk_user_id === 'sink');
  assert.ok(sink && String(sink.reasons).includes('one-way-trades'));
  const listed = await w.listRiskScores(r.db);
  assert.ok(listed.some(a => a.userId === 'sink' && a.reasons.includes('one-way-trades')));
});


for (const backend of ['sqlite', 'postgres']) {
  test(`#958 multi-feeder sink (${backend}): DISTINCT one_way — two feeders each one-way to same sink does not duplicate INSERT / ON CONFLICT`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    const now = Math.floor(r.now / 1000), iso = sec => new Date(sec * 1000).toISOString();
    const w = await r.importModule('lib/risk-scoring.ts');
    await r.db.prepare("UPDATE citizens SET created_at=? WHERE clerk_user_id IN ('alice','bob')").bind(iso(now - 10 * DAY)).run();
    const add = (id) => r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,'kindle',?,18,0,'Good standing',?,?)").bind(id, id, iso(now - 10 * DAY), iso(now - 10 * DAY)).run();
    for (const id of ['feed1', 'feed2', 'hub']) await add(id);
    const fill = async (id, buyer, seller, at) => {
      await r.db.prepare("INSERT INTO player_listings (id,seller_id,item,quantity,unit_minor,created_at) VALUES (?,?,'food',1,100,?)").bind(id, seller, at - 1).run();
      await r.db.prepare("INSERT INTO player_fills (request_id,listing_id,buyer_id,seller_id,item,quantity,amount_minor,filled_at) VALUES (?,?,?,?,'food',1,100,?)").bind(id, id, buyer, seller, at).run();
    };
    for (let i = 0; i < 3; i++) { await fill(`f1${i}`, 'feed1', 'hub', now - H + i); await fill(`f2${i}`, 'feed2', 'hub', now - H + i); }
    // Mutant without DISTINCT: LEFT JOIN one_way would emit hub twice → Postgres ON CONFLICT "cannot affect row a second time"
    await assert.doesNotReject(() => w.runRiskScoring(r.db, now));
    const rows = (await r.db.prepare("SELECT clerk_user_id, reasons, score FROM risk_scores WHERE clerk_user_id='hub'").all()).results;
    assert.equal(rows.length, 1);
    assert.match(String(rows[0].reasons), /one-way-trades/);
    assert.equal(Number(rows[0].score), cfg.oneWayTradePoints);
    // SQL itself must DISTINCT the sink uid (kills the mutant that only coincidentally works with one partner)
    assert.match(w.riskSweepSql(w.countedActSources), /one_way AS \(SELECT DISTINCT f\.to_id AS uid/);
  });
}

test('migration 0106 widens reasons CHECK and is reviewed', () => {
  const pg = readFileSync('db/postgres/0106_one_way_trades.sql', 'utf8');
  const d1 = readFileSync('drizzle/0106_one_way_trades.sql', 'utf8');
  assert.match(pg, /harimu:destructive-reviewed/); assert.match(pg, /one-way-trades/);
  assert.match(d1, /one-way-trades/); assert.match(d1, /RENAME TO risk_scores_old/);
});

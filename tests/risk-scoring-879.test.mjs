/** #879 (docs §20): risk scores for staff review. A young account and three-or-more counted civic acts in a day raise a sort key.
 *  An uncast receipt is not an act. Outside the windows the score clears. No ballot choice is stored. Flag off = no reads and no writes. Human review only. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { countedActSources, riskSweepSql, scoreRisk, riskScoring as cfg } from '../lib/risk-scoring.ts';
import { localRuntime } from './helpers/local-runtime.mjs';

const H = 3600, DAY = 86400;
const iso = sec => new Date(sec * 1000).toISOString();

test('scoreRisk is a sort key: young under 48h, dense at three acts, the two add, a cleared signal is zero', () => {
  assert.deepEqual(scoreRisk({ accountAgeSeconds: 0, civicActCount: 0 }), { score: cfg.newAccountPoints, reasons: ['new-account'], civicActCount: 0 });
  assert.deepEqual(scoreRisk({ accountAgeSeconds: cfg.youngAccountSeconds - 1, civicActCount: 2 }), { score: cfg.newAccountPoints, reasons: ['new-account'], civicActCount: 2 });
  assert.deepEqual(scoreRisk({ accountAgeSeconds: cfg.youngAccountSeconds, civicActCount: 0 }), { score: 0, reasons: [], civicActCount: 0 });
  assert.deepEqual(scoreRisk({ accountAgeSeconds: null, civicActCount: 2 }), { score: 0, reasons: [], civicActCount: 2 });
  assert.deepEqual(scoreRisk({ accountAgeSeconds: null, civicActCount: cfg.denseActFloor }), { score: cfg.denseBasePoints, reasons: ['dense-civic-acts'], civicActCount: 3 });
  assert.equal(scoreRisk({ accountAgeSeconds: null, civicActCount: cfg.denseActFloor + 2 }).score, cfg.denseBasePoints + 2 * cfg.extraActPoints);
  const both = scoreRisk({ accountAgeSeconds: 1, civicActCount: 3 });
  assert.equal(both.score, cfg.newAccountPoints + cfg.denseBasePoints);
  assert.deepEqual(both.reasons, ['new-account', 'dense-civic-acts']);
  assert.deepEqual(scoreRisk({ accountAgeSeconds: -1, civicActCount: 0 }), { score: 0, reasons: [], civicActCount: 0 });
});

async function setup(backend) {
  const r = await localRuntime({ backend });
  const now = Math.floor(r.now / 1000);
  await r.db.prepare("UPDATE citizens SET created_at=? WHERE clerk_user_id IN ('alice','bob')").bind(iso(now - 10 * DAY)).run();
  const add = (id, created) => r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,'kindle',?,18,0,'Good standing',?,?)").bind(id, id, iso(created), iso(created)).run();
  await add('maker', now - 10 * DAY);
  await add('ny', now - H); // young, no acts
  await add('both', now - H); // young and dense
  await add('od', now - 10 * DAY); // old and dense
  await add('quiet', now - 10 * DAY); // one vote
  await add('edge', now - 10 * DAY); // two in the window, one older than a day
  await add('uncast', now - 10 * DAY); // receipt without a cast ballot
  await add('boundary', now - cfg.youngAccountSeconds); // exactly 48h is not young
  const open = now - H;
  await r.db.prepare("INSERT INTO civic_elections (id,nation_id,candidates_json,opens_at,closes_at) VALUES ('e879','kindle','[\"a\",\"b\",\"c\"]',?,?)").bind(open, open + 259200).run();
  const vote = (id, at, written) => r.db.prepare("INSERT INTO civic_voter_receipts (election_id,clerk_user_id,request_id,checked_at,ballot_written,policy) VALUES ('e879',?,?,?,?, 'tier1-human-v1')").bind(id, `rq-${id}`, at, written).run();
  for (const id of ['both', 'od', 'quiet', 'edge']) await vote(id, now - H, 1);
  await vote('uncast', now - H, 0);
  await r.db.prepare("INSERT INTO civic_petitions (id,creator_id,nation_id,title,demand,created_at,expires_at,weekly_humans,threshold) VALUES ('p879','maker','kindle','Road','Fix the road',?,?,1,1)").bind(now - 2 * H, now - 2 * H + 604800).run();
  const sign = (id, at) => r.db.prepare("INSERT INTO civic_petition_signatures (petition_id,clerk_user_id,request_id,kind,signed_at,policy) VALUES ('p879',?,?,'sign',?,'tier1-human-v1')").bind(id, `sig-${id}`, at).run();
  for (const id of ['both', 'od', 'edge']) await sign(id, now - H);
  const petition = (id, at) => r.db.prepare("INSERT INTO government_petitions (request_id,clerk_user_id,nation_id,topic,period_start,occurred_at) VALUES (?,?,'kindle','food',?,?)").bind(`gp-${id}`, id, at, at).run();
  await petition('both', now - H); await petition('od', now - H); await petition('edge', now - cfg.denseWindowSeconds - 1);
  return { r, now, w: await r.importModule('lib/risk-scoring.ts'), sim: await r.importModule('lib/world-simulation.ts') };
}
const stored = async r => (await r.db.prepare('SELECT clerk_user_id, score, reasons, civic_act_count FROM risk_scores ORDER BY clerk_user_id').all()).results.map(x => ({ ...x, score: Number(x.score), civic_act_count: Number(x.civic_act_count) }));

for (const backend of ['sqlite', 'postgres']) {
  test(`sweep (${backend}): young and dense accounts score; one act, an uncast receipt, the 48h boundary and a day-old act do not; re-run is idempotent; aging clears`, async t => {
    const { r, now, w } = await setup(backend); t.after(() => r.close());
    const sql = w.riskSweepSql(w.countedActSources, w.riskScoring);
    assert.doesNotMatch(sql, /ranking|anonymous_ballot|poc_voter/);
    assert.match(sql, /ballot_written=1/);
    for (const table of ['assembly_voter_receipts', 'primary_voter_receipts', 'party_plank_votes', 'civic_petition_signatures', 'government_petitions']) assert.match(sql, new RegExp(table));
    await w.runRiskScoring(r.db, now);
    const expectRow = (id, age, acts) => { const s = scoreRisk({ accountAgeSeconds: age, civicActCount: acts }); return { clerk_user_id: id, score: s.score, reasons: s.reasons.join(','), civic_act_count: acts }; };
    const got = await stored(r);
    assert.deepEqual(got, [expectRow('both', H, 3), expectRow('ny', H, 0), expectRow('od', 10 * DAY, 3)]);
    await w.runRiskScoring(r.db, now);
    assert.deepEqual(await stored(r), got, 're-running writes the same scores');
    const cols = Object.keys((await r.db.prepare('SELECT * FROM risk_scores LIMIT 1').all()).results[0]);
    assert.deepEqual(cols.sort(), ['civic_act_count', 'clerk_user_id', 'reasons', 'score', 'updated_at']);
    await w.runRiskScoring(r.db, now + cfg.youngAccountSeconds + 1);
    assert.deepEqual((await stored(r)).map(x => x.score), [0, 0, 0], 'past both windows the sort key clears and the row stays');
  });
}

test('advanceWorld: flag off does not read or write scores; flag on records the same rows', async t => {
  const { r, now, w, sim } = await setup('sqlite'); t.after(() => r.close());
  const prepare = r.db.prepare.bind(r.db), seen = []; r.db.prepare = q => { seen.push(q); return prepare(q); };
  try { await sim.advanceWorld(r.db, now, {}); } finally { r.db.prepare = prepare; }
  assert.equal(seen.filter(q => /risk_scores/.test(q)).length, 0, 'flag off: no score read or write');
  assert.equal((await stored(r)).length, 0);
  await sim.advanceWorld(r.db, now, { riskScoring: true });
  assert.deepEqual((await stored(r)).map(x => x.clerk_user_id), ['both', 'ny', 'od']);
  assert.equal((await w.listRiskScores(r.db)).length, 3);
});

test('admin route: flag off or short token = 404, wrong bearer = 401, right bearer lists highest then newest, review only', async t => {
  const { r, now, w } = await setup('sqlite'); t.after(() => r.close());
  await w.runRiskScoring(r.db, now);
  const route = await r.importModule('app/api/admin/risk-scores/route.ts'), token = 'fixture-admin-token-879';
  const src = readFileSync('app/api/admin/risk-scores/route.ts', 'utf8');
  const handler = src.slice(src.indexOf('export async function GET'));
  assert.ok(handler.indexOf('riskScoringEnabled') < handler.indexOf('getDatabase('), '404 is decided before any database access');
  const get = auth => route.GET(new Request('https://fixture.invalid/api/admin/risk-scores', { headers: auth ? { Authorization: auth } : {} }));
  r.setFixtureEnv('HARIMU_RISK_SCORING_ENABLED', 'false'); r.setFixtureEnv('HARIMU_ADMIN_TOKEN', token);
  assert.equal((await get(`Bearer ${token}`)).status, 404, 'flag off');
  r.setFixtureEnv('HARIMU_RISK_SCORING_ENABLED', 'true'); r.setFixtureEnv('HARIMU_ADMIN_TOKEN', 'short');
  assert.equal((await get('Bearer short')).status, 404);
  r.setFixtureEnv('HARIMU_ADMIN_TOKEN', token);
  assert.equal((await get('Bearer wrong-token-wrong-token')).status, 401);
  const ok = await get(`Bearer ${token}`); assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.reviewOnly, true);
  assert.deepEqual(body.accounts.map(a => [a.userId, a.reasons.join(',')]), [['both', 'new-account,dense-civic-acts'], ['ny', 'new-account'], ['od', 'dense-civic-acts']]);
  assert.equal(ok.headers.get('Cache-Control'), 'private, no-store');
});

test('the citizen write path is the only sweep, and both migrations are additive', () => {
  const citizen = readFileSync('app/api/citizen/route.ts', 'utf8');
  assert.match(citizen, /HARIMU_RISK_SCORING_ENABLED === 'true' \? \{ riskScoring: true \}/);
  assert.doesNotMatch(readFileSync('app/api/world/route.ts', 'utf8'), /riskScoring/);
  for (const file of ['drizzle/0097_risk_scores.sql', 'db/postgres/0097_risk_scores.sql']) {
    const sql = readFileSync(file, 'utf8');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS risk_scores/);
    assert.doesNotMatch(sql, /\b(DROP\s+[A-Z]|RENAME\b|TRUNCATE\b|DELETE\s+FROM\b|UPDATE\b)/i, file);
  }
  assert.throws(() => riskSweepSql(countedActSources, { ...cfg, denseActFloor: 1.5 }));
  assert.throws(() => riskSweepSql([{ name: 'x', sql: 'SELECT 1; DROP TABLE citizens' }]));
});

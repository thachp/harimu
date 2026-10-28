/** #879 (docs §20): risk scores for staff review. A young account and dense counted civic acts raise a sort key.
 *  #943: Clerk email signals (disposable domain / plus-sub-address) mirrored in clerk_risk_signals also raise the sort key when HARIMU_CLERK_RISK_SIGNALS_ENABLED is on.
 *  #958: repeated one-way value transfers (player_fills + gray_trades) raise the receiving account for staff review.
 *  Humans review the list. This module does not penalize a citizen or decide what they may do.
 *  Flag HARIMU_RISK_SCORING_ENABLED: "true" in preview, "false" in production. Off: the sweep is not called (no reads, no writes).
 *  [ASSUMPTION] windows and point weights are tuning. §20 names the signals and does not set numbers. */
import type { GameDatabase } from './database-contract';

export const riskScoringEnabled = (env: { HARIMU_RISK_SCORING_ENABLED?: string } | null | undefined) => env?.HARIMU_RISK_SCORING_ENABLED === 'true';
export const riskReasons = ['new-account', 'dense-civic-acts', 'clerk-email', 'one-way-trades'] as const;
export type RiskReason = (typeof riskReasons)[number];
/** [ASSUMPTION] 48h young window; 24h dense/trade window; three acts or three one-way fills is the review floor; one-way means no reverse fills in the window. */
export const riskScoring = Object.freeze({
  youngAccountSeconds: 48 * 3600, denseWindowSeconds: 24 * 3600, denseActFloor: 3, oneWayTradeFloor: 3,
  newAccountPoints: 40, denseBasePoints: 30, extraActPoints: 10, clerkEmailPoints: 25, oneWayTradePoints: 35,
});

const reasonsCheck = `reasons IN (
  '','new-account','dense-civic-acts','clerk-email','one-way-trades',
  'new-account,dense-civic-acts','new-account,clerk-email','new-account,one-way-trades',
  'dense-civic-acts,clerk-email','dense-civic-acts,one-way-trades','clerk-email,one-way-trades',
  'new-account,dense-civic-acts,clerk-email','new-account,dense-civic-acts,one-way-trades',
  'new-account,clerk-email,one-way-trades','dense-civic-acts,clerk-email,one-way-trades',
  'new-account,dense-civic-acts,clerk-email,one-way-trades'
)`;

export const riskScoresSchema = `CREATE TABLE IF NOT EXISTS risk_scores (
 clerk_user_id TEXT NOT NULL PRIMARY KEY REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 score INTEGER NOT NULL CHECK(score>=0),
 reasons TEXT NOT NULL CHECK(${reasonsCheck}),
 civic_act_count INTEGER NOT NULL CHECK(civic_act_count>=0),
 updated_at INTEGER NOT NULL,
 CHECK((score=0 AND reasons='') OR (score>0 AND reasons<>''))
)`;

/** Who and when only: a cast ballot (never the ranking), a petition signature, a government petition, a plank vote. NPC claiming has no table yet. Preview poc_ receipts are the civic tables renamed at runtime, so they are not a second source. */
export type CountedActSource = { name: string; sql: string };
export const countedActSources: readonly CountedActSource[] = [
  { name: 'civic-vote', sql: 'SELECT clerk_user_id AS uid, checked_at AS at FROM civic_voter_receipts WHERE ballot_written=1' },
  { name: 'assembly-vote', sql: 'SELECT clerk_user_id AS uid, checked_at AS at FROM assembly_voter_receipts WHERE ballot_written=1' },
  { name: 'primary-vote', sql: 'SELECT clerk_user_id AS uid, checked_at AS at FROM primary_voter_receipts WHERE ballot_written=1' },
  { name: 'petition-signature', sql: 'SELECT clerk_user_id AS uid, signed_at AS at FROM civic_petition_signatures' },
  { name: 'government-petition', sql: 'SELECT clerk_user_id AS uid, occurred_at AS at FROM government_petitions' },
  { name: 'plank-vote', sql: 'SELECT clerk_user_id AS uid, voted_at AS at FROM party_plank_votes' },
];

/** #958: code-constant trade edges. Cash flows buyer → seller on both player_fills and gray_trades. Never from request/env/config. */
export type OneWayTradeSource = { name: string; sql: string };
export const oneWayTradeSources: readonly OneWayTradeSource[] = [
  { name: 'player-fills', sql: 'SELECT buyer_id AS from_id, seller_id AS to_id, filled_at AS at FROM player_fills' },
  { name: 'gray-trades', sql: 'SELECT buyer_id AS from_id, seller_id AS to_id, traded_at AS at FROM gray_trades' },
];

/** Pure sort key. `accountAgeSeconds` null means the enrollment time is unreadable (not young). `oneWayTrades` is the §20 trade-graph flag (#958). */
export function scoreRisk(input: { accountAgeSeconds: number | null; civicActCount: number; clerkEmailRisk?: boolean; oneWayTrades?: boolean }, config = riskScoring): { score: number; reasons: RiskReason[]; civicActCount: number } {
  const count = input.civicActCount, age = input.accountAgeSeconds;
  const young = typeof age === 'number' && age >= 0 && age < config.youngAccountSeconds;
  const dense = count >= config.denseActFloor;
  const clerk = input.clerkEmailRisk === true;
  const oneWay = input.oneWayTrades === true;
  const reasons: RiskReason[] = [];
  let score = 0;
  if (young) { reasons.push('new-account'); score += config.newAccountPoints; }
  if (dense) { reasons.push('dense-civic-acts'); score += config.denseBasePoints + (count - config.denseActFloor) * config.extraActPoints; }
  if (clerk) { reasons.push('clerk-email'); score += config.clerkEmailPoints; }
  if (oneWay) { reasons.push('one-way-trades'); score += config.oneWayTradePoints; }
  return { score, reasons, civicActCount: count };
}

const whole = (n: number) => { if (!Number.isSafeInteger(n) || n < 0) throw new Error('Invalid risk scoring config.'); return String(n); };
// SECURITY: each source sql is interpolated. It must stay a code-constant list and must never come from a request, env or config. Point weights are code-constant integers.
export const riskSweepSql = (sources: readonly CountedActSource[], config = riskScoring, trades: readonly OneWayTradeSource[] = oneWayTradeSources) => {
  if (!sources.length || sources.some(s => /[?;]|--|\/\*/.test(s.sql))) throw new Error('Counted-act sources must be comment-free code constants.');
  if (!trades.length || trades.some(s => /[?;]|--|\/\*/.test(s.sql))) throw new Error('One-way trade sources must be comment-free code constants.');
  const floor = whole(config.denseActFloor), tradeFloor = whole(config.oneWayTradeFloor);
  const young = whole(config.newAccountPoints), base = whole(config.denseBasePoints), extra = whole(config.extraActPoints);
  const clerkPts = whole(config.clerkEmailPoints), oneWayPts = whole(config.oneWayTradePoints);
  const acts = sources.map(s => `SELECT uid, at FROM (${s.sql}) s WHERE at>=? AND at<=?`).join(' UNION ALL ');
  const flows = trades.map(s => `SELECT from_id, to_id, at FROM (${s.sql}) t WHERE at>=? AND at<=?`).join(' UNION ALL ');
  return `INSERT INTO risk_scores (clerk_user_id, score, reasons, civic_act_count, updated_at)
WITH acts AS (${acts}),
 counts AS (SELECT uid, COUNT(*) AS n FROM acts GROUP BY uid),
 young AS (SELECT clerk_user_id AS uid FROM citizens WHERE CAST(strftime('%s', created_at) AS INTEGER) > ? AND CAST(strftime('%s', created_at) AS INTEGER) <= ?),
 clerk AS (SELECT clerk_user_id AS uid FROM clerk_risk_signals WHERE disposable_email=1 OR sub_address=1),
 flows AS (${flows}),
 pair_fwd AS (SELECT from_id, to_id, COUNT(*) AS n FROM flows GROUP BY from_id, to_id),
 one_way AS (SELECT DISTINCT f.to_id AS uid FROM pair_fwd f LEFT JOIN pair_fwd r ON r.from_id=f.to_id AND r.to_id=f.from_id WHERE f.n>=${tradeFloor} AND COALESCE(r.n,0)=0),
 candidates AS (SELECT uid FROM young UNION SELECT uid FROM counts WHERE n>=${floor} UNION SELECT uid FROM clerk UNION SELECT uid FROM one_way UNION SELECT clerk_user_id AS uid FROM risk_scores WHERE score>0)
SELECT c.uid,
 (CASE WHEN y.uid IS NOT NULL THEN ${young} ELSE 0 END)+(CASE WHEN COALESCE(k.n,0)>=${floor} THEN ${base}+(COALESCE(k.n,0)-${floor})*${extra} ELSE 0 END)+(CASE WHEN cl.uid IS NOT NULL THEN ${clerkPts} ELSE 0 END)+(CASE WHEN ow.uid IS NOT NULL THEN ${oneWayPts} ELSE 0 END),
 RTRIM((CASE WHEN y.uid IS NOT NULL THEN 'new-account,' ELSE '' END)||(CASE WHEN COALESCE(k.n,0)>=${floor} THEN 'dense-civic-acts,' ELSE '' END)||(CASE WHEN cl.uid IS NOT NULL THEN 'clerk-email,' ELSE '' END)||(CASE WHEN ow.uid IS NOT NULL THEN 'one-way-trades,' ELSE '' END), ','),
 COALESCE(k.n,0), ?
FROM candidates c LEFT JOIN young y ON y.uid=c.uid LEFT JOIN counts k ON k.uid=c.uid LEFT JOIN clerk cl ON cl.uid=c.uid LEFT JOIN one_way ow ON ow.uid=c.uid
ON CONFLICT(clerk_user_id) DO UPDATE SET score=excluded.score, reasons=excluded.reasons, civic_act_count=excluded.civic_act_count, updated_at=excluded.updated_at`;
};

/** One idempotent upsert of the current elevated set, and a zero-out of accounts that no longer qualify. Call only with the flag on. */
export async function runRiskScoring(db: GameDatabase, now: number, sources: readonly CountedActSource[] = countedActSources, config = riskScoring, trades: readonly OneWayTradeSource[] = oneWayTradeSources): Promise<void> {
  if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(config.youngAccountSeconds) || !Number.isSafeInteger(config.denseWindowSeconds)) throw new Error('Invalid risk scoring time.');
  const since = now - config.denseWindowSeconds, youngAfter = now - config.youngAccountSeconds;
  await db.prepare(riskSweepSql(sources, config, trades)).bind(
    ...sources.flatMap(() => [since, now]), youngAfter, now,
    ...trades.flatMap(() => [since, now]), now,
  ).run();
}

const parseReasons = (text: string): RiskReason[] => {
  if (text === '') return [];
  const parts = text.split(',');
  if (parts.some(part => !(riskReasons as readonly string[]).includes(part))) throw new Error('Unknown risk reason.');
  return parts as RiskReason[];
};
export type RiskScoreRow = { userId: string; score: number; reasons: RiskReason[]; civicActCount: number; updatedAt: number };
/** Staff read, highest score then newest. Score 0 (the signal has cleared) is omitted. */
export async function listRiskScores(db: GameDatabase, limit = 200): Promise<RiskScoreRow[]> {
  const rows = (await db.prepare('SELECT clerk_user_id, score, reasons, civic_act_count, updated_at FROM risk_scores WHERE score>0 ORDER BY score DESC, updated_at DESC, clerk_user_id LIMIT ?').bind(limit)
    .all<{ clerk_user_id: string; score: number; reasons: string; civic_act_count: number; updated_at: number }>()).results ?? [];
  return rows.map(r => ({ userId: r.clerk_user_id, score: Number(r.score), reasons: parseReasons(r.reasons), civicActCount: Number(r.civic_act_count), updatedAt: Number(r.updated_at) }));
}

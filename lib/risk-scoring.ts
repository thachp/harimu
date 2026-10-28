/** #879 (docs §20): risk scores for staff review. A young account and dense counted civic acts raise a sort key.
 *  #943: Clerk email signals (disposable domain / plus-sub-address) mirrored in clerk_risk_signals also raise the sort key when HARIMU_CLERK_RISK_SIGNALS_ENABLED is on.
 *  Humans review the list. This module does not penalize a citizen or decide what they may do.
 *  Flag HARIMU_RISK_SCORING_ENABLED: "true" in preview, "false" in production. Off: the sweep is not called (no reads, no writes).
 *  [ASSUMPTION] windows and point weights are tuning. §20 names the signals and does not set numbers. */
import type { GameDatabase } from './database-contract';

export const riskScoringEnabled = (env: { HARIMU_RISK_SCORING_ENABLED?: string } | null | undefined) => env?.HARIMU_RISK_SCORING_ENABLED === 'true';
export const riskReasons = ['new-account', 'dense-civic-acts', 'clerk-email'] as const;
export type RiskReason = (typeof riskReasons)[number];
/** [ASSUMPTION] 48 real hours matches the new-citizen grace (lib/citizenship.ts). One real day matches the docs' daily new-account limits. Three counted acts is the review floor; one vote or signature is ordinary. Clerk email points are a sort weight only. */
export const riskScoring = Object.freeze({ youngAccountSeconds: 48 * 3600, denseWindowSeconds: 24 * 3600, denseActFloor: 3, newAccountPoints: 40, denseBasePoints: 30, extraActPoints: 10, clerkEmailPoints: 25 });

export const riskScoresSchema = `CREATE TABLE IF NOT EXISTS risk_scores (
 clerk_user_id TEXT NOT NULL PRIMARY KEY REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 score INTEGER NOT NULL CHECK(score>=0),
 reasons TEXT NOT NULL CHECK(reasons IN (
  '','new-account','dense-civic-acts','clerk-email',
  'new-account,dense-civic-acts','new-account,clerk-email','dense-civic-acts,clerk-email',
  'new-account,dense-civic-acts,clerk-email'
 )),
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

/** Pure sort key. `accountAgeSeconds` null means the enrollment time is unreadable (not young). `clerkEmailRisk` is the mirrored Clerk email flag (#943). */
export function scoreRisk(input: { accountAgeSeconds: number | null; civicActCount: number; clerkEmailRisk?: boolean }, config = riskScoring): { score: number; reasons: RiskReason[]; civicActCount: number } {
  const count = input.civicActCount, age = input.accountAgeSeconds;
  const young = typeof age === 'number' && age >= 0 && age < config.youngAccountSeconds;
  const dense = count >= config.denseActFloor;
  const clerk = input.clerkEmailRisk === true;
  const reasons: RiskReason[] = [];
  let score = 0;
  if (young) { reasons.push('new-account'); score += config.newAccountPoints; }
  if (dense) { reasons.push('dense-civic-acts'); score += config.denseBasePoints + (count - config.denseActFloor) * config.extraActPoints; }
  if (clerk) { reasons.push('clerk-email'); score += config.clerkEmailPoints; }
  return { score, reasons, civicActCount: count };
}

const whole = (n: number) => { if (!Number.isSafeInteger(n) || n < 0) throw new Error('Invalid risk scoring config.'); return String(n); };
// SECURITY: each source sql is interpolated. It must stay a code-constant list (countedActSources) and must never come from a request, env or config. Point weights are code-constant integers.
export const riskSweepSql = (sources: readonly CountedActSource[], config = riskScoring) => {
  if (!sources.length || sources.some(s => /[?;]|--|\/\*/.test(s.sql))) throw new Error('Counted-act sources must be comment-free code constants.');
  const floor = whole(config.denseActFloor), young = whole(config.newAccountPoints), base = whole(config.denseBasePoints), extra = whole(config.extraActPoints), clerkPts = whole(config.clerkEmailPoints);
  const acts = sources.map(s => `SELECT uid, at FROM (${s.sql}) s WHERE at>=? AND at<=?`).join(' UNION ALL ');
  return `INSERT INTO risk_scores (clerk_user_id, score, reasons, civic_act_count, updated_at)
WITH acts AS (${acts}),
 counts AS (SELECT uid, COUNT(*) AS n FROM acts GROUP BY uid),
 young AS (SELECT clerk_user_id AS uid FROM citizens WHERE CAST(strftime('%s', created_at) AS INTEGER) > ? AND CAST(strftime('%s', created_at) AS INTEGER) <= ?),
 clerk AS (SELECT clerk_user_id AS uid FROM clerk_risk_signals WHERE disposable_email=1 OR sub_address=1),
 candidates AS (SELECT uid FROM young UNION SELECT uid FROM counts WHERE n>=${floor} UNION SELECT uid FROM clerk UNION SELECT clerk_user_id AS uid FROM risk_scores WHERE score>0)
SELECT c.uid,
 (CASE WHEN y.uid IS NOT NULL THEN ${young} ELSE 0 END)+(CASE WHEN COALESCE(k.n,0)>=${floor} THEN ${base}+(COALESCE(k.n,0)-${floor})*${extra} ELSE 0 END)+(CASE WHEN cl.uid IS NOT NULL THEN ${clerkPts} ELSE 0 END),
 CASE
  WHEN y.uid IS NOT NULL AND COALESCE(k.n,0)>=${floor} AND cl.uid IS NOT NULL THEN 'new-account,dense-civic-acts,clerk-email'
  WHEN y.uid IS NOT NULL AND COALESCE(k.n,0)>=${floor} THEN 'new-account,dense-civic-acts'
  WHEN y.uid IS NOT NULL AND cl.uid IS NOT NULL THEN 'new-account,clerk-email'
  WHEN COALESCE(k.n,0)>=${floor} AND cl.uid IS NOT NULL THEN 'dense-civic-acts,clerk-email'
  WHEN y.uid IS NOT NULL THEN 'new-account'
  WHEN COALESCE(k.n,0)>=${floor} THEN 'dense-civic-acts'
  WHEN cl.uid IS NOT NULL THEN 'clerk-email'
  ELSE ''
 END,
 COALESCE(k.n,0), ?
FROM candidates c LEFT JOIN young y ON y.uid=c.uid LEFT JOIN counts k ON k.uid=c.uid LEFT JOIN clerk cl ON cl.uid=c.uid
ON CONFLICT(clerk_user_id) DO UPDATE SET score=excluded.score, reasons=excluded.reasons, civic_act_count=excluded.civic_act_count, updated_at=excluded.updated_at`;
};

/** One idempotent upsert of the current elevated set, and a zero-out of accounts that no longer qualify. Call only with the flag on. */
export async function runRiskScoring(db: GameDatabase, now: number, sources: readonly CountedActSource[] = countedActSources, config = riskScoring): Promise<void> {
  if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(config.youngAccountSeconds) || !Number.isSafeInteger(config.denseWindowSeconds)) throw new Error('Invalid risk scoring time.');
  const since = now - config.denseWindowSeconds, youngAfter = now - config.youngAccountSeconds;
  await db.prepare(riskSweepSql(sources, config)).bind(...sources.flatMap(() => [since, now]), youngAfter, now, now).run();
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

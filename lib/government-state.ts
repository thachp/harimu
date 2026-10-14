import type {GameDatabase} from './database-contract';
import { simulateGovernment, rebaseGovernmentBudget } from './government';
export const petitionSchema = `CREATE TABLE IF NOT EXISTS government_petitions (
  request_id TEXT PRIMARY KEY, clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id),
  nation_id TEXT NOT NULL, topic TEXT NOT NULL CHECK(topic IN ('food','infrastructure','work')),
  period_start INTEGER NOT NULL, occurred_at INTEGER NOT NULL,
  UNIQUE(clerk_user_id, period_start)
)`;
export const petitionEligibilitySchema = `CREATE TABLE IF NOT EXISTS government_petition_eligibility (
  request_id TEXT PRIMARY KEY REFERENCES government_petitions(request_id),
  clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id), checked_at INTEGER NOT NULL
)`;
export const petitionEligibilitySql = `INSERT INTO government_petition_eligibility (request_id,clerk_user_id,checked_at)
  SELECT request_id,clerk_user_id,? FROM government_petitions WHERE request_id=? AND clerk_user_id=?
  ON CONFLICT(request_id) DO NOTHING`;
export const petitionSql = `INSERT INTO government_petitions
  (request_id, clerk_user_id, nation_id, topic, period_start, occurred_at)
  SELECT ?, clerk_user_id, nation_id, ?, ?, ? FROM citizens
  WHERE clerk_user_id = ? AND nation_id IN ('kindle','korund','aurelle')
    AND NOT EXISTS (SELECT 1 FROM government_petitions WHERE request_id = ?)
    AND NOT EXISTS (SELECT 1 FROM government_petitions WHERE clerk_user_id = ? AND period_start = ?)`;
export const petitionReviewSchema = `CREATE TABLE IF NOT EXISTS government_reviews (
  nation_id TEXT NOT NULL, period_start INTEGER NOT NULL, reviewed_at INTEGER NOT NULL,
  selected_topic TEXT NOT NULL CHECK(selected_topic IN ('food','infrastructure','work')),
  petition_count INTEGER NOT NULL CHECK(petition_count >= 0), snapshot_json TEXT NOT NULL,
  PRIMARY KEY(nation_id,period_start)
)`;
export const petitionResolutionSchema = `CREATE TABLE IF NOT EXISTS government_petition_resolutions (
  request_id TEXT PRIMARY KEY REFERENCES government_petitions(request_id),
  nation_id TEXT NOT NULL, period_start INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('accepted','deferred')),
  FOREIGN KEY(nation_id,period_start) REFERENCES government_reviews(nation_id,period_start)
)`;
export const petitionReviewSql = `INSERT INTO government_reviews
  (nation_id,period_start,reviewed_at,selected_topic,petition_count,snapshot_json)
  VALUES (?,?,?,?,?,?) ON CONFLICT(nation_id,period_start) DO NOTHING`;
export const petitionResolutionSql = `INSERT INTO government_petition_resolutions
  (request_id,nation_id,period_start,status)
  SELECT p.request_id,p.nation_id,p.period_start,
    CASE WHEN p.topic=r.selected_topic THEN 'accepted' ELSE 'deferred' END
  FROM government_petitions p JOIN government_petition_eligibility e ON e.request_id=p.request_id AND e.clerk_user_id=p.clerk_user_id JOIN government_reviews r
    ON r.nation_id=p.nation_id AND r.period_start=p.period_start
  WHERE p.nation_id=? AND p.period_start=?
  ON CONFLICT(request_id) DO NOTHING`;

/** Completed UTC days are reviewed once; this read may persist bounded, idempotent reviews. */
export async function readGovernment(db: GameDatabase, nationId: string, now: number, userId?: string) {
  const [budget, needs, days] = await Promise.all([
    db.prepare("SELECT initial_minor - COALESCE((SELECT SUM(wage_minor) FROM shift_settlements),0) - COALESCE((SELECT SUM(spend_minor) FROM government_policy_executions),0) AS balance FROM economy_funds WHERE id='kindle-employer'").first<{ balance: number }>(),
    db.prepare(`SELECT COUNT(*) AS households, SUM(CASE WHEN CASE WHEN c.nation_id='korund' THEN COALESCE((SELECT SUM(quantity) FROM korund_rations WHERE clerk_user_id=c.clerk_user_id),0)-COALESCE((SELECT SUM(quantity) FROM korund_meals WHERE clerk_user_id=c.clerk_user_id),0) WHEN c.nation_id='aurelle' THEN COALESCE((SELECT SUM(quantity) FROM aurelle_purchases WHERE clerk_user_id=c.clerk_user_id),0)-COALESCE((SELECT SUM(quantity) FROM aurelle_meals WHERE clerk_user_id=c.clerk_user_id),0) ELSE COALESCE(i.quantity,0) END >= 2 THEN 1 ELSE 0 END) AS supplied
      FROM citizens c LEFT JOIN citizen_inventory_balances i ON i.clerk_user_id=c.clerk_user_id AND i.item='food'
      WHERE c.nation_id=?`).bind(nationId).first<{ households: number; supplied: number }>(),
    db.prepare(`SELECT DISTINCT p.period_start FROM government_petitions p JOIN government_petition_eligibility e ON e.request_id=p.request_id AND e.clerk_user_id=p.clerk_user_id
      WHERE p.nation_id=? AND p.period_start < ? AND EXISTS (
        SELECT 1 FROM government_petitions q JOIN government_petition_eligibility qe ON qe.request_id=q.request_id AND qe.clerk_user_id=q.clerk_user_id LEFT JOIN government_petition_resolutions x ON x.request_id=q.request_id
        WHERE q.nation_id=p.nation_id AND q.period_start=p.period_start AND x.request_id IS NULL)
      ORDER BY p.period_start ASC LIMIT 30`)
      .bind(nationId, Math.floor(now/86400)*86400).all<{ period_start: number }>(),
  ]);
  const inputs = { nationId, availableBudgetMinor: nationId === 'kindle' ? Math.max(0,budget?.balance ?? 0) : 0,
    foodSecurity: needs?.households ? Math.floor(100*(needs.supplied ?? 0)/needs.households) : 100 };
  for (const day of days.results) {
    const counts = await db.prepare(`SELECT p.topic,COUNT(*) AS count FROM government_petitions p JOIN government_petition_eligibility e ON e.request_id=p.request_id AND e.clerk_user_id=p.clerk_user_id WHERE p.nation_id=? AND p.period_start=? GROUP BY p.topic`)
      .bind(nationId,day.period_start).all<{ topic: string; count: number }>();
    const snapshot = simulateGovernment({ ...inputs, petitionCounts: Object.fromEntries(counts.results.map(r=>[r.topic,r.count])) });
    if (!snapshot) return null;
    // Both statements use the winner's persisted review, even when concurrent readers disagree.
    await db.batch([
      db.prepare(petitionReviewSql).bind(nationId,day.period_start,now,snapshot.decision.topic,
        counts.results.reduce((sum,r)=>sum+r.count,0),JSON.stringify({ ...snapshot, verificationPolicy: 'tier1-v1' })),
      db.prepare(petitionResolutionSql).bind(nationId,day.period_start),
    ]);
  }
  const review = await db.prepare('SELECT period_start,reviewed_at,petition_count,snapshot_json FROM government_reviews WHERE nation_id=? ORDER BY period_start DESC LIMIT 1')
    .bind(nationId).first<{period_start:number;reviewed_at:number;petition_count:number;snapshot_json:string}>();
  const reviewedSnapshot = review ? JSON.parse(review.snapshot_json) as import('./government').GovernmentSnapshot & { verificationPolicy?: string } : null;
  const verifiedReview = reviewedSnapshot?.verificationPolicy === 'tier1-v1';
  // Legacy snapshots remain history; only reviews made under the receipt policy can affect live priority.
  // A review sets the following UTC day's priority. After that, live needs determine the fallback.
  let snapshot = verifiedReview && review && Math.floor(now/86400)*86400 === review.period_start+86400
    ? reviewedSnapshot
    : simulateGovernment({ ...inputs, petitionCounts: {} });
  if (!snapshot) return null;
  // A new safety emergency overrides a reviewed priority without rewriting the immutable record.
  if (inputs.foodSecurity < 40 && snapshot.decision.topic !== 'food') {
    snapshot = simulateGovernment({ ...inputs, petitionCounts: {} })!;
    snapshot.decision.reason += ' The reviewed priority is temporarily superseded by current food safety needs.';
  }
  if (review) {
    const active = verifiedReview && Math.floor(now/86400)*86400 === review.period_start+86400;
    if (active) snapshot = rebaseGovernmentBudget(snapshot,inputs.availableBudgetMinor,inputs.foodSecurity < 40);
    snapshot.review = {periodStart:review.period_start,reviewedAt:review.reviewed_at,petitionCount:review.petition_count,
      active,expiresAt:review.period_start+172800};
  }
  if (userId) {
    const rows = await db.prepare(`SELECT p.request_id,p.topic,p.occurred_at,e.request_id AS eligibility_receipt,x.status,r.reviewed_at,r.snapshot_json
      FROM government_petitions p LEFT JOIN government_petition_eligibility e ON e.request_id=p.request_id AND e.clerk_user_id=p.clerk_user_id LEFT JOIN government_petition_resolutions x ON x.request_id=p.request_id
      LEFT JOIN government_reviews r ON r.nation_id=x.nation_id AND r.period_start=x.period_start
      WHERE p.clerk_user_id=? AND p.nation_id=? ORDER BY p.occurred_at DESC LIMIT 14`)
      .bind(userId,nationId).all<{request_id:string;eligibility_receipt:string|null;topic:import('./government').PetitionTopic;occurred_at:number;status:'accepted'|'deferred'|null;reviewed_at:number|null;snapshot_json:string|null}>();
    snapshot.petitions = rows.results.map(r=>({requestId:r.request_id,topic:r.topic,submittedAt:r.occurred_at,
      status:r.status ?? 'pending',reviewedAt:r.reviewed_at,
      reason:!r.eligibility_receipt ? 'Legacy prototype petition retained for your records; it has no Tier 1 receipt and is not counted in new reviews.' : r.snapshot_json ? `${r.status === 'accepted' ? 'Accepted as the reviewed policy priority.' : 'Deferred because another priority took precedence.'} ${JSON.parse(r.snapshot_json).decision.reason}`
        : 'Pending until the UTC day ends; the next government visit records the daily review.'}));
  }
  return snapshot;
}

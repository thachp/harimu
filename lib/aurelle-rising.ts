import { parked } from './async-limits'; // #679
import type { GameDatabase } from './database-contract';
import { isMissingRelation, isUniqueViolation, tolerate } from './db-errors';
import { claimant, claimants, pledgeThreshold, risingConfig, risingReady, risingSucceeds, unrestSustainedSeconds, type ClaimantId } from './aurelle-rising-rules';
import { greatLord } from './aurelle-coup-rules';
import { pledgeToasts, risingStage, type RisingStage } from './claimant-copy';
export * from './aurelle-rising-rules';

/** Fill Content #269 placeholders ({claimant}, {house}, {motto}) from the claimant persona. */
export const fillClaimantCopy = (text: string, c: { name: string; house: string; motto: string }) =>
  text.replaceAll('{claimant}', c.name).replaceAll('{house}', c.house).replaceAll('{motto}', c.motto);
const stage = (s: RisingStage, c: { name: string; house: string; motto: string }) => {
  const copy = risingStage(s)!; return { notice: fillClaimantCopy(copy.notice, c), gazette: fillClaimantCopy(copy.crownGazette, c), voice: fillClaimantCopy(copy.claimantVoice, c) };
};

const claimantCheck = `CHECK(claimant_id IN (${claimants.map(c => `'${c.id}'`).join(',')}))`;
/** #71. One current pledge per Tier-1 Aurelle citizen (private; only aggregates leave the server) and one row per Rising. */
export const aurellePledgeSchema = `CREATE TABLE IF NOT EXISTS aurelle_pledges (
  clerk_user_id TEXT PRIMARY KEY REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
  claimant_id TEXT NOT NULL ${claimantCheck},
  request_id TEXT NOT NULL UNIQUE,
  pledged_at INTEGER NOT NULL,
  policy TEXT NOT NULL CHECK(policy = 'tier1-human-v1')
)`;
export const aurelleRisingSchema = `CREATE TABLE IF NOT EXISTS aurelle_risings (
  id TEXT PRIMARY KEY,
  claimant_id TEXT NOT NULL ${claimantCheck},
  opened_at INTEGER NOT NULL,
  closes_at INTEGER NOT NULL CHECK(closes_at > opened_at),
  pledges_at_open INTEGER NOT NULL CHECK(pledges_at_open >= 1),
  weekly_humans_at_open INTEGER NOT NULL CHECK(weekly_humans_at_open >= 1),
  unrest_at_open INTEGER NOT NULL,
  resolved_at INTEGER,
  outcome TEXT CHECK(outcome IS NULL OR outcome IN ('succeeded','failed')),
  pledges_at_close INTEGER,
  weekly_humans_at_close INTEGER,
  stability_at_close INTEGER,
  CHECK((resolved_at IS NULL) = (outcome IS NULL))
)`;
export const aurelleRisingIndexes = [
  'CREATE INDEX IF NOT EXISTS idx_aurelle_pledges_claimant ON aurelle_pledges(claimant_id)',
  'CREATE INDEX IF NOT EXISTS idx_aurelle_risings_opened ON aurelle_risings(opened_at)',
];
export const aurelleRisingSchemas = [aurellePledgeSchema, aurelleRisingSchema, ...aurelleRisingIndexes];

const weeklySql = `SELECT COUNT(*) AS n FROM civic_human_activity a JOIN citizens c ON c.clerk_user_id = a.clerk_user_id
  WHERE c.nation_id = 'aurelle' AND a.policy = 'tier1-human-v1' AND a.last_seen >= ? AND a.last_seen <= ?`;
const pledgeCountsSql = `SELECT p.claimant_id, COUNT(*) AS n FROM aurelle_pledges p JOIN citizens c ON c.clerk_user_id = p.clerk_user_id
  WHERE c.nation_id = 'aurelle' AND p.policy = 'tier1-human-v1' GROUP BY p.claimant_id`;

export type Crown = { claimantId: string; name: string; house: string; motto: string; color: string; crownedAt: number; how: 'rising' | 'coup' } | null;
export type RisingView = { id: string; claimantId: ClaimantId; claimantName: string; house: string; openedAt: number; closesAt: number;
  status: 'open' | 'succeeded' | 'failed'; resolvedAt: number | null };
export type AurelleRisingState = {
  enabled: boolean; asOf: number; crown: Crown;
  claimants: { id: ClaimantId; name: string; house: string; motto: string; grievance: string; programme: string; color: string; pledges: number; crowned: boolean }[];
  weeklyHumans: number; threshold: number | null; unrest: number | null; unrestSustainedSeconds: number;
  myPledge: { claimantId: ClaimantId; pledgedAt: number; changeableAt: number } | null;
  pledge: { allowed: boolean; reason: string | null };
  rising: RisingView | null;
  /** #281: public palace-coup window; added by the route only while HARIMU_AURELLE_COUP_ENABLED is on. */
  coup?: { status: 'open' | 'succeeded' | 'failed'; openedAt: number; closesAt: number; resolvedAt: number | null; newLeader: { name: string; house: string } | null } | null;
  config: typeof risingConfig;
};

export async function aurelleScores(db: GameDatabase) {
  const rows = await db.prepare("SELECT scheduled_at, unrest, stability FROM nation_stability_scores WHERE nation_id = 'aurelle' ORDER BY tick DESC LIMIT 60")
    .all<{ scheduled_at: number; unrest: number; stability: number }>().catch(tolerate(isMissingRelation, { results: [] as { scheduled_at: number; unrest: number; stability: number }[] }));
  return rows.results.map(r => ({ scheduledAt: Number(r.scheduled_at), unrest: Number(r.unrest), stability: Number(r.stability) }));
}
async function counts(db: GameDatabase) {
  const rows = (await db.prepare(pledgeCountsSql).all<{ claimant_id: ClaimantId; n: number }>()).results;
  return new Map(rows.map(r => [r.claimant_id, Number(r.n)]));
}
export const weeklyAurelleHumans = async (db: GameDatabase, now: number) =>
  Number((await db.prepare(weeklySql).bind(now - 7 * 86400, now).first<{ n: number }>())?.n ?? 0);

/** The current royal house: the latest of a successful Rising (#71) and a successful palace coup (#281), by resolution time. */
export async function readCrown(db: GameDatabase): Promise<Crown> {
  const [row, coup] = await Promise.all([
    db.prepare("SELECT claimant_id, resolved_at FROM aurelle_risings WHERE outcome = 'succeeded' ORDER BY resolved_at DESC, id DESC LIMIT 1")
      .first<{ claimant_id: ClaimantId; resolved_at: number }>().catch(tolerate(isMissingRelation, null)),
    db.prepare("SELECT ruler_id, ruler_name, house, resolved_at FROM aurelle_coups WHERE outcome = 'succeeded' ORDER BY resolved_at DESC, id DESC LIMIT 1")
      .first<{ ruler_id: string; ruler_name: string; house: string; resolved_at: number }>().catch(tolerate(isMissingRelation, null)),
  ]);
  const c = row ? claimant(row.claimant_id) : null;
  const lord = coup ? greatLord(coup.ruler_id) : null;
  if (coup && lord && (!row || Number(coup.resolved_at) >= Number(row.resolved_at)))
    return { claimantId: `coup:${lord.id}`, name: coup.ruler_name, house: coup.house, motto: lord.motto, color: lord.color, crownedAt: Number(coup.resolved_at), how: 'coup' };
  return c && row ? { claimantId: c.id, name: c.name, house: c.house, motto: c.motto, color: c.color, crownedAt: Number(row.resolved_at), how: 'rising' } : null;
}

const risingView = (r: { id: string; claimant_id: ClaimantId; opened_at: number; closes_at: number; resolved_at: number | null; outcome: 'succeeded' | 'failed' | null }): RisingView => {
  const c = claimant(r.claimant_id)!;
  return { id: r.id, claimantId: c.id, claimantName: c.name, house: c.house, openedAt: Number(r.opened_at), closesAt: Number(r.closes_at),
    status: r.outcome ?? 'open', resolvedAt: r.resolved_at === null ? null : Number(r.resolved_at) };
};

/** Read-only (GETs). `eligibility` is the caller's server-side Tier-1 check; nation is read from the citizen row. */
export async function readAurelleRising(db: GameDatabase, userId: string | null, now: number, eligibility: { tier1: boolean; reason: string }, enabled: boolean): Promise<AurelleRisingState> {
  const [citizen, mine, byClaimant, weekly, scores, crown, latest] = await Promise.all([
    userId ? db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id = ?').bind(userId).first<{ nation_id: string }>() : null,
    userId ? db.prepare('SELECT claimant_id, pledged_at FROM aurelle_pledges WHERE clerk_user_id = ?').bind(userId).first<{ claimant_id: ClaimantId; pledged_at: number }>() : null,
    counts(db), weeklyAurelleHumans(db, now), aurelleScores(db), readCrown(db),
    db.prepare('SELECT id, claimant_id, opened_at, closes_at, resolved_at, outcome FROM aurelle_risings ORDER BY opened_at DESC, id DESC LIMIT 1')
      .first<{ id: string; claimant_id: ClaimantId; opened_at: number; closes_at: number; resolved_at: number | null; outcome: 'succeeded' | 'failed' | null }>(),
  ]);
  const changeableAt = mine ? Number(mine.pledged_at) + risingConfig.pledgeChangeSeconds : 0;
  const reason = !enabled ? 'Pledges to Aurelle claimants are not open yet.'
    : !userId ? 'Sign in as an Aurelle citizen to pledge.'
    : citizen?.nation_id !== 'aurelle' ? 'Only citizens of Aurelle can pledge to an Aurelle claimant.'
    : !eligibility.tier1 ? `Only Tier-1 verified citizens can pledge. ${eligibility.reason}`
    : mine && now < changeableAt ? pledgeToasts.cooldown.text
    : null;
  return {
    enabled, asOf: now, crown,
    claimants: claimants.map(c => ({ ...c, pledges: byClaimant.get(c.id) ?? 0, crowned: crown?.claimantId === c.id })),
    weeklyHumans: weekly, threshold: pledgeThreshold(weekly), unrest: scores[0]?.unrest ?? null, unrestSustainedSeconds: unrestSustainedSeconds(scores, now),
    myPledge: mine ? { claimantId: mine.claimant_id, pledgedAt: Number(mine.pledged_at), changeableAt } : null,
    pledge: { allowed: reason === null, reason },
    rising: latest ? risingView(latest) : null,
    config: risingConfig,
  };
}

/** Upsert: the first pledge always lands; a change lands only to a different claimant after the 7-day wait. */
export const pledgeSql = `INSERT INTO aurelle_pledges (clerk_user_id, claimant_id, request_id, pledged_at, policy)
  SELECT c.clerk_user_id, ?, ?, ?, 'tier1-human-v1' FROM citizens c WHERE c.clerk_user_id = ? AND c.nation_id = 'aurelle'
  ON CONFLICT(clerk_user_id) DO UPDATE SET claimant_id = excluded.claimant_id, request_id = excluded.request_id, pledged_at = excluded.pledged_at
  WHERE aurelle_pledges.claimant_id != excluded.claimant_id AND aurelle_pledges.pledged_at <= excluded.pledged_at - ${risingConfig.pledgeChangeSeconds}`;

/** Caller has already verified Tier 1 with fresh trusted evidence (never from request data). */
export async function pledge(db: GameDatabase, userId: string, command: { requestId: string; claimantId: ClaimantId }, now: number): Promise<{ status: number; error?: string; replayed?: boolean }> {
  const prior = await db.prepare('SELECT clerk_user_id, claimant_id FROM aurelle_pledges WHERE request_id = ?').bind(command.requestId).first<{ clerk_user_id: string; claimant_id: string }>();
  if (prior) return prior.clerk_user_id === userId && prior.claimant_id === command.claimantId ? { status: 200, replayed: true } : { status: 409, error: 'Request identifier already used for another intent.' };
  const citizen = await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id = ?').bind(userId).first<{ nation_id: string }>();
  if (citizen?.nation_id !== 'aurelle') return { status: 403, error: 'Only citizens of Aurelle can pledge to an Aurelle claimant.' };
  const crown = await readCrown(db);
  if (crown?.claimantId === command.claimantId) return { status: 409, error: `${crown.name} already holds the crown.` };
  const current = await db.prepare('SELECT claimant_id, pledged_at FROM aurelle_pledges WHERE clerk_user_id = ?').bind(userId).first<{ claimant_id: string; pledged_at: number }>();
  if (current?.claimant_id === command.claimantId) return { status: 200 };
  await db.prepare(pledgeSql).bind(command.claimantId, command.requestId, now, userId)
    .run().catch(tolerate(isUniqueViolation, undefined)); // a concurrent identical pledge may win the unique request_id; the read below decides
  const after = await db.prepare('SELECT claimant_id, request_id FROM aurelle_pledges WHERE clerk_user_id = ?').bind(userId).first<{ claimant_id: string; request_id: string }>();
  if (after?.request_id === command.requestId) return { status: 200 };
  return { status: 409, error: pledgeToasts.cooldown.text };
}

const coupWindowOpenSql = 'SELECT 1 FROM aurelle_coups WHERE window_opened_at IS NOT NULL AND resolved_at IS NULL';
const iso = (seconds: number) => new Date(seconds * 1000).toISOString();
const gazette = (headline: string, detail: string) => `INSERT INTO world_events (kind, headline, detail, location, occurred_at, sort_order)
  SELECT 'court-gazette', '${headline.replace(/'/g, "''")}', '${detail.replace(/'/g, "''")}', 'Aurelle', ?, ?`;

/**
 * World tick (write path, flag on): resolve a closed Crisis Window exactly once, then open a Rising when the leading
 * claimant's Tier-1 pledges reach 15% of weekly-active Tier-1 Aurelle humans and Unrest has stayed ≥ 60 for 48 real hours.
 * Each step is one batch whose row write and Court Gazette entry share a guard, so a retry or a racing request adds nothing.
 */
export async function runAurelleRising(db: GameDatabase, now: number) {
  // #679: every read below is read-only and independent of the others, so they start together (one round trip instead of about six in a row).
  // A read whose branch is not taken is never awaited, so its rejection is parked (no unhandled rejection); a branch that uses it still rethrows as before.
  // While a Rising is open, only the open row, scores, counts and weekly reads are used: up to 3 reads (coup window, last resolution, crown) run unused.
  // That is the cost of one round trip instead of about six; they are read-only.
  const openRead = db.prepare('SELECT id, claimant_id, closes_at FROM aurelle_risings WHERE resolved_at IS NULL ORDER BY opened_at LIMIT 1')
    .first<{ id: string; claimant_id: ClaimantId; closes_at: number }>();
  const scoresRead = parked(aurelleScores(db)), countsRead = parked(counts(db)), weeklyRead = parked(weeklyAurelleHumans(db, now));
  const coupRead = parked(db.prepare(coupWindowOpenSql).first().catch(tolerate(isMissingRelation, null)));
  const lastRead = parked(db.prepare('SELECT MAX(resolved_at) AS t FROM aurelle_risings').first<{ t: number | null }>()), crownRead = parked(readCrown(db));
  const open = await openRead;
  const scores = await scoresRead;
  if (open) {
    if (now < Number(open.closes_at)) return;
    const c = claimant(open.claimant_id)!;
    const [byClaimant, weekly] = await Promise.all([countsRead, weeklyRead]);
    const pledges = byClaimant.get(c.id) ?? 0, stability = scores[0]?.stability ?? 100;
    const outcome = risingSucceeds({ pledges, weeklyHumans: weekly, stability }) ? 'succeeded' : 'failed';
    const copy = stage(outcome === 'succeeded' ? 'rising-succeeded' : 'rising-failed', c);
    const [headline, detail] = [copy.gazette, `${copy.notice} ${copy.voice}`];
    await db.batch([
      db.prepare(`UPDATE aurelle_risings SET resolved_at = ?, outcome = ?, pledges_at_close = ?, weekly_humans_at_close = ?, stability_at_close = ?
        WHERE id = ? AND resolved_at IS NULL`).bind(now, outcome, pledges, weekly, stability, open.id),
      db.prepare(`${gazette(headline, detail)} WHERE EXISTS (SELECT 1 FROM aurelle_risings WHERE id = ? AND resolved_at = ? AND outcome = ?)
        AND NOT EXISTS (SELECT 1 FROM world_events WHERE kind = 'court-gazette' AND occurred_at = ?)`)
        .bind(iso(now), -now, open.id, now, outcome, iso(now)),
    ]);
    return;
  }
  // #281: a palace-coup Crisis Window and a Rising window are never open at once.
  if (await coupRead) return;
  const last = await lastRead;
  if (last?.t != null && now < Number(last.t) + risingConfig.cooldownSeconds) return;
  const [byClaimant, weekly, crown] = await Promise.all([countsRead, weeklyRead, crownRead]);
  const leader = claimants.filter(c => c.id !== crown?.claimantId).map(c => ({ c, n: byClaimant.get(c.id) ?? 0 })).sort((a, b) => b.n - a.n || a.c.id.localeCompare(b.c.id))[0];
  const sustained = unrestSustainedSeconds(scores, now);
  if (!leader || !risingReady({ pledges: leader.n, weeklyHumans: weekly, sustainedSeconds: sustained })) return;
  const id = `rising:${now}`;
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO aurelle_risings (id, claimant_id, opened_at, closes_at, pledges_at_open, weekly_humans_at_open, unrest_at_open)
      SELECT ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM aurelle_risings WHERE resolved_at IS NULL) AND NOT EXISTS (${coupWindowOpenSql})`)
      .bind(id, leader.c.id, now, now + risingConfig.windowSeconds, leader.n, weekly, scores[0].unrest),
    db.prepare(`${gazette(stage('crisis-window-open', leader.c).gazette, `${stage('crisis-window-open', leader.c).notice} ${stage('crisis-window-open', leader.c).voice}`)}
      WHERE EXISTS (SELECT 1 FROM aurelle_risings WHERE id = ?) AND NOT EXISTS (SELECT 1 FROM world_events WHERE kind = 'court-gazette' AND occurred_at = ?)`)
      .bind(iso(now), -now, id, iso(now)),
  ]);
}

import { parked } from './async-limits'; // #679
import { readCrown } from './aurelle-rising';
import { readPresidium } from './korund-presidium';
import type {GameDatabase} from './database-contract';
import { simulateGovernment, rebaseGovernmentBudget, confluencePartySnapshot, fulmaraExchangeBellSnapshot, fulmaraGovernmentSnapshot, fulmaraGrandRegattaSnapshot, fulmaraResolutionsSnapshot, ilmarFeastOfFirstLightSnapshot, ilmarPrismContractsSnapshot, ilmarSanctumSnapshot, meridianExamDaySnapshot, meridianPartySnapshot, meridianTurbineDaySnapshot, varkandGovernmentSnapshot, varkandPlebisciteSnapshot, veldwoodCouncilSnapshot, veldwoodDividendDaySnapshot, veldwoodVoteDaySnapshot, withAurelleCrownCalendar, withAurelleHearthNight, withConfluenceAssemblyElection, withConfluenceCanalFestival, withConfluenceParty, withConfluenceQuotaDay, withFulmaraCouncil, withFulmaraExchangeBell, withFulmaraGrandRegatta, withFulmaraResolutions, withHoarvaleAuroraNight, withHoarvaleHonorsListDay, withHoarvaleMoot, withIlmarFeastOfFirstLight, withIlmarPrismContracts, withIlmarSanctum, withKindleElectionClock, withKindleFoundersForgeDay, withKindleMarketBell, withVarkandMusterDay, withKorundChairmanBirthday, withKorundPeoplesCongress, withKorundPlanCalendar, withMeridianExamDay, withMeridianPartyState, withMeridianTurbineDay, withVarkandDirectorate, withVarkandPlebiscite, withVeldwoodCouncil, withVeldwoodDividendDay, withVeldwoodVoteDay } from './government';
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

/** #86 (QA1): report only what spending allows. Policy spend is guarded by the kindle-employer fund alone, so the budget is
 *  min(fund, cap); the kindle-treasury balance is not spendable yet and is not added. */
export function spendableKindleBudget(fundMinor: number, capMinor: number): number {
  return Math.max(0, Math.min(Number(fundMinor), Number(capMinor)));
}

export async function latchGovernmentReviews(db: GameDatabase, nationId: string, now: number) {
  await readGovernment(db, nationId, now);
}

type ReviewRow = {period_start:number;reviewed_at:number;petition_count:number;snapshot_json:string};
/** Completed UTC days are reviewed once. By default this persists bounded, idempotent reviews (POST and world-tick paths).
 *  With readOnly (#205, GET /api/citizen) the same reviews are projected in memory and nothing is written. */
export async function readGovernment(db: GameDatabase, nationId: string, now: number, userId?: string, options: { readOnly?: boolean; korundPresidium?: boolean; hoarvaleAssent?: boolean; varkandDirectorate?: boolean; hoarvaleMoot?: boolean; varkandPlebiscite?: boolean; veldwoodCouncil?: boolean; veldwoodVoteDay?: boolean; veldwoodDividendDay?: boolean; fulmaraCouncil?: boolean; fulmaraResolutions?: boolean; fulmaraExchangeBell?: boolean; fulmaraGrandRegatta?: boolean; ilmarSanctum?: boolean; ilmarFeastOfFirstLight?: boolean; ilmarPrismContracts?: boolean; confluenceParty?: boolean; confluenceAssemblyElection?: boolean; confluenceCanalFestival?: boolean; confluenceQuotaDay?: boolean; meridianPartySchedule?: boolean; meridianExamDay?: boolean; meridianTurbineDay?: boolean; korundPlanCalendar?: boolean; korundChairmanBirthday?: boolean; korundPeoplesCongress?: boolean; aurelleCrownCalendar?: boolean; aurelleHearthNight?: boolean; kindleElectionClock?: boolean; kindleFoundersForgeDay?: boolean; kindleMarketBell?: boolean; varkandMusterDay?: boolean; kindleCycleStartAt?: number | null; hoarvaleHonorsListDay?: boolean; hoarvaleAuroraNight?: boolean } = {}) {
  // #679: the Aurelle crown read touches only the Rising and coup tables, which nothing below writes, so it starts with the first reads instead of last
  // (parked so a run that returns early never leaves an unhandled rejection; the crown branch still rethrows).
  const crownRead = nationId === 'aurelle' ? parked(readCrown(db)) : null;
  const [budget, needs, days] = await Promise.all([
    db.prepare("SELECT initial_minor AS cap, initial_minor - COALESCE((SELECT SUM(wage_minor) FROM shift_settlements),0) - COALESCE((SELECT SUM(spend_minor) FROM government_policy_executions),0) AS balance FROM economy_funds WHERE id='kindle-employer'").first<{ balance: number; cap: number }>(),
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
  const inputs = { nationId, availableBudgetMinor: nationId === 'kindle' ? spendableKindleBudget(budget?.balance ?? 0, budget?.cap ?? 0) : 0,
    foodSecurity: needs?.households ? Math.floor(100*(needs.supplied ?? 0)/needs.households) : 100 };
  const project = (petitionCounts: Record<string, number>) => simulateGovernment({ ...inputs, petitionCounts, now, hoarvaleAssent: options.hoarvaleAssent === true });
  const projected = new Map<number, ReviewRow & { selected_topic: string }>();
  for (const day of days.results) {
    const counts = await db.prepare(`SELECT p.topic,COUNT(*) AS count FROM government_petitions p JOIN government_petition_eligibility e ON e.request_id=p.request_id AND e.clerk_user_id=p.clerk_user_id WHERE p.nation_id=? AND p.period_start=? GROUP BY p.topic`)
      .bind(nationId,day.period_start).all<{ topic: string; count: number }>();
    const snapshot = project(Object.fromEntries(counts.results.map(r=>[r.topic,r.count])));
    if (!snapshot) return null;
    const petitionCount = counts.results.reduce((sum,r)=>sum+r.count,0);
    const snapshotJson = JSON.stringify({ ...snapshot, verificationPolicy: 'tier1-v1' });
    if (options.readOnly) {
      // Mirror ON CONFLICT DO NOTHING: an already persisted review for the day wins over a fresh computation.
      const existing = await db.prepare('SELECT period_start,reviewed_at,petition_count,snapshot_json,selected_topic FROM government_reviews WHERE nation_id=? AND period_start=?')
        .bind(nationId,day.period_start).first<ReviewRow & { selected_topic: string }>();
      projected.set(day.period_start, existing ?? { period_start: day.period_start, reviewed_at: now, petition_count: petitionCount, snapshot_json: snapshotJson, selected_topic: snapshot.decision.topic });
      continue;
    }
    // Both statements use the winner's persisted review, even when concurrent readers disagree.
    await db.batch([
      db.prepare(petitionReviewSql).bind(nationId,day.period_start,now,snapshot.decision.topic,petitionCount,snapshotJson),
      db.prepare(petitionResolutionSql).bind(nationId,day.period_start),
    ]);
  }
  const persisted = await db.prepare('SELECT period_start,reviewed_at,petition_count,snapshot_json FROM government_reviews WHERE nation_id=? ORDER BY period_start DESC LIMIT 1')
    .bind(nationId).first<ReviewRow>();
  const latestProjected = [...projected.values()].sort((a,b)=>b.period_start-a.period_start)[0];
  const review = latestProjected && (!persisted || latestProjected.period_start > persisted.period_start) ? latestProjected : persisted;
  const reviewedSnapshot = review ? JSON.parse(review.snapshot_json) as import('./government').GovernmentSnapshot & { verificationPolicy?: string } : null;
  const verifiedReview = reviewedSnapshot?.verificationPolicy === 'tier1-v1';
  // Legacy snapshots remain history; only reviews made under the receipt policy can affect live priority.
  // A review sets the following UTC day's priority. After that, live needs determine the fallback.
  let snapshot = verifiedReview && review && Math.floor(now/86400)*86400 === review.period_start+86400
    ? reviewedSnapshot
    : project({});
  if (!snapshot) {
    const nowMs = now * 1000; // #1085/#1094/#1098/#1102/#1107/#1137/#1113/#1114/#1133/#1175/#1116/#1122/#1130/#1139/#1150/#1169: now is seconds; these clocks are integer ms. Flags off stay null.
    if (nationId === 'varkand') {
      const muster = (built: import('./government').GovernmentSnapshot | null) => built && options.varkandMusterDay ? withVarkandMusterDay(built, nowMs, true) : built; // #1151: rides on an existing Varkand read
      if (options.varkandDirectorate) {
        const built = varkandGovernmentSnapshot(nowMs, true)!;
        return muster(options.varkandPlebiscite ? withVarkandPlebiscite(built, nowMs, true) : built);
      }
      return muster(varkandPlebisciteSnapshot(nowMs, !!options.varkandPlebiscite));
    }
    if (nationId === 'veldwood') {
      const withDividend = (built: import('./government').GovernmentSnapshot | null) => built && options.veldwoodDividendDay ? withVeldwoodDividendDay(built, nowMs, true) : built; // #1159
      if (options.veldwoodCouncil) {
        const built = veldwoodCouncilSnapshot(nowMs, true)!;
        return withDividend(options.veldwoodVoteDay ? withVeldwoodVoteDay(built, nowMs, true) : built);
      }
      if (options.veldwoodVoteDay) return withDividend(veldwoodVoteDaySnapshot(nowMs, true));
      return veldwoodDividendDaySnapshot(nowMs, !!options.veldwoodDividendDay);
    }
    if (nationId === 'fulmara') {
      if (options.fulmaraCouncil) {
        const built = fulmaraGovernmentSnapshot(nowMs, true)!;
        const withResolutions = options.fulmaraResolutions ? withFulmaraResolutions(built, true) : built;
        const withBell = options.fulmaraExchangeBell ? withFulmaraExchangeBell(withResolutions, nowMs, true) : withResolutions;
        return options.fulmaraGrandRegatta ? withFulmaraGrandRegatta(withBell, nowMs, true) : withBell;
      }
      if (options.fulmaraResolutions) {
        const built = fulmaraResolutionsSnapshot(true)!;
        const withBell = options.fulmaraExchangeBell ? withFulmaraExchangeBell(built, nowMs, true) : built;
        return options.fulmaraGrandRegatta ? withFulmaraGrandRegatta(withBell, nowMs, true) : withBell;
      }
      if (options.fulmaraExchangeBell) {
        const built = fulmaraExchangeBellSnapshot(nowMs, true)!;
        return options.fulmaraGrandRegatta ? withFulmaraGrandRegatta(built, nowMs, true) : built;
      }
      return fulmaraGrandRegattaSnapshot(nowMs, !!options.fulmaraGrandRegatta); // #1178
    }
    if (nationId === 'ilmar') {
      if (options.ilmarSanctum) {
        let built = ilmarSanctumSnapshot(nowMs, true)!;
        if (options.ilmarFeastOfFirstLight) built = withIlmarFeastOfFirstLight(built, nowMs, true);
        return options.ilmarPrismContracts ? withIlmarPrismContracts(built, true) : built;
      }
      if (options.ilmarFeastOfFirstLight) {
        const built = ilmarFeastOfFirstLightSnapshot(nowMs, true)!;
        return options.ilmarPrismContracts ? withIlmarPrismContracts(built, true) : built;
      }
      return ilmarPrismContractsSnapshot(!!options.ilmarPrismContracts); // #1139
    }
    if (nationId === 'confluence') {
      const built = confluencePartySnapshot(nowMs, !!options.confluenceParty, !!options.confluenceAssemblyElection);
      if (!built) return null; // #1165/#1169: both ride on an existing Confluence read
      const withFestival = options.confluenceCanalFestival ? withConfluenceCanalFestival(built, nowMs, true) : built;
      return options.confluenceQuotaDay ? withConfluenceQuotaDay(withFestival, nowMs, true) : withFestival;
    }
    if (nationId === 'meridian') {
      const withTurbine = (built: import('./government').GovernmentSnapshot | null) => built && options.meridianTurbineDay ? withMeridianTurbineDay(built, nowMs, true) : built; // #1175
      if (options.meridianPartySchedule) {
        const built = meridianPartySnapshot(nowMs, true)!;
        return withTurbine(options.meridianExamDay ? withMeridianExamDay(built, nowMs, true) : built);
      }
      if (options.meridianExamDay) return withTurbine(meridianExamDaySnapshot(nowMs, true));
      return meridianTurbineDaySnapshot(nowMs, !!options.meridianTurbineDay); // #1175
    }
    return null;
  }
  // A new safety emergency overrides a reviewed priority without rewriting the immutable record.
  if (inputs.foodSecurity < 40 && snapshot.decision.topic !== 'food') {
    const emergency = project({});
    if (emergency) {
      snapshot = emergency;
      snapshot.decision.reason += ' The reviewed priority is temporarily superseded by current food safety needs.';
    }
  }
  if (review) {
    const active = verifiedReview && Math.floor(now/86400)*86400 === review.period_start+86400;
    if (active) snapshot = rebaseGovernmentBudget(snapshot,inputs.availableBudgetMinor,inputs.foodSecurity < 40);
    snapshot.review = {periodStart:review.period_start,reviewedAt:review.reviewed_at,petitionCount:review.petition_count,
      active,expiresAt:review.period_start+172800};
  }
  if (userId) {
    const rows = await db.prepare(`SELECT p.request_id,p.topic,p.occurred_at,p.period_start,e.request_id AS eligibility_receipt,x.status,r.reviewed_at,r.snapshot_json
      FROM government_petitions p LEFT JOIN government_petition_eligibility e ON e.request_id=p.request_id AND e.clerk_user_id=p.clerk_user_id LEFT JOIN government_petition_resolutions x ON x.request_id=p.request_id
      LEFT JOIN government_reviews r ON r.nation_id=x.nation_id AND r.period_start=x.period_start
      WHERE p.clerk_user_id=? AND p.nation_id=? ORDER BY p.occurred_at DESC LIMIT 14`)
      .bind(userId,nationId).all<{request_id:string;period_start:number;eligibility_receipt:string|null;topic:import('./government').PetitionTopic;occurred_at:number;status:'accepted'|'deferred'|null;reviewed_at:number|null;snapshot_json:string|null}>();
    for (const r of rows.results) {
      const p = !r.status && r.eligibility_receipt ? projected.get(r.period_start) : undefined;
      if (p) { r.status = r.topic === p.selected_topic ? 'accepted' : 'deferred'; r.reviewed_at = p.reviewed_at; r.snapshot_json = p.snapshot_json; }
    }
    snapshot.petitions = rows.results.map(r=>({requestId:r.request_id,topic:r.topic,submittedAt:r.occurred_at,
      status:r.status ?? 'pending',reviewedAt:r.reviewed_at,
      reason:!r.eligibility_receipt ? 'Legacy prototype petition retained for your records; it has no Tier 1 receipt and is not counted in new reviews.' : r.snapshot_json ? `${r.status === 'accepted' ? 'Accepted as the reviewed policy priority.' : 'Deferred because another priority took precedence.'} ${JSON.parse(r.snapshot_json).decision.reason}`
        : 'Pending until the UTC day ends; the next government visit records the daily review.'}));
  }
  if (crownRead) { const crown = await crownRead; if (crown) snapshot.crown = crown; } // #71
  if (nationId === 'korund' && options.korundPresidium) { // #70/#74 (flag off = no roster at all): roster derived from session records; never exposes the vote.
    const p = await readPresidium(db);
    snapshot.presidium = { chairman: { name: p.chairman.name }, seats: p.seats.map(s => ({ id: s.id, name: s.name, role: s.role, status: s.status })),
      session: p.session && { status: p.session.status, openedAt: p.session.openedAt, resolvesAt: p.session.resolvesAt, resolvedAt: p.session.resolvedAt } };
  }
  if (nationId === 'varkand' && options.varkandDirectorate) snapshot = withVarkandDirectorate(snapshot, now * 1000, true); // #1085
  if (nationId === 'varkand' && options.varkandPlebiscite) snapshot = withVarkandPlebiscite(snapshot, now * 1000, true); // #1094
  if (nationId === 'hoarvale' && options.hoarvaleMoot) snapshot = withHoarvaleMoot(snapshot, now, true); // #1096: pure, no read
  if (nationId === 'hoarvale' && options.hoarvaleHonorsListDay) snapshot = withHoarvaleHonorsListDay(snapshot, now * 1000, true); // #1136: pure, no read
  if (nationId === 'hoarvale' && options.hoarvaleAuroraNight) snapshot = withHoarvaleAuroraNight(snapshot, now * 1000, true); // #1160: pure, no read
  if (nationId === 'veldwood' && options.veldwoodCouncil) snapshot = withVeldwoodCouncil(snapshot, now * 1000, true); // #1098
  if (nationId === 'veldwood' && options.veldwoodVoteDay) snapshot = withVeldwoodVoteDay(snapshot, now * 1000, true); // #1122
  if (nationId === 'veldwood' && options.veldwoodDividendDay) snapshot = withVeldwoodDividendDay(snapshot, now * 1000, true); // #1159: pure, no read
  if (nationId === 'fulmara' && options.fulmaraCouncil) snapshot = withFulmaraCouncil(snapshot, now * 1000, true); // #1102
  if (nationId === 'fulmara' && options.fulmaraResolutions) snapshot = withFulmaraResolutions(snapshot, true); // #1130: pure, no read
  if (nationId === 'fulmara' && options.fulmaraExchangeBell) snapshot = withFulmaraExchangeBell(snapshot, now * 1000, true); // #1150
  if (nationId === 'fulmara' && options.fulmaraGrandRegatta) snapshot = withFulmaraGrandRegatta(snapshot, now * 1000, true); // #1178
  if (nationId === 'ilmar' && options.ilmarSanctum) snapshot = withIlmarSanctum(snapshot, now * 1000, true); // #1107
  if (nationId === 'ilmar' && options.ilmarFeastOfFirstLight) snapshot = withIlmarFeastOfFirstLight(snapshot, now * 1000, true); // #1137
  if (nationId === 'ilmar' && options.ilmarPrismContracts) snapshot = withIlmarPrismContracts(snapshot, true); // #1139: pure, no read
  if (nationId === 'confluence' && options.confluenceParty) snapshot = withConfluenceParty(snapshot, now * 1000, true); // #1113
  if (nationId === 'confluence' && options.confluenceAssemblyElection) snapshot = withConfluenceAssemblyElection(snapshot, now * 1000, true); // #1123
  if (nationId === 'confluence' && options.confluenceCanalFestival) snapshot = withConfluenceCanalFestival(snapshot, now * 1000, true); // #1165: pure, no read
  if (nationId === 'confluence' && options.confluenceQuotaDay) snapshot = withConfluenceQuotaDay(snapshot, now * 1000, true); // #1169: pure, no read
  if (nationId === 'meridian' && options.meridianPartySchedule) snapshot = withMeridianPartyState(snapshot, now * 1000, true); // #1114
  if (nationId === 'meridian' && options.meridianExamDay) snapshot = withMeridianExamDay(snapshot, now * 1000, true); // #1133
  if (nationId === 'meridian' && options.meridianTurbineDay) snapshot = withMeridianTurbineDay(snapshot, now * 1000, true); // #1175: pure, no read
  if (nationId === 'korund' && options.korundPlanCalendar) snapshot = withKorundPlanCalendar(snapshot, now * 1000, true); // #1116: pure, no read
  if (nationId === 'korund' && options.korundChairmanBirthday) snapshot = withKorundChairmanBirthday(snapshot, now * 1000, true); // #1147: pure, no read
  if (nationId === 'korund' && options.korundPeoplesCongress) snapshot = withKorundPeoplesCongress(snapshot, now * 1000, true); // #1170: pure, no read
  if (nationId === 'aurelle' && options.aurelleCrownCalendar) snapshot = withAurelleCrownCalendar(snapshot, now * 1000, true); // #1118
  if (nationId === 'aurelle' && options.aurelleHearthNight) snapshot = withAurelleHearthNight(snapshot, now * 1000, true); // #1146: pure, no read
  if (nationId === 'kindle' && options.kindleElectionClock) snapshot = withKindleElectionClock(snapshot, now * 1000, options.kindleCycleStartAt ?? null, true); // #1117: held cycle start adds no key
  if (nationId === 'varkand' && options.varkandMusterDay) snapshot = withVarkandMusterDay(snapshot, now * 1000, true); // #1151: pure, no read
  if (nationId === 'kindle' && options.kindleFoundersForgeDay) snapshot = withKindleFoundersForgeDay(snapshot, now * 1000, true); // #1145: pure, no read
  if (nationId === 'kindle' && options.kindleMarketBell) snapshot = withKindleMarketBell(snapshot, now * 1000, true); // #1164: pure, no read
  return snapshot;
}

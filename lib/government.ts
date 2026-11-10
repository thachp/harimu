import { AURELLE_CHARTER_FAIR_CYCLE_DAYS, aurelleNextCharterFairAt } from './aurelle-charter-fair.ts';
import { AURELLE_CORONATION_DAY_CYCLE_DAYS, aurelleNextCoronationDayAt } from './aurelle-coronation-day.ts';
import { AURELLE_HEARTH_NIGHT_CYCLE_DAYS, aurelleNextHearthNightAt } from './aurelle-hearth-night.ts';
import { AURELLE_REIGN_DISPLAY_DAYS, aurelleNextGreatCouncilWindowAt, aurelleReignStartedAt } from './aurelle-crown-calendar.ts';
import { CONFLUENCE_ASSEMBLY_INTERVAL_DAYS, confluenceLastAssemblyElectionAt, confluenceNextAssemblyElectionAt } from './confluence-assembly-election.ts';
import { CONFLUENCE_CONGRESS_INTERVAL_DAYS, CONFLUENCE_PILLARS, CONFLUENCE_TERM_LIMIT_CONGRESSES, confluenceNextPartyCongressAt } from './confluence-party.ts';
import { CONFLUENCE_CONGRESS_LANTERNS_CYCLE_DAYS, confluenceNextCongressLanternsAt } from './confluence-congress-lanterns.ts';
import { CONFLUENCE_QUOTA_DAY_CYCLE_DAYS, confluenceNextQuotaDayAt } from './confluence-quota-day.ts';
import { kindleElectionClock, type KindleElectionClock } from './kindle-election.ts';
import { KORUND_CHAIRMAN_BIRTHDAY_CYCLE_DAYS, korundNextChairmanBirthdayAt } from './korund-chairman-birthday.ts';
import { KORUND_PEOPLES_CONGRESS_CYCLE_DAYS, korundNextPeoplesCongressAt } from './korund-peoples-congress.ts';
import { KORUND_PLAN_INTERVAL_DAYS, KORUND_QUOTA_RALLIES_PER_PLAN, korundCurrentPlanStartedAt, korundNextPlanDayAt, korundNextQuotaRallyAt } from './korund-plan-calendar.ts';
import { MERIDIAN_EXAM_DAY_CYCLE_DAYS, meridianNextExamDayAt } from './meridian-exam-day.ts';
import { MERIDIAN_TURBINE_DAY_CYCLE_DAYS, MERIDIAN_TURBINE_DAY_HOST, meridianNextTurbineDayAt } from './meridian-turbine-day.ts';
import { MERIDIAN_CONGRESS_WEEK_INTERVAL_DAYS, meridianNextCongressWeekAt } from './meridian-congress-week.ts';
import { MERIDIAN_CONGRESS_INTERVAL_DAYS, MERIDIAN_PARAMOUNT_LEADER_ROLES, MERIDIAN_STANDING_COMMITTEE_SEATS, MERIDIAN_TERM_LIMIT_SUSPEND_SUPERMAJORITY, meridianNextPartyCongressAt } from './meridian-party.ts';
import { ILMAR_FEAST_OF_FIRST_LIGHT_CYCLE_DAYS, ilmarNextFeastOfFirstLightAt } from './ilmar-feast-of-first-light.ts';
import { ILMAR_GREAT_PILGRIMAGE_CYCLE_DAYS, ilmarNextGreatPilgrimageAt } from './ilmar-great-pilgrimage.ts';
import { ILMAR_ASSEMBLY_ELECTION_DAY_CYCLE_DAYS, ilmarNextAssemblyElectionDayAt } from './ilmar-assembly-election-day.ts';
import { ILMAR_COUNCIL_OF_ELDERS_SEATS, ILMAR_ORACLE_TERM, ilmarIsStillday, ilmarNextGreatPilgrimageAt as ilmarSanctumNextGreatPilgrimageAt, ilmarNextStilldayAt } from './ilmar-sanctum.ts';
import { ilmarPrismContracts, type IlmarPrismContract } from './ilmar-prism-contracts.ts';
import { varkandChairAt, varkandCommands, type VarkandCommand } from './varkand-directorate.ts';
import { VARKAND_PLEBISCITE_CYCLE_DAYS, varkandNextPlebisciteAt } from './varkand-plebiscite.ts';
import { FULMARA_COUNCIL_TERM_DAYS, FULMARA_LODESTAR_TERM_DAYS, fulmaraNextCouncilOfTenElectionAt, fulmaraNextLodestarElectionAt, fulmaraTribuneSessionEndsAt } from './fulmara-council.ts';
import { FULMARA_CHARTER_DAY_CYCLE_DAYS, fulmaraNextCharterDayAt } from './fulmara-charter-day.ts';
import { FULMARA_EXCHANGE_BELL_CYCLE_DAYS, fulmaraNextExchangeBellAt } from './fulmara-exchange-bell.ts';
import { FULMARA_FAIR_WIND_BLESSING_CYCLE_DAYS, fulmaraNextFairWindBlessingAt } from './fulmara-fair-wind-blessing.ts';
import { fulmaraResolutions, type FulmaraResolution } from './fulmara-resolutions.ts';
import { VELDWOOD_COUNCIL_TERM_DAYS, VELDWOOD_SPEAKER_ROTATION_DAYS, veldwoodCouncilSpeakerSeat, veldwoodNextCouncilElectionAt } from './veldwood-council.ts';
import { VELDWOOD_DIVIDEND_DAY_CYCLE_DAYS, veldwoodNextDividendDayAt } from './veldwood-dividend-day.ts';
import { VELDWOOD_RING_MOOT_CYCLE_DAYS, veldwoodNextRingMootAt } from './veldwood-ring-moot.ts';
import { VELDWOOD_VOTE_DAY_CYCLE_DAYS, veldwoodNextVoteDayAt } from './veldwood-vote-day.ts';
import { HOARVALE_AURORA_NIGHT_CYCLE_DAYS, hoarvaleNextAuroraNightAt } from './hoarvale-aurora-night.ts';
import { hoarvaleNextElectionNightAt } from './hoarvale-election-night.ts';
import { HOARVALE_HONORS_LIST_INTERVAL_DAYS, hoarvaleNextHonorsListDayAt } from './hoarvale-honors-list-day.ts';
import { hoarvaleMootAt, type HoarvaleMoot } from './hoarvale-moot.ts';
import { hoarvaleNextMootOpeningAt } from './hoarvale-moot-opening.ts';
import { VARKAND_LANTERN_WATCH_CYCLE_DAYS, varkandNextLanternWatchAt } from './varkand-lantern-watch.ts';
import { VARKAND_MUSTER_DAY_INTERVAL_DAYS, varkandNextMusterDayAt } from './varkand-muster-day.ts';
import { VARKAND_ROTATION_DAY_CYCLE_DAYS, varkandNextRotationDayAt } from './varkand-rotation-day.ts';
import { varkandCelebrationsCanceled } from './varkand-red-alert-cancels.ts';
import { CONFLUENCE_CANAL_FESTIVAL_HOST_CITY, CONFLUENCE_CANAL_FESTIVAL_INTERVAL_DAYS, confluenceNextCanalFestivalAt } from './confluence-canal-festival.ts';
import { FULMARA_DOCK_STRIKE_REMEMBRANCE_INTERVAL_DAYS, fulmaraNextDockStrikeRemembranceAt } from './fulmara-dock-strike-remembrance.ts';
import { FULMARA_GRAND_REGATTA_HOST_CITY, FULMARA_GRAND_REGATTA_INTERVAL_DAYS, fulmaraNextGrandRegattaAt } from './fulmara-grand-regatta.ts';
import { KINDLE_FOUNDERS_FORGE_INTERVAL_DAYS, kindleNextFoundersForgeDayAt } from './kindle-founders-forge-day.ts';
import { KINDLE_MARKET_BELL_CYCLE_DAYS, kindleNextMarketBellAt } from './kindle-market-bell.ts';

export type PetitionTopic = 'food' | 'infrastructure' | 'work';
export type GovernmentSnapshot = {
  nationId: string;
  mode: 'rule-bound simulation';
  /** #71: set when a Rising has crowned a claimant; the leader panel shows the new AI royal house. */
  crown?: { claimantId: string; name: string; house: string; motto: string; color: string; crownedAt: number; how?: 'rising' | 'coup' | 'succession' };
  /** #70/#74 Korund: current Chairman, Presidium seats and the latest emergency session (State Media rumor view). */
  presidium?: { chairman: { name: string }; seats: { id: string; name: string; role: string; status: 'serving' | 'purged' }[];
    session: { status: 'open' | 'survived' | 'purged'; openedAt: number; resolvesAt: number; resolvedAt: number | null } | null };
  /** #1085 Varkand: Chair, the five Commands, and the next Rotation Day. Present only while HARIMU_VARKAND_DIRECTORATE_ENABLED is on. */
  directorate?: { chair: VarkandCommand; commands: readonly VarkandCommand[]; nextRotationAt: number };
  /** #1094 Varkand: next Mandate Plebiscite on a 150-real-day cycle. Present only while HARIMU_VARKAND_PLEBISCITE_ENABLED is on. */
  mandatePlebiscite?: { nextAt: number; cycleDays: 150 };
  /** #1098 Veldwood: next Federal Council election and the ceremonial Speaker seat. Present only while HARIMU_VELDWOOD_COUNCIL_ENABLED is on. */
  federalCouncil?: { nextElectionAt: number; termDays: 120; speakerSeat: number; speakerRotationDays: 30 };
  /** #1122 Veldwood: next Vote Day on a 15-real-day cycle. Present only while HARIMU_VELDWOOD_VOTE_DAY_ENABLED is on. */
  voteDayCalendar?: { nextAt: number; cycleDays: 15 };
  /** #1159 Veldwood: next Dividend Day (once per game year = 30 real days). Present only while HARIMU_VELDWOOD_DIVIDEND_DAY_ENABLED is on. Pays no dividend and states no amount. */
  dividendDay?: { nextAt: number; cycleDays: 30 };
  /** #1244 Veldwood: next midsummer Ring Moot (once per game year = 30 real days, midsummer offset). Present only while HARIMU_VELDWOOD_RING_MOOT_ENABLED is on. Date only. */
  ringMoot?: { nextAt: number; cycleDays: 30 };
  /** #1102 Fulmara: Council of Ten, Lodestar and the Tribune session. Present only while HARIMU_FULMARA_COUNCIL_ENABLED is on. */
  grandCouncil?: {
    councilOfTenNextElectionAt: number; councilOfTenTermDays: 30;
    lodestarNextElectionAt: number; lodestarTermDays: 90; lodestarConsecutiveReelection: false;
    tribuneSessionEndsAt: number; tribuneVetoesPerSession: 1;
  };
  /** #1130 Fulmara: non-election shareholder resolutions with share totals. Present only while HARIMU_FULMARA_RESOLUTIONS_ENABLED is on. */
  resolutions?: FulmaraResolution[];
  /** #1150 Fulmara: next Exchange Bell on a 30-real-day cycle. Present only while HARIMU_FULMARA_EXCHANGE_BELL_ENABLED is on. Opens no trading session. */
  exchangeBell?: { nextAt: number; cycleDays: 30 };
  /** #1179 Fulmara: next Charter Day (once per game year = 30 real days). Present only while HARIMU_FULMARA_CHARTER_DAY_ENABLED is on. Date only: no charter text, shareholder vote, dividend, or bonus. */
  charterDay?: { nextAt: number; cycleDays: 30 };
  /** #1184 Fulmara: next Fair-Wind Blessing on a 30-real-day cycle. Present only while HARIMU_FULMARA_FAIR_WIND_BLESSING_ENABLED is on. Holds the next date only. */
  fairWindBlessing?: { nextAt: number; cycleDays: 30 };
  /** #1107 Ilmar: Oracle life term, 12 Elders, Stillday, and the next Great Pilgrimage. Present only while HARIMU_ILMAR_SANCTUM_CALENDAR_ENABLED is on. */
  sanctum?: { oracleTerm: 'life'; councilOfEldersSeats: 12; isStillday: boolean; nextStilldayAt: number; nextGreatPilgrimageAt: number };
  /** #1137 Ilmar: next Feast of First Light. Present only while HARIMU_ILMAR_FEAST_OF_FIRST_LIGHT_ENABLED is on. */
  feastOfFirstLight?: { nextAt: number; cycleDays: 15 };
  /** #1196 Ilmar: next Great Pilgrimage on a 30-real-day cycle. Present only while HARIMU_ILMAR_GREAT_PILGRIMAGE_ENABLED is on. Holds the next date only. */
  greatPilgrimage?: { nextAt: number; cycleDays: 30 };
  /** #1212 Ilmar: next Assembly Election day on a 120-real-day cycle. Present only while HARIMU_ILMAR_ASSEMBLY_ELECTION_DAY_ENABLED is on. Holds the next date only. */
  assemblyElectionDay?: { nextAt: number; cycleDays: 120 };
  /** #1139 Ilmar: Prism contracts, each with a title and a whole-number profit share. Present only while HARIMU_ILMAR_PRISM_CONTRACTS_ENABLED is on. */
  contracts?: IlmarPrismContract[];
  /** #1113 Confluence: Four Pillars and the next Party Congress. Present only while HARIMU_CONFLUENCE_PARTY_SCHEDULE_ENABLED is on. */
  party?: { pillars: readonly ['general_secretary', 'president', 'premier', 'assembly_chair']; termLimitCongresses: 2; nextCongressAt: number; congressIntervalDays: 150 };
  /** #1123 Confluence: next People's Assembly election window. Present only while HARIMU_CONFLUENCE_ASSEMBLY_ELECTION_ENABLED is on. Opens no ballot; the result is not binding. */
  assemblyElection?: { cycleStartedAt: number; nextElectionAt: number; intervalDays: 150; ballotOpen: false; leadershipHeedsResult: false };
  /** #1169 Confluence: next Quota Day (once per game year = 30 real days). Present only while HARIMU_CONFLUENCE_QUOTA_DAY_ENABLED is on. States no quota, target, or bonus. */
  quotaDay?: { nextAt: number; cycleDays: 30 };
  /** #1183 Confluence: next Congress Lanterns (once per game year = 30 real days). Present only while HARIMU_CONFLUENCE_CONGRESS_LANTERNS_ENABLED is on. Date only: no lantern count, delegate list, or Party text. */
  congressLanterns?: { nextAt: number; cycleDays: 30 };
  /** #1114 Meridian: Paramount Leader roles, 7-seat Standing Committee, and the next Party Congress. Present only while HARIMU_MERIDIAN_PARTY_SCHEDULE_ENABLED is on. */
  partyState?: { paramountLeaderRoles: readonly ['general_secretary', 'state_chair']; standingCommitteeSeats: 7; nextCongressAt: number; congressIntervalDays: 150; termLimitsSuspendable: true; suspendSupermajority: '2/3' };
  /** #1133 Meridian: next Exam Day. Present only while HARIMU_MERIDIAN_EXAM_DAY_ENABLED is on. */
  examDay?: { nextAt: number; cycleDays: 30 };
  /** #1175 Meridian: next Turbine Day on a 30-real-day cycle. Present only while HARIMU_MERIDIAN_TURBINE_DAY_ENABLED is on. Holds no grid output, power figure, or bonus. Shen Springs hosts it. */
  turbineDay?: { nextAt: number; cycleDays: 30; host: 'Shen Springs' };
  /** #1189 Meridian: next Congress Week (every 5 game years = 150 real days). Present only while HARIMU_MERIDIAN_CONGRESS_WEEK_ENABLED is on. Date only — no agenda, roster, or SEZ text. */
  congressWeek?: { nextAt: number; intervalDays: 150; holdsCongress: false };
  /** #1116 Korund: current Five-Year Plan start, next Plan Day and next quarterly Quota Rally. Present only while HARIMU_KORUND_PLAN_CALENDAR_ENABLED is on. */
  planCalendar?: { currentPlanStartedAt: number; nextPlanDayAt: number; nextQuotaRallyAt: number; planIntervalDays: 150; quotaRalliesPerPlan: 4 };
  /** #1147 Korund: next Chairman's Birthday. Present only while HARIMU_KORUND_CHAIRMAN_BIRTHDAY_ENABLED is on. Names no Chairman and awards no medal. */
  chairmanBirthday?: { nextAt: number; cycleDays: 30 };
  /** #1170 Korund: next People's Congress. Present only while HARIMU_KORUND_PEOPLES_CONGRESS_ENABLED is on. Holds no votes, motions, delegates, or outcomes. */
  peoplesCongress?: { nextAt: number; cycleDays: 30 };
  roles: { name: string; controller: string }[];
  decision: { title: string; reason: string; proposedSpendMinor: number; topic: PetitionTopic };
  review?: { periodStart: number; reviewedAt: number; petitionCount: number; active: boolean; expiresAt: number };
  petitions?: { requestId: string; topic: PetitionTopic; submittedAt: number; status: 'pending' | 'accepted' | 'deferred'; reason: string; reviewedAt: number | null }[];
  /** #985: Kindle Policy Ledger. Present only while HARIMU_KINDLE_POLICY_LEDGER_ENABLED is on. */
  policyLedger?: { id: string; publishedAt: number; office: string; title: string; brief: string }[];
  /** #1117 Kindle: presidential term end and the next Ballot Night. Present only while HARIMU_KINDLE_ELECTION_CLOCK_ENABLED is on and the cycle start is set. */
  electionClock?: KindleElectionClock;
  availableBudgetMinor: number;
  influenceSummary: string;
  /** #1096 Hoarvale: Moot term and investiture deadline. Present only while HARIMU_HOARVALE_MOOT_ENABLED is on. */
  moot?: HoarvaleMoot;
  /** #1136 Hoarvale: next Honors List Day (once per game year = 30 real days). Present only while HARIMU_HOARVALE_HONORS_LIST_DAY_ENABLED is on. Awards no titles. */
  honorsListDay?: { nextAt: number; intervalDays: 30; awardsTitles: false };
  /** #1160 Hoarvale: next Aurora Night. Present only while HARIMU_HOARVALE_AURORA_NIGHT_ENABLED is on. Holds no festival and adds no rest bonus. */
  auroraNight?: { nextAt: number; cycleDays: 30 };
  /** #1208 Hoarvale: next Opening of the Moot (the next term start). Present only while HARIMU_HOARVALE_MOOT_OPENING_ENABLED is on. The next date only. */
  mootOpening?: { nextAt: number };
  electionNight?: { nextAt: number }; // #1219: next date only, while HARIMU_HOARVALE_ELECTION_NIGHT_ENABLED is on
  musterDay?: { nextAt: number; intervalDays: 30; mustersTroops: false; canceled?: true }; // #1151; #1220 `canceled` only at a stored Red Alert
  /** #1207 Varkand: next Rotation Day (the existing 60-real-day Chair term). Present only while HARIMU_VARKAND_ROTATION_DAY_ENABLED is on. Date only. `canceled` is present only while a stored Red Alert holds. */
  rotationDay?: { nextAt: number; cycleDays: 60; canceled?: true };
  /** #1211 Varkand: next Lantern Watch (once per 30 real days). Present only while HARIMU_VARKAND_LANTERN_WATCH_ENABLED is on. Date only. #1220 adds `canceled` at a stored Red Alert. */
  lanternWatch?: { nextAt: number; cycleDays: 30; canceled?: true };
  /** #1165 Confluence: next Canal Festival (once per game year = 30 real days). Present only while HARIMU_CONFLUENCE_CANAL_FESTIVAL_ENABLED is on. Holds no festival. */
  canalFestival?: { nextAt: number; intervalDays: 30; hostCity: 'Lanu Terraces'; holdsFestival: false };
  /** #1178 Fulmara: next Grand Regatta (once per game year = 30 real days). Present only while HARIMU_FULMARA_GRAND_REGATTA_ENABLED is on. Holds no race. */
  grandRegatta?: { nextAt: number; intervalDays: 30; hostCity: 'Corvel Isles'; holdsRegatta: false };
  /** #1187 Fulmara: next Dock Strike remembrance (once per game year = 30 real days). Present only while HARIMU_FULMARA_DOCK_STRIKE_REMEMBRANCE_ENABLED is on. Date only. */
  dockStrikeRemembrance?: { nextAt: number; intervalDays: 30; holdsRemembrance: false };
  foundersForgeDay?: { nextAt: number; intervalDays: 30; opensFair: false }; // #1145
  /** #1164 Kindle: next Market Bell on a 30-real-day cycle. Present only while HARIMU_KINDLE_MARKET_BELL_ENABLED is on. Holds no market event, price move, or bonus. */
  marketBell?: { nextAt: number; cycleDays: 30 };
  /** #1089: Hoarvale Moot bills. Present only when the caller passes hoarvaleAssent (the server flag). Assent sits on the bill. */
  bills?: HoarvaleBill[];
  /** #612: the Founding Period state, only present while HARIMU_FOUNDING_PERIOD_ENABLED is on (kindle, korund, aurelle). */
  /** #613: Aurelle succession state and the named heir (flag HARIMU_AURELLE_SUCCESSION_ENABLED; absent otherwise). */
  succession?: { status: 'reigning' | 'ailing' | 'vacant' | 'acceded' | 'abdicated'; heir: { name: string; named: boolean } | null };
  /** #1118 Aurelle: reign-start display clock and the next Great Council window. Present only while HARIMU_AURELLE_CROWN_CALENDAR_ENABLED is on. */
  crownCalendar?: { reignStartedAt: number; nextGreatCouncilWindowAt: number; reignDisplayDays: number };
  /** #1146 Aurelle: next Hearth Night (once per game year = 30 real days). Present only while HARIMU_AURELLE_HEARTH_NIGHT_ENABLED is on. Blesses no houses. */
  hearthNight?: { nextAt: number; cycleDays: 30 };
  /** #1191 Aurelle: next Coronation Day (once per game year = 30 real days). Present only while HARIMU_AURELLE_CORONATION_DAY_ENABLED is on. Date only: no rite text, Privy Council roster, or Crown debasement figures. */
  coronationDay?: { nextAt: number; cycleDays: 30 };
  /** #1197 Aurelle: next Charter Fair (once per game year = 30 real days). Present only while HARIMU_AURELLE_CHARTER_FAIR_ENABLED is on. Date only: no charter list, guild name, or trade right. */
  charterFair?: { nextAt: number; cycleDays: 30 };
  founding?: { active: boolean; endsAt: number | null; dayOfPeriod: number | null };
};

/** Docs §7.7: Royal Assent is automatic 48 real hours after the Moot passes a bill. The Sovereign has no ordinary veto.
 *  [ASSUMPTION] #1089 also stores `withheld`, which the docs do not name. A bill dissolved before that 48th hour
 *  (the reserve power) is withheld, and the assent date is the dissolve time. Later dissolve does not un-assent a bill. */
export const ASSENT_SECONDS = 48 * 3600;
const HOUR = 3600;
/** Jan 15 2026 12:00 UTC (the fixture clock). The Mint band is due, Frostcore is an hour old, tenure was already dissolved. */
export const HOARVALE_ASSENT_SAMPLE_AT = 1_768_478_400;
export type AssentStatus = 'pending' | 'assented' | 'withheld';
export type HoarvaleBill = {
  id: string; title: string; passedAt: number; assentStatus: AssentStatus; assentAt: number | null;
  /** #1134: seconds until Royal Assent. Present on a pending bill only while HARIMU_HOARVALE_AUTO_ASSENT_ENABLED is on. Not a column. */
  secondsUntilAssent?: number;
};
export const HOARVALE_BILLS: readonly { id: string; title: string; passedAt: number; dissolvedAt: number | null }[] = [
  { id: 'hoarvale-frostcore-export', title: 'Frostcore export guidance', passedAt: HOARVALE_ASSENT_SAMPLE_AT - HOUR, dissolvedAt: null },
  { id: 'hoarvale-inflation-band', title: 'Mint inflation band', passedAt: HOARVALE_ASSENT_SAMPLE_AT - ASSENT_SECONDS, dissolvedAt: null },
  { id: 'hoarvale-tenure-steps', title: 'Tenure pay steps', passedAt: HOARVALE_ASSENT_SAMPLE_AT - 30 * HOUR, dissolvedAt: HOARVALE_ASSENT_SAMPLE_AT - 29 * HOUR },
];
export function billAssent(passedAt: number, dissolvedAt: number | null, now: number): { assentStatus: AssentStatus; assentAt: number | null } {
  if (!Number.isSafeInteger(passedAt) || passedAt < 0 || !Number.isSafeInteger(now) || now < 0) return { assentStatus: 'pending', assentAt: null };
  const due = passedAt + ASSENT_SECONDS;
  if (dissolvedAt != null && Number.isSafeInteger(dissolvedAt) && now >= dissolvedAt && dissolvedAt >= passedAt && dissolvedAt < due) return { assentStatus: 'withheld', assentAt: dissolvedAt };
  if (now < due) return { assentStatus: 'pending', assentAt: null };
  return { assentStatus: 'assented', assentAt: due };
}
/** #1134: real seconds until Royal Assent for a bill that is still pending. At passedAt + 48h the wait is 0; the settle tick records assent.
 *  Null for assented, withheld, or a clock that is not a safe integer. Not stored. */
export function secondsUntilAssent(passedAt: number, status: AssentStatus, now: number): number | null {
  if (status !== 'pending' || !Number.isSafeInteger(passedAt) || passedAt < 0 || !Number.isSafeInteger(now) || now < 0) return null;
  const due = passedAt + ASSENT_SECONDS;
  if (!Number.isSafeInteger(due)) return null;
  return now >= due ? 0 : due - now;
}
/** Same bill when there is no countdown, so a flag-off read keeps today's keys. */
export function withAssentCountdown(bill: HoarvaleBill, now: number): HoarvaleBill {
  const seconds = secondsUntilAssent(bill.passedAt, bill.assentStatus, now);
  return seconds === null ? bill : { ...bill, secondsUntilAssent: seconds };
}
export const hoarvaleBills = (now: number): HoarvaleBill[] => HOARVALE_BILLS.map(bill => ({ id: bill.id, title: bill.title, passedAt: bill.passedAt, ...billAssent(bill.passedAt, bill.dissolvedAt, now) }));

export { MOOT_TERM_SECONDS, INVESTITURE_DEADLINE_SECONDS, MOOT_INVESTITURE_VOTE_SECONDS, hoarvaleMoot, hoarvaleMootAt } from './hoarvale-moot.ts';
export type { HoarvaleMoot } from './hoarvale-moot.ts';
/** #1096. Flag off, or any nation but Hoarvale: the same snapshot, and no moot key. */
export function withHoarvaleMoot(snapshot: GovernmentSnapshot, now: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'hoarvale') return snapshot;
  return { ...snapshot, moot: hoarvaleMootAt(now) };
}

/** #1136. Flag off, or any nation but Hoarvale: the same snapshot, and no honorsListDay key. Awards no titles. */
export function withHoarvaleHonorsListDay(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'hoarvale') return snapshot;
  return { ...snapshot, honorsListDay: {
    nextAt: hoarvaleNextHonorsListDayAt(nowMs), intervalDays: HOARVALE_HONORS_LIST_INTERVAL_DAYS as 30, awardsTitles: false,
  } };
}

/** #1160. Flag off, or any nation but Hoarvale: the same snapshot, and no auroraNight key. Holds no festival and adds no rest bonus. */
export function withHoarvaleAuroraNight(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'hoarvale') return snapshot;
  return { ...snapshot, auroraNight: { nextAt: hoarvaleNextAuroraNightAt(nowMs), cycleDays: HOARVALE_AURORA_NIGHT_CYCLE_DAYS } };
}

/** #1208. Flag off, or any nation but Hoarvale: the same snapshot, and no mootOpening key. The next date only. */
export function withHoarvaleMootOpening(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'hoarvale') return snapshot;
  return { ...snapshot, mootOpening: { nextAt: hoarvaleNextMootOpeningAt(nowMs) } };
}

/** Hoarvale read while only the Opening of the Moot flag is on. No moot, honorsListDay, or auroraNight key. Flag off returns null, which is today's read. */
export function hoarvaleMootOpeningSnapshot(nowMs: number, enabled: boolean): GovernmentSnapshot | null {
  if (!enabled) return null;
  return withHoarvaleMootOpening({
    nationId: 'hoarvale', mode: 'rule-bound simulation',
    roles: [{ name: 'Opening of the Moot', controller: 'AI/SI role · deterministic rules' }],
    decision: {
      title: 'Opening of the Moot', topic: 'infrastructure', proposedSpendMinor: 0,
      reason: 'The Opening of the Moot is the start of the next Moot term. This read names the next date. It quotes no rite and names no members.',
    },
    availableBudgetMinor: 0,
    influenceSummary: 'This read names the next Opening of the Moot. It quotes no rite and names no members.',
  }, nowMs, true);
}
/** #1219. Flag off, or any nation but Hoarvale: the same snapshot, and no electionNight key. */
export function withHoarvaleElectionNight(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'hoarvale') return snapshot;
  return { ...snapshot, electionNight: { nextAt: hoarvaleNextElectionNightAt(nowMs) } };
}
/** Flag-only Hoarvale read. No moot, honors, or aurora key. Flag off returns null. */
export function hoarvaleElectionNightSnapshot(nowMs: number, enabled: boolean): GovernmentSnapshot | null {
  if (!enabled) return null;
  return withHoarvaleElectionNight({ nationId: 'hoarvale', mode: 'rule-bound simulation',
    roles: [{ name: 'Election Night', controller: 'AI/SI role · deterministic rules' }],
    decision: { title: 'Election Night', topic: 'infrastructure', proposedSpendMinor: 0, reason: 'This read names the next Election Night.' },
    availableBudgetMinor: 0, influenceSummary: 'This read names the next Election Night.' }, nowMs, true);
}

/** #1151. Flag off, or any nation but Varkand: the same snapshot, and no musterDay key. Musters no troops, changes no Alert Level. */
export function withVarkandMusterDay(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'varkand') return snapshot;
  return { ...snapshot, musterDay: {
    nextAt: varkandNextMusterDayAt(nowMs), intervalDays: VARKAND_MUSTER_DAY_INTERVAL_DAYS as 30, mustersTroops: false,
  } };
}

/** #1207. Flag off, or any nation but Varkand: the same snapshot, and no rotationDay key. Date only. */
export function withVarkandRotationDay(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean, canceled = false): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'varkand') return snapshot;
  return { ...snapshot, rotationDay: {
    nextAt: varkandNextRotationDayAt(nowMs), cycleDays: VARKAND_ROTATION_DAY_CYCLE_DAYS as 60,
    ...(canceled ? { canceled: true as const } : {}),
  } };
}

/** #1220. Flag off, or the Alert Level is not Red: the same snapshot. Red marks celebration rows already on the read.
 *  Does not add a row, move a date, or mark the Mandate Plebiscite. */
export function withVarkandRedAlertCancels(snapshot: GovernmentSnapshot, enabled: boolean, level: string | null | undefined): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'varkand' || !varkandCelebrationsCanceled(level)) return snapshot;
  const musterNeeds = snapshot.musterDay != null && snapshot.musterDay.canceled !== true;
  const rotationNeeds = snapshot.rotationDay != null && snapshot.rotationDay.canceled !== true;
  const lanternNeeds = snapshot.lanternWatch != null && snapshot.lanternWatch.canceled !== true;
  if (!musterNeeds && !rotationNeeds && !lanternNeeds) return snapshot;
  return {
    ...snapshot,
    ...(musterNeeds && snapshot.musterDay ? { musterDay: { ...snapshot.musterDay, canceled: true as const } } : {}),
    ...(rotationNeeds && snapshot.rotationDay ? { rotationDay: { ...snapshot.rotationDay, canceled: true as const } } : {}),
    ...(lanternNeeds && snapshot.lanternWatch ? { lanternWatch: { ...snapshot.lanternWatch, canceled: true as const } } : {}),
  };
}

/** Varkand read while only the Rotation Day flag is on. No directorate, plebiscite, or musterDay key. Flag off returns null, which is today's read. */
export function varkandRotationDaySnapshot(nowMs: number, enabled: boolean, canceled = false): GovernmentSnapshot | null {
  if (!enabled) return null;
  return withVarkandRotationDay({
    nationId: 'varkand', mode: 'rule-bound simulation',
    roles: [{ name: 'Directorate', controller: 'AI/SI role · deterministic rules' }],
    decision: {
      title: 'Rotation Day', topic: 'infrastructure', proposedSpendMinor: 0,
      reason: 'Rotation Day is when the Chair passes on. This read names the next date. It names no Chair and proposes no spending.',
    },
    availableBudgetMinor: 0,
    influenceSummary: 'The Chair rotates on the existing term. This read does not name a Chair.',
  }, nowMs, true, canceled);
}

/** #1211. Flag off, or any nation but Varkand: the same snapshot, and no lanternWatch key. Date only. */
export function withVarkandLanternWatch(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'varkand') return snapshot;
  return { ...snapshot, lanternWatch: { nextAt: varkandNextLanternWatchAt(nowMs), cycleDays: VARKAND_LANTERN_WATCH_CYCLE_DAYS } };
}

/** #1165. Flag off, or any nation but Confluence: the same snapshot, and no canalFestival key. Holds no festival, harvest yield, or bonus. */
export function withConfluenceCanalFestival(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'confluence') return snapshot;
  return { ...snapshot, canalFestival: {
    nextAt: confluenceNextCanalFestivalAt(nowMs), intervalDays: CONFLUENCE_CANAL_FESTIVAL_INTERVAL_DAYS as 30,
    hostCity: CONFLUENCE_CANAL_FESTIVAL_HOST_CITY, holdsFestival: false,
  } };
}

/** #1178. Flag off, or any nation but Fulmara: the same snapshot, and no grandRegatta key. Holds no race, prize, or bonus. */
export function withFulmaraGrandRegatta(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'fulmara') return snapshot;
  return { ...snapshot, grandRegatta: {
    nextAt: fulmaraNextGrandRegattaAt(nowMs), intervalDays: FULMARA_GRAND_REGATTA_INTERVAL_DAYS as 30,
    hostCity: FULMARA_GRAND_REGATTA_HOST_CITY, holdsRegatta: false,
  } };
}

/** Fulmara read while only the Grand Regatta flag is on. No grandCouncil, resolutions, or exchangeBell key. Flag off returns null, which is today's read. */
export function fulmaraGrandRegattaSnapshot(nowMs: number, enabled: boolean): GovernmentSnapshot | null {
  if (!enabled) return null;
  return withFulmaraGrandRegatta({
    nationId: 'fulmara', mode: 'rule-bound simulation',
    roles: [{ name: 'Grand Regatta', controller: 'AI/SI role · deterministic rules' }],
    decision: {
      title: 'Grand Regatta', topic: 'work', proposedSpendMinor: 0,
      reason: 'The Grand Regatta is hosted at Corvel Isles and falls every 30 real days. This read names the next Grand Regatta. It holds no race, lists no prizes or bonuses, and proposes no spending.',
    },
    availableBudgetMinor: 0,
    influenceSummary: 'Corvel Isles hosts the Grand Regatta. This read does not hold a race or award a prize.',
  }, nowMs, true);
}

/** #1187. Flag off, or any nation but Fulmara: the same snapshot, and no dockStrikeRemembrance key. Date only. */
export function withFulmaraDockStrikeRemembrance(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'fulmara') return snapshot;
  return { ...snapshot, dockStrikeRemembrance: {
    nextAt: fulmaraNextDockStrikeRemembranceAt(nowMs), intervalDays: FULMARA_DOCK_STRIKE_REMEMBRANCE_INTERVAL_DAYS as 30, holdsRemembrance: false,
  } };
}

/** Fulmara read while only the Dock Strike remembrance flag is on. Flag off returns null, which is today's read. */
export function fulmaraDockStrikeRemembranceSnapshot(nowMs: number, enabled: boolean): GovernmentSnapshot | null {
  if (!enabled) return null;
  return withFulmaraDockStrikeRemembrance({
    nationId: 'fulmara', mode: 'rule-bound simulation',
    roles: [{ name: 'Dock Strike remembrance', controller: 'AI/SI role · deterministic rules' }],
    decision: {
      title: 'Dock Strike remembrance', topic: 'work', proposedSpendMinor: 0,
      reason: 'The Dock Strike remembrance falls every 30 real days. This read names the next date only and proposes no spending.',
    },
    availableBudgetMinor: 0,
    influenceSummary: 'This read names the next Dock Strike remembrance date only.',
  }, nowMs, true);
}

/** #1145. Flag off, or any nation but Kindle: the same snapshot, and no foundersForgeDay key. Opens no fair. */
export function withKindleFoundersForgeDay(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'kindle') return snapshot;
  return { ...snapshot, foundersForgeDay: {
    nextAt: kindleNextFoundersForgeDayAt(nowMs), intervalDays: KINDLE_FOUNDERS_FORGE_INTERVAL_DAYS as 30, opensFair: false,
  } };
}

/** #1164. Flag off, or any nation but Kindle: the same snapshot, and no marketBell key. Holds no market event, price move, or bonus. */
export function withKindleMarketBell(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'kindle') return snapshot;
  return { ...snapshot, marketBell: { nextAt: kindleNextMarketBellAt(nowMs), cycleDays: KINDLE_MARKET_BELL_CYCLE_DAYS } };
}

const institutions = {
  kindle: {
    roles: ['President', 'Ministers', 'Assembly members'],
    response: 'The Assembly reviews citizen petitions and the President proposes a lawful appropriation.',
    influence: 'Petitions affect this proposal. Nation-specific voting and public opinion are planned influence channels; officeholding is reserved for government agents.',
  },
  korund: {
    roles: ['Party leader', 'Planning ministers', 'Party council'],
    response: 'The planning council reviews requests against ration and production priorities.',
    influence: 'Citizen requests affect planning priorities. Korund has a one-party government; this panel does not create a general election.',
  },
  aurelle: {
    roles: ['Sovereign', 'Royal ministers', 'Royal council'],
    response: 'The royal council presents citizen petitions to the sovereign for a bounded royal allocation.',
    influence: 'Petitions affect royal priorities. Aurelle retains hereditary succession; petitions do not elect the sovereign.',
  },
  hoarvale: {
    roles: ['Sovereign', 'Prime Minister', 'Moot members'],
    response: 'The Moot passes bills. The Sovereign records Royal Assent on each bill.',
    influence: 'Petitions affect Moot priorities. The Sovereign is ceremonial and does not hold an ordinary veto; petitions do not elect the Sovereign.',
  },
} as const;

function safeCount(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? Math.min(value, 1_000_000) : 0;
}

/** A pure proposal, never an appropriation or a ledger write. Inputs must come from authoritative state. */
export function simulateGovernment(input: {
  nationId: string; availableBudgetMinor: number; foodSecurity: number;
  petitionCounts: Record<string, number>; hoarvaleAssent?: boolean; now?: number;
}): GovernmentSnapshot | null {
  if (input.nationId === 'hoarvale' && input.hoarvaleAssent !== true) return null;
  if (!Object.hasOwn(institutions, input.nationId)) return null;
  const institution = institutions[input.nationId as keyof typeof institutions];
  const budget = typeof input.availableBudgetMinor === 'number'
    && Number.isSafeInteger(input.availableBudgetMinor) && input.availableBudgetMinor >= 0
    ? input.availableBudgetMinor : 0;
  const foodSecurity = Number.isFinite(input.foodSecurity)
    ? Math.max(0, Math.min(100, input.foodSecurity)) : 0;
  const counts = {
    food: safeCount(input.petitionCounts?.food),
    infrastructure: safeCount(input.petitionCounts?.infrastructure),
    work: safeCount(input.petitionCounts?.work),
  };
  // Food shortages have a documented priority; ties favor food, then infrastructure, then work.
  const emergency = foodSecurity < 40;
  const topic: PetitionTopic = emergency ? 'food'
    : counts.infrastructure > counts.food && counts.infrastructure >= counts.work ? 'infrastructure'
      : counts.work > counts.food && counts.work > counts.infrastructure ? 'work' : 'food';
  const titles = { food: 'Food security reserve', infrastructure: 'Infrastructure maintenance', work: 'Workplace support' };
  const count = counts[topic];
  // Integer arithmetic remains safe even for the largest valid input budget.
  const proposedSpendMinor = Math.floor(budget / (emergency ? 5 : 10));
  return {
    nationId: input.nationId, mode: 'rule-bound simulation',
    roles: institution.roles.map((name) => ({ name, controller: 'AI/SI role · deterministic rules' })),
    availableBudgetMinor: budget,
    decision: {
      title: titles[topic], proposedSpendMinor, topic,
      reason: `${institution.response} ${emergency ? `Food security is ${foodSecurity}/100, below the 40-point safety threshold; food takes priority.` : `${count} ${topic} petition${count === 1 ? '' : 's'} set this priority (food ${counts.food}, infrastructure ${counts.infrastructure}, work ${counts.work}; ties favor food, then infrastructure).`} ${budget === 0 ? 'No verified budget is available, so no spending is proposed.' : `The proposal is capped at ${emergency ? '20' : '10'}% of the verified available budget.`}`,
    },
    influenceSummary: institution.influence,
    ...(input.nationId === 'hoarvale' ? { bills: hoarvaleBills(typeof input.now === 'number' ? input.now : 0) } : {}),
  };
}

/** #1085. Flag off, or any nation but Varkand: the same snapshot, and no directorate key. */
export function withVarkandDirectorate(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'varkand') return snapshot;
  const { chair, nextRotationAt } = varkandChairAt(nowMs);
  return { ...snapshot, directorate: { chair, commands: varkandCommands, nextRotationAt } };
}

/** #1094. Flag off, or any nation but Varkand: the same snapshot, and no mandatePlebiscite key. */
export function withVarkandPlebiscite(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'varkand') return snapshot;
  return { ...snapshot, mandatePlebiscite: { nextAt: varkandNextPlebisciteAt(nowMs), cycleDays: VARKAND_PLEBISCITE_CYCLE_DAYS } };
}

/** #1098. Flag off, or any nation but Veldwood: the same snapshot, and no federalCouncil key. */
export function withVeldwoodCouncil(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'veldwood') return snapshot;
  return { ...snapshot, federalCouncil: {
    nextElectionAt: veldwoodNextCouncilElectionAt(nowMs), termDays: VELDWOOD_COUNCIL_TERM_DAYS,
    speakerSeat: veldwoodCouncilSpeakerSeat(nowMs), speakerRotationDays: VELDWOOD_SPEAKER_ROTATION_DAYS,
  } };
}

/** #1118. Flag off, or any nation but Aurelle: the same snapshot, and no crownCalendar key. Names no heir and proposes no spending. */
export function withAurelleCrownCalendar(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'aurelle') return snapshot;
  return { ...snapshot, crownCalendar: {
    reignStartedAt: aurelleReignStartedAt(nowMs), nextGreatCouncilWindowAt: aurelleNextGreatCouncilWindowAt(nowMs),
    reignDisplayDays: AURELLE_REIGN_DISPLAY_DAYS,
  } };
}

/** #1146. Flag off, or any nation but Aurelle: the same snapshot, and no hearthNight key. Blesses no houses, names no heir, and proposes no spending. */
export function withAurelleHearthNight(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'aurelle') return snapshot;
  return { ...snapshot, hearthNight: { nextAt: aurelleNextHearthNightAt(nowMs), cycleDays: AURELLE_HEARTH_NIGHT_CYCLE_DAYS as 30 } };
}

/** #1191. Flag off, or any nation but Aurelle: the same snapshot, and no coronationDay key. Date only. */
export function withAurelleCoronationDay(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'aurelle') return snapshot;
  return { ...snapshot, coronationDay: { nextAt: aurelleNextCoronationDayAt(nowMs), cycleDays: AURELLE_CORONATION_DAY_CYCLE_DAYS as 30 } };
}

/** #1197. Flag off, or any nation but Aurelle: the same snapshot, and no charterFair key. Date only. */
export function withAurelleCharterFair(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'aurelle') return snapshot;
  return { ...snapshot, charterFair: { nextAt: aurelleNextCharterFairAt(nowMs), cycleDays: AURELLE_CHARTER_FAIR_CYCLE_DAYS } };
}

/** #1122. Flag off, or any nation but Veldwood: the same snapshot, and no voteDayCalendar key. */
export function withVeldwoodVoteDay(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'veldwood') return snapshot;
  return { ...snapshot, voteDayCalendar: { nextAt: veldwoodNextVoteDayAt(nowMs), cycleDays: VELDWOOD_VOTE_DAY_CYCLE_DAYS } };
}

/** #1159. Flag off, or any nation but Veldwood: the same snapshot, and no dividendDay key. Pays no dividend and states no amount. */
export function withVeldwoodDividendDay(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'veldwood') return snapshot;
  return { ...snapshot, dividendDay: { nextAt: veldwoodNextDividendDayAt(nowMs), cycleDays: VELDWOOD_DIVIDEND_DAY_CYCLE_DAYS as 30 } };
}

/** #1244. Flag off, or any nation but Veldwood: the same snapshot, and no ringMoot key. Date only. */
export function withVeldwoodRingMoot(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'veldwood') return snapshot;
  return { ...snapshot, ringMoot: { nextAt: veldwoodNextRingMootAt(nowMs), cycleDays: VELDWOOD_RING_MOOT_CYCLE_DAYS as 30 } };
}

/** #1102. Flag off, or any nation but Fulmara: the same snapshot, and no grandCouncil key. */
export function withFulmaraCouncil(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'fulmara') return snapshot;
  return { ...snapshot, grandCouncil: {
    councilOfTenNextElectionAt: fulmaraNextCouncilOfTenElectionAt(nowMs), councilOfTenTermDays: FULMARA_COUNCIL_TERM_DAYS,
    lodestarNextElectionAt: fulmaraNextLodestarElectionAt(nowMs), lodestarTermDays: FULMARA_LODESTAR_TERM_DAYS, lodestarConsecutiveReelection: false,
    tribuneSessionEndsAt: fulmaraTribuneSessionEndsAt(nowMs), tribuneVetoesPerSession: 1,
  } };
}

/** #1130. Flag off, or any nation but Fulmara: the same snapshot, and no resolutions key. */
export function withFulmaraResolutions(snapshot: GovernmentSnapshot, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'fulmara') return snapshot;
  return { ...snapshot, resolutions: fulmaraResolutions() };
}

/** #1150. Flag off, or any nation but Fulmara: the same snapshot, and no exchangeBell key. Opens no trading session. */
export function withFulmaraExchangeBell(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'fulmara') return snapshot;
  return { ...snapshot, exchangeBell: { nextAt: fulmaraNextExchangeBellAt(nowMs), cycleDays: FULMARA_EXCHANGE_BELL_CYCLE_DAYS } };
}

/** #1179. Flag off, or any nation but Fulmara: the same snapshot, and no charterDay key. Date only. */
export function withFulmaraCharterDay(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'fulmara') return snapshot;
  return { ...snapshot, charterDay: { nextAt: fulmaraNextCharterDayAt(nowMs), cycleDays: FULMARA_CHARTER_DAY_CYCLE_DAYS as 30 } };
}

/** Fulmara read while only the Charter Day flag is on. No grandCouncil, resolutions, or exchangeBell key. Flag off returns null, which is today's read. */
export function fulmaraCharterDaySnapshot(nowMs: number, enabled: boolean): GovernmentSnapshot | null {
  if (!enabled) return null;
  return withFulmaraCharterDay({
    nationId: 'fulmara', mode: 'rule-bound simulation',
    roles: [{ name: 'Charter Day', controller: 'AI/SI role · deterministic rules' }],
    decision: {
      title: 'Charter Day', topic: 'work', proposedSpendMinor: 0,
      reason: 'Charter Day falls once each game year. This read names the next Charter Day. It holds no charter text, shareholder vote, dividend, or bonus, and proposes no spending.',
    },
    availableBudgetMinor: 0,
    influenceSummary: 'This read names the next Charter Day and nothing else.',
  }, nowMs, true);
}

/** #1184. Flag off, or any nation but Fulmara: the same snapshot, and no fairWindBlessing key. Holds the next date only. */
export function withFulmaraFairWindBlessing(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'fulmara') return snapshot;
  return { ...snapshot, fairWindBlessing: { nextAt: fulmaraNextFairWindBlessingAt(nowMs), cycleDays: FULMARA_FAIR_WIND_BLESSING_CYCLE_DAYS } };
}

/** Fulmara read while only the Fair-Wind Blessing flag is on. No grandCouncil, resolutions, or exchangeBell key. Flag off returns null, which is today's read. */
export function fulmaraFairWindBlessingSnapshot(nowMs: number, enabled: boolean): GovernmentSnapshot | null {
  if (!enabled) return null;
  return withFulmaraFairWindBlessing({
    nationId: 'fulmara', mode: 'rule-bound simulation',
    roles: [{ name: 'Fair-Wind Blessing', controller: 'AI/SI role · deterministic rules' }],
    decision: {
      title: 'Fair-Wind Blessing', topic: 'work', proposedSpendMinor: 0,
      reason: 'The Fair-Wind Blessing of the convoys falls every 30 real days. This read names the next date. It holds no blessing text, lists no convoy, states no Toll Coupon figure, and proposes no spending.',
    },
    availableBudgetMinor: 0,
    influenceSummary: 'This read names the next Fair-Wind Blessing. It lists no convoy and states no Toll Coupon figure.',
  }, nowMs, true);
}

/** Fulmara read while only the Exchange Bell flag is on. No grandCouncil or resolutions key. Flag off returns null, which is today's read. */
export function fulmaraExchangeBellSnapshot(nowMs: number, enabled: boolean): GovernmentSnapshot | null {
  if (!enabled) return null;
  return withFulmaraExchangeBell({
    nationId: 'fulmara', mode: 'rule-bound simulation',
    roles: [{ name: 'Exchange Bell', controller: 'AI/SI role · deterministic rules' }],
    decision: {
      title: 'Exchange Bell', topic: 'work', proposedSpendMinor: 0,
      reason: 'The Exchange Bell is the year\'s opening of trading and falls every 30 real days. Arcport hosts it. This read names the next Exchange Bell. It opens no trading session, moves no prices, lists no trades, and proposes no spending.',
    },
    availableBudgetMinor: 0,
    influenceSummary: 'Arcport hosts the Exchange Bell. This read does not open a trading session or record a trade.',
  }, nowMs, true);
}

/** Fulmara read while only the resolutions flag is on. No grandCouncil key. Flag off returns null, which is today's read. */
export function fulmaraResolutionsSnapshot(enabled: boolean): GovernmentSnapshot | null {
  if (!enabled) return null;
  return withFulmaraResolutions({
    nationId: 'fulmara', mode: 'rule-bound simulation',
    roles: [{ name: 'Grand Council', controller: 'AI/SI role · deterministic rules' }],
    decision: {
      title: 'Share resolutions', topic: 'work', proposedSpendMinor: 0,
      reason: 'Non-election shareholder resolutions bind the Council of Ten. This read posts each title, its status, and the share totals. It opens no ballot and proposes no spending.',
    },
    availableBudgetMinor: 0,
    influenceSummary: 'Human holders vote Charter Shares on charters, share issues, reserve rules, and alliances. Abstentions are counted and do not decide the result. This read does not cast a vote.',
  }, true);
}

/** Varkand read while only the plebiscite flag is on. No directorate key. Flag off returns null, which is today's read. */
export function varkandPlebisciteSnapshot(nowMs: number, enabled: boolean): GovernmentSnapshot | null {
  if (!enabled) return null;
  return withVarkandPlebiscite({
    nationId: 'varkand', mode: 'rule-bound simulation',
    roles: [{ name: 'Directorate', controller: 'AI/SI role · deterministic rules' }],
    decision: {
      title: 'Mandate Plebiscite', topic: 'infrastructure', proposedSpendMinor: 0,
      reason: 'The Mandate Plebiscite falls every 150 real days. This read names the next date. It opens no ballot and proposes no spending.',
    },
    availableBudgetMinor: 0,
    influenceSummary: 'Citizens are asked to approve the Directorate\'s Order every 150 real days. This read does not collect votes.',
  }, nowMs, true);
}

/** Varkand read while only the Lantern Watch flag is on. No directorate, plebiscite, or musterDay key. Flag off returns null, which is today's read. */
export function varkandLanternWatchSnapshot(nowMs: number, enabled: boolean): GovernmentSnapshot | null {
  if (!enabled) return null;
  return withVarkandLanternWatch({
    nationId: 'varkand', mode: 'rule-bound simulation',
    roles: [{ name: 'Lantern Watch', controller: 'AI/SI role · deterministic rules' }],
    decision: {
      title: 'Lantern Watch', topic: 'infrastructure', proposedSpendMinor: 0,
      reason: 'Lantern Watch falls every 30 real days. This read names the next date only and proposes no spending.',
    },
    availableBudgetMinor: 0,
    influenceSummary: 'This read names the next Lantern Watch date only.',
  }, nowMs, true);
}

/** Varkand government read while the flag is on. Flag off returns null, which is today's read. */
export function varkandGovernmentSnapshot(nowMs: number, enabled: boolean): GovernmentSnapshot | null {
  if (!enabled) return null;
  return withVarkandDirectorate({
    nationId: 'varkand', mode: 'rule-bound simulation',
    roles: varkandCommands.map(command => ({ name: `${command.command} Marshal`, controller: 'AI/SI role · deterministic rules' })),
    decision: {
      title: 'Directorate order', topic: 'infrastructure', proposedSpendMinor: 0,
      reason: 'The Directorate of the Five Commands holds the line. This read names the Chair and the next Rotation Day. It proposes no spending.',
    },
    availableBudgetMinor: 0,
    influenceSummary: 'The Chair rotates among the five Marshals every 60 real days. Citizens do not elect the Directorate.',
  }, nowMs, true);
}

/** #1117. Flag off, any nation but Kindle, or a held cycle start: the same snapshot, and no electionClock key. */
export function withKindleElectionClock(snapshot: GovernmentSnapshot, nowMs: number, cycleStartSeconds: number | null, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'kindle') return snapshot;
  const electionClock = kindleElectionClock(cycleStartSeconds, nowMs);
  if (!electionClock) return snapshot;
  return { ...snapshot, electionClock };
}

/** #1114. Flag off, or any nation but Meridian: the same snapshot, and no partyState key. */
export function withMeridianPartyState(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'meridian') return snapshot;
  return { ...snapshot, partyState: {
    paramountLeaderRoles: MERIDIAN_PARAMOUNT_LEADER_ROLES, standingCommitteeSeats: MERIDIAN_STANDING_COMMITTEE_SEATS,
    nextCongressAt: meridianNextPartyCongressAt(nowMs), congressIntervalDays: MERIDIAN_CONGRESS_INTERVAL_DAYS,
    termLimitsSuspendable: true, suspendSupermajority: MERIDIAN_TERM_LIMIT_SUSPEND_SUPERMAJORITY,
  } };
}

/** #1133. Flag off, or any nation but Meridian: the same snapshot, and no examDay key. Names no rank and opens no exam. */
export function withMeridianExamDay(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'meridian') return snapshot;
  return { ...snapshot, examDay: { nextAt: meridianNextExamDayAt(nowMs), cycleDays: MERIDIAN_EXAM_DAY_CYCLE_DAYS } };
}

/** #1175. Flag off, or any nation but Meridian: the same snapshot, and no turbineDay key. Holds no grid output, power figure, or bonus. */
export function withMeridianTurbineDay(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'meridian') return snapshot;
  return { ...snapshot, turbineDay: { nextAt: meridianNextTurbineDayAt(nowMs), cycleDays: MERIDIAN_TURBINE_DAY_CYCLE_DAYS, host: MERIDIAN_TURBINE_DAY_HOST } };
}

/** Meridian read while only the Turbine Day flag is on. No partyState or examDay key. Flag off returns null, which is today's read. */
export function meridianTurbineDaySnapshot(nowMs: number, enabled: boolean): GovernmentSnapshot | null {
  if (!enabled) return null;
  return withMeridianTurbineDay({
    nationId: 'meridian', mode: 'rule-bound simulation',
    roles: [{ name: 'Turbine Day', controller: 'AI/SI role · deterministic rules' }],
    decision: {
      title: 'Turbine Day', topic: 'infrastructure', proposedSpendMinor: 0,
      reason: 'Turbine Day is the anniversary of the national grid and falls every 30 real days. Shen Springs hosts it. This read names the next Turbine Day. It states no grid output, power figure, or bonus, and proposes no spending.',
    },
    availableBudgetMinor: 0,
    influenceSummary: 'Shen Springs hosts Turbine Day. This read does not report grid output or a power figure.',
  }, nowMs, true);
}

/** #1189. Flag off, or any nation but Meridian: the same snapshot, and no congressWeek key. Date only. */
export function withMeridianCongressWeek(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'meridian') return snapshot;
  return { ...snapshot, congressWeek: {
    nextAt: meridianNextCongressWeekAt(nowMs), intervalDays: MERIDIAN_CONGRESS_WEEK_INTERVAL_DAYS, holdsCongress: false,
  } };
}

/** Meridian read while only the Congress Week flag is on. No partyState, examDay, or turbineDay key. Flag off returns null, which is today's read. */
export function meridianCongressWeekSnapshot(nowMs: number, enabled: boolean): GovernmentSnapshot | null {
  if (!enabled) return null;
  return withMeridianCongressWeek({
    nationId: 'meridian', mode: 'rule-bound simulation',
    roles: [{ name: 'Congress Week', controller: 'AI/SI role · deterministic rules' }],
    decision: {
      title: 'Congress Week', topic: 'infrastructure', proposedSpendMinor: 0,
      reason: 'Congress Week falls every 150 real days (5 game years). This read names the next date only and proposes no spending.',
    },
    availableBudgetMinor: 0,
    influenceSummary: 'This read names the next Congress Week date only.',
  }, nowMs, true);
}

/** Meridian read while only the Exam Day flag is on. No partyState key. Flag off returns null, which is today's read. */
export function meridianExamDaySnapshot(nowMs: number, enabled: boolean): GovernmentSnapshot | null {
  if (!enabled) return null;
  return withMeridianExamDay({
    nationId: 'meridian', mode: 'rule-bound simulation',
    roles: [{ name: 'Exam Pagoda', controller: 'AI/SI role · deterministic rules' }],
    decision: {
      title: 'Exam Day', topic: 'work', proposedSpendMinor: 0,
      reason: 'Exam Day is when ranks are announced. This read names the next Exam Day. It awards no rank and proposes no spending.',
    },
    availableBudgetMinor: 0,
    influenceSummary: 'Ranks are announced on Exam Day. This read does not score an exam or change a rank.',
  }, nowMs, true);
}

/** Meridian read while the flag is on. Meridian has no other government snapshot, so this is the smallest one that carries the partyState block. Flag off returns null, which is today's read. */
export function meridianPartySnapshot(nowMs: number, enabled: boolean): GovernmentSnapshot | null {
  if (!enabled) return null;
  return withMeridianPartyState({
    nationId: 'meridian', mode: 'rule-bound simulation',
    roles: [
      { name: 'Paramount Leader (General Secretary and State Chair)', controller: 'AI/SI role · deterministic rules' },
      { name: 'Standing Committee', controller: 'AI/SI role · deterministic rules' },
    ],
    decision: {
      title: 'Party Congress schedule', topic: 'infrastructure', proposedSpendMinor: 0,
      reason: 'The Paramount Leader holds the General Secretary and State Chair posts. The Standing Committee has 7 seats. This read names when the next Party Congress sits. It proposes no spending.',
    },
    availableBudgetMinor: 0,
    influenceSummary: 'A Central Committee chosen at the Party Congress every 5 game years picks the leadership. Congress can suspend term limits by a 2/3 vote. This read chooses no one and suspends nothing.',
  }, nowMs, true);
}

/** #1107. Flag off, or any nation but Ilmar: the same snapshot, and no sanctum key. */
export function withIlmarSanctum(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'ilmar') return snapshot;
  return { ...snapshot, sanctum: {
    oracleTerm: ILMAR_ORACLE_TERM, councilOfEldersSeats: ILMAR_COUNCIL_OF_ELDERS_SEATS,
    isStillday: ilmarIsStillday(nowMs), nextStilldayAt: ilmarNextStilldayAt(nowMs), nextGreatPilgrimageAt: ilmarSanctumNextGreatPilgrimageAt(nowMs),
  } };
}

/** #1139. Flag off, or any nation but Ilmar: the same snapshot, and no contracts key. */
export function withIlmarPrismContracts(snapshot: GovernmentSnapshot, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'ilmar') return snapshot;
  return { ...snapshot, contracts: ilmarPrismContracts() };
}

/** #1113. Flag off, or any nation but Confluence: the same snapshot, and no party key. */
export function withConfluenceParty(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'confluence') return snapshot;
  return { ...snapshot, party: {
    pillars: CONFLUENCE_PILLARS, termLimitCongresses: CONFLUENCE_TERM_LIMIT_CONGRESSES,
    nextCongressAt: confluenceNextPartyCongressAt(nowMs), congressIntervalDays: CONFLUENCE_CONGRESS_INTERVAL_DAYS,
  } };
}

/** #1123. Flag off, or any nation but Confluence: the same snapshot, and no assemblyElection key. */
export function withConfluenceAssemblyElection(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'confluence') return snapshot;
  return { ...snapshot, assemblyElection: {
    cycleStartedAt: confluenceLastAssemblyElectionAt(nowMs), nextElectionAt: confluenceNextAssemblyElectionAt(nowMs),
    intervalDays: CONFLUENCE_ASSEMBLY_INTERVAL_DAYS as 150, ballotOpen: false, leadershipHeedsResult: false,
  } };
}

/** #1169. Flag off, or any nation but Confluence: the same snapshot, and no quotaDay key. States no quota, target, or bonus. */
export function withConfluenceQuotaDay(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'confluence') return snapshot;
  return { ...snapshot, quotaDay: { nextAt: confluenceNextQuotaDayAt(nowMs), cycleDays: CONFLUENCE_QUOTA_DAY_CYCLE_DAYS as 30 } };
}

/** #1183. Flag off, or any nation but Confluence: the same snapshot, and no congressLanterns key. Date only. */
export function withConfluenceCongressLanterns(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'confluence') return snapshot;
  return { ...snapshot, congressLanterns: { nextAt: confluenceNextCongressLanternsAt(nowMs), cycleDays: CONFLUENCE_CONGRESS_LANTERNS_CYCLE_DAYS } };
}

/** Confluence read while the flag is on. Confluence has no other government snapshot, so this is the smallest one that carries the party block. Flag off returns null, which is today's read. */
export function confluencePartySnapshot(nowMs: number, enabled: boolean, assemblyElection = false): GovernmentSnapshot | null {
  if (!enabled && !assemblyElection) return null; // #1123: either flag gives Confluence a read
  return withConfluenceAssemblyElection(withConfluenceParty({
    nationId: 'confluence', mode: 'rule-bound simulation',
    roles: ['General Secretary', 'President', 'Premier', "Chair of the People's Assembly"].map(name => ({ name, controller: 'AI/SI role · deterministic rules' })),
    decision: {
      title: 'Party Congress', topic: 'infrastructure', proposedSpendMinor: 0,
      reason: 'Every 150 real days a Party Congress elects a Central Committee. This read names the Four Pillars and the next Congress. It opens no ballot and proposes no spending.',
    },
    availableBudgetMinor: 0,
    influenceSummary: 'The Four Pillars share collective leadership. Each Pillar may serve 2 Congress terms. This read does not elect a Pillar.',
  }, nowMs, enabled), nowMs, assemblyElection);
}

/** Ilmar read while the flag is on. Ilmar has no other government snapshot, so this is the smallest one that carries the sanctum block. Flag off returns null, which is today's read. */
export function ilmarSanctumSnapshot(nowMs: number, enabled: boolean): GovernmentSnapshot | null {
  if (!enabled) return null;
  return withIlmarSanctum({
    nationId: 'ilmar', mode: 'rule-bound simulation',
    roles: [
      { name: 'Supreme Oracle', controller: 'AI/SI role · deterministic rules' },
      { name: 'Council of Elders', controller: 'AI/SI role · deterministic rules' },
    ],
    decision: {
      title: 'Sanctum calendar', topic: 'infrastructure', proposedSpendMinor: 0,
      reason: 'The Supreme Oracle holds office for life. The Council of Elders has 12 seats. This read names whether today is a Stillday and when the next Stillday and Great Pilgrimage fall. It proposes no spending.',
    },
    availableBudgetMinor: 0,
    influenceSummary: 'The Oracle serves for life, chosen by the Council of Elders. This read does not choose an Oracle, pause Prism trading, or open a pilgrimage.',
  }, nowMs, true);
}

/** Ilmar read while only the Prism contracts flag is on. No sanctum key. Flag off returns null, which is today's read. */
export function ilmarPrismContractsSnapshot(enabled: boolean): GovernmentSnapshot | null {
  if (!enabled) return null;
  return withIlmarPrismContracts({
    nationId: 'ilmar', mode: 'rule-bound simulation',
    roles: [
      { name: 'Treasury of Endowments', controller: 'AI/SI role · deterministic rules' },
      { name: 'Guardian Synod', controller: 'AI/SI role · deterministic rules' },
    ],
    decision: {
      title: 'Prism contracts', topic: 'work', proposedSpendMinor: 0,
      reason: 'Clear Measure credit is a Lightshare profit share or an asset-backed Endowment lease, never a fixed interest rate. This read posts each contract title and its whole-number profit share. It opens no partnership and proposes no spending.',
    },
    availableBudgetMinor: 0,
    influenceSummary: 'Endowment counting-houses post profit shares, not interest. This read does not certify a template, pause Prism trading, or collect the tithe.',
  }, true);
}

/** #1137. Flag off, or any nation but Ilmar: the same snapshot, and no feastOfFirstLight key. Chooses no Oracle, lists no clergy, and proposes no spending. */
export function withIlmarFeastOfFirstLight(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'ilmar') return snapshot;
  return { ...snapshot, feastOfFirstLight: { nextAt: ilmarNextFeastOfFirstLightAt(nowMs), cycleDays: ILMAR_FEAST_OF_FIRST_LIGHT_CYCLE_DAYS } };
}

/** Ilmar read while only the Feast of First Light flag is on. No sanctum key. Flag off returns null, which is today's read. */
export function ilmarFeastOfFirstLightSnapshot(nowMs: number, enabled: boolean): GovernmentSnapshot | null {
  if (!enabled) return null;
  return withIlmarFeastOfFirstLight({
    nationId: 'ilmar', mode: 'rule-bound simulation',
    roles: [{ name: 'Feast of First Light', controller: 'AI/SI role · deterministic rules' }],
    decision: {
      title: 'Feast of First Light', topic: 'infrastructure', proposedSpendMinor: 0,
      reason: 'The Feast of First Light falls every 15 real days, twice per game year. This read names the next feast. It chooses no Oracle, lists no clergy, and proposes no spending.',
    },
    availableBudgetMinor: 0,
    influenceSummary: 'This read names the next Feast of First Light. It chooses no Oracle and lists no clergy.',
  }, nowMs, true);
}

/** #1196. Flag off, or any nation but Ilmar: the same snapshot, and no greatPilgrimage key. Holds the next date only. */
export function withIlmarGreatPilgrimage(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'ilmar') return snapshot;
  return { ...snapshot, greatPilgrimage: { nextAt: ilmarNextGreatPilgrimageAt(nowMs), cycleDays: ILMAR_GREAT_PILGRIMAGE_CYCLE_DAYS } };
}

/** Ilmar read while only the Great Pilgrimage flag is on. No sanctum, feast, or contracts key. Flag off returns null, which is today's read. */
export function ilmarGreatPilgrimageSnapshot(nowMs: number, enabled: boolean): GovernmentSnapshot | null {
  if (!enabled) return null;
  return withIlmarGreatPilgrimage({
    nationId: 'ilmar', mode: 'rule-bound simulation',
    roles: [{ name: 'Great Pilgrimage', controller: 'AI/SI role · deterministic rules' }],
    decision: {
      title: 'Great Pilgrimage', topic: 'infrastructure', proposedSpendMinor: 0,
      reason: 'The Great Pilgrimage falls once per game year, every 30 real days. This read names the next date. It counts no pilgrims, names no route or shrine, quotes no Oracle, and proposes no spending.',
    },
    availableBudgetMinor: 0,
    influenceSummary: 'This read names the next Great Pilgrimage. It counts no pilgrims and names no shrine.',
  }, nowMs, true);
}

/** #1212. Flag off, or any nation but Ilmar: the same snapshot, and no assemblyElectionDay key. Holds the next date only. */
export function withIlmarAssemblyElectionDay(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'ilmar') return snapshot;
  return { ...snapshot, assemblyElectionDay: { nextAt: ilmarNextAssemblyElectionDayAt(nowMs), cycleDays: ILMAR_ASSEMBLY_ELECTION_DAY_CYCLE_DAYS } };
}

/** Ilmar read while only the Assembly Election day flag is on. No sanctum, feast, contracts, or greatPilgrimage key. Flag off returns null, which is today's read. */
export function ilmarAssemblyElectionDaySnapshot(nowMs: number, enabled: boolean): GovernmentSnapshot | null {
  if (!enabled) return null;
  return withIlmarAssemblyElectionDay({
    nationId: 'ilmar', mode: 'rule-bound simulation',
    roles: [{ name: 'Assembly Election day', controller: 'AI/SI role · deterministic rules' }],
    decision: {
      title: 'Assembly Election day', topic: 'infrastructure', proposedSpendMinor: 0,
      reason: 'The Assembly of the Faithful elects every 120 real days. This read names the next Assembly Election day. It names no candidates, opens no ballot, lists no results, and proposes no spending.',
    },
    availableBudgetMinor: 0,
    influenceSummary: 'This read names the next Assembly Election day. It names no candidates and opens no ballot.',
  }, nowMs, true);
}

/** Veldwood read while only the Dividend Day flag is on. No federalCouncil or voteDayCalendar key. Flag off returns null, which is today's read. */
export function veldwoodDividendDaySnapshot(nowMs: number, enabled: boolean): GovernmentSnapshot | null {
  if (!enabled) return null;
  return withVeldwoodDividendDay({
    nationId: 'veldwood', mode: 'rule-bound simulation',
    roles: [{ name: 'Dividend Day', controller: 'AI/SI role · deterministic rules' }],
    decision: {
      title: 'Dividend Day', topic: 'infrastructure', proposedSpendMinor: 0,
      reason: 'Dividend Day is the yearly Citizen Dividend date, once per game year. This read names the next Dividend Day. It pays no dividend and states no amount.',
    },
    availableBudgetMinor: 0,
    influenceSummary: 'The Common Fund pays a yearly Citizen Dividend. This read names the date only.',
  }, nowMs, true);
}

/** Veldwood read while only the Ring Moot flag is on. No federalCouncil, voteDayCalendar, or dividendDay key. Flag off returns null, which is today's read. */
export function veldwoodRingMootSnapshot(nowMs: number, enabled: boolean): GovernmentSnapshot | null {
  if (!enabled) return null;
  return withVeldwoodRingMoot({
    nationId: 'veldwood', mode: 'rule-bound simulation',
    roles: [{ name: 'Ring Moot', controller: 'AI/SI role · deterministic rules' }],
    decision: {
      title: 'Ring Moot', topic: 'infrastructure', proposedSpendMinor: 0,
      reason: 'Ring Moot is the midsummer federation gathering, once per game year. This read names the next Ring Moot. It opens no vote, lists no motions, and states no turnout.',
    },
    availableBudgetMinor: 0,
    influenceSummary: 'The federation gathers at midsummer for Ring Moot. This read names the date only.',
  }, nowMs, true);
}

/** Veldwood read while only the Vote Day flag is on. No federalCouncil key. Flag off returns null, which is today's read. */
export function veldwoodVoteDaySnapshot(nowMs: number, enabled: boolean): GovernmentSnapshot | null {
  if (!enabled) return null;
  return withVeldwoodVoteDay({
    nationId: 'veldwood', mode: 'rule-bound simulation',
    roles: [{ name: 'Vote Day', controller: 'AI/SI role · deterministic rules' }],
    decision: {
      title: 'Vote Day', topic: 'infrastructure', proposedSpendMinor: 0,
      reason: 'Vote Days fall every 15 real days. This read names the next Vote Day. It opens no ballot, lists no items, and proposes no spending.',
    },
    availableBudgetMinor: 0,
    influenceSummary: 'A Vote Day is a bundled referendum. This read does not collect votes or change any law.',
  }, nowMs, true);
}

/** Veldwood read while the flag is on. Veldwood has no other government snapshot, so this is the smallest one that carries the Council block. Flag off returns null, which is today's read. */
export function veldwoodCouncilSnapshot(nowMs: number, enabled: boolean): GovernmentSnapshot | null {
  if (!enabled) return null;
  return withVeldwoodCouncil({
    nationId: 'veldwood', mode: 'rule-bound simulation',
    roles: [{ name: 'Federal Council', controller: 'AI/SI role · deterministic rules' }],
    decision: {
      title: 'Federal Council', topic: 'infrastructure', proposedSpendMinor: 0,
      reason: 'The Federal Assembly elects a Federal Council of 7 for 120 real days. This read names the next election and the Council Speaker seat. It opens no ballot and proposes no spending.',
    },
    availableBudgetMinor: 0,
    influenceSummary: 'The Council decides collegially. The ceremonial Council Speaker rotates by seniority every 30 real days. This read does not collect votes.',
  }, nowMs, true);
}

/** Fulmara read while the flag is on. Fulmara has no other government snapshot, so this is the smallest one that carries the Grand Council block. Flag off returns null, which is today's read. */
export function fulmaraGovernmentSnapshot(nowMs: number, enabled: boolean): GovernmentSnapshot | null {
  if (!enabled) return null;
  return withFulmaraCouncil({
    nationId: 'fulmara', mode: 'rule-bound simulation',
    roles: [{ name: 'Grand Council', controller: 'AI/SI role · deterministic rules' }],
    decision: {
      title: 'Grand Council', topic: 'work', proposedSpendMinor: 0,
      reason: 'The Grand Council elects the Council of Ten each game year and the Lodestar for 90 real days. This read names those dates and when the Tribune session ends. It opens no ballot and proposes no spending.',
    },
    availableBudgetMinor: 0,
    influenceSummary: 'The Lodestar cannot stand for the next term. The Tribune of the Docks holds one veto per 30-real-day session. This read does not cast it.',
  }, nowMs, true);
}

/** Preserve the recorded priority, while rebasing a live proposal onto today's verified funds. */
export function rebaseGovernmentBudget(snapshot: GovernmentSnapshot, availableBudgetMinor: number, emergency: boolean): GovernmentSnapshot {
  const budget = Number.isSafeInteger(availableBudgetMinor) && availableBudgetMinor >= 0 ? availableBudgetMinor : 0;
  return { ...snapshot, availableBudgetMinor: budget, decision: { ...snapshot.decision,
    proposedSpendMinor: Math.floor(budget / (emergency ? 5 : 10)),
    reason: `${snapshot.decision.reason} Recorded review inputs above are historical. Today's verified programme funds are ${budget} minor units; today's proposal is recalculated with the ${emergency ? 20 : 10}% limit.` } };
}

/** #1116. Flag off, or any nation but Korund: the same snapshot, and no planCalendar key. Opens no rally and changes no quota. */
export function withKorundPlanCalendar(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'korund') return snapshot;
  return { ...snapshot, planCalendar: {
    currentPlanStartedAt: korundCurrentPlanStartedAt(nowMs), nextPlanDayAt: korundNextPlanDayAt(nowMs), nextQuotaRallyAt: korundNextQuotaRallyAt(nowMs),
    planIntervalDays: KORUND_PLAN_INTERVAL_DAYS, quotaRalliesPerPlan: KORUND_QUOTA_RALLIES_PER_PLAN,
  } };
}

/** #1147. Flag off, or any nation but Korund: the same snapshot, and no chairmanBirthday key. Names no Chairman, awards no medal, and proposes no spending. */
export function withKorundChairmanBirthday(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'korund') return snapshot;
  return { ...snapshot, chairmanBirthday: { nextAt: korundNextChairmanBirthdayAt(nowMs), cycleDays: KORUND_CHAIRMAN_BIRTHDAY_CYCLE_DAYS } };
}

/** #1170. Flag off, or any nation but Korund: the same snapshot, and no peoplesCongress key. Holds no votes, motions, delegates, or outcomes. */
export function withKorundPeoplesCongress(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'korund') return snapshot;
  return { ...snapshot, peoplesCongress: { nextAt: korundNextPeoplesCongressAt(nowMs), cycleDays: KORUND_PEOPLES_CONGRESS_CYCLE_DAYS } };
}

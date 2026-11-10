/** #1193: world-read data for the #392/#1192 World atlas. Pure: no database, so no migration.
 *  HARIMU_WORLD_ATLAS_READS_ENABLED lives in HARIMU_GRAY_PACK ("true" in preview, "false" in production). Off: the world read is unchanged.
 *  Next festival: the earliest upcoming date among the nation holiday clocks already on the government reads. Each one counts only while its own flag is on.
 *  [ASSUMPTION] A "festival" is an entry in a nation page's "Holidays & festivals" row (harimu-docs content/world/nations/*.mdx) whose government read has a clock.
 *  Clock-backed, in that row's order: Kindle Ballot Night, Founders' Forge Day, Market Bell; Confluence Congress Lanterns, Canal Festival, Quota Day;
 *  Meridian Congress Week, Exam Day, Turbine Day; Korund Plan Day, Quota Rally, Chairman's Birthday, People's Congress; Aurelle Coronation Day, Hearth Night, Charter Fair, Kite Festival;
 *  Ilmar Feast of First Light, Assembly Election, Great Pilgrimage, Clearing; Hoarvale Opening of the Moot, Honors List Day, Aurora Night, Election Night;
 *  Varkand Muster Day, Rotation Day, Mandate Plebiscite, Lantern Watch; Veldwood Vote Day, Dividend Day, Ring Moot;
 *  Fulmara Exchange Bell, Grand Regatta, Charter Day, Fair-Wind Blessing, Dock Strike remembrance.
 *  Ilmar Stilldays have a clock on sanctum.nextStilldayAt but stay out: the docs call them weekly rest, so they would always be next, and they share the sanctum flag.
 *  Rows with no clock are not invented: Aurelle Heir's Naming, Veldwood Glade Festival, Veldwood Initiative Night.
 *  [ASSUMPTION] Kite Festival (§17.1), Ring Moot (§17.1), and Clearing (§14.1) have government clocks and are not in the nation holiday row.
 *  Each is listed after that nation's clocked row, so a tie keeps the row and then the new clock. Hearth Night (#1146) was already a source.
 *  [ASSUMPTION] Ties: every festival at the earliest instant is listed, in docs roster order (content/world/cultures.mdx), then in the nation row's order.
 *  Election Night and Opening of the Moot share that instant (both offsets are 0, #1208/#1219). The list keeps row order, so Opening of the Moot comes before Election Night.
 *  Dates only: no bonus or holiday effect is applied here.
 *  #1239: while HARIMU_VARKAND_RED_ALERT_CANCELS_ENABLED holds a stored Red Alert (same gate as #1220),
 *  the caller may pass canceled celebration names so nextFestival skips Muster Day, Rotation Day, and Lantern Watch.
 *  Mandate Plebiscite stays. Flag off, or Green/Amber: identical to today. */
import { flagOn } from './flag-pack.mjs';
import { aurelleNextCharterFairAt } from './aurelle-charter-fair.ts';
import { aurelleNextCoronationDayAt } from './aurelle-coronation-day.ts';
import { aurelleNextHearthNightAt } from './aurelle-hearth-night.ts';
import { aurelleNextKiteFestivalAt } from './aurelle-kite-festival.ts';
import { confluenceNextCanalFestivalAt } from './confluence-canal-festival.ts';
import { confluenceNextCongressLanternsAt } from './confluence-congress-lanterns.ts';
import { confluenceNextQuotaDayAt } from './confluence-quota-day.ts';
import { kindleCycleStartAt, type CalendarBindings } from './election-calendars.ts';
import { fulmaraNextCharterDayAt } from './fulmara-charter-day.ts';
import { fulmaraNextDockStrikeRemembranceAt } from './fulmara-dock-strike-remembrance.ts';
import { fulmaraNextExchangeBellAt } from './fulmara-exchange-bell.ts';
import { fulmaraNextFairWindBlessingAt } from './fulmara-fair-wind-blessing.ts';
import { fulmaraNextGrandRegattaAt } from './fulmara-grand-regatta.ts';
import { hoarvaleNextAuroraNightAt } from './hoarvale-aurora-night.ts';
import { hoarvaleNextElectionNightAt } from './hoarvale-election-night.ts';
import { hoarvaleNextHonorsListDayAt } from './hoarvale-honors-list-day.ts';
import { hoarvaleNextMootOpeningAt } from './hoarvale-moot-opening.ts';
import { ilmarNextAssemblyElectionDayAt } from './ilmar-assembly-election-day.ts';
import { ilmarNextClearingAt } from './ilmar-clearing.ts';
import { ilmarNextFeastOfFirstLightAt } from './ilmar-feast-of-first-light.ts';
import { ilmarNextGreatPilgrimageAt } from './ilmar-great-pilgrimage.ts';
import { kindleElectionClock } from './kindle-election.ts';
import { kindleNextFoundersForgeDayAt } from './kindle-founders-forge-day.ts';
import { kindleNextMarketBellAt } from './kindle-market-bell.ts';
import { korundNextChairmanBirthdayAt } from './korund-chairman-birthday.ts';
import { korundNextPeoplesCongressAt } from './korund-peoples-congress.ts';
import { korundNextPlanDayAt, korundNextQuotaRallyAt } from './korund-plan-calendar.ts';
import { meridianNextCongressWeekAt } from './meridian-congress-week.ts';
import { meridianNextExamDayAt } from './meridian-exam-day.ts';
import { meridianNextTurbineDayAt } from './meridian-turbine-day.ts';
import { varkandNextLanternWatchAt } from './varkand-lantern-watch.ts';
import { varkandNextMusterDayAt } from './varkand-muster-day.ts';
import { varkandNextPlebisciteAt } from './varkand-plebiscite.ts';
import { varkandNextRotationDayAt } from './varkand-rotation-day.ts';
import { veldwoodNextDividendDayAt } from './veldwood-dividend-day.ts';
import { veldwoodNextRingMootAt } from './veldwood-ring-moot.ts';
import { veldwoodNextVoteDayAt } from './veldwood-vote-day.ts';

export const WORLD_ATLAS_READS_FLAG = 'HARIMU_WORLD_ATLAS_READS_ENABLED';
export const worldAtlasReadsEnabled = (env: unknown) => flagOn(env, WORLD_ATLAS_READS_FLAG);

export type WorldFestivalSource = { nationId: string; name: string; flag: string; nextAt: (nowMs: number, env?: unknown) => number };
export type WorldFestival = { nationId: string; name: string };
/** `at` is unix seconds, like the rest of `simulation.clock`. */
export type WorldNextFestival = { at: number; festivals: WorldFestival[] };

const f = (nationId: string, name: string, flag: string, nextAt: (nowMs: number, env?: unknown) => number): WorldFestivalSource => ({ nationId, name, flag: `HARIMU_${flag}_ENABLED`, nextAt });
/** #1231: next Ballot Night from the Kindle election clock. Unset, invalid, or a held clock is not a safe integer, so the source is skipped. */
function kindleNextBallotNightAt(nowMs: number, env?: unknown): number {
  if (env == null || typeof env !== 'object') return Number.NaN;
  return kindleElectionClock(kindleCycleStartAt(env as CalendarBindings), nowMs)?.nextBallotNightAt ?? Number.NaN;
}
/** Names are the docs' own row names. Order: the cultures roster, then each nation's "Holidays & festivals" row. */
export const worldFestivalSources: readonly WorldFestivalSource[] = [
  f('kindle', 'Ballot Night', 'KINDLE_ELECTION_CLOCK', kindleNextBallotNightAt),
  f('kindle', "Founders' Forge Day", 'KINDLE_FOUNDERS_FORGE_DAY', kindleNextFoundersForgeDayAt),
  f('kindle', 'Market Bell', 'KINDLE_MARKET_BELL', kindleNextMarketBellAt),
  f('confluence', 'Congress Lanterns', 'CONFLUENCE_CONGRESS_LANTERNS', confluenceNextCongressLanternsAt),
  f('confluence', 'Canal Festival', 'CONFLUENCE_CANAL_FESTIVAL', confluenceNextCanalFestivalAt),
  f('confluence', 'Quota Day', 'CONFLUENCE_QUOTA_DAY', confluenceNextQuotaDayAt),
  f('meridian', 'Congress Week', 'MERIDIAN_CONGRESS_WEEK', meridianNextCongressWeekAt),
  f('meridian', 'Exam Day', 'MERIDIAN_EXAM_DAY', meridianNextExamDayAt),
  f('meridian', 'Turbine Day', 'MERIDIAN_TURBINE_DAY', meridianNextTurbineDayAt),
  f('korund', 'Plan Day', 'KORUND_PLAN_CALENDAR', korundNextPlanDayAt),
  f('korund', 'Quota Rally', 'KORUND_PLAN_CALENDAR', korundNextQuotaRallyAt),
  f('korund', "Chairman's Birthday", 'KORUND_CHAIRMAN_BIRTHDAY', korundNextChairmanBirthdayAt),
  f('korund', "People's Congress", 'KORUND_PEOPLES_CONGRESS', korundNextPeoplesCongressAt),
  f('aurelle', 'Coronation Day', 'AURELLE_CORONATION_DAY', aurelleNextCoronationDayAt),
  f('aurelle', 'Hearth Night', 'AURELLE_HEARTH_NIGHT', aurelleNextHearthNightAt),
  f('aurelle', 'Charter Fair', 'AURELLE_CHARTER_FAIR', aurelleNextCharterFairAt),
  f('aurelle', 'Kite Festival', 'AURELLE_KITE_FESTIVAL', aurelleNextKiteFestivalAt),
  f('ilmar', 'Feast of First Light', 'ILMAR_FEAST_OF_FIRST_LIGHT', ilmarNextFeastOfFirstLightAt),
  f('ilmar', 'Assembly Election', 'ILMAR_ASSEMBLY_ELECTION_DAY', ilmarNextAssemblyElectionDayAt),
  f('ilmar', 'Great Pilgrimage', 'ILMAR_GREAT_PILGRIMAGE', ilmarNextGreatPilgrimageAt),
  f('ilmar', 'Clearing', 'ILMAR_CLEARING', ilmarNextClearingAt),
  f('hoarvale', 'Opening of the Moot', 'HOARVALE_MOOT_OPENING', hoarvaleNextMootOpeningAt),
  f('hoarvale', 'Honors List Day', 'HOARVALE_HONORS_LIST_DAY', hoarvaleNextHonorsListDayAt),
  f('hoarvale', 'Aurora Night', 'HOARVALE_AURORA_NIGHT', hoarvaleNextAuroraNightAt),
  f('hoarvale', 'Election Night', 'HOARVALE_ELECTION_NIGHT', hoarvaleNextElectionNightAt),
  f('varkand', 'Muster Day', 'VARKAND_MUSTER_DAY', varkandNextMusterDayAt),
  f('varkand', 'Rotation Day', 'VARKAND_ROTATION_DAY', varkandNextRotationDayAt),
  f('varkand', 'Mandate Plebiscite', 'VARKAND_PLEBISCITE', varkandNextPlebisciteAt),
  f('varkand', 'Lantern Watch', 'VARKAND_LANTERN_WATCH', varkandNextLanternWatchAt),
  f('veldwood', 'Vote Day', 'VELDWOOD_VOTE_DAY', veldwoodNextVoteDayAt),
  f('veldwood', 'Dividend Day', 'VELDWOOD_DIVIDEND_DAY', veldwoodNextDividendDayAt),
  f('veldwood', 'Ring Moot', 'VELDWOOD_RING_MOOT', veldwoodNextRingMootAt),
  f('fulmara', 'Exchange Bell', 'FULMARA_EXCHANGE_BELL', fulmaraNextExchangeBellAt),
  f('fulmara', 'Grand Regatta', 'FULMARA_GRAND_REGATTA', fulmaraNextGrandRegattaAt),
  f('fulmara', 'Charter Day', 'FULMARA_CHARTER_DAY', fulmaraNextCharterDayAt),
  f('fulmara', 'Fair-Wind Blessing', 'FULMARA_FAIR_WIND_BLESSING', fulmaraNextFairWindBlessingAt),
  f('fulmara', 'Dock Strike remembrance', 'FULMARA_DOCK_STRIKE_REMEMBRANCE', fulmaraNextDockStrikeRemembranceAt),
];

/** Earliest next festival among the sources whose flag is on. Null when none is on or no date is a safe integer.
 *  `canceledNames` (#1239): celebration names to skip (e.g. Varkand Muster Day / Rotation Day / Lantern Watch at Red). Pure: the caller decides the set. */
export function worldNextFestival(nowMs: number, env: unknown, sources: readonly WorldFestivalSource[] = worldFestivalSources, canceledNames: ReadonlySet<string> | readonly string[] = []): WorldNextFestival | null {
  const skip = canceledNames instanceof Set ? canceledNames : new Set(canceledNames);
  let best: number | null = null, festivals: WorldFestival[] = [];
  for (const source of sources) {
    if (skip.has(source.name)) continue;
    if (!flagOn(env, source.flag)) continue;
    const at = source.nextAt(nowMs, env);
    if (!Number.isSafeInteger(at)) continue;
    if (best === null || at < best) { best = at; festivals = []; }
    if (at === best) festivals.push({ nationId: source.nationId, name: source.name });
  }
  return best === null ? null : { at: Math.floor(best / 1000), festivals };
}

/** The `simulation.clock` addition. Flag off (or no festival flag on): an empty object, so the clock is identical to today.
 *  `canceledNames` is forwarded to worldNextFestival (#1239). */
export function worldAtlasClockFields(nowSeconds: number, env: unknown, canceledNames: ReadonlySet<string> | readonly string[] = []): { nextFestival?: WorldNextFestival } {
  if (!worldAtlasReadsEnabled(env)) return {};
  const nextFestival = worldNextFestival(nowSeconds * 1000, env, worldFestivalSources, canceledNames);
  return nextFestival ? { nextFestival } : {};
}

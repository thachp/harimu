/** #488 (Stage 0b of the seven-nations plan, design on #486, ARC option a): one entry per nation for all ten ids, saying how each opens.
 *  The live list itself stays in the import-free `lib/nation-discovery.ts` (`liveNations`, shared by the enroll gate #485, the QA switch and the Coming soon gate),
 *  because many component tests load that file directly under plain Node. This registry imports it, one direction only: nothing in `nation-discovery.ts` imports this file.
 *  A live nation has `openingFlag: null`. A closed one names the flag that will open it (HARIMU_<NATION>_ENABLED); every one of those flags is off (wrangler vars, #489) and only `nationPlayable` reads them.
 *  The opening PR for a nation adds its capital here (map-zones keeps the three live capitals until #491 derives them).
 *  No behaviour changes: all ten nations answer exactly as the old three-id literals did. */
import { isLiveNation, liveNations } from './nation-discovery';
import { qaTestCitizenAllowed, type QaBindings } from './qa-tools';

export const nationIds = ['kindle', 'confluence', 'meridian', 'korund', 'aurelle', 'ilmar', 'hoarvale', 'varkand', 'veldwood', 'fulmara'] as const;
export type NationId = typeof nationIds[number];
export type NationOpening = {
  id: NationId;
  /** null = live for everyone (it is in `liveNations`); otherwise the name of the (off) flag that will open the nation. */
  openingFlag: string | null;
  /** Map seed (#491): filled in by the PR that opens the nation. The three live nations carry theirs; no new capital yet. */
  capital?: { x: number; y: number };
  /** Border outpost square, when the nation has one (the three live nations do). */
  outpost?: { x: number; y: number };
  /** Heartland terrain mix, used to seed the nation's squares. Present exactly when `capital` is. */
  biome?: readonly string[];
  /** #490 (Stage 0d): the nation's wage currency, wage fund and jobs for the generic wage ledger (lib/nation-work.ts). Absent for every nation today:
   *  the opening PR for a nation fills these in, and until then HARIMU_NATION_WORK_ENABLED has nothing to run. Kindle, Korund and Aurelle keep their own ledgers. */
  currency?: { code: string; name: string };
  wage?: { fundMinor: number };
  jobs?: readonly NationJob[];
};
type MapSeed = { capital: { x: number; y: number }; outpost: { x: number; y: number }; biome: readonly string[] };
/** The three live nations' capitals, outposts and biomes (moved from lib/map-zones.ts `mvpNations`, values unchanged; docs 6.1/6.2 reduced-scale map, #66). */
const liveMapSeeds: Readonly<Partial<Record<NationId, MapSeed>>> = {
  kindle: { capital: { x: 5, y: 4 }, outpost: { x: 8, y: 7 }, biome: ['plains', 'hills', 'volcanic badland'] },
  korund: { capital: { x: 18, y: 4 }, outpost: { x: 15, y: 7 }, biome: ['mountains', 'cliff/plateau', 'hills'] },
  aurelle: { capital: { x: 12, y: 14 }, outpost: { x: 12, y: 11 }, biome: ['cliff/plateau', 'plains', 'coast'] },
};
/** One job a nation offers. `id` must start with the nation id (it is also the work-order id, so ids never collide across nations). `wageMinor` is paid once per claimed shift. */
export type NationJob = { id: string; name: string; capacityCost: number; hours: number; wageMinor: number; output: string };

/** #487 (Confluence PoC, slice 1): the Confluence wage ledger for the generic work commands (lib/nation-work.ts). Read only while HARIMU_CONFLUENCE_ENABLED and HARIMU_NATION_WORK_ENABLED
 *  are "true" and the account is QA-allowlisted (nationPlayable). Currency per docs (the-confluence.mdx: Current, CUR); no band, parity or State Bank (excluded by #487).
 *  [ASSUMPTION] job values copy the Labor Notes / Crowns pattern (capacity 4, 2 hours, 800 minor units; Stage 0 design section 3), and the fund (100000 minor units) is an [ASSUMPTION] accepted by ARC, matching Korund's seeded `korund_resources.initial_minor` (lib/db.ts).
 *  Name and output are placeholders from the docs' city table (Lanu Terraces: "Cooperative harvest shifts") until Content supplies copy. No capital yet: that is the next slice. */
export const confluenceWork = {
  currency: { code: 'CUR', name: 'Current' },
  wage: { fundMinor: 100_000 },
  jobs: [{ id: 'confluence-cooperative-harvest', name: 'Cooperative harvest shift', capacityCost: 4, hours: 2, wageMinor: 800, output: 'Rice brought in on the Lanu Terraces' }],
} as const satisfies Pick<NationOpening, 'currency' | 'wage' | 'jobs'>;
const workSeeds: Readonly<Partial<Record<NationId, Pick<NationOpening, 'currency' | 'wage' | 'jobs'>>>> = { confluence: confluenceWork };

export const nationOpenings: readonly NationOpening[] = nationIds.map(id => ({ id, openingFlag: isLiveNation(id) ? null : `HARIMU_${id.toUpperCase()}_ENABLED`, ...liveMapSeeds[id], ...workSeeds[id] }));

export const nationOpening = (id: unknown): NationOpening | undefined => typeof id === 'string' ? nationOpenings.find(opening => opening.id === id) : undefined;
/** Ids whose rules run: the live nations plus any whose opening flag is exactly "true" in `bindings`, in catalog order. Unknown ids never appear.  */
export const openNationIds = (bindings: Readonly<Record<string, string | undefined>> = {}): readonly NationId[] =>
  nationOpenings.filter(opening => opening.openingFlag === null || bindings[opening.openingFlag] === 'true').map(opening => opening.id);
type OpeningBindings = Readonly<Record<string, string | undefined>> & QaBindings;
/** #489 (Stage 0c): may this account enroll in, switch to, or play this nation? Fails closed.
 *  A live nation: always. An unknown id, or a nation whose opening flag is not exactly "true": never. A flag-on nation: only a QA-allowlisted account (`qaTestCitizenAllowed`:
 *  HARIMU_QA_TEST_CITIZENS, NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW, HARIMU_QA_TEST_CITIZEN_IDS), so a mistaken flag on production still opens nothing for the public,
 *  and a call without a user id (userId omitted) never opens a flag-on nation. Public opening is a later release decision. The enroll route and the QA switch both call this. */
export const nationPlayable = (id: unknown, bindings?: OpeningBindings, userId?: string | null): boolean => {
  const opening = nationOpening(id);
  if (!opening) return false;
  if (opening.openingFlag === null) return true;
  if (typeof userId !== 'string' || !userId || bindings?.[opening.openingFlag] !== 'true') return false;
  return qaTestCitizenAllowed(bindings, userId);
};
export { liveNations };

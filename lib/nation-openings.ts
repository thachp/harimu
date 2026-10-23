/** #488 (Stage 0b of the seven-nations plan, design on #486, ARC option a): one entry per nation for all ten ids, saying how each opens.
 *  The live list itself stays in the import-free `lib/nation-discovery.ts` (`liveNations`, shared by the enroll gate #485, the QA switch and the Coming soon gate),
 *  because many component tests load that file directly under plain Node. This registry imports it, one direction only: nothing in `nation-discovery.ts` imports this file.
 *  A live nation has `openingFlag: null`. A closed one names the flag that will open it (HARIMU_<NATION>_ENABLED); every one of those flags is off (wrangler vars, #489) and only `nationPlayable` reads them.
 *  The opening PR for a nation adds its capital here (map-zones keeps the three live capitals until #491 derives them).
 *  No behaviour changes: all ten nations answer exactly as the old three-id literals did. */
import { isLiveNation, liveNations } from './nation-discovery';
import { qaTestCitizenAllowed, type QaBindings } from './qa-tools';
import { WORLD_GRID } from './globe-mapping'; // the grid size, defined once

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
  /** Heartland terrain mix, used to seed the nation's squares. Set with the capital by the nation's opening PR; #486 placed six capitals before their biomes. */
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
  /** #487 slice 2: Meetwater, the Confluence capital (docs the-confluence.mdx: central delta Heartland). [ASSUMPTION] (4,13) and the outpost (7,10): the docs give no coordinates; the 7x7 block
   *  is clear of the three live blocks, the Commons and the grid edge on the 24x18 map (tests/confluence-capital-487.test.mjs). Biome from the docs (canals, terraced hills, delta wetland). */
  confluence: { capital: { x: 4, y: 13 }, outpost: { x: 7, y: 10 }, biome: ['river edge', 'wetland', 'hills'] },
};
/** #486 (ARC on #486: 30x24 additive): the six unopened nations' capitals, each replacing that nation's stand-in marker (lib/globe-mapping.ts nationGlobeSquares).
 *  Each capital went to the stand-in it was closest to on the globe (the assignment with the least total arc from the 24x18 stand-ins; unique, tests/world-grid-30x24-486.test.mjs).
 *  Position only: no biome, outpost or squares yet, so the nation is not on the square map (`mappedNations`) and its readiness `map` stays false; its opening PR adds the biome and
 *  runs `nationSquaresUpsertSql`. [ASSUMPTION] the docs give no capital coordinates. */
const newCapitals: Readonly<Partial<Record<NationId, { capital: { x: number; y: number } }>>> = {
  meridian: { capital: { x: 26, y: 17 } }, ilmar: { capital: { x: 25, y: 3 } }, hoarvale: { capital: { x: 3, y: 20 } },
  varkand: { capital: { x: 19, y: 11 } }, veldwood: { capital: { x: 26, y: 10 } }, fulmara: { capital: { x: 19, y: 18 } },
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

export const nationOpenings: readonly NationOpening[] = nationIds.map(id => ({ id, openingFlag: isLiveNation(id) ? null : `HARIMU_${id.toUpperCase()}_ENABLED`, ...newCapitals[id], ...liveMapSeeds[id], ...workSeeds[id] }));

export const nationOpening = (id: unknown): NationOpening | undefined => typeof id === 'string' ? nationOpenings.find(opening => opening.id === id) : undefined;
/** Ids whose rules run: the live nations plus any whose opening flag is exactly "true" in `bindings`, in catalog order. Unknown ids never appear.  */
export const openNationIds = (bindings: Readonly<Record<string, string | undefined>> = {}): readonly NationId[] =>
  nationOpenings.filter(opening => opening.openingFlag === null || (bindings[opening.openingFlag] === 'true' && readinessAllows(opening, bindings))).map(opening => opening.id);
/** #486 (Stage 0 closeout, slice 1): the map-size-independent opening checklist, read from the registry entry alone. A live nation is always ready (it keeps its own modules).
 *  `map`: a capital and biome are set (checked present, not where; placement is #486's map-fit measurement). `work`: currency, wage fund and at least one job. */
export type NationReadiness = { map: boolean; work: boolean; ready: boolean };
/** #486 (QA1 nit): the map check also asks whether the capital's block fits, using the same rules as the map-fit measurement on #486. Values mirror lib/map-zones.ts
 *  (width and height are WORLD_GRID, lib/globe-mapping.ts; frontierRadius 3, Commons centre 12,6 are repeated here, since that file imports this one, and pinned equal by tests/nation-readiness-486.test.mjs). */
/** #486: the capital spacing rules, in one place: a 7x7 block (radius 3) wholly on the grid, capitals at least 7 apart and at least 5 from the Commons centre (Chebyshev). */
export const capitalSpacing = { blockRadius: 3, minCapitalDistance: 7, minCommonsDistance: 5 } as const;
export const mapFitRules = { width: WORLD_GRID.width, height: WORLD_GRID.height, commonsCentre: { x: 12, y: 6 }, ...capitalSpacing } as const;
const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
/** Does a capital's 7x7 block fit: wholly on the grid, Chebyshev >= 7 from every other capital and >= 5 from the Commons centre? A check only; it places nothing. */
export const capitalFits = (capital: { x: number; y: number }, others: readonly { x: number; y: number }[]): boolean => {
  const { width, height, blockRadius: r, commonsCentre, minCapitalDistance, minCommonsDistance } = mapFitRules;
  return capital.x >= r && capital.y >= r && capital.x + r < width && capital.y + r < height
    && cheb(capital, commonsCentre) >= minCommonsDistance && others.every(other => cheb(capital, other) >= minCapitalDistance);
};
/** Readiness of one registry entry, checked against the other entries' capitals. Exported so a partial entry can be tested directly. */
export const openingReadiness = (opening: NationOpening, all: readonly NationOpening[] = nationOpenings): NationReadiness => {
  if (opening.openingFlag === null) return { map: true, work: true, ready: true };
  const others = all.flatMap(o => o.id !== opening.id && o.capital ? [o.capital] : []);
  const map = Boolean(opening.capital && opening.biome?.length && capitalFits(opening.capital, others));
  const work = Boolean(opening.currency && opening.wage && opening.jobs?.length);
  return { map, work, ready: map && work };
};
export const nationReadiness = (id: unknown): NationReadiness | undefined => {
  const opening = nationOpening(id);
  return opening ? openingReadiness(opening) : undefined;
};
/** Behind HARIMU_NATION_READINESS_ENABLED (preview "true", production "false"): when on, a nation whose opening flag is "true" but whose registry entry is incomplete stays closed,
 *  so flipping a flag early opens nothing. Off: exactly the behaviour before #486 (the opening flag and the QA allowlist decide). */
const readinessAllows = (opening: NationOpening, bindings?: Readonly<Record<string, string | undefined>>) =>
  bindings?.HARIMU_NATION_READINESS_ENABLED !== 'true' || nationReadiness(opening.id)?.ready === true;
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
  if (!readinessAllows(opening, bindings)) return false; // #486
  return qaTestCitizenAllowed(bindings, userId);
};
/** #872 (ARC ruling on the issue): the nations this account may play here, in catalog order: exactly those where nationPlayable is true, never a flag alone.
 *  The Preview badge, comparison table and population bands follow this (sent to the client as GET /api/citizen `openNations`); enroll and the QA switch call nationPlayable itself.
 *  Without a signed-in user only the live list qualifies, so the public answer and production (every flag "false") are unchanged. */
export const playableNationIds = (bindings?: OpeningBindings, userId?: string | null): readonly NationId[] =>
  nationIds.filter(id => nationPlayable(id, bindings, userId));
export { liveNations };

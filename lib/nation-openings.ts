/** #488 (Stage 0b of the seven-nations plan, design on #486, ARC option a): one entry per nation for all ten ids, saying how each opens.
 *  The live list itself stays in the import-free `lib/nation-discovery.ts` (`liveNations`, shared by the enroll gate #485, the QA switch and the Coming soon gate),
 *  because many component tests load that file directly under plain Node. This registry imports it, one direction only: nothing in `nation-discovery.ts` imports this file.
 *  A live nation has `openingFlag: null`. A closed one names the flag that will open it (HARIMU_<NATION>_ENABLED); every one of those flags is off, nothing reads
 *  or defines them yet (no wrangler binding), and the opening PR for a nation adds its capital here (map-zones keeps the three live capitals until #491 derives them).
 *  No behaviour changes: all ten nations answer exactly as the old three-id literals did. */
import { isLiveNation, liveNations } from './nation-discovery';

export const nationIds = ['kindle', 'confluence', 'meridian', 'korund', 'aurelle', 'ilmar', 'hoarvale', 'varkand', 'veldwood', 'fulmara'] as const;
export type NationId = typeof nationIds[number];
export type NationOpening = {
  id: NationId;
  /** null = live for everyone (it is in `liveNations`); otherwise the name of the (off) flag that will open the nation. */
  openingFlag: string | null;
  /** Filled in by the PR that opens the nation; none yet. */
  capital?: { x: number; y: number };
};

export const nationOpenings: readonly NationOpening[] = nationIds.map(id => ({ id, openingFlag: isLiveNation(id) ? null : `HARIMU_${id.toUpperCase()}_ENABLED` }));

export const nationOpening = (id: unknown): NationOpening | undefined => typeof id === 'string' ? nationOpenings.find(opening => opening.id === id) : undefined;
/** Ids whose rules run: the live nations plus any whose opening flag is exactly "true" in `bindings`, in catalog order. Unknown ids never appear. (No flag is wired to a binding yet.) */
export const openNationIds = (bindings: Readonly<Record<string, string | undefined>> = {}): readonly NationId[] =>
  nationOpenings.filter(opening => opening.openingFlag === null || bindings[opening.openingFlag] === 'true').map(opening => opening.id);
export { liveNations };

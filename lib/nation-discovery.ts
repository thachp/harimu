export type DiscoveryNation = {id:string;name:string;government?:string;economy?:string;currency?:string;religion?:string};
/** #485: the one list of nations a citizen can enroll in today (Kindle, Korund, Aurelle); the other seven are seeded in `nations` but their economies are not built.
 *  Every gate reads it so they cannot drift: the enroll route (server gate, before any write), the QA nation switch (`qa-test-nation`) and the client "Coming soon" gate (`nationIsPreview`).
 *  This file imports nothing on purpose: many component tests load it directly. The Stage 0 registry (lib/nation-openings.ts, #488) imports this list (one direction only) and derives each nation's `openingFlag` from it. */
export const liveNations = ['kindle','korund','aurelle'] as const;
export type LiveNationId = typeof liveNations[number];
export const isLiveNation = (id: unknown): id is LiveNationId => typeof id === 'string' && (liveNations as readonly string[]).includes(id);
/** The ten nations always show in default order; the discovery filter and sort rows were removed. A nation is a preview until its economy is playable. */
/** #872: `open` is the server's list of nations open in this environment (`liveNationIds`, lib/nation-openings: a live nation, or one whose HARIMU_<ID>_ENABLED is "true"
 *  and that passes the readiness check). Omitted or empty: the hardcoded live list alone, exactly as before. */
export function nationIsPreview(id:string,open?:readonly string[]){return !isLiveNation(id)&&!(Array.isArray(open)&&open.includes(id));} // Array.isArray: safe as a .filter callback
/** #875 (QA3): the open list the nations-bar Preview badge reads. undefined (badge hidden) only while the citizen status is still settling; a signed-out
 *  visitor, a failed citizen fetch, and a build without accounts all settle to [], so guests, the badge's main audience, still see Preview. */
export function previewOpenNations(open: readonly string[] | undefined, accounts: boolean, status: 'loading' | 'anonymous' | 'ready' | 'error'): readonly string[] | undefined {
  if (open) return open;
  return !accounts || status === 'anonymous' || status === 'error' ? [] : undefined;
}

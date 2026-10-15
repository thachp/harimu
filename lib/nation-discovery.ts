export type DiscoveryNation = {id:string;name:string;government?:string;economy?:string;currency?:string;religion?:string};
/** #485: the one list of nations a citizen can enroll in today (Kindle, Korund, Aurelle); the other seven are seeded in `nations` but their economies are not built.
 *  Every gate reads it so they cannot drift: the enroll route (server gate, before any write), the QA nation switch (`qaTestNations`) and the client "Coming soon" gate (`nationIsPreview`).
 *  This file imports nothing on purpose: many component tests load it directly. The Stage 0 registry (#488) will derive this list from its openings (`openingFlag === null`); the exports stay. */
export const liveNations = ['kindle','korund','aurelle'] as const;
export type LiveNationId = typeof liveNations[number];
export const isLiveNation = (id: unknown): id is LiveNationId => typeof id === 'string' && (liveNations as readonly string[]).includes(id);
/** The ten nations always show in default order; the discovery filter and sort rows were removed. A nation is a preview until its economy is playable. */
export function nationIsPreview(id:string){return !isLiveNation(id);}

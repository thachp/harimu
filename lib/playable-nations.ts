/** #485: the one server-side list of nations a citizen can enroll in today. Pure data, imports nothing, so every gate reads the same list and they cannot drift:
 *  the enroll route (server gate, before any write), the QA nation switch (`qaTestNations`), and the client "Coming soon" gate (`nationIsPreview`).
 *  Playable today: Kindle, Korund, Aurelle. The other seven nations are seeded in `nations` but their economies are not built (docs: nation roster, MVP scope).
 *  The Stage 0 registry (#488, lib/nation-openings.ts) derives this list from its openings (`openingFlag === null`); the export name and shape stay. */
export const liveNations = ['kindle', 'korund', 'aurelle'] as const;
export type LiveNationId = typeof liveNations[number];
export const isLiveNation = (id: unknown): id is LiveNationId => typeof id === 'string' && (liveNations as readonly string[]).includes(id);

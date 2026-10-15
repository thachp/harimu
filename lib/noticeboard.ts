/** #375: the city noticeboard shows only the viewed nation's own stories (or none). `world_events` has no nation column and its three seeded
 *  stories (Forgehaven, the Kindle Assembly, the Kindle-Confluence corridor vote) are all Kindle's, as is the page's offline fallback; the only other
 *  rows the game writes are Aurelle Court Gazette entries (kind 'court-gazette', lib/aurelle-rising.ts). So the owner is derived from the kind: a gazette
 *  entry is Aurelle's, anything else is Kindle's. Korund has no stories yet and shows the empty state. A new nation-specific kind must be added here. */
export type NoticeboardEvent = { kind: string };
export const noticeboardNation = (event: NoticeboardEvent): 'kindle' | 'aurelle' => event.kind === 'court-gazette' ? 'aurelle' : 'kindle';
export const noticeboardEvents = <T extends NoticeboardEvent>(events: readonly T[], nationId: string): T[] => events.filter(event => noticeboardNation(event) === nationId);

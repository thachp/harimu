/** #375: the city noticeboard shows only the viewed nation's own stories (or none). `world_events` has no nation column and its three seeded
 *  stories (Forgehaven, the Kindle Assembly, the Kindle-Confluence corridor vote) are all Kindle's, as is the page's offline fallback; the only other
 *  rows the game writes are Aurelle Court Gazette entries (kind 'court-gazette', lib/aurelle-rising.ts) and #966 tier drops
 *  (`city-tier-kindle|korund|aurelle`, lib/city-tier.ts). So the owner is derived from the kind: a gazette entry is Aurelle's,
 *  a tier drop belongs to the nation in its kind, and anything else is Kindle's. A new nation-specific kind must be added here. */
export type NoticeboardEvent = { kind: string };
export const noticeboardNation = (event: NoticeboardEvent): 'kindle' | 'korund' | 'aurelle' => {
  if (event.kind === 'court-gazette') return 'aurelle';
  const nation = /^city-tier-(kindle|korund|aurelle)$/.exec(event.kind)?.[1];
  if (nation === 'kindle' || nation === 'korund' || nation === 'aurelle') return nation;
  return 'kindle';
};
export const noticeboardEvents = <T extends NoticeboardEvent>(events: readonly T[], nationId: string): T[] => events.filter(event => noticeboardNation(event) === nationId);

/** #68: a nation's stance toward a faith's festival (docs §14.2). Kindle treats every faith the same (tolerated).
 *  Aurelle endorses the Kinward Rite and tolerates the others. Korund bans every faith festival in public.
 *  Any other nation has no #68 row. */
export type FestivalStance = 'endorsed' | 'tolerated' | 'banned';

export function festivalStance(nationId: string, faithId: string): FestivalStance | null {
  if (nationId === 'kindle') return 'tolerated';
  if (nationId === 'aurelle') return faithId === 'kinward-rite' ? 'endorsed' : 'tolerated';
  if (nationId === 'korund') return 'banned';
  return null;
}

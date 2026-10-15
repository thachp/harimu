/** #344: the Kindle-style Market (goods, listings, order book) ships behind HARIMU_ORDER_BOOK_ENABLED.
 * While it is off, its entry points are hidden: the Market location tab, the city map building, the
 * first-week tracker's market goals, and the "take your earnings to market" prompts.
 * Korund's State store (ration coupons) and Aurelle's royal store are separate nation systems, not this market, so they stay.
 * Pure and dependency-free so tests can import it directly. */
export const marketHiddenNations=['korund','aurelle'] as const;
/** True when the Market (as a place to go) should be offered to this citizen. `flag` is the server's HARIMU_ORDER_BOOK_ENABLED. */
export function marketVisible(nationId:string|null|undefined,flag:boolean):boolean{
 return flag||nationId==='korund'||nationId==='aurelle';
}
/** Server side: reads the raw env string the same way every other flag is read. */
export const marketFlagOn=(value:unknown):boolean=>value==='true';
/** Dock / location tabs: only the Market entry is flag-gated. */
export const locationVisible=(location:string,nationId:string|null|undefined,flag:boolean):boolean=>location!=='market'||marketVisible(nationId,flag);

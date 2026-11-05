/** #1139: Ilmar Prism contracts (docs §7.6, §12.3, §23).
 *  Pure: a posted counting-house register, no database, so no migration. This read does not open a
 *  partnership, collect a tithe, pause Prism trading, or write a chain record.
 *  [ASSUMPTION] The docs name two Clear Measure instruments (profit-sharing Lightshare partnerships
 *  and asset-backed Endowment leases) and say counting-houses post profit shares, not interest.
 *  They do not name titles or percents. The four rows are a fixed public sample from places already
 *  in lib/cities.ts (Mirrorhall, Lume Mesa, Glassen) and the Glassen Great Kiln landmark in §7.6.
 *  They do not move with the clock.
 *  [ASSUMPTION] sharePercent is the posted whole-number share of that venture's profit, from 0 to 100.
 *  It is not an interest rate, the tithe (a tax, §12.12), or a rent. A lease row uses the same field:
 *  the profit share that stands in place of fixed interest. */
export type IlmarPrismContract = { title: string; sharePercent: number };

const posted: readonly IlmarPrismContract[] = [
  { title: 'Lightshare: Mirrorhall counting-house', sharePercent: 40 },
  { title: 'Lightshare: Glassen Sunglass kiln', sharePercent: 25 },
  { title: 'Endowment lease: Lume Mesa pilgrim stair', sharePercent: 15 },
  { title: 'Endowment lease: Glassen Great Kiln', sharePercent: 10 },
];

/** A whole percent from 0 to 100. Anything else is unposted, not rounded into a rate. */
export function ilmarSharePercent(value: number): number | null {
  return Number.isInteger(value) && value >= 0 && value <= 100 ? value : null;
}

/** A fresh list, so a caller cannot change the posted register. Blank titles and bad percents are dropped. */
export function ilmarPrismContracts(): IlmarPrismContract[] {
  return posted.flatMap(row => {
    const title = row.title.trim();
    const sharePercent = ilmarSharePercent(row.sharePercent);
    return title && sharePercent != null ? [{ title, sharePercent }] : [];
  });
}

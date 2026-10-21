/** #601: pure targeted goods-sanction rules (import-free). Canon: harimu-docs 13.3 ("Targeted sanctions: bans on specific goods"), 13.3.1 ("Humanitarian goods (food, medicine) always settle").
 *  The goods are the two catalogs that exist: the household market (lib/market.ts) and the #195 order-book goods (lib/market-orders.ts). */
export const sanctionGoods = ['food', 'materials', 'knowledge', 'fruit', 'meat', 'wood'] as const;
export type SanctionGood = typeof sanctionGoods[number];
/** [ASSUMPTION] humanitarian goods per 13.3.1 "food": the market's food plus fruit and meat (edible, even though #195 does not count them for meals). There is no medicine good yet. */
export const humanitarianGoods: readonly SanctionGood[] = ['food', 'fruit', 'meat'];
export const sanctionGoodLabels: Readonly<Record<SanctionGood, string>> = { food: 'Food', materials: 'Materials', knowledge: 'Knowledge', fruit: 'Fruit', meat: 'Meat', wood: 'Wood' };
export const maxSanctionGoods = 3; // [ASSUMPTION] at most 3 goods per sanction (everything sanctionable today); a full cut is the #363 embargo
export const isSanctionGood = (value: unknown): value is SanctionGood => typeof value === 'string' && (sanctionGoods as readonly string[]).includes(value);

export type GoodsCheck = { ok: true; goods: SanctionGood[] } | { ok: false; reason: 'bad_goods' | 'humanitarian_good' };
/** Validates a proposed list: 1..max known goods, no food. Returns the sorted, de-duplicated list. */
export function checkSanctionGoods(value: unknown): GoodsCheck {
  if (!Array.isArray(value) || value.length < 1 || value.length > maxSanctionGoods * 2 || !value.every(isSanctionGood)) return { ok: false, reason: 'bad_goods' };
  const goods = [...new Set(value as SanctionGood[])].sort();
  if (goods.length > maxSanctionGoods) return { ok: false, reason: 'bad_goods' };
  if (goods.some(g => humanitarianGoods.includes(g))) return { ok: false, reason: 'humanitarian_good' };
  return { ok: true, goods };
}
/** Stored as ",a,b," so one LIKE finds a good with no JSON functions (works on SQLite and Postgres). */
export const goodsColumn = (goods: readonly string[]) => `,${goods.join(',')},`;
export const goodsFromColumn = (column: string) => column.split(',').filter(isSanctionGood);

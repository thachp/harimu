/** #392: citizen resource bar (WC, currency, food, materials, knowledge).
 *  NEXT_PUBLIC_HARIMU_RESOURCE_BAR is a HARIMU_UI_PACK key ("true" in preview, "false" in production).
 *  Layout bundles that omit the define have no `process`. A missing flag is off. Only the exact string "true" enables it.
 *  Each chip is a number already on the citizen or household read. A missing read is left out. No placeholder is filled in. */
export function resourceBarFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_RESOURCE_BAR; }
  catch { return undefined; }
}
export function resourceBarEnabled(value: string | undefined = resourceBarFlag()): boolean {
  return value === 'true';
}

export type ResourceBarId = 'wc' | 'wallet' | 'food' | 'materials' | 'knowledge';
export type ResourceBarItem = { id: ResourceBarId; label: string; value: string; name: string };
export type ResourceBarRead = {
  nationId: string;
  /** Citizen row `capacity`. Work capacity is the energy read. */
  capacity?: number | null;
  currencyCode?: string | null;
  /** Kindle Spark, Aurelle Crowns or Korund Labor Notes, in minor units. */
  walletMinor?: number | null;
  /** Present once that nation's stock read has arrived. */
  inventory?: { food?: number | null; materials?: number | null; knowledge?: number | null } | null;
};

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const money = (minor: number) => (minor / 100).toFixed(2);
/** Household wallet (lib/ui-v2-household.ts): only these three nations have a balance on the existing read. */
const walletNations = new Set(['kindle', 'aurelle', 'korund']);
/** Household stock: Kindle reads its inventory; Aurelle and Korund read household food. The other nations have no stock read. */
const foodNations = new Set(['kindle', 'aurelle', 'korund']);

/** Chips for the bar. Materials and knowledge exist only on the Kindle inventory.
 *  Aurelle and Korund have no materials or knowledge count (a hardcoded 0 is not shown).
 *  Wallet and food are omitted for every other nation, and any chip whose number has not arrived is omitted. */
export function resourceBarItems(read: ResourceBarRead): ResourceBarItem[] {
  const items: ResourceBarItem[] = [];
  if (finite(read.capacity)) items.push({ id: 'wc', label: 'WC', value: String(read.capacity), name: `Work capacity, ${read.capacity} WC` });
  if (walletNations.has(read.nationId) && finite(read.walletMinor) && (read.currencyCode === 'SPK' || read.currencyCode === 'CRN' || read.currencyCode === 'LN')) {
    const amount = money(read.walletMinor);
    items.push({ id: 'wallet', label: read.currencyCode, value: amount, name: `Wallet, ${amount} ${read.currencyCode}` });
  }
  const inventory = read.inventory;
  if (inventory && foodNations.has(read.nationId) && finite(inventory.food)) items.push({ id: 'food', label: 'Food', value: String(inventory.food), name: `Food, ${inventory.food}` });
  if (read.nationId === 'kindle' && inventory && finite(inventory.materials)) items.push({ id: 'materials', label: 'Mat.', value: String(inventory.materials), name: `Materials, ${inventory.materials}` });
  if (read.nationId === 'kindle' && inventory && finite(inventory.knowledge)) items.push({ id: 'knowledge', label: 'Know.', value: String(inventory.knowledge), name: `Knowledge, ${inventory.knowledge}` });
  return items;
}

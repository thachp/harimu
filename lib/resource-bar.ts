/** #392: citizen resource bar (WC, currency, food, materials, knowledge). #1202 reads the ledgers GET /api/citizen already returns.
 *  NEXT_PUBLIC_HARIMU_RESOURCE_BAR is a HARIMU_UI_PACK key ("true" in preview, "false" in production).
 *  Layout bundles that omit the define have no `process`. A missing flag is off. Only the exact string "true" enables it.
 *  Each chip is a number already on the citizen read. A nation with no ledger for that resource is left out. No placeholder is filled in. */
export function resourceBarFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_RESOURCE_BAR; }
  catch { return undefined; }
}
export function resourceBarEnabled(value: string | undefined = resourceBarFlag()): boolean {
  return value === 'true';
}

export type ResourceCurrency = 'SPK' | 'CRN' | 'LN' | 'CUR';
export type ResourceBarId = 'wc' | 'wallet' | 'food' | 'materials' | 'knowledge';
export type ResourceBarItem = { id: ResourceBarId; label: string; value: string; name: string };
export type ResourceBarRead = {
  nationId: string;
  /** Citizen row `capacity`. Work capacity is the energy read. */
  capacity?: number | null;
  currencyCode?: string | null;
  /** Minor units of that nation's own wage ledger. */
  walletMinor?: number | null;
  /** Present once that nation's stock read has arrived. Materials and knowledge are Kindle only. */
  inventory?: { food?: number | null; materials?: number | null; knowledge?: number | null } | null;
};

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const money = (minor: number) => (minor / 100).toFixed(2);
/** Wage ledgers on GET /api/citizen: Kindle Spark, Aurelle Crowns, Korund Labor Notes, Confluence Current (`nationWorkPlan.walletMinor`). */
const walletLedger: Readonly<Record<string, ResourceCurrency>> = { kindle: 'SPK', aurelle: 'CRN', korund: 'LN', confluence: 'CUR' };
/** Household stock: Kindle reads its inventory; Aurelle and Korund read household food. No other nation has a stock read. */
const foodNations = new Set(['kindle', 'aurelle', 'korund']);

/** Chips for the bar. A currency is shown only when it is that nation's ledger code.
 *  Materials and knowledge exist only on the Kindle inventory. Aurelle and Korund food is their own count.
 *  Any chip whose number has not arrived is omitted. */
export function resourceBarItems(read: ResourceBarRead): ResourceBarItem[] {
  const items: ResourceBarItem[] = [];
  if (finite(read.capacity)) items.push({ id: 'wc', label: 'WC', value: String(read.capacity), name: `Work capacity, ${read.capacity} WC` });
  const ledger = walletLedger[read.nationId];
  if (ledger && read.currencyCode === ledger && finite(read.walletMinor)) {
    const amount = money(read.walletMinor);
    items.push({ id: 'wallet', label: ledger, value: amount, name: `Wallet, ${amount} ${ledger}` });
  }
  const inventory = read.inventory;
  if (inventory && foodNations.has(read.nationId) && finite(inventory.food)) items.push({ id: 'food', label: 'Food', value: String(inventory.food), name: `Food, ${inventory.food}` });
  if (read.nationId === 'kindle' && inventory && finite(inventory.materials)) items.push({ id: 'materials', label: 'Mat.', value: String(inventory.materials), name: `Materials, ${inventory.materials}` });
  if (read.nationId === 'kindle' && inventory && finite(inventory.knowledge)) items.push({ id: 'knowledge', label: 'Know.', value: String(inventory.knowledge), name: `Knowledge, ${inventory.knowledge}` });
  return items;
}

export type CitizenHudSource = {
  nationId?: string | null;
  economy?: { walletMinor?: number | null; inventory?: readonly { item: string; quantity: number }[] | null } | null;
  aurellePlan?: { walletMinor?: number | null; foodQuantity?: number | null } | null;
  korundPlan?: { walletMinor?: number | null; foodQuantity?: number | null } | null;
  /** Confluence Current. Absent unless GET /api/citizen included `nationWorkPlan`. */
  nationWorkPlan?: { walletMinor?: number | null; currency?: { code?: string | null } | null } | null;
};
export type CitizenHudResources = {
  /** null: this nation has no wage ledger, so the shell must not label the chip SPK. */
  currencyCode: ResourceCurrency | null;
  walletMinor?: number;
  inventory?: { food?: number; materials?: number; knowledge?: number };
};

const qty = (inventory: CitizenHudSource['economy'], item: string) => {
  const value = inventory?.inventory?.find(entry => entry.item === item)?.quantity;
  return finite(value) ? value : 0;
};
const kindleStock = (economy: CitizenHudSource['economy']) => economy ? { food: qty(economy, 'food'), materials: qty(economy, 'materials'), knowledge: qty(economy, 'knowledge') } : undefined;
const minor = (value: number | null | undefined) => finite(value) ? value : undefined;

/** Props for the top-bar resources. Flag on passes only ledgers that exist.
 *  Flag off keeps today's chips, except a nation without a Spark ledger is not labelled SPK from `economy.walletMinor`.
 *  Aurelle and Korund flag-off materials and knowledge stay 0: those chips already showed 0, and the bar (flag on) does not receive them. */
export function citizenHudResources(source: CitizenHudSource, barOn: boolean): CitizenHudResources {
  const id = source.nationId ?? '';
  const wallet = !id || id === 'kindle' ? minor(source.economy?.walletMinor)
    : id === 'aurelle' ? minor(source.aurellePlan?.walletMinor)
    : id === 'korund' ? minor(source.korundPlan?.walletMinor)
    : id === 'confluence' && source.nationWorkPlan?.currency?.code === 'CUR' ? minor(source.nationWorkPlan.walletMinor)
    : undefined;
  if (!id || id === 'kindle') return { currencyCode: 'SPK', walletMinor: wallet, inventory: kindleStock(source.economy) };
  if (barOn) {
    const food = id === 'aurelle' ? source.aurellePlan?.foodQuantity : id === 'korund' ? source.korundPlan?.foodQuantity : undefined;
    return { currencyCode: walletLedger[id] && wallet !== undefined ? walletLedger[id] : null, walletMinor: wallet, inventory: finite(food) ? { food } : undefined };
  }
  if (id === 'aurelle') return { currencyCode: 'CRN', walletMinor: wallet, inventory: source.aurellePlan ? { food: minor(source.aurellePlan.foodQuantity), materials: 0, knowledge: 0 } : undefined };
  if (id === 'korund') return { currencyCode: 'LN', walletMinor: wallet, inventory: source.korundPlan ? { food: minor(source.korundPlan.foodQuantity), materials: 0, knowledge: 0 } : undefined };
  if (id === 'confluence' && wallet !== undefined) return { currencyCode: 'CUR', walletMinor: wallet, inventory: kindleStock(source.economy) };
  return { currencyCode: null, walletMinor: undefined, inventory: kindleStock(source.economy) };
}

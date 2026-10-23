/** #789 (docs §12.12): read-only Kindle national budget. Treasury balance and income-tax inflow come from the real ledger (economy_funds + shift_income_tax, #86).
 *  Integer minor units (100 = 1 SPK). Nothing spends from kindle-treasury yet, so every §12.12 category reads "no spending yet"; no number is made up.
 *  Flag HARIMU_KINDLE_BUDGET_VIEW_ENABLED: "true" in preview, "false" in production. Read-only: SELECTs only. */
import type { GameDatabase } from './database-contract';
import { kindleTreasuryBalanceSql } from './economy';
import { gameDaySeconds } from './faith';
import { incomeTaxRateSource } from './income-tax';
import { kindleSalesTaxSinceSql } from './kindle-sales-tax'; // #844 follow-up

export const kindleBudgetViewEnabled = (env: { HARIMU_KINDLE_BUDGET_VIEW_ENABLED?: string } | null | undefined) => env?.HARIMU_KINDLE_BUDGET_VIEW_ENABLED === 'true';
/** The §12.12 spending categories, in the docs' order. */
export const budgetCategories = ['Defense', 'Infrastructure', 'Welfare', 'Culture, propaganda and faith', 'Administration', 'Reserves'] as const;
export type KindleBudget = {
  treasuryMinor: number; todayTaxMinor: number; /** #844 follow-up: present only with HARIMU_KINDLE_SALES_TAX_ENABLED on. */ salesTaxTodayMinor?: number; gameDayStartsAt: string; ratePercent: number; rateSource: string;
  categories: { name: (typeof budgetCategories)[number]; spentMinor: null }[];
};
const int = (v: unknown) => { const n = Number(v ?? 0); return Number.isSafeInteger(n) ? n : 0; };
/** Start of the current game day (12x clock: 2 real hours), as the ISO text settled_at is stored in.
 *  Why the Unix epoch and not the world clock's epoch: advanceWorld stores world_clock.epoch_seconds as floor(now / tickSeconds) * tickSeconds, a multiple of 7200, so
 *  world-clock game days start on the same 2-hour boundaries as Unix-epoch ones (only the day number differs, which this view never shows). Using the Unix epoch, as
 *  lib/faith.ts gameDayOf does, needs no world_clock read and works before the first tick. If the world epoch ever stops being 7200-aligned, read it here instead. */
export const gameDayStartIso = (nowSeconds: number) => new Date(Math.floor(nowSeconds / gameDaySeconds) * gameDaySeconds * 1000).toISOString();

export async function readKindleBudget(db: GameDatabase, nowSeconds: number, ratePercent: number, options: { salesTax?: boolean } = {}): Promise<KindleBudget> {
  const since = gameDayStartIso(nowSeconds);
  const [balance, today] = await Promise.all([
    db.prepare(kindleTreasuryBalanceSql).first<{ balance: number | string }>(),
    db.prepare('SELECT COALESCE(SUM(tax_minor), 0) AS today FROM shift_income_tax WHERE settled_at >= ?').bind(since).first<{ today: number | string }>(),
  ]);
  const dayStart = Math.floor(nowSeconds / gameDaySeconds) * gameDaySeconds; // charged_at is unix seconds
  const sales = options.salesTax ? await db.prepare(kindleSalesTaxSinceSql).bind(dayStart, dayStart).first<{ total: number | string }>() : null;
  return { treasuryMinor: int(balance?.balance), todayTaxMinor: int(today?.today), ...(sales ? { salesTaxTodayMinor: int(sales.total) } : {}), gameDayStartsAt: since, ratePercent, rateSource: incomeTaxRateSource,
    categories: budgetCategories.map(name => ({ name, spentMinor: null })) };
}

/** #392 UI 64: City fact list drops the repeated Capital row on a capital.
 *  NEXT_PUBLIC_HARIMU_CITY_CAPITAL_ROW_DEDUPE is HARIMU_UI_PACK entry 61
 *  ("true" in preview, "false" in production). A missing flag is off. Only the exact string "true" enables it.
 *  On, and only while header stats are on and cityStatusStat is Capital, that fact is left out.
 *  Off, header stats off, or a city that is not the capital, the fact list stays as it is. */
export const CITY_CAPITAL_ROW_DEDUPE_FLAG = 'NEXT_PUBLIC_HARIMU_CITY_CAPITAL_ROW_DEDUPE';

export function cityCapitalRowDedupeFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_CITY_CAPITAL_ROW_DEDUPE; }
  catch { return undefined; }
}
export function cityCapitalRowDedupeEnabled(value: string | undefined = cityCapitalRowDedupeFlag()): boolean {
  return value === 'true';
}

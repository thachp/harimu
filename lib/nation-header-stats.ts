/** #392 UI 41: Nation side-panel header chips. NEXT_PUBLIC_HARIMU_NATION_HEADER_STATS is HARIMU_UI_PACK entry 39
 *  ("true" in preview, "false" in production). A missing flag is off. Only the exact string "true" enables it.
 *  Stability, Capital and Currency are the nation record's own fields. Currency reuses cityCurrencyParts.
 *  A missing read is left out. An empty list means the row stays off. */
import { cityCurrencyParts } from './city-header-stats.ts';

export const NATION_HEADER_STATS_FLAG = 'NEXT_PUBLIC_HARIMU_NATION_HEADER_STATS';

export function nationHeaderStatsFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_NATION_HEADER_STATS; }
  catch { return undefined; }
}
export function nationHeaderStatsEnabled(value: string | undefined = nationHeaderStatsFlag()): boolean {
  return value === 'true';
}

export type NationHeaderId = 'stability' | 'capital' | 'currency';
export type NationHeaderStat = { id: NationHeaderId; label: string; value: string; detail?: string };

/** Concept order: Stability, Capital, Currency. No stand-in is filled in. */
export function nationHeaderStats(input: { stability?: unknown; capital?: unknown; currency?: unknown }): NationHeaderStat[] {
  const stats: NationHeaderStat[] = [];
  if (typeof input.stability === 'number' && Number.isFinite(input.stability)) stats.push({ id: 'stability', label: 'Stability', value: String(input.stability) });
  const capital = typeof input.capital === 'string' ? input.capital.trim() : '';
  if (capital) stats.push({ id: 'capital', label: 'Capital', value: capital });
  const currency = cityCurrencyParts(input.currency);
  if (currency) stats.push({ id: 'currency', label: 'Currency', ...currency });
  return stats;
}

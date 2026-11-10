/** #392 UI 40: City side-panel header chips. NEXT_PUBLIC_HARIMU_CITY_HEADER_STATS is HARIMU_UI_PACK entry 38
 *  ("true" in preview, "false" in production). A missing flag is off. Only the exact string "true" enables it.
 *  Status is cityStatusStat (Capital, and only on a capital). Population is the nation's own population field, or a finite count.
 *  Currency is that nation's currency name, or the symbol when the string has no name. A missing read is left out. */
import { cityStatusStat } from './ui-v2-panel.ts';

export const CITY_HEADER_STATS_FLAG = 'NEXT_PUBLIC_HARIMU_CITY_HEADER_STATS';

export function cityHeaderStatsFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_CITY_HEADER_STATS; }
  catch { return undefined; }
}
export function cityHeaderStatsEnabled(value: string | undefined = cityHeaderStatsFlag()): boolean {
  return value === 'true';
}

export type CityHeaderLabel = 'Population' | 'Status' | 'Currency';
export type CityHeaderStat = { label: CityHeaderLabel; value: string };

/** A finite count is grouped (72000 → "72,000"). A nation's stored string ("924k", "1.42m") is shown as stored. Blank is missing. */
export function formatCityPopulation(value: unknown): string | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? Math.trunc(value).toLocaleString('en-US') : null;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  return /^\d+$/.test(text) ? Number(text).toLocaleString('en-US') : text;
}

/** "Crown (CRN) · gold-backed" → "Crown". The cut at " · " is the nation panel's. A bare symbol ("CRN") stays. Empty is missing. */
export function cityCurrencyChip(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const head = value.split(' · ')[0].trim();
  if (!head) return null;
  const named = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(head);
  if (!named) return head;
  return named[1].trim() || named[2].trim() || null;
}

/** Concept order: Population, Status, Currency. No stand-in is filled in. An empty list means the row stays off. */
export function cityHeaderStats(input: { city?: { capital?: boolean } | null; population?: unknown; currency?: unknown }): CityHeaderStat[] {
  const stats: CityHeaderStat[] = [];
  const population = formatCityPopulation(input.population);
  if (population) stats.push({ label: 'Population', value: population });
  const status = cityStatusStat(input.city);
  if (status) stats.push({ label: 'Status', value: status.value });
  const currency = cityCurrencyChip(input.currency);
  if (currency) stats.push({ label: 'Currency', value: currency });
  return stats;
}

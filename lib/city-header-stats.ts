/** #392 UI 40: City side-panel header chips. NEXT_PUBLIC_HARIMU_CITY_HEADER_STATS is HARIMU_UI_PACK entry 38
 *  ("true" in preview, "false" in production). A missing flag is off. Only the exact string "true" enables it.
 *  Status is cityStatusStat (Capital, and only on a capital). Population is the nation's own population field, labeled as that nation's.
 *  Currency is the nation's currency name, with the code and backing kept as detail. A missing read is left out. */
import { cityStatusStat } from './ui-v2-panel.ts';

export const CITY_HEADER_STATS_FLAG = 'NEXT_PUBLIC_HARIMU_CITY_HEADER_STATS';

export function cityHeaderStatsFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_CITY_HEADER_STATS; }
  catch { return undefined; }
}
export function cityHeaderStatsEnabled(value: string | undefined = cityHeaderStatsFlag()): boolean {
  return value === 'true';
}

export type CityHeaderId = 'population' | 'status' | 'currency';
export type CityHeaderStat = { id: CityHeaderId; label: string; value: string; detail?: string; spoken?: string };

/** A finite count is grouped (72000 → "72,000"). A nation's stored string ("924k", "1.42m") is shown as stored. Blank is missing. */
export function formatCityPopulation(value: unknown): string | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? Math.trunc(value).toLocaleString('en-US') : null;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  return /^\d+$/.test(text) ? Number(text).toLocaleString('en-US') : text;
}

/** Shared by the City and Nation header chips.
 *  "Crown (CRN) · gold-backed" → name "Crown" and detail "CRN · gold-backed".
 *  "Labor Note (LN) + ration coupons" has no " · ", so the code and the words after it are the detail: "LN + ration coupons".
 *  A bare symbol ("CRN") is the value, with no detail. Empty is missing. */
export function cityCurrencyParts(value: unknown): { value: string; detail?: string } | null {
  if (typeof value !== 'string') return null;
  const [headRaw, ...rest] = value.split(' · ');
  const head = headRaw.trim();
  const tail = rest.join(' · ').trim();
  if (!head) return null;
  const named = /^(.*?)\s*\(([^)]+)\)\s*(.*)$/.exec(head);
  if (!named) return { value: head, ...(tail ? { detail: tail } : {}) };
  const name = named[1].trim(), symbol = named[2].trim(), after = named[3].trim();
  const shown = name || symbol;
  if (!shown) return null;
  const codeLine = [name ? symbol : '', after].filter(Boolean).join(' ');
  const detail = [codeLine, tail].filter(Boolean).join(' · ');
  return { value: shown, ...(detail ? { detail } : {}) };
}
export function cityCurrencyChip(value: unknown): string | null {
  return cityCurrencyParts(value)?.value ?? null;
}

/** Visible label is "{Nation} pop." when the name is short enough to sit in a chip. Otherwise "Nation pop." The spoken name always uses the nation. */
export function nationPopulationLabel(name: unknown): { label: string; spoken: string } {
  const nation = typeof name === 'string' ? name.trim() : '';
  const short = nation.length > 0 && nation.length <= 18 ? nation : '';
  return { label: short ? `${short} pop.` : 'Nation pop.', spoken: `${nation || 'Nation'} population` };
}

/** Concept order: Population, Status, Currency. No stand-in is filled in. An empty list means the row stays off. */
export function cityHeaderStats(input: { city?: { capital?: boolean } | null; nationName?: unknown; population?: unknown; currency?: unknown }): CityHeaderStat[] {
  const stats: CityHeaderStat[] = [];
  const population = formatCityPopulation(input.population);
  if (population) {
    const names = nationPopulationLabel(input.nationName);
    stats.push({ id: 'population', label: names.label, value: population, spoken: names.spoken });
  }
  const status = cityStatusStat(input.city);
  if (status) stats.push({ id: 'status', label: status.label, value: status.value });
  const currency = cityCurrencyParts(input.currency);
  if (currency) stats.push({ id: 'currency', label: 'Currency', ...currency });
  return stats;
}

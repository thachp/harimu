/** #392: World atlas on the world view (?view=world).
 *  NEXT_PUBLIC_HARIMU_WORLD_ATLAS is a HARIMU_UI_PACK key ("true" in preview, "false" in production).
 *  Layout bundles that omit the define have no `process`. A missing flag is off. Only the exact string "true" enables it.
 *  Each row is a value the nation list, the selected nation, or the world clock already carries. A missing read is left out. */
import { ageHudLine, worldAgeAt } from './world-age.ts';

export function worldAtlasFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_WORLD_ATLAS; }
  catch { return undefined; }
}
export function worldAtlasEnabled(value: string | undefined = worldAtlasFlag()): boolean {
  return value === 'true';
}

export type WorldAtlasNation = {
  population?: string | null;
  capital?: string | null;
  government?: string | null;
  economy?: string | null;
  currency?: string | null;
  stability?: number | null;
};
/** Epoch and now are unix seconds from the world clock (`simulation.clock`). Absent until that read arrives. */
export type WorldAtlasClock = { epochSeconds?: number | null; nowSeconds?: number | null } | null;
export type WorldAtlasStat = { label: string; value: string };

const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;

/** Rows for the atlas. Nation count is the length of the nation read. World age uses the clock's own Age line.
 *  Population, capital, government, economy, currency and stability are the selected nation's fields.
 *  There is no named epoch, language, law count, dispute count, or world festival on these reads, so those rows are not built. */
export function worldAtlasStats(input: { nations: readonly unknown[]; nation?: WorldAtlasNation | null; clock?: WorldAtlasClock }): WorldAtlasStat[] {
  const stats: WorldAtlasStat[] = [];
  if (input.nations.length > 0) stats.push({ label: 'Nations', value: String(input.nations.length) });
  const epoch = input.clock?.epochSeconds, now = input.clock?.nowSeconds;
  if (typeof epoch === 'number' && typeof now === 'number') {
    const age = worldAgeAt(epoch * 1000, now * 1000);
    if (age) stats.push({ label: 'World age', value: ageHudLine(age) });
  }
  const nation = input.nation;
  if (nation) {
    const population = text(nation.population), capital = text(nation.capital), government = text(nation.government), economy = text(nation.economy), currency = text(nation.currency);
    if (population) stats.push({ label: 'Population', value: population });
    if (capital) stats.push({ label: 'Capital', value: capital });
    if (government) stats.push({ label: 'Government', value: government });
    if (economy) stats.push({ label: 'Economy', value: economy });
    if (currency) stats.push({ label: 'Currency', value: currency });
    if (typeof nation.stability === 'number' && Number.isFinite(nation.stability)) stats.push({ label: 'Stability', value: `${nation.stability} / 100` });
  }
  return stats;
}

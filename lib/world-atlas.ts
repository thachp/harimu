/** #392 / #1193: World atlas on the world view (?view=world).
 *  NEXT_PUBLIC_HARIMU_WORLD_ATLAS is a HARIMU_UI_PACK key ("true" in preview, "false" in production).
 *  Layout bundles that omit the define have no `process`. A missing flag is off. Only the exact string "true" enables it.
 *  Each row is a value the nation list, the selected nation, the world clock, or the simulation already carries. A missing read is left out. */
import { ageHudLine, worldAgeAt } from './world-age.ts';

export function worldAtlasFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_WORLD_ATLAS; }
  catch { return undefined; }
}
export function worldAtlasEnabled(value: string | undefined = worldAtlasFlag()): boolean {
  return value === 'true';
}

export type WorldAtlasNation = {
  id?: string | null;
  shortName?: string | null;
  population?: string | null;
  capital?: string | null;
  government?: string | null;
  economy?: string | null;
  currency?: string | null;
  stability?: number | null;
};
/** Epoch and now are unix seconds from the world clock (`simulation.clock`). Absent until that read arrives. */
export type WorldAtlasClock = { epochSeconds?: number | null; nowSeconds?: number | null } | null;
/** Wars, embargoes and war proposals already on `simulation`. Each field is attached only while its own flag is on:
 *  `wars` while HARIMU_WAR_ENABLED, `embargoes` while HARIMU_EMBARGO_ENABLED,
 *  `warProposals` while HARIMU_WAR_ENABLED and HARIMU_WAR_ASSEMBLY_ENABLED. A missing field is that source off, or not loaded. */
export type WorldAtlasDisputes = {
  wars?: { wars?: readonly { status?: string; attacker?: string; defender?: string }[] | null } | null;
  embargoes?: { embargoes?: readonly { status?: string; actor?: string; target?: string }[] | null } | null;
  warProposals?: readonly { status?: string; defender?: string }[] | null;
} | null;
export type WorldAtlasStat = { label: string; value: string };

const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;

const parties: Record<string, string> = { kindle: 'Kindle', korund: 'Korund', aurelle: 'Aurelle' };
const same = (value: unknown, id: string) => value === id;
const rows = (value: unknown) => Array.isArray(value) ? value as readonly { status?: string; attacker?: string; defender?: string; actor?: string; target?: string }[] : null;
/** Open wars are still mobilizing or active. An in-force embargo is active. A proposal still `proposed` is pending. */
function openDisputes(disputes: WorldAtlasDisputes | undefined, nation: WorldAtlasNation | null | undefined): string | null {
  if (!disputes) return null;
  const wars = disputes.wars == null ? null : rows(disputes.wars.wars);
  const embargoes = disputes.embargoes == null ? null : rows(disputes.embargoes.embargoes);
  const proposals = disputes.warProposals == null ? null : rows(disputes.warProposals);
  if (wars === null && embargoes === null && proposals === null) return null;
  const openWars = (wars ?? []).filter(war => war.status === 'mobilizing' || war.status === 'active');
  const openEmbargoes = (embargoes ?? []).filter(item => item.status === 'in-force');
  const pending = (proposals ?? []).filter(item => item.status === 'proposed');
  const total = openWars.length + openEmbargoes.length + pending.length;
  if (total === 0) return 'None';
  const piece = (count: number, one: string, many: string) => count === 0 ? null : `${count} ${count === 1 ? one : many}`;
  const parts = [piece(openWars.length, 'war', 'wars'), piece(openEmbargoes.length, 'embargo', 'embargoes'), piece(pending.length, 'proposal', 'proposals')].filter((part): part is string => part !== null);
  let value = `${total} · ${parts.join(' · ')}`;
  const id = text(nation?.id);
  const name = id && parties[id] ? (text(nation?.shortName) ?? parties[id]) : null;
  if (id && name) {
    const involved = openWars.filter(war => same(war.attacker, id) || same(war.defender, id)).length
      + openEmbargoes.filter(item => same(item.actor, id) || same(item.target, id)).length
      + pending.filter(item => same(item.defender, id) || id === 'kindle').length;
    value += ` · ${name} in ${involved}`;
  }
  return value;
}

/** Rows for the atlas. Nation count is the length of the nation read. World age uses the clock's own Age line.
 *  Open disputes counts wars, embargoes and war proposals already on the simulation, and only the sources whose field is present.
 *  Population, capital, government, economy, currency and stability are the selected nation's fields.
 *  There is no named epoch, language, law count, or world festival on these reads, so those rows are not built. */
export function worldAtlasStats(input: { nations: readonly unknown[]; nation?: WorldAtlasNation | null; clock?: WorldAtlasClock; disputes?: WorldAtlasDisputes }): WorldAtlasStat[] {
  const stats: WorldAtlasStat[] = [];
  if (input.nations.length > 0) stats.push({ label: 'Nations', value: String(input.nations.length) });
  const epoch = input.clock?.epochSeconds, now = input.clock?.nowSeconds;
  if (typeof epoch === 'number' && typeof now === 'number') {
    const age = worldAgeAt(epoch * 1000, now * 1000);
    if (age) stats.push({ label: 'World age', value: ageHudLine(age) });
  }
  const disputes = openDisputes(input.disputes, input.nation);
  if (disputes) stats.push({ label: 'Open disputes', value: disputes });
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

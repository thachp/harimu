/** #1166: Nation overview on the nation view (?view=country).
 *  NEXT_PUBLIC_HARIMU_NATION_OVERVIEW is a HARIMU_UI_PACK key ("true" in preview, "false" in production).
 *  Layout bundles that omit the define have no `process`. A missing flag is off. Only the exact string "true" enables it. */
export type NationOverviewNation = {
  id: string;
  name?: string | null;
  motto?: string | null;
  stability?: number | null;
  capital?: string | null;
  currency?: string | null;
  government?: string | null;
  economy?: string | null;
  religion?: string | null;
};
export type NationOverviewGovernment = { nationId?: string | null; roles?: readonly { name?: string | null }[] | null } | null;
export type NationInstitution = { id: string; name: string; view: 'government' };

export function nationOverviewFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_NATION_OVERVIEW; }
  catch { return undefined; }
}
export function nationOverviewEnabled(value: string | undefined = nationOverviewFlag()): boolean {
  return value === 'true';
}
const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;

/** Fields the nation and government reads actually carry. Missing ones are null or an empty list, never filled in. */
export function nationOverviewFields(nation: NationOverviewNation, government: NationOverviewGovernment = null) {
  const capital = text(nation.capital);
  const sameNation = government?.nationId === nation.id;
  const institutions: NationInstitution[] = sameNation ? (government?.roles ?? []).flatMap(role => {
    const name = text(role?.name);
    return name ? [{ id: name, name, view: 'government' as const }] : [];
  }) : [];
  return {
    name: text(nation.name),
    motto: text(nation.motto),
    stability: typeof nation.stability === 'number' && Number.isFinite(nation.stability) ? nation.stability : null,
    capital,
    currency: text(nation.currency),
    government: text(nation.government),
    economy: text(nation.economy),
    faith: text(nation.religion),
    institutions,
    explore: capital ? `Explore ${capital}` : null,
  };
}

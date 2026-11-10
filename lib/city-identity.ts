/** #392 UI 44: City panel identity. NEXT_PUBLIC_HARIMU_CITY_IDENTITY is HARIMU_UI_PACK entry 41
 *  ("true" in preview, "false" in production). A missing flag is off. Only the exact string "true" enables it.
 *  A capital's subtitle is "Capital of {nation}" using the short name the header chips already use, else the full name.
 *  Any other city, or an unknown capital flag, keeps the nation name. The tagline is that city's description. Blank hides it. */
export const CITY_IDENTITY_FLAG = 'NEXT_PUBLIC_HARIMU_CITY_IDENTITY';
export const CITY_LIFE_KICKER = 'City life';

export function cityIdentityFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_CITY_IDENTITY; }
  catch { return undefined; }
}
export function cityIdentityEnabled(value: string | undefined = cityIdentityFlag()): boolean {
  return value === 'true';
}

export function cityIdentitySubtitle(city: { capital?: boolean } | null | undefined, nation: { name: string; shortName?: string | null }): string {
  return city?.capital === true ? `Capital of ${nation.shortName || nation.name}` : nation.name;
}

/** The city's own description, trimmed. Empty, blank, or a non-string is hidden. */
export function cityIdentityTagline(description: unknown): string | null {
  if (typeof description !== 'string') return null;
  const text = description.trim();
  return text ? text : null;
}

/** The kicker sits above the existing household primary. No primary, no kicker. */
export function cityIdentityKicker(hasPrimary: boolean): string | null {
  return hasPrimary ? CITY_LIFE_KICKER : null;
}

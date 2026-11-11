/** #392 UI 66: Household panel identity. NEXT_PUBLIC_HARIMU_HOUSEHOLD_IDENTITY is HARIMU_UI_PACK entry 63
 *  ("true" in preview, "false" in production). A missing flag is off. Only the exact string "true" enables it.
 *  Title follows the #379 map pill: "Your household" for a citizen, "Household" for a visitor. Default is the citizen.
 *  Subtitle joins a trimmed residence and nation name. Motto is the nation's own, trimmed; blank hides it. */
import { locationLabel } from './game-viewport.ts';
export const HOUSEHOLD_IDENTITY_FLAG = 'NEXT_PUBLIC_HARIMU_HOUSEHOLD_IDENTITY';
export function householdIdentityFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_HOUSEHOLD_IDENTITY; }
  catch { return undefined; }
}
export function householdIdentityEnabled(value: string | undefined = householdIdentityFlag()): boolean {
  return value === 'true';
}
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
/** Citizen by default. A visitor uses the #379 household label. */
export function householdIdentityTitle(visitor = false): string {
  return locationLabel('home', 'Your household', visitor);
}
/** Both trimmed. A middle dot joins them only when residence and nation name are both present. */
export function householdIdentitySubtitle(residence: unknown, nationName: unknown): string {
  const place = text(residence), nation = text(nationName);
  return place && nation ? `${place} \u00B7 ${nation}` : place || nation;
}
/** Empty, blank, or a non-string is hidden. */
export function householdIdentityMotto(motto: unknown): string | null {
  const mottoText = text(motto);
  return mottoText ? mottoText : null;
}

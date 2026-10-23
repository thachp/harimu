/** #738 slice 1: army units (docs §15.3 Armies; §11.3 Military job family). Pure and import-free (types aside).
 *  One standing home-guard unit per MVP nation; citizens volunteer, leave and pick a squad stance. Nothing moves or fights yet. */
import type { ArmyNation, Stance } from './army-copy';
export type ArmyUnit = { id: string; nationId: ArmyNation; name: string; officer: string };
/** [ASSUMPTION] Unit and AI officer names are neutral placeholders (≤ 24 characters, army-copy ARMY_NAME_MAX); the docs name no units. */
export const armyUnits: readonly ArmyUnit[] = [
  { id: 'kindle-home-guard', nationId: 'kindle', name: 'Kindle Home Guard', officer: 'Captain Arden' },
  { id: 'korund-home-guard', nationId: 'korund', name: 'Korund Home Brigade', officer: 'Colonel Veshko' },
  { id: 'aurelle-home-guard', nationId: 'aurelle', name: 'Aurelle Home Company', officer: 'Captain Lisandre' },
];
/** ARC ruling on #793 (docs §11.3): only Kindle recruits volunteers. Korund (conscription lottery) and Aurelle (levies) open in slice 3. */
export const volunteerNations: readonly ArmyNation[] = ['kindle'];
export const armyStances: readonly Stance[] = ['hold', 'advance', 'fall_back'];
/** [ASSUMPTION] A new member starts on Hold. */
export const defaultStance: Stance = 'hold';
export const unitForNation = (nationId: string | null | undefined) => armyUnits.find(u => u.nationId === nationId) ?? null;
export const unitById = (id: unknown) => armyUnits.find(u => u.id === id) ?? null;
/** Both flags: armies sit on top of war (HARIMU_WAR_ENABLED). */
export const armiesEnabled = (env: unknown) => { const e = (env ?? {}) as { HARIMU_ARMIES_ENABLED?: string; HARIMU_WAR_ENABLED?: string }; return e.HARIMU_ARMIES_ENABLED === 'true' && e.HARIMU_WAR_ENABLED === 'true'; };
export type ArmyCommand = { action: 'join'; unitId: string; requestId: string } | { action: 'leave'; requestId: string } | { action: 'stance'; stance: Stance; requestId: string };
export function parseArmyCommand(body: Record<string, unknown>): ArmyCommand | null {
  const { action, requestId, unitId, stance } = body;
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(requestId)) return null;
  if (action === 'join' && typeof unitId === 'string' && unitId.length <= 64) return { action, unitId, requestId };
  if (action === 'leave') return { action, requestId };
  if (action === 'stance' && armyStances.includes(stance as Stance)) return { action, stance: stance as Stance, requestId };
  return null;
}

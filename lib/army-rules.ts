/** #738 slice 1: army units (docs §15.3 Armies; §11.3 Military job family). Pure and import-free (types aside).
 *  One standing home-guard unit per MVP nation; citizens volunteer, leave and pick a squad stance. Nothing moves or fights yet. */
import type { ArmyNation, Stance } from './army-copy';
import { flagOn } from './flag-pack.mjs';
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
export const armiesEnabled = (env: unknown) => flagOn(env, 'HARIMU_ARMIES_ENABLED') && flagOn(env, 'HARIMU_WAR_ENABLED');
/** #738 slice 2 flag: drills, strength and morale. Needs both slice-1 flags too. */
export const armyDrillsEnabled = (env: unknown) => armiesEnabled(env) && flagOn(env, 'HARIMU_ARMY_DRILLS_ENABLED');
/** A game day is 2 real hours (12x clock; the same length as gray-market GAME_DAY_SECONDS, pinned by a test). */
export const ARMY_GAME_DAY_SECONDS = 7200;
/** ARC rulings (Oct 23) on #836: participation counts over the last 7 game days. Strength = 10 per member + 3 per drill + 1 per shift
 *  settled after the member joined, in the window. Morale = 50 + 50 × (share of members who drilled in the window), so 50 to 100. The docs give no figures. */
export const armyParticipation = { windowDays: 7, perMember: 10, perDrill: 3, perShift: 1, moraleBase: 50, moraleSpan: 50 } as const;
export function unitStrength(members: number, drills: number, shifts: number) {
  const p = armyParticipation; return Math.max(0, members) * p.perMember + Math.max(0, drills) * p.perDrill + Math.max(0, shifts) * p.perShift;
}
export function unitMorale(members: number, drilledMembers: number) {
  const p = armyParticipation; if (members <= 0) return p.moraleBase;
  return p.moraleBase + Math.floor(p.moraleSpan * Math.min(members, Math.max(0, drilledMembers)) / members);
}
export const parseDrill = (body: Record<string, unknown>) => typeof body.requestId === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(body.requestId) ? { requestId: body.requestId } : null;
export type ArmyCommand = { action: 'join'; unitId: string; requestId: string } | { action: 'leave'; requestId: string } | { action: 'stance'; stance: Stance; requestId: string };
export function parseArmyCommand(body: Record<string, unknown>): ArmyCommand | null {
  const { action, requestId, unitId, stance } = body;
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(requestId)) return null;
  if (action === 'join' && typeof unitId === 'string' && unitId.length <= 64) return { action, unitId, requestId };
  if (action === 'leave') return { action, requestId };
  if (action === 'stance' && armyStances.includes(stance as Stance)) return { action, stance: stance as Stance, requestId };
  return null;
}

/** #1445. NEXT_PUBLIC_HARIMU_NEIGHBORHOOD_WALK is HARIMU_UI_PACK index 71. Only "true" enables it. */
import { cityTierUnlockFields } from './city-tier.ts'; import type { CoResident } from './city-location.ts'; import { notableProfile } from './notable-profiles.ts';
export const NEIGHBORHOOD_WALK_FLAG = 'NEXT_PUBLIC_HARIMU_NEIGHBORHOOD_WALK';
const districtKey = 'harimu:walk-district';
export function neighborhoodWalkFlag(): string | undefined { try { return process.env.NEXT_PUBLIC_HARIMU_NEIGHBORHOOD_WALK; } catch { return undefined; } }
export function neighborhoodWalkEnabled(value: string | undefined = neighborhoodWalkFlag()): boolean { return value === 'true'; }
/** Spec §15.2. Market is the given label for market/plan depot. Extra slots repeat these six. */
export const districtTypes = ['Residential', 'Industrial', 'Market', 'Civic', 'Military', 'Sacred'] as const;
export type DistrictName = (typeof districtTypes)[number];
export function isDistrictType(name: string): name is DistrictName { return (districtTypes as readonly string[]).includes(name); }
export function slotCount(slots: number | null | undefined): number { return typeof slots === 'number' && Number.isFinite(slots) ? Math.max(0, Math.floor(slots)) : cityTierUnlockFields(1).districtSlots; }
export function districtNames(slots: number | null | undefined): DistrictName[] { const n = slotCount(slots); return Array.from({ length: n }, (_, i) => districtTypes[i % districtTypes.length]); }
export function districtsForTier(tier: number): DistrictName[] { return districtNames(cityTierUnlockFields(tier).districtSlots); }
export function rememberDistrict(name: string) { try { sessionStorage.setItem(districtKey, name); } catch { /* the URL param is set once Neighborhood is open */ } }
export function districtFromSearch(search: string, slots: number | null | undefined): DistrictName { const names = districtNames(slots); let stored = ''; try { stored = sessionStorage.getItem(districtKey) ?? ''; } catch { stored = ''; } return names.find(name => name === (new URLSearchParams(search).get('district') || stored)) ?? names[0] ?? 'Residential'; }
export type Spot = { x: number; z: number };
const ring = (count: number, radius: number, turn = 0): Spot[] => Array.from({ length: count }, (_, i) => { const a = (Math.PI * 2 * i) / Math.max(count, 1) + turn; return { x: Math.cos(a) * radius, z: Math.sin(a) * radius }; });
export function houseSlots(count: number): Spot[] { return ring(Math.max(4, count), 8); }
export function residentSpots(count: number): Spot[] { return ring(count, 3.2, -Math.PI / 2); }
export function nearestResident(x: number, z: number, spots: readonly Spot[], range = 1.7): number { let best = -1, bestD = range * range; spots.forEach((spot, index) => { const d = (spot.x - x) ** 2 + (spot.z - z) ** 2; if (d <= bestD) { bestD = d; best = index; } }); return best; }
export function stepWalk(x: number, z: number, yaw: number, forward: number, strafe: number, houses: readonly Spot[]): Spot {
  let nx = Math.max(-14, Math.min(14, x + (Math.sin(yaw) * forward + Math.cos(yaw) * strafe) * 0.16)), nz = Math.max(-14, Math.min(14, z + (Math.cos(yaw) * forward - Math.sin(yaw) * strafe) * 0.16));
  for (const house of houses) { const dx = nx - house.x, dz = nz - house.z, min = 1.35, len = Math.hypot(dx, dz); if (len < min) { nx = house.x + (len ? dx / len : 1) * min; nz = house.z + (len ? dz / len : 0) * min; } } return { x: nx, z: nz };
}
export type ResidentCard = { name: string; status: CoResident['status']; kind: 'AI citizen' | 'Citizen'; you: boolean; role?: string };
export function residentCard(resident: CoResident, nationId: string): ResidentCard { const notable = resident.kind === 'ai' ? notableProfile(nationId) : null; return { name: notable?.name ?? resident.name, status: resident.status, kind: resident.kind === 'ai' ? 'AI citizen' : 'Citizen', you: resident.you, ...(notable ? { role: notable.role } : {}) }; }

/** #1445 slice 4. NEXT_PUBLIC_HARIMU_PLACE_NAV is HARIMU_UI_PACK index 75. Only "true" enables it. */
import { cityForNation, residentCitiesForNation } from './cities.ts';
import { desktopGateEnabled } from './desktop-gate.ts';
import { isDistrictSlot, neighborhoodWalkEnabled } from './neighborhood-walk.ts';
export const PLACE_NAV_FLAG = 'NEXT_PUBLIC_HARIMU_PLACE_NAV';
export function placeNavFlag(): string | undefined { try { return process.env.NEXT_PUBLIC_HARIMU_PLACE_NAV; } catch { return undefined; } }
export function placeNavEnabled(value: string | undefined = placeNavFlag()): boolean { return value === 'true'; }
/** Rail and Neighborhood crumb: the walk (UI_PACK 71) and the desktop gate must be on too. Household stays inside City. */
export function placeNavShown(value?: string): boolean { return placeNavEnabled(value) && neighborhoodWalkEnabled() && desktopGateEnabled(); }
export const placeRailLevels = [{ id: 'world', name: 'World' }, { id: 'country', name: 'Nation' }, { id: 'square', name: 'City' }, { id: 'neighborhood', name: 'Neighborhood' }] as const;
export function placeRailCurrent(level: string, view: string): 'page' | 'location' | undefined { const here = view === 'neighborhood' ? 'neighborhood' : view === 'world' ? 'world' : view === 'country' || view === 'nation' || view === 'military' || view === 'economy' || view === 'faith' ? 'country' : 'square'; return here !== level ? undefined : view === level ? 'page' : 'location'; }
const zoomOrder = ['world', 'country', 'square', 'neighborhood'] as const;
const zoomRank = (view: string) => view === 'world' ? 0 : view === 'country' || view === 'nation' || view === 'military' || view === 'economy' || view === 'faith' ? 1 : view === 'square' ? 2 : view === 'neighborhood' ? 3 : -1;
/** Back walks World, Nation, City, Neighborhood. A drive entry (City to Neighborhood) pushes only Neighborhood. */
export function placeNavTrail(from: string, to: string): readonly string[] { const a = zoomRank(from), b = zoomRank(to); return a < 0 || b <= a ? [to] : zoomOrder.slice(a + 1, b + 1); }
const cityCam = { pull: 7.2, y: 3.5 }, walkCam = { pull: 6, y: 3.2 };
/** Reduced motion returns the destination at once (a cut). */
export function placeNavCamera(from: 'square' | 'neighborhood', to: 'square' | 'neighborhood', t: number, reduced: boolean): { pull: number; y: number; cut: boolean } {
  const a = from === 'neighborhood' ? walkCam : cityCam, b = to === 'neighborhood' ? walkCam : cityCam; if (reduced) return { pull: b.pull, y: b.y, cut: true };
  const e = Math.max(0, Math.min(1, t)), u = e * e * (3 - 2 * e); return { pull: a.pull + (b.pull - a.pull) * u, y: a.y + (b.y - a.y) * u, cut: false };
}
let lastPlace: 'square' | 'neighborhood' | null = null, arrival: { next: 'square' | 'neighborhood'; from: 'square' | 'neighborhood' | null } | null = null;
export function approachFrom(next: 'square' | 'neighborhood'): 'square' | 'neighborhood' | null { if (arrival?.next === next) return arrival.from; const from = lastPlace && lastPlace !== next ? lastPlace : null; lastPlace = next; arrival = { next, from }; return from; }
let noted: { city: string | null; slots: number } | null = null;
export function noteDistrictSlots(cityId: string | null | undefined, slots: number | null | undefined) { noted = typeof slots === 'number' && Number.isFinite(slots) ? { city: cityId ?? null, slots: Math.floor(slots) } : null; }
export function keepDistrict(params: URLSearchParams, district: string): boolean {
  if (!neighborhoodWalkEnabled() || params.get('view') !== 'neighborhood' || !isDistrictSlot(district)) return false; if (!placeNavEnabled() || !noted) return true;
  const city = params.get('city'); return noted.city && city && noted.city !== city ? true : Number(district) < noted.slots;
}
const doorY = 0.46, wallHalf = { x: 0.85, z: 0.75 }, doorOut = { x: 0.88, z: 0.78 };
/** The walk door sits on the axis-aligned wall nearest the square (the origin). A tie keeps the z face, which is the old +z door. */
export function houseDoorPose(house: { x: number; z: number }): { x: number; y: number; z: number; rotationY: number } {
  const y = doorY, sx = house.x > 0 ? -1 : 1, sz = house.z > 0 ? -1 : 1;
  const xFace = (house.x + sx * wallHalf.x) ** 2 + house.z ** 2, zFace = house.x ** 2 + (house.z + sz * wallHalf.z) ** 2;
  return xFace < zFace ? { x: house.x + sx * doorOut.x, y, z: house.z, rotationY: Math.PI / 2 } : { x: house.x, y, z: house.z + sz * doorOut.z, rotationY: 0 };
}
/** Crumb targets while place nav is shown. `district` is the URL slot `keepDistrict` still accepts. `cityId` is the URL city in this nation, else the resident city with this name. A held nation passes neither. */
export function placeCrumbTargets(search: string, nationId: string, cityName?: string, held = false): { cityId?: string; district?: string } {
  if (held) return {};
  let params: URLSearchParams; try { params = new URLSearchParams(search); } catch { return {}; }
  const rawCity = params.get('city') ?? '', cityId = cityForNation(nationId, rawCity)?.id ?? (cityName ? residentCitiesForNation(nationId).find(city => city.name === cityName)?.id : undefined);
  const district = params.get('district') ?? '';
  return { ...(cityId ? { cityId } : {}), ...(district && keepDistrict(params, district) ? { district } : {}) };
}
/** Flag off leaves a neighborhood district untouched. Flag on sets one, and drops a carried one across a nation or city (#55). */
export function applyDistrict(url: URL, scene: string, nationId: string | undefined, prevNation: string | null, prevCity: string | null, cityId: string | undefined, district: string | null): void {
  if (scene !== 'neighborhood') { url.searchParams.delete('district'); return; } if (!placeNavEnabled()) return; if (district) url.searchParams.set('district', district);
  else if ((prevNation && nationId && nationId !== prevNation) || (cityId && prevCity && cityId !== prevCity)) url.searchParams.delete('district');
}

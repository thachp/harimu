/** #1445 slice 5. NEXT_PUBLIC_HARIMU_NATION_CITIES_3D is HARIMU_UI_PACK index 76. Only "true" enables it. */
import { clampCamera, clampZoom } from './game-viewport.ts';
export const NATION_CITIES_3D_FLAG = 'NEXT_PUBLIC_HARIMU_NATION_CITIES_3D';
export function nationCities3dFlag(): string | undefined { try { return process.env.NEXT_PUBLIC_HARIMU_NATION_CITIES_3D; } catch { return undefined; } }
export function nationCities3dEnabled(value: string | undefined = nationCities3dFlag()): boolean { return value === 'true'; }
export type CityPoint = { id: string; name: string; x: number; z: number; capital: boolean };
export function pillInView(x: number, y: number, z: number) { return !(z > 1 || x < -1 || x > 1 || y < -1 || y > 1); }
export function nationCityLayout(cities: readonly { id: string; name: string; capital?: boolean }[]): CityPoint[] {
  const n = Math.max(cities.length, 1), ring = cities.length < 2 ? 0 : 8;
  return cities.map((city, i) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return { id: city.id, name: city.name, capital: Boolean(city.capital), x: Math.round(Math.sin(a) * ring * 100) / 100, z: Math.round(Math.cos(a) * ring * 100) / 100 };
  });
}
export type Road = { x1: number; z1: number; x2: number; z2: number };
export function nationRoads(spots: readonly { x: number; z: number }[]): Road[] {
  return spots.slice(1).map(spot => ({ x1: spots[0].x, z1: spots[0].z, x2: spot.x, z2: spot.z }));
}
export function nationBounds(spots: readonly { x: number; z: number }[], pad = 6): number {
  return Math.max(10, spots.reduce((n, spot) => Math.max(n, Math.abs(spot.x), Math.abs(spot.z)), 0) + pad);
}
export function nationCamera(x: number, z: number, zoom: number, bounds: number) {
  return { x: clampCamera(x, bounds), z: clampCamera(z, bounds), zoom: clampZoom(zoom) };
}
export type Pill = { id: string; x: number; y: number; w: number; h: number };
export function pillHit(pills: readonly Pill[], px: number, py: number): string | null {
  for (let i = pills.length - 1; i >= 0; i--) { const pill = pills[i]; if (px >= pill.x && px <= pill.x + pill.w && py >= pill.y && py <= pill.y + pill.h) return pill.id; }
  return null;
}
export function nearestCity(spots: readonly { id: string; x: number; z: number }[], x: number, z: number, radius = 3.2): string | null {
  let best: string | null = null, bestD = radius * radius;
  for (const spot of spots) { const d = (spot.x - x) ** 2 + (spot.z - z) ** 2; if (d <= bestD) { bestD = d; best = spot.id; } }
  return best;
}
const cityWatch = new Set<() => void>(), cityPick = new Set<(id: string) => void>();
let pickedCity: string | null = null;
export function pickedNationCity() { return pickedCity; }
export function subscribeNationCity(fn: () => void) { cityWatch.add(fn); return () => { cityWatch.delete(fn); }; }
export function onNationCity(fn: (id: string) => void) { cityPick.add(fn); return () => { cityPick.delete(fn); }; }
export function pickNationCity(id: string) { pickedCity = id; for (const fn of cityPick) fn(id); for (const fn of cityWatch) fn(); }

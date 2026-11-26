/** #1445 slice 3. NEXT_PUBLIC_HARIMU_CITY_DRIVE is HARIMU_UI_PACK index 73. Only "true" enables it. */
import { districtLabels, rememberDistrict } from './neighborhood-walk.ts';
export const CITY_DRIVE_FLAG = 'NEXT_PUBLIC_HARIMU_CITY_DRIVE';
export function cityDriveFlag(): string | undefined { try { return process.env.NEXT_PUBLIC_HARIMU_CITY_DRIVE; } catch { return undefined; } }
export function cityDriveEnabled(value: string | undefined = cityDriveFlag()): boolean { return value === 'true'; }
export type Spot = { x: number; z: number };
export type Block = Spot & { w: number; d: number; h: number };
export type Gate = Spot & { label: string };
const ang = (i: number, n: number) => (Math.PI * 2 * i) / Math.max(n, 1) - Math.PI / 2;
export function gateLayout(slots: number | null | undefined): Gate[] {
  const labels = districtLabels(slots);
  return labels.map((label, i) => { const a = ang(i, labels.length); return { label, x: Math.sin(a) * 15, z: Math.cos(a) * 15 }; });
}
export function cityBlocks(low = false, riverX = 8): Block[] {
  const rays = [6, 8].flatMap(n => Array.from({ length: n }, (_, i) => ang(i, n))).filter(ray => Math.min(Math.abs(Math.sin(ray)), Math.abs(Math.cos(ray))) > 0.2), blocks: Block[] = [];
  for (let ix = -8; ix <= 8; ix++) for (let iz = -8; iz <= 8; iz++) {
    const x = ix * 1.55, z = iz * 1.55, dist = Math.hypot(x, z), a = Math.atan2(x, z);
    if (!x || !z || Math.abs(x - riverX) < 1.5 || dist < 3.3 || dist > 12.5 || rays.some(ray => { let d = Math.abs(a - ray); if (d > Math.PI) d = Math.PI * 2 - d; return dist * Math.sin(d) < 1.05; })) continue;
    blocks.push({ x, z, w: 1.2, d: 1.2, h: 0.65 + (1 - dist / 13) * 1.85 });
  }
  if (blocks.length % 2) blocks.pop(); return low ? blocks.filter((_, i) => i % 2 === 0) : blocks;
}
export function driveStep(x: number, z: number, yaw: number, throttle: number, steer: number, blocks: readonly Block[]): { x: number; z: number; yaw: number } {
  const nextYaw = yaw - Math.max(-1, Math.min(1, steer)) * 0.05;
  let nx = x + Math.sin(nextYaw) * throttle * 0.26, nz = z + Math.cos(nextYaw) * throttle * 0.26;
  for (const block of blocks) {
    const dx = nx - block.x, dz = nz - block.z, min = block.w / 2 + 0.35, len = Math.hypot(dx, dz);
    if (len < min) { nx = block.x + (len ? dx / len : 1) * min; nz = block.z + (len ? dz / len : 0) * min; }
  }
  return { x: Math.max(-17.5, Math.min(17.5, nx)), z: Math.max(-17.5, Math.min(17.5, nz)), yaw: nextYaw };
}
export function gateHit(x: number, z: number, gates: readonly Spot[], radius = 1.75): number {
  let best = -1, bestD = radius * radius;
  gates.forEach((gate, index) => { const d = (gate.x - x) ** 2 + (gate.z - z) ** 2; if (d <= bestD) { bestD = d; best = index; } });
  return best;
}
export function minimapPoint(x: number, z: number, size: number, span = 18): { x: number; y: number } {
  const half = size / 2; return { x: half + (x / span) * (half - 6), y: half - (z / span) * (half - 6) };
}
/** Drive-here with no scene, and a reduced-motion cut, use the walk row's talk guard. */
export function driveEntry(talk: boolean, onWalk: (() => void) | undefined, enter: () => void) { if (talk) onWalk?.(); enter(); }
export function driveToward(x: number, z: number, yaw: number, gate: Spot): { steer: number; throttle: number } {
  let diff = Math.atan2(gate.x - x, gate.z - z) - yaw; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
  return { steer: Math.max(-1, Math.min(1, -diff * 4)), throttle: Math.abs(diff) < 0.35 ? 1 : 0 };
}
type Ask = { index: number };
const waits = new Set<(ask: Ask) => void>();
export function driveHere(index: number): boolean { if (!waits.size) return false; for (const fn of waits) fn({ index }); return true; }
export function onDriveHere(fn: (ask: Ask) => void): () => void { waits.add(fn); return () => { waits.delete(fn); }; }
export function enterDistrict(index: number, onView: (view: 'neighborhood') => void) { rememberDistrict(index); onView('neighborhood'); }
/** The square place opens the existing square scene. The drive listens and steps aside. */
export const citySquareEvent = 'harimu-square-open';
export function openCitySquare(): void { try { if (typeof window !== 'undefined') window.dispatchEvent(new Event(citySquareEvent)); } catch { /* no window */ } }

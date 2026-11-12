/** #467 slice 1: off-chain land lots, tile titles and leases (migration 0123). Tables only: no grant, backfill, purchase or capture path reads or
 *  writes them yet, so square purchase and capture() are unchanged with the flag off or on. Only the exact string "true" turns the flag on. */
import { flagOn } from './flag-pack.mjs';

export const LAND_TILES_FLAG = 'HARIMU_LAND_TILES_ENABLED';
export const landTilesEnabled = (env: unknown): boolean => flagOn(env, 'HARIMU_LAND_TILES_ENABLED');
export const LAND_LOT_SIZES = [10, 20, 30] as const; // [ASSUMPTION] illustrative grid sizes from the design (D89/D91); still open
/** Design invariant 2: a titled tile lies inside its lot's boundary, origin <= t < origin + size. Not a SQL CHECK; the later write path enforces it. */
export const tileInLot = (lot: { origin_tx: number; origin_ty: number; size: number }, tx: number, ty: number): boolean =>
  tx >= lot.origin_tx && tx < lot.origin_tx + lot.size && ty >= lot.origin_ty && ty < lot.origin_ty + lot.size;

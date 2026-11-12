/** #467 slice 1: off-chain land lots, tile titles and leases (migration 0123). Tables only: no grant, backfill, purchase or capture path reads or
 *  writes them yet, so square purchase and capture() are unchanged with the flag off or on. Only the exact string "true" turns the flag on. */
export const LAND_TILES_FLAG = 'HARIMU_LAND_TILES_ENABLED';
/** Top-level wrangler var (Architect on #1334), not in any flag pack, so a pack is never read for it. */
export const landTilesEnabled = (env: unknown): boolean => !!env && typeof env === 'object' && (env as Record<string, unknown>).HARIMU_LAND_TILES_ENABLED === 'true';
export const LAND_LOT_SIZES = [10, 20, 30] as const; // [ASSUMPTION] illustrative grid sizes from the design (D89/D91); still open
/** Design invariant 2: a titled tile lies inside its lot's boundary, origin <= t < origin + size. Not a SQL CHECK; the later write path enforces it. */
export const tileInLot = (lot: { origin_tx: number; origin_ty: number; size: number }, tx: number, ty: number): boolean =>
  tx >= lot.origin_tx && tx < lot.origin_tx + lot.size && ty >= lot.origin_ty && ty < lot.origin_ty + lot.size;

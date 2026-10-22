/** #82 slice 2: the Ownership overlay. Pure helper for the read-only GET /api/world/ownership. */

export type OwnershipMap = { width: number; height: number; cells: [number, number, string][]; totals: { nationId: string; squares: number }[] };

/** Only owned squares, as [x, y, nation]; totals sorted by squares, then nation id. */
export function ownershipMap(width: number, height: number, squares: readonly { x: number; y: number; owner: string | null }[]): OwnershipMap {
  const cells: [number, number, string][] = [], counts = new Map<string, number>();
  for (const { x, y, owner } of squares) if (owner) { cells.push([x, y, owner]); counts.set(owner, (counts.get(owner) ?? 0) + 1); }
  const totals = [...counts].map(([nationId, n]) => ({ nationId, squares: n })).sort((a, b) => b.squares - a.squares || a.nationId.localeCompare(b.nationId));
  return { width, height, cells, totals };
}

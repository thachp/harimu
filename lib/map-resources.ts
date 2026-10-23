/** #82 slice 3: the Resources overlay. Pure helpers for the read-only GET /api/world/resources. Import-free (plain-Node tests load it). */

export type ResourceMap = { width: number; height: number; cells: [number, number, string][]; totals: { resource: string; squares: number }[] };

/** One icon per resource node of map-design §6.2 (six ordinary, ten rare), text glyphs so the shape (not color) tells them apart; rare nodes get a ring.
 *  [ASSUMPTION] §6.2 names the nodes but no icons: these glyphs are placeholders until art lands. U+FE0E keeps symbols that have emoji forms as plain text. */
export const RESOURCE_ICONS: Readonly<Record<string, { symbol: string; rare: boolean }>> = {
  food: { symbol: '✿', rare: false }, timber: { symbol: '♣\uFE0E', rare: false }, stone: { symbol: '▲', rare: false },
  ore: { symbol: '◆', rare: false }, fuel: { symbol: '♨\uFE0E', rare: false }, 'cloth fiber': { symbol: '≋', rare: false },
  Emberstone: { symbol: '✹', rare: true }, Riverpearl: { symbol: '◉', rare: true }, Ironroot: { symbol: '⚘\uFE0E', rare: true },
  Skysilk: { symbol: '☁\uFE0E', rare: true }, 'Geotherm core': { symbol: '◎', rare: true }, Sunglass: { symbol: '☀\uFE0E', rare: true },
  Frostcore: { symbol: '❄\uFE0E', rare: true }, Hazequartz: { symbol: '⬡', rare: true }, Heartwood: { symbol: '♠\uFE0E', rare: true }, Stormcells: { symbol: '⚡\uFE0E', rare: true },
};
export const resourceIcon = (resource: string) => RESOURCE_ICONS[resource] ?? { symbol: '•', rare: false };
export const resourceName = (resource: string) => resource.charAt(0).toUpperCase() + resource.slice(1);

/** Only squares with a resource node, as [x, y, resource]; totals sorted by squares, then name. */
export function resourceMap(width: number, height: number, squares: readonly { x: number; y: number; resource: string | null }[]): ResourceMap {
  const cells: [number, number, string][] = [], counts = new Map<string, number>();
  for (const { x, y, resource } of squares) if (resource) { cells.push([x, y, resource]); counts.set(resource, (counts.get(resource) ?? 0) + 1); }
  const totals = [...counts].map(([resource, n]) => ({ resource, squares: n })).sort((a, b) => b.squares - a.squares || a.resource.localeCompare(b.resource));
  return { width, height, cells, totals };
}

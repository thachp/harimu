/** #82 slice 4: the Unrest overlay. Pure helpers for the read-only GET /api/world/unrest. Import-free (plain-Node tests load it).
 *  Unrest is scored per nation (lib/stability.ts, 0-100 each tick), not per square, so each owned square shows its nation's latest band. */

export type UnrestBand = 'Calm' | 'Tense' | 'Riot';
export type UnrestMap = { width: number; height: number; nations: { nationId: string; unrest: number; band: UnrestBand }[]; cells: [number, number, UnrestBand][] };

/** [ASSUMPTION] Band cut-offs: the docs name no Calm/Tense/Riot thresholds. Riot starts at 60, the Unrest level of Aurelle's Rising (docs coups-transitions: Unrest ≥ 60),
 *  Tense at 30, three times the Unrest baseline of 10 (lib/stability.ts). */
export const UNREST_BANDS: readonly { band: UnrestBand; from: number; symbol: string; color: string }[] = [
  { band: 'Calm', from: 0, symbol: '○', color: '#1d4a3f' }, { band: 'Tense', from: 30, symbol: '◐', color: '#6b5a25' }, { band: 'Riot', from: 60, symbol: '●', color: '#6e2a24' },
];
export function unrestBand(unrest: number): UnrestBand { return [...UNREST_BANDS].reverse().find(b => unrest >= b.from)!.band; }
export const bandMark = (band: UnrestBand) => UNREST_BANDS.find(b => b.band === band)!;

/** Owned squares of nations that have a score, as [x, y, band]; nations without a score yet are left out (no band is invented). */
export function unrestMap(width: number, height: number, squares: readonly { x: number; y: number; owner: string | null }[], scores: Readonly<Record<string, number>>): UnrestMap {
  const nations = Object.entries(scores).map(([nationId, unrest]) => ({ nationId, unrest, band: unrestBand(unrest) })).sort((a, b) => b.unrest - a.unrest || a.nationId.localeCompare(b.nationId));
  const band = new Map(nations.map(n => [n.nationId, n.band]));
  return { width, height, nations, cells: squares.flatMap(({ x, y, owner }) => (owner && band.has(owner) ? [[x, y, band.get(owner)!] as [number, number, UnrestBand]] : [])) };
}

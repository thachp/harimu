/** #392 S1: crest tokens and placeholder vector motifs for all ten nations.
 *  Source: harimu-docs `production/art-direction.mdx` (Iconography: each nation emblem is an original geometric mark drawn from its government, currency or faith; the palette table).
 *  The motifs below are those documented marks, drawn as simple strokes; final illustrations are the held A-series art (A5). No lore is added here.
 *  Names, symbol and pattern token come from `nationMarks` (#79, lib/nation-themes.ts); this file only adds the crest colours and drawing, and takes the display name as a
 *  parameter so it stays free of sibling imports (node --experimental-strip-types tests load lib files directly). */

export const crestViewBox = '0 0 48 56';
/** Shield outline and an inset line, in the 48x56 viewBox. */
export const crestShield = 'M24 2 L44 9 V28 C44 41 35 50 24 54 C13 50 4 41 4 28 V9 Z';
export const crestInset = 'M24 6.5 L40 12 V28 C40 38.5 33 46 24 49.5 C15 46 8 38.5 8 28 V12 Z';
/** Gold edge shared by every crest. */
export const crestEdge = '#d0ad54';

const round = (n: number) => Math.round(n * 100) / 100;
/** Seven leaves around a ring (Veldwood), as one path of small diamonds. */
function leafRing() {
  const parts: string[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (Math.PI * 2 * i) / 7 - Math.PI / 2, cx = 24 + 10.5 * Math.cos(a), cy = 28 + 10.5 * Math.sin(a), ux = Math.cos(a), uy = Math.sin(a), px = -uy, py = ux;
    const p = (r: number, s: number) => `${round(cx + ux * r + px * s)} ${round(cy + uy * r + py * s)}`;
    parts.push(`M${p(4.6, 0)} L${p(0, 2.6)} L${p(-4.6, 0)} L${p(0, -2.6)} Z`);
  }
  return parts.join(' ');
}
/** Eight gear teeth around a circle of radius 7 at (24,28) (Meridian). */
function gearTeeth() {
  const parts: string[] = [];
  for (let i = 0; i < 8; i++) { const a = (Math.PI / 4) * i, c = Math.cos(a), s = Math.sin(a); parts.push(`M${round(24 + 7 * c)} ${round(28 + 7 * s)} L${round(24 + 10.4 * c)} ${round(28 + 10.4 * s)}`); }
  return parts.join(' ');
}

/** `field`: shield fill; `mark`: motif strokes; `accent`: inset line. `palette` lists the documented palette names with the hex used. `motif` is the documented emblem, `d` its drawing. */
export const nationCrests = {
  kindle: { field: '#7a3a1a', mark: '#f6ead3', accent: '#d9692b', palette: ['Ember orange', 'Basalt black', 'Brass'], motif: 'An open ballot-star in a hexagon', d: 'M24 15 L35.3 21.5 V34.5 L24 41 L12.7 34.5 V21.5 Z M24 21 L28.1 33.7 L17.3 25.8 L30.7 25.8 L19.9 33.7' },
  confluence: { field: '#1f4d8a', mark: '#f6ead3', accent: '#3c9d7e', palette: ['Deep blue', 'Jade', 'Lantern gold'], motif: 'Three joined rivers', d: 'M14 13 C14 26 24 26 24 37 V45 M34 13 C34 26 24 26 24 37 M24 13 V37' },
  meridian: { field: '#8c3d22', mark: '#f6ead3', accent: '#d8d4cc', palette: ['Red-copper', 'White', 'Slate'], motif: 'A gear on a meridian line', d: `M24 11 V46 M17 28 a7 7 0 1 0 14 0 a7 7 0 1 0 -14 0 ${gearTeeth()}` },
  korund: { field: '#4a3f2c', mark: '#f6ead3', accent: '#c08a2e', palette: ['Ochre', 'Slate grey', 'Rust red'], motif: 'A stone keystone', d: 'M15 15 H33 L29.5 38 H18.5 Z M11 41 H37' },
  aurelle: { field: '#2f6a9a', mark: '#ffffff', accent: '#d0ad54', palette: ['Sky blue', 'White', 'Gilt'], motif: 'A winged crown', d: 'M18 33 V23 L21 27 L24 20 L27 27 L30 23 V33 Z M17 31 C11 31 8 26 7 19 C11 22 14 22 17 24 M31 31 C37 31 40 26 41 19 C37 22 34 22 31 24' },
  ilmar: { field: '#7d6a2b', mark: '#fff8e0', accent: '#8d7be0', palette: ['Sand gold', 'White', 'Prism colors'], motif: 'A prism-eye', d: 'M8 28 Q24 12 40 28 Q24 44 8 28 Z M24 21 L30 33 H18 Z' },
  hoarvale: { field: '#3f7898', mark: '#ffffff', accent: '#b8c2c9', palette: ['Ice blue', 'White', 'Silver'], motif: 'A crown over a parliament arc', d: 'M16 21 L18 14 L21 18 L24 12 L27 18 L30 14 L32 21 Z M11 41 H37 M12 41 A12 12 0 0 1 36 41 M24 41 V29 M24 41 L15.5 32.5 M24 41 L32.5 32.5' },
  varkand: { field: '#3a4248', mark: '#f1f1ec', accent: '#d1352b', palette: ['Gunmetal', 'Slate green', 'Signal red'], motif: 'Five bars in a watchtower', d: 'M16.5 15 H31.5 L29.5 43 H18.5 Z M20.5 21 V38 M22.25 21 V38 M24 21 V38 M25.75 21 V38 M27.5 21 V38' },
  veldwood: { field: '#25552f', mark: '#f6ead3', accent: '#e0a43a', palette: ['Forest green', 'Amber', 'Bark brown'], motif: 'A ring of seven leaves', d: leafRing() },
  fulmara: { field: '#4a3279', mark: '#f1ecff', accent: '#3aa0ff', palette: ['Storm violet', 'Electric blue', 'Copper', 'Verdigris'], motif: "Scales over a ship's prow", d: 'M12 15 H36 M24 11 V27 M12 15 L8 24 Q12 30 16 24 Z M36 15 L32 24 Q36 30 40 24 Z M12 34 H36 L30 44 H18 Z M36 34 L40 30' },
} as const;
export type NationCrest = (typeof nationCrests)[keyof typeof nationCrests];
export function nationCrest(nationId: string): NationCrest | null { return Object.hasOwn(nationCrests, nationId) ? nationCrests[nationId as keyof typeof nationCrests] : null; }
/** "Kindle Republic crest: an open ballot-star in a hexagon": the text alternative. `name` is `nationMark(id).name`. */
export function nationCrestLabel(nationId: string, name: string) {
  const crest = nationCrest(nationId);
  return crest ? `${name} crest: ${crest.motif[0].toLowerCase()}${crest.motif.slice(1)}` : null;
}
/** Build-time flag NEXT_PUBLIC_HARIMU_UI_V2_CREST (UI v2, stage S1): crests ship off until QA turns them on. Only the exact string "true" enables them. */
export function uiV2CrestEnabled(value: string | undefined = process.env.NEXT_PUBLIC_HARIMU_UI_V2_CREST) { return value === 'true'; }

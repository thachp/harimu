/** #392: nation crest accent on the side-panel header, the selected globe label and the zoom-path step.
 *  NEXT_PUBLIC_HARIMU_NATION_ACCENT is a HARIMU_UI_PACK key ("true" in preview, "false" in production).
 *  Layout bundles that omit the define have no `process`. A missing flag is off. Only the exact string "true" enables it.
 *
 *  The colour is `nationCrests[id].accent` (lib/nation-crests.ts, the art-direction palette table). No hex is added here.
 *  An id with no crest keeps the dark teal chrome and the existing gold. Text uses the accent only when it clears AA
 *  on the zoom-path chip; otherwise the step stays gold and the accent is a rule. */
import { nationCrest } from './nation-crests.ts';

export const NATION_ACCENT_FLAG = 'NEXT_PUBLIC_HARIMU_NATION_ACCENT';
/** Zoom-path chip, app/zoom-path.css --s2-chip. The current step's words sit on it. */
export const ACCENT_CHIP = '#0d2530';
/** Inspector header ground, app/game-shell.css .game-inspector-title. */
export const ACCENT_HEADER = '#102934';
/** Existing zoom-path current step, app/zoom-path.css --s2-gold. */
export const ACCENT_GOLD_TEXT = '#f1d58a';
/** WCAG AA for normal text. */
export const ACCENT_TEXT_AA = 4.5;

export function nationAccentFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_NATION_ACCENT; }
  catch { return undefined; }
}
export function nationAccentEnabled(value: string | undefined = nationAccentFlag()): boolean {
  return value === 'true';
}

/** Nation, city and world. City is the square view. Household, work, market and civic stay on the shared chrome. */
export function nationAccentApplies(view: string): boolean {
  return view === 'world' || view === 'country' || view === 'nation' || view === 'square';
}

const channel = (hex: string) => hex.slice(1).match(/../g)!.map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
export function accentContrast(a: string, b: string): number {
  const lum = (hex: string) => { const c = channel(hex); return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722; };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export type NationChromeAccent = {
  rule: string;
  text: string;
  /** 'accent' when the crest colour clears AA on the chip. 'gold' keeps the existing words and paints the accent as a rule. */
  textRole: 'accent' | 'gold';
};

/** Null when this id has no crest palette. Callers then leave the gold and teal chrome alone. */
export function nationChromeAccent(nationId: string): NationChromeAccent | null {
  const crest = nationCrest(nationId);
  if (!crest) return null;
  const textOk = accentContrast(crest.accent, ACCENT_CHIP) >= ACCENT_TEXT_AA;
  return { rule: crest.accent, text: textOk ? crest.accent : ACCENT_GOLD_TEXT, textRole: textOk ? 'accent' : 'gold' };
}

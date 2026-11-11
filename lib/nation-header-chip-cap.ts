/** #392 UI 59: Nation header chips stay inside the panel.
 *  NEXT_PUBLIC_HARIMU_NATION_HEADER_CHIP_CAP is HARIMU_UI_PACK entry 56
 *  ("true" in preview, "false" in production). A missing flag is off. Only the exact string "true" enables it.
 *  On, and only while the word-wrap flag is also on and header chips are shown, each chip uses min-width: min(100%, min-content).
 *  Off, the header stays as it is. */
export const NATION_HEADER_CHIP_CAP_FLAG = 'NEXT_PUBLIC_HARIMU_NATION_HEADER_CHIP_CAP';

export function nationHeaderChipCapFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_NATION_HEADER_CHIP_CAP; }
  catch { return undefined; }
}
export function nationHeaderChipCapEnabled(value: string | undefined = nationHeaderChipCapFlag()): boolean {
  return value === 'true';
}

/** #392 UI 65: City header chip details keep a hyphenated token on one line.
 *  NEXT_PUBLIC_HARIMU_CITY_HEADER_HYPHEN_KEEP is HARIMU_UI_PACK entry 62
 *  ("true" in preview, "false" in production). A missing flag is off. Only the exact string "true" enables it.
 *  On, the City panel class keeps a hard hyphen inside its chip detail on one line, and the chip stays inside the panel.
 *  Off, the header stays as it is. */
export const CITY_HEADER_HYPHEN_KEEP_FLAG = 'NEXT_PUBLIC_HARIMU_CITY_HEADER_HYPHEN_KEEP';

export function cityHeaderHyphenKeepFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_CITY_HEADER_HYPHEN_KEEP; }
  catch { return undefined; }
}
export function cityHeaderHyphenKeepEnabled(value: string | undefined = cityHeaderHyphenKeepFlag()): boolean {
  return value === 'true';
}

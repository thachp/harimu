/** #392 UI 62: City header stats keep each word whole.
 *  NEXT_PUBLIC_HARIMU_CITY_HEADER_WORD_WRAP is HARIMU_UI_PACK entry 59
 *  ("true" in preview, "false" in production). A missing flag is off. Only the exact string "true" enables it.
 *  On, the City panel class keeps header stat labels, values and details on word boundaries, and each chip stays inside the panel.
 *  Off, the header stays as it is. */
export const CITY_HEADER_WORD_WRAP_FLAG = 'NEXT_PUBLIC_HARIMU_CITY_HEADER_WORD_WRAP';

export function cityHeaderWordWrapFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_CITY_HEADER_WORD_WRAP; }
  catch { return undefined; }
}
export function cityHeaderWordWrapEnabled(value: string | undefined = cityHeaderWordWrapFlag()): boolean {
  return value === 'true';
}

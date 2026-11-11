/** #392 UI 57: Nation overview institution rows.
 *  NEXT_PUBLIC_HARIMU_NATION_INSTITUTION_ROWS is HARIMU_UI_PACK entry 54
 *  ("true" in preview, "false" in production). A missing flag is off. Only the exact string "true" enables it.
 *  On, each government role is a full-width row with a trailing caret. Off, the buttons stay as they are. */
export const NATION_INSTITUTION_ROWS_FLAG = 'NEXT_PUBLIC_HARIMU_NATION_INSTITUTION_ROWS';

export function nationInstitutionRowsFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_NATION_INSTITUTION_ROWS; }
  catch { return undefined; }
}
export function nationInstitutionRowsEnabled(value: string | undefined = nationInstitutionRowsFlag()): boolean {
  return value === 'true';
}

/** #1317: quiet header and calendar popover. NEXT_PUBLIC_HARIMU_CONCEPT_CHROME is HARIMU_UI_PACK entry 66
 *  ("true" in preview, "false" in production). A missing flag is off. Only the exact string "true" enables it. */
export const CONCEPT_CHROME_FLAG = 'NEXT_PUBLIC_HARIMU_CONCEPT_CHROME';
export function conceptChromeFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_CONCEPT_CHROME; }
  catch { return undefined; }
}
export function conceptChromeEnabled(value: string | undefined = conceptChromeFlag()): boolean {
  return value === 'true';
}

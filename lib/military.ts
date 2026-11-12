/** #1315 M1. NEXT_PUBLIC_HARIMU_MILITARY is HARIMU_UI_PACK entry 69 ("true" in preview, "false" in production). A missing flag is off. Only the exact string "true" enables it. */
export const MILITARY_FLAG = 'NEXT_PUBLIC_HARIMU_MILITARY';
export function militaryFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_MILITARY; }
  catch { return undefined; }
}
export function militaryEnabled(value: string | undefined = militaryFlag()): boolean {
  return value === 'true';
}

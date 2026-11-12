/** #1329 F1. NEXT_PUBLIC_HARIMU_FAITH is HARIMU_UI_PACK entry 71 ("true" in preview, "false" in production). A missing flag is off. Only the exact string "true" enables it. */
export const FAITH_FLAG = 'NEXT_PUBLIC_HARIMU_FAITH';
export function faithFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_FAITH; }
  catch { return undefined; }
}
export function faithEnabled(value: string | undefined = faithFlag()): boolean {
  return value === 'true';
}

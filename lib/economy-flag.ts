/** #1315 E1. NEXT_PUBLIC_HARIMU_ECONOMY is HARIMU_UI_PACK entry 70 ("true" in preview, "false" in production). A missing flag is off. Only the exact string "true" enables it. */
export const ECONOMY_FLAG = 'NEXT_PUBLIC_HARIMU_ECONOMY';
export function economyFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_ECONOMY; }
  catch { return undefined; }
}
export function economyEnabled(value: string | undefined = economyFlag()): boolean {
  return value === 'true';
}

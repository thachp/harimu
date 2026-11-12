/** #1315 desktop gate. NEXT_PUBLIC_HARIMU_DESKTOP_GATE is HARIMU_UI_PACK entry 68
 *  ("true" in preview, "false" in production). A missing flag is off. Only the exact string "true" enables it. */
export const DESKTOP_GATE_FLAG = 'NEXT_PUBLIC_HARIMU_DESKTOP_GATE';
export function desktopGateFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_DESKTOP_GATE; }
  catch { return undefined; }
}
export function desktopGateEnabled(value: string | undefined = desktopGateFlag()): boolean {
  return value === 'true';
}

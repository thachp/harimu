/** #392 UI 60: World atlas fact marks use size 1em only when the scale flag is on too.
 *  NEXT_PUBLIC_HARIMU_ICON_SIZE_SCALE_GATE is HARIMU_UI_PACK entry 57
 *  ("true" in preview, "false" in production). A missing flag is off. Only the exact string "true" enables it.
 *  On, those marks pass size 1em only when icon size sync and NEXT_PUBLIC_HARIMU_WORLD_ATLAS_ICON_SCALE are both on.
 *  Off, they stay as UI 56 left them. */
export const ICON_SIZE_SCALE_GATE_FLAG = 'NEXT_PUBLIC_HARIMU_ICON_SIZE_SCALE_GATE';

export function iconSizeScaleGateFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_ICON_SIZE_SCALE_GATE; }
  catch { return undefined; }
}
export function iconSizeScaleGateEnabled(value: string | undefined = iconSizeScaleGateFlag()): boolean {
  return value === 'true';
}

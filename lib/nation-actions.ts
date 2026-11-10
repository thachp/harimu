/** #392 UI 42: Nation overview action row. NEXT_PUBLIC_HARIMU_NATION_ACTIONS is HARIMU_UI_PACK entry 40
 *  ("true" in preview, "false" in production). A missing flag is off. Only the exact string "true" enables it. */
export const NATION_ACTIONS_FLAG = 'NEXT_PUBLIC_HARIMU_NATION_ACTIONS';

export function nationActionsFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_NATION_ACTIONS; }
  catch { return undefined; }
}
export function nationActionsEnabled(value: string | undefined = nationActionsFlag()): boolean {
  return value === 'true';
}

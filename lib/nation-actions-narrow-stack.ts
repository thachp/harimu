/** #392 UI 55: Nation overview actions always stack at a narrow viewport.
 *  NEXT_PUBLIC_HARIMU_NATION_ACTIONS_NARROW_STACK is HARIMU_UI_PACK entry 52
 *  ("true" in preview, "false" in production). A missing flag is off. Only the exact string "true" enables it.
 *  The class is added only while this flag and the UI 54 stack flag are both on, and only while the action row is shown. */
export const NATION_ACTIONS_NARROW_STACK_FLAG = 'NEXT_PUBLIC_HARIMU_NATION_ACTIONS_NARROW_STACK';

export function nationActionsNarrowStackFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_NATION_ACTIONS_NARROW_STACK; }
  catch { return undefined; }
}
export function nationActionsNarrowStackEnabled(value: string | undefined = nationActionsNarrowStackFlag()): boolean {
  return value === 'true';
}

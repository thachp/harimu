/** #392 UI 54: Nation overview actions stack. NEXT_PUBLIC_HARIMU_NATION_ACTIONS_STACK is HARIMU_UI_PACK entry 51
 *  ("true" in preview, "false" in production). A missing flag is off. Only the exact string "true" enables it.
 *  The action row stacks full width when the two buttons cannot sit side by side without clipping a word.
 *  The class is added only while the nation action row is on. */
export const NATION_ACTIONS_STACK_FLAG = 'NEXT_PUBLIC_HARIMU_NATION_ACTIONS_STACK';

export function nationActionsStackFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_NATION_ACTIONS_STACK; }
  catch { return undefined; }
}
export function nationActionsStackEnabled(value: string | undefined = nationActionsStackFlag()): boolean {
  return value === 'true';
}

/** #392 UI 45: Nation overview motto placement. NEXT_PUBLIC_HARIMU_NATION_MOTTO is HARIMU_UI_PACK entry 42
 *  ("true" in preview, "false" in production). A missing flag is off. Only the exact string "true" enables it.
 *  Flag on moves the nation record's motto to the right of the title. Blank stays hidden. Flag off keeps it under the name. */
export const NATION_MOTTO_FLAG = 'NEXT_PUBLIC_HARIMU_NATION_MOTTO';

export function nationMottoFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_NATION_MOTTO; }
  catch { return undefined; }
}
export function nationMottoEnabled(value: string | undefined = nationMottoFlag()): boolean {
  return value === 'true';
}

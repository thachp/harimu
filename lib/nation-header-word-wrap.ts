/** #392 UI 58: Nation header wraps at word boundaries.
 *  NEXT_PUBLIC_HARIMU_NATION_HEADER_WORD_WRAP is HARIMU_UI_PACK entry 55
 *  ("true" in preview, "false" in production). A missing flag is off. Only the exact string "true" enables it.
 *  On, and only while the motto or the header chips are also on, the header class keeps those strings on word boundaries.
 *  Off, the header stays as it is. */
export const NATION_HEADER_WORD_WRAP_FLAG = 'NEXT_PUBLIC_HARIMU_NATION_HEADER_WORD_WRAP';

export function nationHeaderWordWrapFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_NATION_HEADER_WORD_WRAP; }
  catch { return undefined; }
}
export function nationHeaderWordWrapEnabled(value: string | undefined = nationHeaderWordWrapFlag()): boolean {
  return value === 'true';
}

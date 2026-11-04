/** #1076: Nation panel header lists Capital, Government, Economy and Currency.
 *  NEXT_PUBLIC_HARIMU_NATION_FACT_ROWS is a HARIMU_UI_PACK key ("true" in preview, "false" in production).
 *  Layout bundles that omit the define have no `process`. A missing flag is off. */
export function nationFactRowsFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_NATION_FACT_ROWS; }
  catch { return undefined; }
}
export function nationFactRowsEnabled(value: string | undefined = nationFactRowsFlag()): boolean {
  return value === 'true';
}

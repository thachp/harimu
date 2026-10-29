/** #1008: Aurelle decrees as sealed scrolls (docs §23.2). Build flag NEXT_PUBLIC_HARIMU_AURELLE_SEALED_SCROLLS
 *  ("true" in preview, "false" in production), carried in HARIMU_UI_PACK and expanded into the client bundle.
 *  Only the exact string "true" enables it. No new decree data. */
export function aurelleSealedScrollsEnabled(value: string | undefined = process.env.NEXT_PUBLIC_HARIMU_AURELLE_SEALED_SCROLLS): boolean { return value === 'true'; }

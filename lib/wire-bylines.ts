/** Build-time flag NEXT_PUBLIC_HARIMU_WIRE_BYLINES (#243): the nation's press template pack (lib/press-templates.ts, #242/#238/#239) runs as filler
 *  wire stories in the National news edition, each under its in-world wire byline (Kindle Press, Korund State Media, Court Gazette).
 *  FILLER ONLY (ARC): the pack shows only while no player paper has published in that nation. "true" in preview, "false" in production;
 *  only the exact string "true" enables it. Import-free (the caller passes lib/press-templates.ts pressPacks), so plain Node tests can load it. */
import type { PressPack } from './press-templates';
export function wireBylinesEnabled(value: string | undefined = process.env.NEXT_PUBLIC_HARIMU_WIRE_BYLINES): boolean { return value === 'true'; }
/** The filler pack for a nation's edition, or null: flag off, a nation without a pack, or a player paper has published there (filler gives way).
 *  No player papers exist yet, so callers pass 0 until the newspaper feature lands. */
export function wireFiller(nationId: string | null | undefined, packs: Readonly<Partial<Record<string, PressPack>>>, playerPapersPublished = 0, enabled: boolean = wireBylinesEnabled()): PressPack | null {
  if (!enabled || playerPapersPublished > 0 || !nationId) return null;
  return packs[nationId] ?? null;
}

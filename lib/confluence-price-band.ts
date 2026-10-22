/** #487 (Confluence PoC): one staple with a fixed price band on the market board. Display only: no trade, no State Bank, no Clearing House, no CUR band or parity moves
 *  (all excluded by #487). Docs: the-confluence.mdx / economy-currency.mdx ("staples priced in bands"; "fixed-price systems (... Confluence staples)").
 *  Behind HARIMU_CONFLUENCE_ENABLED and only for a QA-allowlisted Confluence citizen (nationPlayable). Pure: no query, no write. */
import { nationPlayable } from './nation-openings';
import type { QaBindings } from './qa-tools';

export type PriceBoard = { nationId: 'confluence'; currency: 'CUR'; staple: string; unit: string; priceMinor: number; floorMinor: number; ceilingMinor: number; bandPct: number };
/** [ASSUMPTION] Numbers are not in the docs: rice, 1.00 CUR per bowl, a ±5% band (the docs' CUR band width, reused for the staple). The price sits at the band centre and does not move. */
export const confluenceStaple = { staple: 'Rice', unit: 'bowl', priceMinor: 100, bandPct: 5 } as const;

export function confluencePriceBoard(nationId: string | null | undefined, userId: string | null | undefined, bindings?: QaBindings & Readonly<Record<string, string | undefined>>): PriceBoard | null {
  if (nationId !== 'confluence' || bindings?.HARIMU_CONFLUENCE_ENABLED !== 'true' || !nationPlayable(nationId, bindings, userId)) return null;
  const { staple, unit, priceMinor, bandPct } = confluenceStaple, swing = Math.round(priceMinor * bandPct / 100);
  return { nationId: 'confluence', currency: 'CUR', staple, unit, priceMinor, floorMinor: priceMinor - swing, ceilingMinor: priceMinor + swing, bandPct };
}

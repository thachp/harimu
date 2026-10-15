import { nationMark, nationSymbolsEnabled } from '../lib/nation-themes';
/** #79: the nation's color-blind-safe symbol chip (shape + fill pattern + light accent) shown next to its name on the nation strip and comparison table.
 *  Decorative for assistive tech: the nation name beside it is the text alternative; sighted users also get the symbol and pattern name as a tooltip.
 *  Renders nothing unless NEXT_PUBLIC_HARIMU_NATION_SYMBOLS is "true", and nothing for ids with no mark. */
export function NationSymbol({ id }: { id: string }) {
  const mark = nationMark(id);
  if (!mark || !nationSymbolsEnabled()) return null;
  return <span className="nation-symbol" data-nation-pattern={mark.pattern} data-nation-symbol={id} aria-hidden="true" title={`${mark.name} symbol, ${mark.patternName}`} style={{ color: mark.accent }}>{mark.symbol}</span>;
}
/** The same chip as a DOM node, for the WebGL globe's label buttons (they are built with the DOM API, not React). Null when the flag is off or the id has no mark. */
export function nationSymbolElement(id: string, doc: Document = document): HTMLSpanElement | null {
  const mark = nationMark(id);
  if (!mark || !nationSymbolsEnabled()) return null;
  const chip = doc.createElement('span');
  chip.className = 'nation-symbol'; chip.dataset.nationPattern = mark.pattern; chip.dataset.nationSymbol = id; chip.setAttribute('aria-hidden', 'true');
  chip.title = `${mark.name} symbol, ${mark.patternName}`; chip.style.color = mark.accent; chip.textContent = mark.symbol;
  return chip;
}

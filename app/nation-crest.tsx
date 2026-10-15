import { crestEdge, crestInset, crestShield, crestViewBox, nationCrest, nationCrestLabel, uiV2CrestEnabled } from '../lib/nation-crests';
import { nationMark } from '../lib/nation-themes';
/** #392 S1: the nation crest (shield + documented emblem motif, placeholder vector). Reuses the #79 mark for its pattern and name. `size` is in px at 100% text and scales with --text-scale.
 *  Decorative for assistive tech (QA2 #534): the nation name beside it already says which nation, so the svg is aria-hidden; sighted users get the label as a tooltip.
 *  Renders nothing unless NEXT_PUBLIC_HARIMU_UI_V2_CREST is "true" (or `force`, for previews and tests), and nothing for ids without a crest. */
export function NationCrest({ id, size = 36, force = false }: { id: string; size?: number; force?: boolean }) {
  const crest = nationCrest(id), mark = nationMark(id), label = mark ? nationCrestLabel(id, mark.name) : null;
  if (!crest || !mark || !label || !(force || uiV2CrestEnabled())) return null;
  return <span className="nation-crest" data-nation-crest={id} title={label} data-nation-pattern={mark.pattern} style={{ '--crest-size': `${size}px`, '--crest-field': crest.field, '--crest-mark': crest.mark } as React.CSSProperties}>
    <svg viewBox={crestViewBox} aria-hidden="true" focusable="false">
      <path d={crestShield} fill="none" stroke={crestEdge} strokeWidth="2.6" strokeLinejoin="round" />
      <path d={crestInset} fill="none" stroke={crest.accent} strokeWidth="1.2" opacity=".9" />
      <path d={crest.d} fill="none" stroke={crest.mark} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </span>;
}

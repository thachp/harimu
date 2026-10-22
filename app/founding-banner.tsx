'use client';
// #612 slice B: the Founding Period banner on the government view (Kindle, Korund, Aurelle) while HARIMU_FOUNDING_PERIOD_ENABLED is on. The server only sends government.founding with the flag on.
// All player-facing lines come from the #499 copy module. Presentation only: no fetch, no state.
import { useDisplayTimestamp } from './display-preferences';
import { AiBadge } from './ai-disclosure';
import { dayThirtyPreviewFor, foundingBanner, foundingEnded, foundingProgramme, foundingTenure, FOUNDING_NATIONS, type FoundingNation } from '../lib/founding-period-copy';

export type FoundingView = { active: boolean; endsAt: number | null; dayOfPeriod: number | null };
export function FoundingBanner({ founding, nationId }: { founding?: FoundingView | null; nationId: string }) {
  const formatTime = useDisplayTimestamp();
  if (!founding || !FOUNDING_NATIONS.includes(nationId as FoundingNation)) return null;
  if (!founding.active) return <section className="founding-banner" aria-label="Founding Period"><p role="status">{foundingEnded.text}</p></section>;
  const preview = dayThirtyPreviewFor(nationId as FoundingNation);
  // [ASSUMPTION] With no known end time (shard start not set) only the explainer shows; the dated caption would be a guess.
  return <section className="founding-banner" aria-label="Founding Period">
    <h4>{foundingBanner.title}</h4>
    {founding.endsAt !== null && <p role="status">{foundingBanner.caption.text.replace('{endsAt}', formatTime(founding.endsAt * 1000))}</p>}
    <p>{foundingBanner.explainer.text}</p>
    <ul>
      <li><strong>{foundingProgramme.label}</strong> <AiBadge /> · {foundingProgramme.line.text}</li>
      <li><strong>{foundingTenure.label}</strong> · {foundingTenure.line.text}</li>
    </ul>
    {preview && <article aria-label="Day 30 preview"><h5>{preview.headline}</h5><p>{preview.body}</p><small>{preview.byline.name}{preview.aiBadge && <> <AiBadge /></>}</small></article>}
  </section>;
}

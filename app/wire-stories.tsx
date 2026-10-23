'use client';
// #243: filler wire stories under their in-world byline (NEXT_PUBLIC_HARIMU_WIRE_BYLINES). Every string comes from lib/press-templates.ts; this adds no copy.
// Reading order per story: headline, then byline (with the AI badge for a Crown or Presidium voice, #381), then the body. The byline is plain text in the
// ARC: a screen-reader-only 'Wire: ' prefix (.wire-sr) names the byline's role; nothing visible changes.
// nation document's ink color, so contrast is the document's own; the outlet is styled by its rule (app/game-shell.css "#243"), never by color alone.
import { AiBadge } from './ai-disclosure';
import type { PressPack } from '../lib/press-templates';

export function WireStories({ pack }: { pack: PressPack }) {
  const id = `wire-${pack.nationId}`;
  return <section className={`wire-stories wire-${pack.outlet}`} aria-labelledby={id}>
    <h3 id={id}>{pack.byline.name}</h3>
    <ol>{pack.templates.map(story => <li key={story.id}><article aria-labelledby={`${story.id}-h`}>
      <h4 id={`${story.id}-h`}>{story.headline}</h4>
      <p className="wire-byline"><span className="wire-sr">Wire: </span>{pack.byline.name}{story.aiBadge && <> <AiBadge /></>}</p>
      {story.body.map((line, i) => <p key={i}>{line}</p>)}
    </article></li>)}</ol>
  </section>;
}

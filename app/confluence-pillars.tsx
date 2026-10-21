import { draftLeaderPersonas } from '@/lib/leader-drafts';
import { AiBadge } from './ai-disclosure';

/** #487 (Confluence PoC): the Four Pillars, read-only, from lib/leader-drafts.ts (every officeholder is an AI persona, GDD §8). No ballots, Congress or actions
 *  (Party Congress and Assembly ballots are excluded by #487). Rendered only for a Confluence citizen, who can exist only while HARIMU_CONFLUENCE_ENABLED is on for a QA-allowlisted account. */
export const confluencePillars = draftLeaderPersonas.confluence;
export function ConfluencePillars() {
  return <section className="citizen-market" aria-labelledby="confluence-pillars-heading">
    <h3 id="confluence-pillars-heading">The Four Pillars</h3>
    <ul>{confluencePillars.map(p => <li key={p.office}><strong>{p.office}</strong> · {p.name} <AiBadge /><br /><span>{p.biography}</span></li>)}</ul>
  </section>;
}

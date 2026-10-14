import type { PublicStability } from '@/lib/stability';

/** Stability/Unrest for one nation (#69). Korund shows only the state-approved figure plus system stats. */
export function StabilityPanel({ score }: { score: PublicStability | undefined }) {
  if (!score) return <section aria-label="Stability and Unrest"><h4>Stability and Unrest</h4><p>No daily score has been recorded yet. The first one is saved when the next game day (two real hours) is processed.</p></section>;
  if (score.kind === 'state-approved') return <section aria-label="State-approved stability"><h4>State-approved Stability: {score.approvedStability}/100</h4>
    <p>Figure published by the State Statistics Bureau for game day tick {score.tick}.</p>
    <p>System stats: {score.systemStats.citizens} citizens · {score.systemStats.fedPercent}% ate in the last 24 real hours · {score.systemStats.workedPercent}% worked a shift · {score.systemStats.petitionBacklog} requests awaiting review.</p></section>;
  return <section aria-label="Stability and Unrest"><h4>Stability {score.stability}/100 · Unrest {score.unrest}/100</h4>
    <p>Recalculated once per game day (every two real hours) from saved game records. Tick {score.tick}.</p>
    <details><summary>What moved them today</summary>
      <ul aria-label="Stability breakdown">{score.breakdown.stability.map(term => <li key={term.input}>Stability {term.points >= 0 ? '+' : ''}{term.points} · {term.detail}</li>)}</ul>
      <ul aria-label="Unrest breakdown">{score.breakdown.unrest.map(term => <li key={term.input}>Unrest +{term.points} · {term.detail}</li>)}</ul>
    </details></section>;
}

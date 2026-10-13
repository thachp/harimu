'use client';
import type { GovernmentSnapshot } from '../lib/government';
import { leaderPersonas, leaderProgramme } from '../lib/leader-personas';
import { governmentDisclosure } from '../lib/government-disclosure';
import type { SimulationState } from '../lib/world-simulation';
import { GameTimer } from './game-timer';
import { AiBadge, AiTextTag } from './ai-disclosure';

export function LeaderPanel({snapshot,simulation}:{snapshot:GovernmentSnapshot;simulation?:SimulationState}) {
  const persona=leaderPersonas[snapshot.nationId as keyof typeof leaderPersonas];
  if(!persona)return null;
  const disclosure=governmentDisclosure(snapshot);
  return <section className="leader-panel" aria-label={`${persona.office} of ${snapshot.nationId}`}>
    <div className="leader-identity">
      <svg viewBox="0 0 80 96" role="img" aria-label={`Stylized portrait of ${persona.name}`} width="80" height="96">
        <rect width="80" height="96" rx="4" fill="#132b33" />
        <path d="M8 96 Q8 62 40 62 Q72 62 72 96" fill={persona.color}/>
        <ellipse cx="40" cy="39" rx="19" ry="24" fill="#bb9e81"/>
        <path d={snapshot.nationId==='aurelle'?'M20 34 L20 12 L30 20 L40 8 L50 20 L60 12 L60 34 Z':snapshot.nationId==='korund'?'M18 30 L18 18 Q40 5 62 18 L62 30 Z':'M20 42 Q10 8 40 10 Q68 10 61 44 L54 26 Q33 32 26 25 Z'} fill={persona.color}/>
        <path d="M31 41h4m10 0h4M34 53q6 4 12 0" stroke="#3d302b" strokeWidth="2" fill="none"/>
      </svg>
      <div><h3>{persona.office} · {persona.name} <AiBadge /></h3><p>{persona.affiliation}</p><p>{persona.biography}</p><small>Authored preview persona · fixed-rule leadership</small></div>
    </div>
    <details><summary>Current pledges and programme</summary><ul>{leaderProgramme(snapshot).map(pledge=><li key={pledge.title}><strong>{pledge.title}</strong> · {pledge.status}</li>)}</ul></details>
    <details><summary>Why? · {disclosure.title}</summary><p><AiTextTag provenance={disclosure.provenance}/></p><p>{disclosure.text}</p>{disclosure.kind==='brief' && <><p><strong>Goal:</strong> {snapshot.decision.title}.</p><p><strong>Other priorities:</strong> Food, infrastructure and workplace support compete for this proposal. Food safety takes precedence; otherwise recorded petition counts rank them, with ties favoring food, then infrastructure.</p></>}</details>
    {simulation && <details><summary>Upcoming routine review</summary><GameTimer endsAt={(simulation.clock.epochSeconds+(simulation.clock.latestTick+1)*simulation.clock.cadenceSeconds)*1000} label="Next policy settlement"/><p>Processed on a server visit after the deadline. No election or major AI decision is scheduled in this preview.</p></details>}
  </section>;
}

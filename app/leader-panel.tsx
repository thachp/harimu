'use client';
import { NationDocument } from './nation-document';
import { NationCrest } from './nation-crest';
import { aurelleSealedScrollsEnabled } from '../lib/aurelle-sealed-scrolls';
import type { GovernmentSnapshot } from '../lib/government';
import { leaderPersonas, leaderProgramme } from '../lib/leader-personas';
import { governmentDisclosure } from '../lib/government-disclosure';
import { nationDisclosureFor, whyLink } from '../lib/decision-disclosure-copy'; // #985
import type { SimulationState } from '../lib/world-simulation';
import { GameTimer } from './game-timer';
import { AiBadge, AiTextTag } from './ai-disclosure';

/** #613: the succession line (HARIMU_AURELLE_SUCCESSION_ENABLED; the server sends `succession` only then). [ASSUMPTION] placeholder strings for the Aurelle succession copy companion; in-file so this component loads under plain Node. */
const successionStatus={reigning:'The Monarch reigns.',ailing:'The Monarch is ailing.',vacant:'The throne stands vacant.',acceded:'The heir has acceded.',abdicated:'The Monarch has abdicated.'} as const;
const successionLine=(s:NonNullable<GovernmentSnapshot['succession']>)=>`${successionStatus[s.status]} ${s.heir?`${s.heir.named?'Named heir':'Heir by seniority'}: ${s.heir.name}.`:'No heir remains: the Great Council elects a new house.'}`;
export function LeaderPanel({snapshot,simulation}:{snapshot:GovernmentSnapshot;simulation?:SimulationState}) {
  const authored=leaderPersonas[snapshot.nationId as keyof typeof leaderPersonas];
  // #71/#281: a successful Rising or palace coup crowns a new AI royal house; the new AI royal house replaces the authored monarch.
  const crowned=snapshot.crown&&authored?{...authored,name:snapshot.crown.name,affiliation:`${snapshot.crown.house} · ${snapshot.crown.how==='coup'?'installed by a palace coup':snapshot.crown.how==='succession'?'acceded by succession':'crowned by a popular Rising'}`,color:snapshot.crown.color,biography:snapshot.crown.how==='succession'?`${snapshot.crown.name} of ${snapshot.crown.house} holds the Sky Throne by hereditary succession.`:snapshot.crown.how==='coup'?`${snapshot.crown.name} of ${snapshot.crown.house} now holds the Sky Throne after a palace coup. Motto: “${snapshot.crown.motto}”`:`Took the Sky Throne after a Rising of the commons. Motto: “${snapshot.crown.motto}”`}:authored;
  // #70: after a purge the Chosen Comrade replaces the authored Chairman.
  const persona=snapshot.presidium&&crowned&&snapshot.presidium.chairman.name!==crowned.name?{...crowned,name:snapshot.presidium.chairman.name,biography:'Confirmed as Chairman by the Presidium after an emergency session. Citizens receive official statements; council deliberation stays private.'}:crowned;
  if(!persona)return null;
  const disclosure=governmentDisclosure(snapshot);
  const sealed=snapshot.nationId==='aurelle'&&aurelleSealedScrollsEnabled();
  const kindleBrief=nationDisclosureFor('kindle');
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
    {snapshot.succession&&<p role="status" aria-label="Succession">{successionLine(snapshot.succession)}</p>}
    {snapshot.presidium&&<section aria-label="Presidium seats"><h4>The Presidium <AiBadge /></h4><ul>{snapshot.presidium.seats.map(s=><li key={s.id}><strong>{s.name}</strong> · {s.role}{s.status==='purged'?' · removed from the Presidium':''}</li>)}</ul>
      {snapshot.presidium.session?.status==='open'&&<p role="status">State Media rumor: the Presidium is meeting in emergency session.</p>}</section>}
    <details><summary>Current pledges and programme</summary><ul>{leaderProgramme(snapshot).map(pledge=><li key={pledge.title}><strong>{pledge.title}</strong> · {pledge.status}</li>)}</ul></details>
    <NationDocument nationId={snapshot.nationId} label={disclosure.title} className={sealed?'leader-statement aurelle-sealed-scroll':'leader-statement'}>{sealed&&<span className="aurelle-scroll-seal" aria-hidden="true"><NationCrest id="aurelle" size={28} force/></span>}<details><summary>Why? · {disclosure.title}</summary><p><AiTextTag provenance={disclosure.provenance}/></p><p>{disclosure.text}</p>{disclosure.kind==='brief' && <><p><strong>Goal:</strong> {snapshot.decision.title}.</p><p><strong>Other priorities:</strong> Food, infrastructure and workplace support compete for this proposal. Food safety takes precedence; otherwise recorded petition counts rank them, with ties favoring food, then infrastructure.</p></>}</details></NationDocument>
    {snapshot.policyLedger && snapshot.nationId==='kindle' && kindleBrief && <section aria-label="Policy Ledger"><h4>Policy Ledger</h4>{!snapshot.policyLedger.length ? <p>No published decisions are on the ledger yet.</p> : <ol>{snapshot.policyLedger.map(entry => <li key={entry.id}><p>{new Date(entry.publishedAt * 1000).toISOString().slice(0, 10)} · {entry.office} <AiBadge /> · {entry.title}</p><details><summary aria-label={whyLink.accessibleName}>{whyLink.label} · {kindleBrief.title}</summary><p><AiTextTag provenance="deterministic"/></p><p>{entry.brief}</p><p>{kindleBrief.notPublished.text}</p></details></li>)}</ol>}</section>}
    {simulation && <details><summary>Upcoming routine review</summary><GameTimer endsAt={(simulation.clock.epochSeconds+(simulation.clock.latestTick+1)*simulation.clock.cadenceSeconds)*1000} label="Next policy settlement"/><p>Processed on a server visit after the deadline. No election or major AI decision is scheduled in this preview.</p></details>}
  </section>;
}

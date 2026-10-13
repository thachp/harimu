import type { GovernmentSnapshot } from './government';

/** Authored POC characters; identity is stable and independent of citizen/account data. */
export const leaderPersonas = {
  kindle: {name:'Ines Varro',office:'President',affiliation:'Civic Stewardship',color:'#80b9ad',biography:'A pragmatic steward who puts household food security first and keeps public proposals within verified funds.'},
  korund: {name:'Neral Voss',office:'Chairman',affiliation:'The Presidium',color:'#b68676',biography:'A disciplined planner who emphasizes food production and continuity. Citizens receive official statements; council deliberation stays private.'},
  aurelle: {name:'Maera Solenne',office:'Monarch',affiliation:'House Solenne',color:'#c7af75',biography:'A measured sovereign who hears household petitions through the royal council. The crown publishes decrees rather than council deliberation.'},
} as const;

export function leaderProgramme(snapshot: GovernmentSnapshot) {
  return [
    {title:'Prioritize household food when the safety threshold is breached',status:'Enforced by rules'},
    {title:snapshot.decision.title,status:snapshot.decision.proposedSpendMinor>0?'Proposed · funds not yet allocated':'Proposed · no verified appropriation funds'},
    {title:'Keep proposals within verified programme funds',status:'Enforced by rules'},
  ];
}

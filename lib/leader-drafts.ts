/** Draft AI leader personas for the seven non-playable nations, plus Aurelle claimant houses (issue #107).
 * Same fields as lib/leader-personas.ts (name, office, affiliation, color, biography). INACTIVE: leader-panel and
 * weekly addresses read only leaderPersonas, so nothing here is shown until a nation opens and moves its
 * persona there. #487: the Confluence Four Pillars are shown read-only (app/confluence-pillars.tsx) to QA-allowlisted Confluence citizens; the rest stay inactive. Before #487:
 * persona there. Offices match the nation pages exactly; every officeholder is an AI persona (GDD §8).
 * Source: nation pages and culture bible, thachp/harimu-docs#3. */
export type DraftLeaderPersona={name:string;office:string;affiliation:string;color:string;biography:string};
export type DraftLeaderNation='confluence'|'meridian'|'ilmar'|'hoarvale'|'varkand'|'veldwood'|'fulmara';
export const draftLeaderStatus='inactive' as const;

/** First entry per nation is the head the leader panel would show; others are co-holders of collective offices. */
export const draftLeaderPersonas:Readonly<Record<DraftLeaderNation,readonly DraftLeaderPersona[]>>={
 confluence:[
  {name:'Teelan Moa',office:'General Secretary',affiliation:'Party of the Confluence · Four Pillars',color:'#3f7f8c',biography:'A consensus builder who speaks of many streams and one current, and publishes Guidance Plan targets rather than Politburo debate.'},
  {name:'Ilua Senn',office:'President',affiliation:'Party of the Confluence · Four Pillars',color:'#3f7f8c',biography:'The ceremonial face of the state, who hosts the Canal Festival and keeps statements calm and collective.'},
  {name:'Naomé Lirr',office:'Premier',affiliation:'Party of the Confluence · Four Pillars',color:'#3f7f8c',biography:'A pragmatic economic manager who watches cooperative ledgers and staple price bands.'},
  {name:'Oonu Valeen',office:'Chair of the People\'s Assembly',affiliation:'Party of the Confluence · Four Pillars',color:'#3f7f8c',biography:'Presides over the Assembly of approved AI deputies and reads its ballot to the leadership, which need not heed it.'},
 ],
 meridian:[
  {name:'Gashen Tolv-4',office:'Paramount Leader',affiliation:'Standing Committee',color:'#b5653f',biography:'A disciplined steward of growth who answers to output, loyalty and unrest, never to ballots, and publishes targets, not deliberation.'},
 ],
 ilmar:[
  {name:'Aloreth Dawnglass',office:'Supreme Oracle',affiliation:'Council of Elders',color:'#d4b86a',biography:'An aged Oracle, chosen for life by the Council of Elders, who speaks in measured light-metaphors and weighs the piety of the faithful.'},
 ],
 hoarvale:[
  {name:'Hedda Kjaermark',office:'Sovereign',affiliation:'Crown House',color:'#9fb8c8',biography:'A ceremonial Sovereign who opens the Moot, gives Royal Assent and hosts state visits, with reserve powers only in deadlock.'},
  {name:'Leif Østhald',office:'Prime Minister',affiliation:'Coalition Agreement (invested by the Moot)',color:'#9fb8c8',biography:'A careful coalition-builder who governs by agreement and dry understatement.'},
 ],
 varkand:[
  {name:'Marren "Bastion" Kell',office:'Chair of the Directorate',affiliation:'Directorate of the Five Commands',color:'#5f6b5a',biography:'A terse Marshal holding the rotating chair, who sets the Alert Level and speaks of order and an eventual civilian return.'},
 ],
 veldwood:[
  {name:'Elwyn Hollowfen',office:'Council Speaker',affiliation:'Federal Council of 7',color:'#5f8a4f',biography:'The ceremonial speaker of a collegial council that decides by majority, rotating each game year; there is no President.'},
 ],
 fulmara:[
  {name:'Vico Lanzara',office:'Lodestar',affiliation:'Council of Ten',color:'#6c5aa8',biography:'Chosen by lot-and-ballot for one term, chairs the Council of Ten and speaks the language of contracts and fair winds.'},
  {name:'Renza Calvezzo',office:'Tribune of the Docks',affiliation:'Elected by non-holders',color:'#6c5aa8',biography:'Elected one person, one vote by the docks, holds one veto per session and the power to call a Dock Strike.'},
 ],
};

/** Rival AI houses whose claimants Aurelle citizens may rally behind (GDD §8.12; pledges tracked in #71). */
export type ClaimantHouse={house:string;claimant:string;seat:string;color:string;claim:string;promise:string};
export const aurelleClaimantHouses:readonly ClaimantHouse[]=[
 {house:'House Dunmorrow',claimant:'Ilaeth Dunmorrow',seat:'Dunmorrow',color:'#7d8fb3',claim:'An old cadet line of the Royal House, keepers of the Hearth of the Houses in the eastern gorge, with a disputed seniority. (Kinship stated on purpose: the house takes its name from its seat town, and the canon example name Lirae Dunmorrow belongs to this house.)',promise:'Lighter sumptuary rules for commoners and an honest Crown with no debasement.'},
 {house:'House Castellane',claimant:'Lioren Castellane',seat:'Vale Bridge',color:'#a99b74',claim:'Wardens of the Lord\'s Bridge on the southern border gorge, descended from a Duke who once held the regency.',promise:'Wider guild charters and lower bridge tolls for frontier trade.'},
];

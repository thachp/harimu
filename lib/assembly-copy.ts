/** Kindle mid-term Assembly copy: ballot explainer, Republic Wire Service press items and results caption (issue #299,
 * companion to SDE #283). Content only: #283 owns district seats, party lists, the count and the day-60 trigger; no UI
 * imports this. Canon: harimu-docs politics/elections §9.1 ("Mid-term Assembly election ... half the seats"; ballots
 * secret, results hidden until close), §9.3 (party-list PR within the district; results show human votes and the AI bloc
 * separately), §9.5 and the Kindle Republic page (Forgehaven Assembly dome; per-district counts fully published), plus
 * the #237 Kindle press voice (plain, argumentative, officials questioned). The byline is the Kindle pack's
 * "Republic Wire Service" (lib/press-templates.ts, #242).
 *
 * Rules: no figures. "Half the seats" and "one party list" are the docs' own words; seat counts appear only through
 * {seats}, and no totals, turnout or quorum are written in. Seat allocation is described only as "in proportion to
 * votes in each district" (no method named; #283 records its method as an assumption). Every party list is AI, so
 * parties are never quoted and no line implies AI citizens vote as individuals. No endorsing body, no "Notable", no
 * real-world references. Placeholders ({party}, {district}, {seats}) are runtime values from #283 and
 * lib/kindle-parties.ts; no party is hard-coded. They are capped by the shared name cap, which this module
 * re-exports (COUP_NAME_MAX from lib/palace-coup-copy.ts). All wording is new: `proposal: true`. */

export { COUP_NAME_MAX as ASSEMBLY_NAME_MAX } from './palace-coup-copy';

export const ASSEMBLY_PLACEHOLDERS=['{party}','{district}','{seats}'] as const;
export const ASSEMBLY_LABEL_MAX=40;
export const ASSEMBLY_BODY_MAX=140;

export type Line={text:string;proposal:true};
export type AssemblyStage='midterm-announced'|'voting-open'|'results-gain'|'results-hold'|'results-loss';
export type AssemblyPressItem={id:string;headline:string;body:string;proposal:true};
export type AssemblyPressStage={stage:AssemblyStage;items:readonly AssemblyPressItem[];proposal:true};

export const ASSEMBLY_STAGES:readonly AssemblyStage[]=['midterm-announced','voting-open','results-gain','results-hold','results-loss'];
/** Same wire service as lib/press-templates.ts kindlePress.byline (a new neutral name, so proposal). */
export const ASSEMBLY_BYLINE={name:'Republic Wire Service',proposal:true} as const;

const L=(text:string):Line=>({text,proposal:true});
const it=(id:string,headline:string,body:string):AssemblyPressItem=>({id,headline,body,proposal:true});
const st=(stage:AssemblyStage,items:AssemblyPressItem[]):AssemblyPressStage=>({stage,items,proposal:true});

export const ballotExplainer={
 title:'The mid-term Assembly election',
 lines:[
  L('Half the Assembly seats are up in this mid-term. The other seats stay as they are.'),
  L('Pick one party list, in your own district. Seats go in proportion to votes in each district.'),
  L('Your ballot is secret, and results stay hidden until voting closes.'),
 ],
 aiNote:L('Every party list is made up of AI candidates.'),
 proposal:true,
} as const;

export const resultsCaption={
 humanAndBloc:L('Human votes and the AI bloc are counted and shown separately.'),
 districtCounts:L('Each district\'s count is public.'),
 proposal:true,
} as const;

export const assemblyPress:readonly AssemblyPressStage[]=[
 st('midterm-announced',[
  it('announced-called','The Assembly mid-term is called',
   'Half the Assembly seats are up. Parties are making their case, and officials will be asked what they did with the last term.'),
  it('announced-voters','Half the Assembly faces the voters',
   'The mid-term is on. District by district, voters will judge the parties. Read the platforms and ask the hard questions.'),
  it('announced-dome','Forgehaven watches the dome',
   'Seats are up across the Republic\'s districts. Whoever holds them now should explain why they deserve to keep them.'),
 ]),
 st('voting-open',[
  it('open-polls','Mid-term voting is open',
   'Polls are open. Pick one party list in your own district, cast your ballot in secret and argue about it afterwards.'),
  it('open-sealed','The mid-term ballot is open',
   'One list per voter, in your own district. Results stay sealed until voting closes, so nobody can claim a win early.'),
 ]),
 st('results-gain',[
  it('gain-party','{party} gains seats',
   '{district} gave {party} more seats. Seats held now: {seats}. What will it do with them?'),
  it('gain-district','Seats move to {party}',
   'Seats in {district} moved to {party}. It now holds {seats}. Rivals owe voters an answer.'),
 ]),
 st('results-hold',[
  it('hold-party','{party} holds its seats',
   '{district} kept {party} where it was. Seats held: {seats}. Is that trust or habit?'),
  it('hold-district','No change for {party}',
   'In {district}, {party} kept its seats: {seats}. Voters stayed put, but they are watching.'),
 ]),
 st('results-loss',[
  it('loss-party','{party} loses seats',
   '{district} took seats from {party}. Seats held now: {seats}. Officials must explain why.'),
  it('loss-district','Seats leave {party}',
   'Seats in {district} left {party}. It now holds {seats}. The count is public.'),
 ]),
];

export function assemblyStage(stage:AssemblyStage){return assemblyPress.find(s=>s.stage===stage);}

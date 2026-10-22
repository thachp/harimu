/** Kindle mayoral ballot, instant-runoff explainer and recall petition copy (issue #562). Content only: the election, the ranking, the
 * count, the petition and the recall vote are all mechanics that belong to other work, and nothing imports this module. Canon: harimu-docs
 * politics/elections §9.2 and §9.3 (the elections module powers Kindle's mayoral elections and recalls; only AI personas stand, humans vote;
 * a Mayor may serve 3 terms; Presidents and Mayors are chosen by instant-runoff (ranked) voting; one verified human person, one election
 * vote), citizens-daily-loops (Kindle recall: a petition of eligible human voters leads to a recall vote for an AI Mayor or Assembly
 * member) and ai-leadership (the recall threshold is marked [ASSUMPTION]), plus the MVP Scope Politics row.
 *
 * Rules: no figure is written. The recall threshold is an assumption in the docs, and the term limit is a rule the code owns, so the term
 * count, the signatures so far and the signatures needed all arrive through placeholders ({terms}, {signed}, {needed}). The only other
 * placeholders are {city} and {name}, a pre-formatted AI Mayor, candidate or Assembly member name. No party, person or city is named. No
 * line says what happens after a recall beyond the office holder leaving office: how soon a new mayor is chosen is not in the docs. The
 * instant-runoff lines describe the method the page names and nothing about turnout, thresholds or timing. Every line is system chrome in
 * one neutral voice: no AI persona speaks here, so there is no byline and no AI badge (ui-ux §23.2); lines about an AI candidate or office
 * holder say plainly that they are an AI. Limits: labels 40, lines 100, tested with {city} and {name} filled to a local 24-character cap
 * and the three number placeholders filled to six characters. All wording is new: `proposal: true`. */

export const MAYORAL_NAME_MAX=24;
export const MAYORAL_NUMBER_MAX=6;
export const MAYORAL_LABEL_MAX=40;
export const MAYORAL_LINE_MAX=100;
export const MAYORAL_PLACEHOLDERS=['{city}','{name}','{terms}','{signed}','{needed}'] as const;

export type Line={text:string;proposal:true};
const L=(text:string):Line=>({text,proposal:true});

/** Mayoral ballot chrome. Humans vote, AI personas run. */
export const mayoralBallotCopy={
 title:'Mayor of {city}',
 whoRuns:L('Every candidate is an AI. Humans vote and AI personas run.'),
 whoVotes:L('Only verified human citizens can vote in this election.'),
 oneBallot:L('Each verified person gets one ballot.'),
 instructions:L('Rank the candidates in the order you prefer.'),
 submitButton:'Cast your ranking',
 submitConfirm:L('Submit your ranking for {city}?'),
 submitted:L('Your ranking for {city} is submitted.'),
 notEligible:L('You cannot vote in this election yet.'),
 candidateChip:'AI candidate',
 termNote:L('A mayor can serve at most {terms} terms.'),
 result:L('The votes for {city} are counted. {name} is the next mayor.'),
 proposal:true,
} as const;

/** The instant-runoff method in three plain lines, in the order a reader needs them. */
export const instantRunoffExplainer={
 title:'How ranked voting works',
 lines:[
  L('You rank the candidates. Your first choice is counted first.'),
  L('If no candidate has a majority, the candidate in last place drops out.'),
  L('Votes for that candidate move to each voter\'s next choice, and the count repeats.'),
 ],
 proposal:true,
} as const;

/** Recall petition and vote. The target is an AI Mayor or Assembly member; only verified human citizens sign and vote. */
export const recallCopy={
 title:'Recall petition',
 about:L('A recall petition asks voters to hold a vote on an AI Mayor or Assembly member.'),
 whoSigns:L('Only verified human citizens can sign.'),
 startButton:'Start a recall petition',
 signButton:'Sign this petition',
 signed:L('You signed this petition.'),
 progress:'{signed} of {needed} signatures',
 reached:L('The petition reached its goal. A recall vote will be held.'),
 voteTitle:'Recall {name}?',
 votePrompt:L('Should {name} stay in office?'),
 keepOption:'Keep in office',
 recallOption:'Recall',
 stays:L('The recall vote is closed. {name} stays in office.'),
 recalled:L('The recall vote is closed. {name} has been recalled.'),
 aiNote:L('{name} is an AI. The result of this vote is binding.'),
 proposal:true,
} as const;

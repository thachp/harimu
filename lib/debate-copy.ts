/** Kindle presidential debate copy: moderator framing, question intake, fact-check panel and candidate fallback lines
 * (issue #285, companion to SDE #282). Content only: #282 owns intake, voting, question selection, the gateway call,
 * the validator and the transcript; no UI imports this. Canon: harimu-docs politics/elections §9.4 (Debates row:
 * citizen questions ranked by up-votes, one vote per Tier-1 citizen; AI candidates answer in character, constrained to
 * their platform and the digest; a fact-check panel shows the system's true figures beside any claim), the Kindle
 * Republic page, MVP scope §27, and the #237 Kindle press voice (plain, argumentative, officials questioned).
 *
 * Rules: no figures (the question count, length cap and vote rules stay in #282; "Tier-1" is the docs' tier name).
 * Fallback lines name only pledges on that candidate's platform card (lib/kindle-parties.ts, #257/#262) and quote
 * the card text exactly. No endorsing body is named. Candidates are AI; "Notable" is not used. Runtime names are
 * placeholders capped at DEBATE_NAME_MAX (#282 to enforce). All wording is new: `proposal: true`. */



export const DEBATE_PLACEHOLDERS=['{candidate}'] as const;
/** Worst-case length of a filled runtime name (same 24-character cap ARC set on #288). #282 should enforce it. */
export const DEBATE_NAME_MAX=24;
export const DEBATE_LABEL_MAX=40;
export const DEBATE_BODY_MAX=140;

export type Line={text:string;proposal:true};
const L=(text:string):Line=>({text,proposal:true});

export const moderatorCopy={
 open:[
  L('Welcome to the presidential debate. Citizens asked the questions; the candidates answer them here, in public.'),
  L('Tonight the Republic asks and the candidates answer. Every claim is checked against the system\'s own figures.'),
  L('This is the citizens\' debate. The questions with the most up-votes come first, and each candidate answers.'),
 ],
 questionIntro:[
  L('The next question comes from a citizen.'),
  L('Citizens up-voted this question. Candidates, please answer.'),
  L('Here is the next question from the public.'),
 ],
 close:[
  L('That ends the debate. The transcript and the fact-check panel stay open for every voter to read.'),
  L('Thank you, candidates. The ballot is yours to cast, voters. Read the transcript before you do.'),
  L('The debate is over. Check the claims, compare the platforms, and make up your own mind.'),
 ],
 proposal:true,
} as const;

export const questionIntakeCopy={
 submitLabel:'Ask the candidates',
 submitPrompt:L('Ask the candidates a question for the debate. Keep it to public game issues and leave out personal details.'),
 submitButton:'Submit question',
 upvoteButton:'Up-vote',
 upvoteHint:L('Up-vote the questions you want asked. The questions with the most up-votes are put to the candidates.'),
 alreadyVoted:L('You have already up-voted this question. Each citizen gets one vote per question.'),
 notEligible:L('Only Tier-1 verified citizens can submit or up-vote debate questions. Verify your account to take part.'),
 moderationRejected:L('This question was not accepted because it broke the moderation rules. Edit it and try again.'),
 submitted:L('Your question is in. Other citizens can now up-vote it.'),
 proposal:true,
} as const;

export const factCheckCopy={
 panelTitle:'Fact check',
 labels:{claim:'Claim',systemFigure:'System figure',matches:'Matches',differs:'Differs'},
 explainer:L('Beside each claim that names a tracked figure, the panel shows the system\'s true figure.'),
 proposal:true,
} as const;

/** One neutral line per candidate when the AI answer is unavailable (gateway down or budget spent). Each line quotes
 * only that candidate's platform-card pledges; `pledges` lists the keys it quotes so the test can check them. */
export type FallbackLine={candidateId:string;text:string;pledges:readonly string[];proposal:true};
const fb=(candidateId:string,pledges:string[],text:string):FallbackLine=>({candidateId,text,pledges,proposal:true});
export const fallbackLines:readonly FallbackLine[]=[
 fb('ines-varro',['jobs-full-employment'],'{candidate}\'s live answer is unavailable. Platform card: "A job for every Resident who wants one".'),
 fb('tobin-achterberg',['tax-lower-income','trade-open-markets'],'{candidate}\'s live answer is unavailable. Platform card: "Lower the income tax", "Open the markets to every trader".'),
 fb('mara-quell',['housing-public','frontier-docks'],'{candidate}\'s live answer is unavailable. Platform card: "Build public housing", "Build new docks at Brasswell Port".'),
];
export const fallbackNotice:Line=L('Live AI answers are unavailable right now, so each candidate\'s platform card is shown instead.');

export function fallbackFor(candidateId:string){return fallbackLines.find(f=>f.candidateId===candidateId);}

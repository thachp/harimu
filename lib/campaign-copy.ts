/** Kindle primaries, town hall and canvassing copy (issue #300). Content only: nothing here is mechanics (membership,
 * dues, ranking, question selection, quest rewards all belong to the SDE work) and no UI imports this. Canon:
 * harimu-docs politics/elections §9.1 (Primaries: "Human party members vote among the AI hopefuls (instant-runoff); AI
 * citizens do not vote in primaries"; Campaign: town halls and human volunteers' canvassing quests), §9.4 (AI parties
 * and members; Town halls: asynchronous Q&A, citizens post questions, the candidate answers the top-ranked ones; Ground
 * game: canvassing raises a candidate's visibility in districts, "visibility, not votes"), citizens-daily-loops (Kindle
 * loop: "canvass for your AI party") and the #237 Kindle press voice.
 *
 * Rules: no figures. The town-hall window, question count and petition threshold stay in the mechanics; no method is
 * named for the primary count or the question ranking. No line says or implies canvassing changes votes or that AI
 * citizens vote in primaries. No rewards or currency language (§9.3: incentives are cosmetic). Hopefuls and candidates
 * are AI and carry an AI flag; nobody is quoted. Party names come only from the {party} placeholder. No endorsing body,
 * no "Notable", no real-world references. Placeholders ({hopeful}, {party}, {candidate}, {district}) are capped by the
 * shared name cap, which this module re-exports (COUP_NAME_MAX from lib/palace-coup-copy.ts). All wording is new:
 * `proposal: true`. */

export { COUP_NAME_MAX as CAMPAIGN_NAME_MAX } from './palace-coup-copy';

export const CAMPAIGN_PLACEHOLDERS=['{hopeful}','{party}','{candidate}','{district}'] as const;
export const CAMPAIGN_LABEL_MAX=40;
export const CAMPAIGN_BODY_MAX=140;

export type Line={text:string;proposal:true};
const L=(text:string):Line=>({text,proposal:true});

export const primariesCopy={
 title:'Party primaries',
 explainer:[
  L('Primaries are for party members. Rank your party\'s AI hopefuls in the order you prefer.'),
  L('AI citizens do not vote in primaries. Only human party members do.'),
  L('The hopeful who comes out ahead becomes the party\'s nominee for the presidency.'),
 ],
 hopefulCard:{
  nameLine:L('{hopeful}'),
  partyLine:L('Party: {party}'),
  intro:L('AI hopeful for {party}. Read the platform, then rank your choice.'),
  aiBadge:true,
 },
 nomineeAnnounced:[
  L('Party members have chosen {hopeful} as the {party} nominee.'),
  L('{hopeful} is the {party} nominee. The campaign begins.'),
  L('The primary is over. {hopeful} will carry the {party} banner.'),
 ],
 proposal:true,
} as const;

export const townHallCopy={
 title:'Town hall',
 callForQuestions:[
  L('The town hall is open. Post your question for {candidate}, and read what others have asked.'),
  L('Citizens, ask {candidate} what matters to you. Questions are open for the town hall.'),
  L('Questions for {candidate} are open. Keep them to public issues.'),
 ],
 questionsClosed:[
  L('Questions for {candidate} are closed. The top-ranked questions will be answered.'),
  L('The town hall is no longer taking questions. {candidate} will answer the top-ranked ones.'),
  L('Questions are closed. Next, {candidate} answers the questions ranked highest.'),
 ],
 answersIntro:[
  L('{candidate} now answers the top-ranked questions from citizens.'),
  L('Here are {candidate}\'s answers to the questions citizens ranked highest.'),
  L('The town hall answers begin. {candidate} responds to the top-ranked questions.'),
 ],
 aiDisclosure:L('{candidate} is an AI candidate. These answers are AI-generated.'),
 aiBadge:true,
 proposal:true,
} as const;

export const canvassingCopy={
 questTitle:'Canvass for your party',
 tasks:[
  L('Walk your district and meet your neighbors.'),
  L('Share the platform card of {candidate} and explain its pledges.'),
  L('Listen to what your neighbors ask of {party}.'),
 ],
 note:L('Canvassing builds visibility, not votes.'),
 completion:L('Quest complete. {candidate} is more visible in {district}.'),
 proposal:true,
} as const;

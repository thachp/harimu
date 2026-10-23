/** Army unit, join-a-unit, squad stance and supply copy for Kindle, Korund and Aurelle (issue #580). Content only: armies, movement,
 * logistics and battles are other work, and nothing imports this module. Canon: harimu-docs territory-cities-warfare §15.3 (Armies: units
 * are produced from arms, food and conscripts or volunteers; AI officers command stacks; human soldiers join units, and their shifts,
 * drills and squad stances raise unit strength and morale. Logistics: units need supply lines from depots, and cut supply lines reduce
 * strength each game day. Resolution: battles are resolved server-side in rounds every 10 real minutes, from strength, terrain, fortification,
 * supply, morale, AI commander decisions and human soldiers' squad stances, with no twitch combat) and §21.2 (stylized, invented, no real
 * militaries or atrocities). The war, siege, weariness and protections copy modules cover declarations, sieges and the home front; nothing
 * here repeats them.
 *
 * Voice: controls, labels and helpers are plain system lines in one voice for every nation. Only the supply-cut and supply-restored captions
 * have a hint of each nation's voice (Kindle plain, Korund calm and collective, Aurelle formal), with no byline, no officials and no
 * "Be it known". Battle lines are short and calm: no gore, no casualties and no real unit or army names. Badge rule (#381 / ui-ux §23.2):
 * the three officer orders speak for an AI officer, so they carry the AI badge; every other line, including the unit card's commander
 * label, is a system line and does not.
 *
 * What the docs do not name: the docs say squads have stances and AI commanders use stances, reserves and retreat, but give no stance names,
 * so Hold, Advance and Fall back are neutral proposed labels, and their helpers say only that a stance counts in each round. The
 * "low" supply state is also a proposed label between supplied and cut.
 *
 * Rules: figures come only from the docs (rounds every 10 real minutes); everything else is a pre-formatted placeholder: {unit}, {officer},
 * {reason}, {amount}, {round} and {result}. {amount} is a strength figure and {round} a round number, capped at six characters; the others
 * are capped at a local 24 characters. Limits: labels 40, lines 100, captions 80. All wording is new: `proposal: true`. */

export const ARMY_NAME_MAX=24;
export const ARMY_NUMBER_MAX=6;
export const ARMY_LABEL_MAX=40;
export const ARMY_LINE_MAX=100;
export const ARMY_CAPTION_MAX=80;
export const ARMY_PLACEHOLDERS=['{unit}','{officer}','{reason}','{amount}','{round}','{result}'] as const;
export const ARMY_NUMBER_PLACEHOLDERS=['{amount}','{round}'] as const;
/** The docs' round length (§15.3). */
export const ARMY_ROUND_MINUTES=10;

export type Line={text:string;proposal:true};
export type OfficerLine={text:string;aiBadge:true;proposal:true};
export type ArmyNation='kindle'|'korund'|'aurelle';
export type SupplyState='supplied'|'low'|'cut';
export type Stance='hold'|'advance'|'fall_back';
export const ARMY_NATIONS:readonly ArmyNation[]=['kindle','korund','aurelle'];
export const SUPPLY_STATES:readonly SupplyState[]=['supplied','low','cut'];
export const STANCES:readonly Stance[]=['hold','advance','fall_back'];

const L=(text:string):Line=>({text,proposal:true});
const O=(text:string):OfficerLine=>({text,aiBadge:true,proposal:true});

/** The unit card: labels (40), the supply states, and the commander label that says the officer is an AI. */
export const unitCard={
 title:'{unit}',
 strengthLabel:'Strength',
 moraleLabel:'Morale',
 supplyLabel:'Supply',
 supplyStates:{supplied:'Supplied',low:'Low supply',cut:'Supply cut'} as Readonly<Record<SupplyState,string>>,
 commanderLabel:'Commander: {officer} (AI)',
 memberCountLabel:'Members',
 proposal:true,
} as const;

/** Three short orders spoken by the AI officer. Badged: they speak for an AI. */
export const officerOrders:readonly OfficerLine[]=[
 O('Stay with your unit. We move together.'),
 O('Keep your place and watch your supply.'),
 O('Rest when you can. The next round is coming.'),
];

/** Join and leave a unit. */
export const unitMembership={
 joinButton:'Join a unit',
 leaveButton:'Leave unit',
 joinConfirm:L('Join {unit}?'),
 leaveConfirm:L('Leave {unit}?'),
 joined:L('You joined {unit}.'),
 left:L('You left {unit}.'),
 drillsHelper:L('Your drills raise the unit\'s strength and morale.'),
 // #738 slice 2 (proposal, for Content): the drill button and its two outcomes.
 drillButton:'Drill with your unit',
 drilled:L('You drilled with {unit}.'),
 drilledToday:L('You already drilled this game day.'),
 // #738 slice 3: PLACEHOLDER copy, marked for Content (proposal: true), not final wording. A conscript's call-up note; Leave is hidden until the term ends.
 calledUp:L('You were called up to serve in {unit}. You can leave when your term ends.'),
 // PLACEHOLDER copy, marked for Content (proposal: true): staying in the unit after the term (ARC on #839).
 stayButton:'Stay after my term',
 stayed:L('You will stay in {unit} after your term.'),
 // PLACEHOLDER copy, marked for Content (proposal: true): a refused stay (not a conscript, or the term already ended) (#738 stay-error follow-up).
 stayRefused:L('You cannot stay in {unit}: you are not serving a term right now.'),
 // Content (#887 follow-up), docs §15.3 Logistics: units need supply lines from depots; a cut line lowers strength each game day.
 // {pct} is the server's loss figure. Depot (the capital), range, daily rate and the half-strength cap were approved by ARC on #897 (lib/army-supply.ts); the card names only the cap.
 supplyCut:L('Supply line cut. Strength is down {pct}% and drops each game day the line stays cut, to at most half.'),
 supplyCutLegend:L('supply line cut, strength down {pct}%'),
 notEligible:L('You cannot join this unit: {reason}'),
 notOpenYet:L('This unit is not taking volunteers yet.'),
 actionFailed:L('Your unit change did not go through: {reason}'),
 proposal:true,
} as const;

/** QA3 on #793: a failed join explains eligibility; a failed leave or stance uses the neutral template, never the join wording. */
export const armyFailureNote=(action:'join'|'leave'|'stance',unitName:string,reason:string)=>
 (action==='join'?unitMembership.notEligible.text:unitMembership.actionFailed.text).replace(/\{unit\}/g,unitName).replace(/\{reason\}/g,reason);

/** Squad stance labels (40) and one-line helpers (100). Neutral names: the docs name no stances. */
export const squadStance={
 label:'Squad stance',
 labels:{hold:'Hold',advance:'Advance',fall_back:'Fall back'} as Readonly<Record<Stance,string>>,
 helpers:{
  hold:L('Hold: your squad stays where it is.'),
  advance:L('Advance: your squad presses forward.'),
  fall_back:L('Fall back: your squad pulls back.'),
 } as Readonly<Record<Stance,Line>>,
 oneInput:L('Your stance counts in every battle round.'),
 proposal:true,
} as const;

/** Supply notices. The daily strength loss is neutral; cut and restored captions have a hint of each nation's voice (captions 80; the daily loss is a line, 100). */
export const supplyNotices={
 cut:{
  kindle:L('Supply is cut. The unit is on its own.'),
  korund:L('The supply line is cut. The brigade waits for relief.'),
  aurelle:L('The supply line is cut. The company is without provisions.'),
 } as Readonly<Record<ArmyNation,Line>>,
 restored:{
  kindle:L('Supply is back. The unit is supplied again.'),
  korund:L('The supply line is open. The brigade is supplied.'),
  aurelle:L('The supply line is open. The company has its provisions.'),
 } as Readonly<Record<ArmyNation,Line>>,
 dailyLoss:L('{unit} loses {amount} strength each game day while supply is cut.'),
 proposal:true,
} as const;

/** The battle round summary and a one-line explainer (rounds every 10 real minutes, §15.3). */
export const battleRound={
 summary:L('Round {round}: {result}'),
 explainer:L('Battles are resolved in rounds every 10 real minutes.'),
 proposal:true,
} as const;

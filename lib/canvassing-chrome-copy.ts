/** Canvassing panel chrome for the Kindle canvassing PoC: the labels the panel still marks as placeholders (issue #503). Content only; nothing
 * imports this until the panel's placeholder strings are swapped. The quest title, tasks, note and completion line stay in the separate
 * campaign copy module and are not repeated here. Canon: harimu-docs elections §9.4 Campaign systems ("ground game: visibility, not votes")
 * and the citizens' daily loops page (Kindle: canvass for your AI party).
 *
 * Rule for every line: canvassing builds visibility, which is display only. No line says or implies that canvassing changes a vote, a tally
 * or a result; the lines that touch on visibility say it is not votes. Cost is a runtime value ({cost}, Work Capacity as the existing cost),
 * and the per-district count is {points}; no figure is written into any line. System chrome: no byline and no AI badge.
 *
 * Placeholders: {party}, {candidate} and {district} are runtime names capped by the shared name cap, which this module re-exports
 * (COUP_NAME_MAX from the palace coup copy module); {cost} and {points} are whole numbers, tested at six characters. Limits: labels 40,
 * lines 80, bodies 140, tested with every placeholder filled to its cap. All wording is new: `proposal: true`. */

export { COUP_NAME_MAX as CANVASS_NAME_MAX } from './palace-coup-copy';

export const CANVASS_PLACEHOLDERS=['{party}','{candidate}','{district}','{cost}','{points}'] as const;
export const CANVASS_NUMBER_MAX=6;
export const CANVASS_LABEL_MAX=40;
export const CANVASS_LINE_MAX=80;
export const CANVASS_BODY_MAX=140;

export type Line={text:string;proposal:true};
const L=(text:string):Line=>({text,proposal:true});

/** Before the citizen has joined a party. */
export const canvassJoin={
 heading:'Canvassing',
 prompt:L('Join a party to canvass for its candidate.'),
 note:L('Canvassing builds visibility, which is display only. It is not votes.'),
 proposal:true,
} as const;

/** The two buttons: a visible label and a longer accessible name. */
export const canvassActions={
 start:{label:'Start canvassing',accessibleName:'Start canvassing for {party}'},
 finish:{label:'Finish canvassing',accessibleName:'Finish canvassing for {party}'},
 timerLabel:'Quest finishes',
 proposal:true,
} as const;

/** Where, how much and when again. */
export const canvassStatus={
 district:L('Your district: {district}.'),
 cost:L('Canvassing costs {cost} Work Capacity.'),
 cooldown:L('Come back tomorrow.'),
 proposal:true,
} as const;

/** The visibility section: display only, never votes. */
export const canvassVisibility={
 ariaLabel:'Candidate visibility',
 heading:'Visibility for {candidate}',
 row:L('{district}: {points}'),
 empty:L('No visibility yet. Canvassing builds visibility, not votes.'),
 note:L('Visibility is display only. It does not count as votes.'),
 proposal:true,
} as const;

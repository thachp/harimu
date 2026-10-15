/** Closed-nation copy for the seven-nations Stage 0 (issue #504): the "Coming soon" label for a nation that is not open, the refusal when a
 * player tries to enroll in or change to it, a one-line stylized reason, and a line that existing citizenship is unchanged. Content only;
 * nothing imports this until the enroll gate and the world strip swap in their wording. Canon: seven-nations Stage 0 (the three live
 * nations are open; the rest are closed for now) and the nation discovery "Coming soon" strip.
 *
 * Voice: system lines only, the same for every closed nation. No byline, no AI badge, no nation-in-character refusal, and no line is spoken
 * by a leader or an outlet. Out of character where it is a refusal. The nation is named only through {nation}, a runtime name capped by the
 * shared name cap, which this module re-exports (COUP_NAME_MAX from the palace coup copy module), so no nation or real-world country is
 * written into any line.
 *
 * Rules: no figure and no promise of an opening date; "coming soon" appears only in the label and its accessible name, and no line says
 * when or whether a nation will open. Limits: labels 40, lines 80, bodies 140, tested with {nation} filled to 24 characters. All wording is
 * new: `proposal: true`. */

export { COUP_NAME_MAX as OPENING_NAME_MAX } from './palace-coup-copy';

export const OPENING_PLACEHOLDERS=['{nation}'] as const;
export const OPENING_LABEL_MAX=40;
export const OPENING_LINE_MAX=80;
export const OPENING_BODY_MAX=140;

export type Line={text:string;proposal:true};
const L=(text:string):Line=>({text,proposal:true});

/** The strip label, with a longer accessible name. */
export const nationComingSoon={
 label:'Coming soon',
 accessibleName:L('{nation} is coming soon. It is not open to join yet.'),
 proposal:true,
} as const;

/** The refusals. `generic` carries no name, for a place that cannot fill {nation}. */
export const nationClosedRefusals={
 enroll:L('{nation} is not open yet. You cannot enroll there now.'),
 change:L('{nation} is not open yet. You cannot change to it now.'),
 generic:L('That nation is not open yet.'),
 proposal:true,
} as const;

/** One stylized line on why, and the reassurance for players already in a nation. */
export const nationClosedWhy={
 why:L('In this world, nations open over time.'),
 unchanged:L('Your citizenship is unchanged.'),
 proposal:true,
} as const;

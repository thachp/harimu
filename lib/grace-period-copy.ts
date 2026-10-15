/** Citizenship grace-period copy: the Change nation button, countdown caption, confirmation, the three locked reasons, what ends the grace period,
 * the lifetime-change line and the done line (issue #498). Content only; nothing imports this until the existing screens swap their literals.
 * Canon: harimu-docs overview/core-concepts §5.2 ("a single free nation change within the first 48 real hours and before the citizen performs any
 * political action"; the Change nation button with a countdown disappears at the first political action or after 48 hours; the citizen is
 * re-created in the new nation and purchased cosmetics are kept; it does not count as the lifetime change), decisions-log row 26 and the MVP scope
 * integrity row (48-hour nation-change grace period).
 *
 * Voice: one neutral system voice, the same in every nation. No byline, no AI badge, no nation voice. The locked-reason keys match the three the
 * citizenship status already tracks (political-action, change-used, grace-expired); a test keeps them in step with the app's type.
 *
 * Rules: the only figure is the docs' 48 real hours, written only in the window line and the expired line; the end time comes only through
 * {endsAt}, a pre-formatted string, and the new nation through {nation}. The list of actions that end the grace period is the docs' list and nothing
 * more: a vote, a petition signature, a pledge, joining a party, holding congregation office. Nothing about the lifetime change limit beyond the docs'
 * one line, and nothing about immigration or asylum. The runtime values are capped by the shared name cap, which this module re-exports
 * (COUP_NAME_MAX from the palace coup copy module). Limits: labels 40, lines 80, bodies 140, tested with every placeholder filled to 24
 * characters. All wording is new: `proposal: true`. */

export { COUP_NAME_MAX as GRACE_NAME_MAX } from './palace-coup-copy';

export const GRACE_PLACEHOLDERS=['{endsAt}','{nation}'] as const;
export const GRACE_LABEL_MAX=40;
export const GRACE_LINE_MAX=80;
export const GRACE_BODY_MAX=140;
/** The docs' figure (core concepts §5.2), real hours. */
export const GRACE_PERIOD_HOURS=48;

export type Line={text:string;proposal:true};
export type GraceLockedReason='political-action'|'change-used'|'grace-expired';
export const GRACE_LOCKED_REASONS:readonly GraceLockedReason[]=['political-action','change-used','grace-expired'];

const L=(text:string):Line=>({text,proposal:true});

/** The button, its countdown caption and the window line. */
export const graceButton={
 label:'Change nation',
 accessibleName:'Change nation: a single free change',
 countdown:L('Free nation change until {endsAt}.'),
 window:L('Your free nation change lasts for the first 48 real hours, or until your first political action.'),
 proposal:true,
} as const;

/** The confirmation. */
export const graceConfirm={
 prompt:L('Change your nation now? This uses your single free change, and you are re-created in the new nation.'),
 confirm:'Confirm change',
 cancel:'Stay in my nation',
 proposal:true,
} as const;

/** One plain line per locked reason, under the keys the app tracks. */
export const graceLocked:Record<GraceLockedReason,Line>={
 'political-action':L('Locked: your first political action ended the grace period.'),
 'change-used':L('Locked: your single free change has already been used.'),
 'grace-expired':L('Locked: the 48-hour grace period has ended.'),
};

/** What ends the grace period (the docs' list), what the change does and does not cost, and the done line. */
export const graceExplainer={
 endsOn:L('A vote, a petition signature, a pledge, joining a party or holding congregation office ends the grace period.'),
 lifetime:L('This change does not count as your lifetime change. Purchased cosmetics are kept.'),
 done:L('Your nation has changed. You are now a citizen of {nation}.'),
 proposal:true,
} as const;

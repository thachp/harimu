/** War protections copy (issue #421, docs §15.4). Content only: the world and SDE lanes own evacuation, the housing voucher, wounded
 * recovery, the newcomer shield and the foundation truce, and no UI imports this. Canon: harimu-docs territory-cities-warfare §15.4
 * (citizens are never killed; soldiers whose units are destroyed are wounded, out of action for 1-3 real days, and keep their gear
 * insurance; homes and personal belongings are never looted; if a city is captured its citizens are evacuated to the nearest home city,
 * keep their personal items and receive a housing voucher; new
 * citizens cannot be conscripted for 14 real days; newly founded cities have a 10-real-day foundation truce) and §15.3 (sieges), plus Decision 109 (private land titles stay with their owners and existing leases are honored; funded
 * relocation support and voluntary buyouts replace the earlier blanket compensation promise, and no compensation is promised without a
 * budget; funding caps and amounts are open). #470 slice 1 adds dedicated relocationSupport and landBuyout lines (Tessera only, no funds when
 * the pot is empty, voluntary buyout) that stay unwired. Companion to the two `citizenSafety` lines in lib/war-copy.ts (#312): these lines say the same things and never contradict them
 * (a test loads both).
 *
 * Voice: plain, calm, non-graphic system notices. They have no byline and no AI voice, so none is AI-badged.
 *
 * Rules: the only figures are the docs' 14 real days (newcomer shield) and 10 real days (foundation truce), each in its own lines. The
 * wounded length comes only through {days}, a pre-formatted string that already carries its unit, so the docs' 1-3 range is never
 * written in. No compensation is promised: relocation support is only offered, any buyout is
 * voluntary, and no share, percentage or payment for land is written. Support and buyouts are Tessera only and never convertible.
 * {city} is the captured or newly founded city, {safeCity} the nearest home city; both are runtime values capped by the shared name cap, which this module
 * re-exports (COUP_NAME_MAX from lib/palace-coup-copy.ts). Limits: labels 40, lines 80, tested with every placeholder filled to 24
 * characters. Capture, conscription and truce mechanics are not described beyond the docs. All wording is new: `proposal: true`. */

export { COUP_NAME_MAX as PROTECTIONS_NAME_MAX } from './palace-coup-copy';

export const PROTECTIONS_PLACEHOLDERS=['{city}','{safeCity}','{days}'] as const;
export const PROTECTIONS_LABEL_MAX=40;
export const PROTECTIONS_LINE_MAX=80;
/** The docs' two figures (§15.4), real days. */
export const NEWCOMER_SHIELD_DAYS=14;
export const FOUNDATION_TRUCE_DAYS=10;

export type Line={text:string;proposal:true};
const L=(text:string):Line=>({text,proposal:true});

/** Reminders that align with `citizenSafety` in lib/war-copy.ts: never killed, never looted, wounded and insured. */
export const safetyReminders=[
 L('In war, citizens are never killed. Your home is never looted.'),
 L('Wounded, not killed. Your gear insurance still applies.'),
] as const;

/** On city capture: the citizen is evacuated and keeps personal items; land stays with its owner; relocation support may be offered and any buyout is voluntary (Decision 109). */
export const evacuation={
 headline:'You were moved to safety',
 notice:[
  L('{city} fell. You were moved to {safeCity}.'),
  L('You were evacuated from {city} to {safeCity}.'),
 ],
 belongings:L('Your home was not looted. Your personal items are safe.'),
 title:L('Your land stays yours, and existing leases are honored.'),
 relocation:L('Relocation support may be offered. Any buyout is voluntary.'),
 proposal:true,
} as const;

/** Housing voucher: label and explainer. */
export const housingVoucher={
 label:'Housing voucher',
 explainer:[
  L('A housing voucher was issued for {safeCity}.'),
  L('Use your housing voucher to settle in {safeCity}.'),
 ],
 proposal:true,
} as const;

/** Wounded: status, return-to-duty notice. The length is {days} only (the docs give a range of real days, not written here). */
export const wounded={
 label:'Wounded',
 status:[
  L('You are wounded and out of action. You return in {days}.'),
  L('Wounded, not killed. Back on duty in {days}.'),
 ],
 returned:L('Your wounds have healed. You are back on duty.'),
 proposal:true,
} as const;

/** Newcomer shield (docs: 14 real days). */
export const newcomerShield={
 label:'Newcomer shield',
 banner:L('Newcomer shield: no conscription for 14 real days.'),
 explainer:L('New citizens cannot be conscripted for 14 real days.'),
 ended:L('Your newcomer shield has ended.'),
 proposal:true,
} as const;

/** Foundation truce on a newly founded city (docs: 10 real days). */
export const foundationTruce={
 label:'Foundation truce',
 notice:L('{city} is newly founded. No assaults on it for 10 real days.'),
 ended:L('The foundation truce on {city} has ended.'),
 proposal:true,
} as const;

/** Relocation support (#470 / Decision 109): Tessera only when a pot is funded; empty pot says so. Unwired until later slices. */
export const relocationSupport={
 label:'Relocation support',
 funded:L('Relocation support, when funded, is in Tessera only.'),
 empty:L('No funds are available for relocation support.'),
 stays:L('Support is Tessera only and is not convertible.'),
 proposal:true,
} as const;

/** Voluntary land buyout (#470 / Decision 109): Tessera offers only; never forced. Unwired until later slices. */
export const landBuyout={
 label:'Land buyout',
 voluntary:L('A land buyout is always voluntary. You may decline.'),
 currency:L('Buyout offers are in Tessera only.'),
 decline:L('Declining a buyout has no penalty.'),
 proposal:true,
} as const;

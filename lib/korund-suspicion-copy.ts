/** Korund Suspicion indicator, Correction Duty status and appeal copy (issue #409, companion to #382). Content only: #382 owns Suspicion
 * state and Correction Duty, and no UI imports this. Canon: harimu-docs religion-faiths §14.6 (State Security investigates by rule; each
 * discovery adds Suspicion; a first discovery adds Suspicion only; Correction Duty, at most 7 real days, applies only to repeat discoveries;
 * discovery is abstract, State Media may not name believers) and ai-leadership §8.18 (punishments are capped, rule-triggered by Suspicion,
 * appealable, and punished players always keep a playable loop). The appeal result is automatic, decided by rule and not by staff
 * (the ruling on #650), so every appeal line below says so plainly. The `discovery.first` and `discovery.repeat` notices already exist in
 * the separate faith copy module (#322 and #371); nothing here repeats them.
 *
 * Voice: quiet, plain and non-graphic, as #322. No arrest, violence or desecration; no believer is ever named. Lines where State Security
 * itself speaks (the duty banner, the duty-ended line and the three appeal lines) speak for an AI body, so they are AI-badged (#381, ui-ux
 * §23.2): the automatic result is State Security's rule applying, so it says so. Labels, the private tooltip and the days-left caption are plain
 * system notices and are not badged. Korund voice is short and formal, with no warmth and no threat.
 *
 * Rules: Suspicion is private, so the indicator is a label and a pre-formatted {level} word with no number or threshold. The only figure
 * is the docs' seven-day cap on Correction Duty, in one line. The days left come only through {days}, a pre-formatted string that already
 * carries its unit. No appeal odds, delay, window or rule detail is invented. [ASSUMPTION] "once" in the appeal explainer is the one-appeal
 * rule from #650, not a docs figure; confirm it with the docs before this is final. Limits: labels 40, lines 80, tested with every placeholder filled to
 * the shared 24-character name cap, which this module re-exports from the separate palace coup copy module. All wording is new:
 * `proposal: true`. */

export { COUP_NAME_MAX as SUSPICION_NAME_MAX } from './palace-coup-copy';

export const SUSPICION_PLACEHOLDERS=['{level}','{days}'] as const;
export const SUSPICION_LABEL_MAX=40;
export const SUSPICION_LINE_MAX=80;

export type Line={text:string;proposal:true};
export type OrganLine={text:string;aiBadge:true;proposal:true};
export type AppealKey='granted'|'denied';
const L=(text:string):Line=>({text,proposal:true});
const O=(text:string):OrganLine=>({text,aiBadge:true,proposal:true});

export const APPEAL_KEYS:readonly AppealKey[]=['granted','denied'];

/** Private Suspicion indicator: a label, a private tag, a level line and a short tooltip. Labels only. */
export const suspicionIndicator={
 label:'Suspicion',
 privateTag:'Private to you',
 levelLine:'Suspicion: {level}',
 tooltip:[
  L('State Security keeps a private record. Only you can see it.'),
  L('Each inspection that finds a shrine adds to it. Nobody else sees it.'),
 ],
 proposal:true,
} as const;

/** Correction Duty status while it runs. The banner speaks for State Security (badged); the rest are system lines. */
export const correctionDuty={
 label:'Correction Duty',
 daysLeft:'Days left: {days}',
 banner:O('State Security: you are on Correction Duty.'),
 /** Docs §14.6: only a repeat discovery leads to it; §8.18: the cap, and a playable loop is always kept. */
 repeatOnly:L('Only a repeat discovery leads to Correction Duty.'),
 cap:L('Correction Duty lasts at most 7 real days.'),
 playable:L('You can still play and work while on Correction Duty.'),
 proposal:true,
} as const;

/** Appeal: button, explainer and the two results. The result is automatic (§8.18, #650), so there is no submitted or pending state, and
 * every line is State Security's rule speaking: badged. */
export const appeal={
 button:'Appeal',
 explainer:O('State Security: you may appeal once. The result is decided automatically.'),
 states:{
  granted:O('State Security: appeal decided automatically. Correction Duty is lifted.'),
  denied:O('State Security: appeal decided automatically. Correction Duty stands.'),
 } as Readonly<Record<AppealKey,OrganLine>>,
 proposal:true,
} as const;

/** Duty-ended notices: one in State Security's voice (badged), one plain system line. */
export const dutyEnded={
 organ:O('State Security: your Correction Duty has ended.'),
 system:L('Correction Duty has ended. You may carry on as before.'),
 proposal:true,
} as const;

export const appealStateFor=(key:AppealKey)=>appeal.states[key];

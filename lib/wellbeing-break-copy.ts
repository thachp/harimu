/** Break reminder, personal time limit and take-a-break reassurance copy (issue #537). Content only; nothing imports this until the reminder timer
 * and the settings exist. Canon: harimu-docs vision/wellbeing-responsibility, "Time and wellbeing tools" (approved design: optional session
 * reminders and personal time limits, break reminders and easy notification controls; a world that does not punish absence; offline players are
 * protected; no streak penalties or fear-of-missing-out mechanics; easy ways to take a break, pause or leave without losing your identity).
 * The docs leave metrics, consent, retention and intervention procedures open, so this is wording only and claims nothing beyond the page.
 *
 * Voice: one neutral system voice, the same in every nation. No byline, no AI badge, no nation voice. Plain and kind, never judging how long
 * someone plays and never pressing them to stay: the player decides. No clinical or health claims. The word "streak", urgency and
 * fear-of-missing-out wording are kept out of every line, and a test scans for them.
 *
 * Rules: no figure is written into any line: the reminder interval is {interval} and the daily limit is {limit}, both pre-formatted by the code
 * (for example a length of time). The runtime values are capped by the shared name cap, which this module re-exports (COUP_NAME_MAX from the
 * palace coup copy module). Limits: labels 40, lines 80, bodies 140, tested with every placeholder filled to 24 characters. All wording is new:
 * `proposal: true`. */

export { COUP_NAME_MAX as BREAK_NAME_MAX } from './palace-coup-copy';

export const BREAK_PLACEHOLDERS=['{interval}','{limit}'] as const;
export const BREAK_LABEL_MAX=40;
export const BREAK_LINE_MAX=80;
export const BREAK_BODY_MAX=140;

export type Line={text:string;proposal:true};
const L=(text:string):Line=>({text,proposal:true});

/** Settings: each control has a label and a one-line help. Both are optional features. */
export const breakSettings={
 sessionReminder:{label:'Session reminders',help:L('Optional. Get a gentle reminder to take a break while you play.')},
 intervalLabel:'Remind me every {interval}',
 timeLimit:{label:'Personal time limit',help:L('Optional. Set a daily limit for yourself.')},
 limitLabel:'Daily limit: {limit}',
 proposal:true,
} as const;

/** The break reminder: a short title, a few kind variants (rotate them), and two actions. */
export const breakReminder={
 title:'Time for a break?',
 bodies:[
  L('You have been playing for a while. Your world will be here when you come back.'),
  L('A good moment to stretch, have some water or rest your eyes.'),
  L('Take a break if you would like to. Your citizen will be here when you return.'),
  L('Resting is part of playing. Come back whenever you are ready.'),
 ] as readonly Line[],
 actions:{keepPlaying:'Keep playing',takeBreak:'Take a break'},
 proposal:true,
} as const;

/** The time-limit notice: same two actions, and where to change the limit. */
export const breakLimitNotice={
 title:'You reached your time limit',
 body:L('You set this limit yourself. You can keep playing or take a break.'),
 settingsNote:L('You can change your limit in settings.'),
 actions:{keepPlaying:'Keep playing',takeBreak:'Take a break'},
 proposal:true,
} as const;

/** Reassurance, limited to what the wellbeing page says: leave or pause without losing your identity, absence is not punished, and offline
 * players are protected. */
export const breakReassurance={
 identity:L('You can take a break, pause or leave without losing your identity.'),
 absence:L('Harimu does not punish you for being away, and there is no pressure to log in.'),
 protection:L('Offline players are protected. For example, small balances are shielded from inflation.'),
 proposal:true,
} as const;

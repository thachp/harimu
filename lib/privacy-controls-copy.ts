/** "What we keep and why" explainer and the export, delete and AI-memory control copy (issue #539). Content only; nothing imports this until
 * those controls exist. Canon: harimu-docs vision/wellbeing-responsibility, "Data and privacy" (collect only what the world needs and explain what
 * is stored and why; players can export and delete their data) and "Consent" (players opt in to deeper features such as memory with AI
 * characters and linking real identity; an AI character's memory of a person can be viewed and cleared by that person). The docs still mark the
 * retention rules as needing verification, so no retention period is stated anywhere here.
 *
 * What the explainer lists comes from the game's current database schema, in plain categories and no table names: the account sign-in, the
 * citizen and nation, household and wallet balances, actions in the world, and messages posted in public squares. The schema has no table for
 * player-filed reports and none for stored AI conversation memory, so neither is listed; the AI memory lines describe the control and the opt-in
 * only and claim nothing about what is stored.
 *
 * Voice: one neutral system voice, the same in every nation. No byline, no AI badge, no nation voice, no legal policy text. Plain and calm.
 * Rules: no figure, no retention period and no promise about timing. The typed confirmation word is {confirmWord}, supplied by the code. The runtime
 * value is capped by the shared name cap, which this module re-exports (COUP_NAME_MAX from the palace coup copy module). Limits: labels 40, lines
 * 100, explainer lines 140, tested with the placeholder filled to 24 characters. All wording is new: `proposal: true`. */

export { COUP_NAME_MAX as PRIVACY_NAME_MAX } from './palace-coup-copy';

export const PRIVACY_PLACEHOLDERS=['{confirmWord}'] as const;
export const PRIVACY_LABEL_MAX=40;
export const PRIVACY_LINE_MAX=100;
export const PRIVACY_EXPLAINER_MAX=140;

export type Line={text:string;proposal:true};
const L=(text:string):Line=>({text,proposal:true});

/** The explainer: one line per category the app holds today, each with its reason. */
export const privacyExplainer={
 title:'What we keep and why',
 intro:L('Harimu keeps only what the world needs to run. Here is what is stored, and why.'),
 categories:[
  {key:'account',line:L('Your account sign-in, so you can come back as the same player.')},
  {key:'citizen',line:L('Your citizen and nation, so the world knows who you are in it.')},
  {key:'balances',line:L('Your household and wallet balances, so your money stays correct.')},
  {key:'actions',line:L('Your actions in the world, such as work, trades and civic acts, so results and records are right.')},
  {key:'messages',line:L('Messages you post in public squares, so other players can read them.')},
 ] as readonly {key:'account'|'citizen'|'balances'|'actions'|'messages';line:Line}[],
 proposal:true,
} as const;

/** Export my data. */
export const privacyExport={
 label:'Export my data',
 help:L('Get a copy of the data Harimu keeps about you.'),
 confirmPrompt:L('Export a copy of your data now?'),
 confirm:'Export',
 cancel:'Cancel',
 proposal:true,
} as const;

/** Delete my account: an irreversible-action warning and a typed confirmation. */
export const privacyDelete={
 label:'Delete my account',
 help:L('Delete your account and the data tied to it.'),
 warning:L('This cannot be undone. You will lose access to your citizen and your account.'),
 typedPromptLabel:'Type {confirmWord} to confirm',
 confirm:'Delete my account',
 cancel:'Keep my account',
 proposal:true,
} as const;

/** View and clear what AI characters remember. */
export const privacyAiMemory={
 viewLabel:'What AI characters remember',
 clearLabel:'Clear what AI characters remember',
 help:L('See what AI characters remember about you, and clear it if you want to.'),
 confirmPrompt:L('Clear everything AI characters remember about you?'),
 confirm:'Clear memory',
 cancel:'Cancel',
 cleared:L('Memory cleared.'),
 proposal:true,
} as const;

/** Opt-in toggles for the deeper features the docs name. Each is off unless the player turns it on. */
export const privacyOptIns={
 aiMemory:{label:'AI memory',help:L('Off unless you turn it on. Lets AI characters remember you between conversations.')},
 linkIdentity:{label:'Link real identity',help:L('Off unless you turn it on. Connects your real identity to your account.')},
 proposal:true,
} as const;

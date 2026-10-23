/** Missionary invite flow, outcome toasts, {readyAt} cooldown blocks and host-city feed lines (issue #340, companion to
 * #225 and to lib/missionary-copy.ts from #266). Content only: #225 owns invitations, conversion and cooldowns, and no UI
 * imports this. lib/missionary-copy.ts already holds the per-faith invitation cards, the accept and not-now buttons, the
 * day-count cooldown notices, mute copy and host permission notices; this module adds only what #340 found missing: a
 * generic invite prompt with Accept and Not now labels (the same "Not now" as lib/missionary-copy.ts, #383), a private success toast and a failure toast, cooldown block lines that
 * give the time only through {readyAt}, and one public host-city feed line in the host nation's press voice.
 * Canon: harimu-docs religion-faiths §14.8 (invitations are opt-in; conversion happens only if the citizen accepts; host permission
 * is free in pluralist nations, Kinward Rite only in Aurelle, banned in Korund), §14.3 (conversion prompts are always opt-in),
 * MVP Scope Religion row, and the press voices Kindle (#237, Kindle Press) and the Aurelle Court Gazette (#239).
 *
 * Rules: placeholders are only {readyAt}, {faith} and {city}, all pre-formatted strings; no figure is written here, so no day counts
 * and no conversion counts. No line names a player or says who converted. Private UI lines are nation-neutral and faith-neutral
 * (the faith comes in through {faith}). Korund bans preaching, so there is no public Korund line. Feed lines are plain reports, not
 * the Crown's own voice, so none is AI-badged. Limits: labels 40, lines 80 (ARC's number for this batch), tested with every
 * placeholder filled to the shared 24-character name cap, which this module re-exports (COUP_NAME_MAX from
 * lib/palace-coup-copy.ts). All wording is new: `proposal: true`. */

export { COUP_NAME_MAX as MISSIONARY_NAME_MAX } from './palace-coup-copy';

export const MISSIONARY_PLACEHOLDERS=['{readyAt}','{faith}','{city}'] as const;
export const MISSIONARY_LABEL_MAX=40;
export const MISSIONARY_LINE_MAX=80;

export type Line={text:string;proposal:true};
export type FeedNation='kindle'|'aurelle';
/** A public host-city line with its press byline. `aiBadge` is false: these are reports, not a decree in the Crown's voice. */
export type FeedLine={text:string;byline:{name:string;proposal:boolean};aiBadge:boolean;proposal:true};

export const FEED_NATIONS:readonly FeedNation[]=['kindle','aurelle'];

const L=(text:string):Line=>({text,proposal:true});

/** Private invite prompt for any faith; the per-faith cards stay in lib/missionary-copy.ts. */
export const missionaryInvite={
 prompt:L('A missionary of {faith} invites you. The choice is yours alone.'),
 accept:'Accept',
 notNow:'Not now',
 proposal:true,
} as const;

/** Private toasts after the citizen answers. Neither blames or presses the citizen. */
export const missionaryOutcomes={
 success:L('You joined {faith}. The choice was yours.'),
 declined:L('Invitation declined. Nothing about your faith has changed.'),
 failure:L('The invitation could not be completed. Your faith has not changed.'),
 proposal:true,
} as const;

/** Cooldown blocks: the time arrives pre-formatted in {readyAt}. While one is active, show only the notice (#268). */
export const missionaryCooldowns={
 invitation:L('No new invitation until {readyAt}. You may be invited then.'),
 faithChange:L('You changed faith recently. You can change again after {readyAt}.'),
 proposal:true,
} as const;

/** Public host-city feed line, one per nation that allows public preaching. Korund bans preaching, so it has none. */
export const missionaryFeed:Readonly<Record<FeedNation,FeedLine>>={
 kindle:{text:'A missionary of {faith} preached in {city}.',byline:{name:'Kindle Press',proposal:false},aiBadge:false,proposal:true},
 aurelle:{text:'A missionary of {faith} was heard in {city}.',byline:{name:'Court Gazette',proposal:false},aiBadge:false,proposal:true},
};

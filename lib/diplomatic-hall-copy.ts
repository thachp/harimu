/** Diplomatic Hall copy: tab, channel header, explainer, composer, nation tag, empty state and refusals (issue #600, companion to the
 * Diplomatic Hall proof of concept in #599). Content only: the channel, its flag, the read and post rules and every refusal code belong to
 * the build work, and nothing imports this module. Canon: harimu-docs systems/social-news-media §18.1 (Channels: the global channel is the
 * Diplomatic Hall and Trade Fair channels; Korund citizens cannot see it) and diplomacy-war/trade-diplomacy-sanctions §13.4 (as citizenship is
 * permanent, cross-nation social contact happens in diplomatic halls, trade fairs and the global channel).
 *
 * Voice: one neutral system voice for every line, the same in every nation. There is no byline, no nation voice, no State Media or court
 * framing and no AI character speaking, so nothing here carries the AI badge (#381 / ui-ux §23.2). The Korund refusal says only that the hall is
 * closed to the player's nation: it names no other nation, says nothing about what is said in the hall, and does not hint at how a closed
 * nation could see it. A second, separate refusal covers a nation that loses the channel at a Red Alert (the docs list Varkand), so the
 * closed-nation line is not stretched to cover it. No line says posts are private, and none promises what happens to a post.
 *
 * Rules: no figure is written. The two placeholders are pre-formatted strings filled at runtime: {nation}, a nation name, capped at a local
 * 24 characters, and {max}, the post length limit from the build work (a number, capped at six characters). The refusal keys below are
 * proposed names: the build issue asks for stable codes but has not named them. Limits: labels 40, lines 100, tested with every placeholder
 * filled to its cap. All wording is new: `proposal: true`. */

export const HALL_NAME_MAX=24;
export const HALL_NUMBER_MAX=6;
export const HALL_LABEL_MAX=40;
export const HALL_LINE_MAX=100;
export const HALL_PLACEHOLDERS=['{nation}','{max}'] as const;

export type Line={text:string;proposal:true};
export type HallRefusalKey='nation_closed'|'alert_closed'|'signed_out'|'rate_limit'|'too_long';
export const HALL_REFUSAL_KEYS:readonly HallRefusalKey[]=['nation_closed','alert_closed','signed_out','rate_limit','too_long'];
export type HallRefusal={key:HallRefusalKey;line:Line;proposal:true};

const L=(text:string):Line=>({text,proposal:true});

/** The tab and the channel header (labels, 40). */
export const hallChrome={
 tabLabel:'Diplomatic Hall',
 headerTitle:'The Diplomatic Hall',
 emptyState:L('No posts in the Diplomatic Hall yet.'),
 proposal:true,
} as const;

/** The one-line explainer under the header. The docs give no rule about posting in character or about a nation tag, so nothing here claims one (QA3 note on #606). */
export const hallExplainer={
 line:L('Citizens of the nations in this hall can read and post here.'),
 proposal:true,
} as const;

/** The composer and the nation tag. The tag is a pre-formatted nation name plus a plain word; its accessible name says whose citizen posted. */
export const hallComposer={
 placeholder:'Write to the Diplomatic Hall',
 sendButton:'Post',
 nationTag:{text:'{nation} citizen',accessibleName:'Citizen of {nation}'},
 proposal:true,
} as const;

/** Refusals, one neutral line each, in the order the checks would run. */
export const hallRefusals:readonly HallRefusal[]=[
 {key:'nation_closed',line:L('The Diplomatic Hall is closed to your nation.'),proposal:true},
 {key:'alert_closed',line:L('The Diplomatic Hall is closed to your nation during a Red Alert.'),proposal:true},
 {key:'signed_out',line:L('Sign in as a citizen to use the Diplomatic Hall.'),proposal:true},
 {key:'rate_limit',line:L('You are posting too quickly. Please wait a moment and try again.'),proposal:true},
 {key:'too_long',line:L('That post is too long. Posts can be up to {max} characters.'),proposal:true},
];
export function hallRefusalFor(key:HallRefusalKey){return hallRefusals.find(r=>r.key===key);}

export const diplomaticHallCopy={chrome:hallChrome,explainer:hallExplainer,composer:hallComposer,refusals:hallRefusals,proposal:true} as const;

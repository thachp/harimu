/** "Need support?" panel and AI distress fallback lines (issue #538). Content only; nothing imports this until the panel and the AI chat exist.
 * Canon: harimu-docs vision/wellbeing-responsibility, "Mental health resources" (easy access to support resources from anywhere; AI characters may
 * respond supportively to distress a player expresses and point toward real-world help rather than deepen dependence; this does not authorize
 * covert mental-health profiling or diagnosis; Harimu does not present itself as therapy) and "AI disclosure" (every AI is labeled, no AI claims
 * to be human). The docs approve the principle but no procedure, so this is generic wording only.
 *
 * Voice: the link and the panel are one neutral system voice, plain and kind. The AI fallback lines are spoken by an AI character and carry the
 * AI badge (ui-ux §23.2): each says it is an AI, steps out of character and points to the support panel. Nothing here detects, records or
 * reacts to distress; the lines are only for the moment a player has expressed it. No diagnosis, no advice beyond reaching out to someone the
 * player trusts or a local support service, no promise to remember, follow up or be there, and no claim of feelings or friendship.
 *
 * Rules: no figure, no hotline name or number and no resource is written anywhere: the region-appropriate resource is {resourceLink}, supplied
 * by the code. The runtime value is capped by the shared name cap, which this module re-exports (COUP_NAME_MAX from the palace coup copy
 * module). Limits: labels 40, lines 120, tested with the placeholder filled to 24 characters. All wording is new: `proposal: true`. */

export { COUP_NAME_MAX as SUPPORT_NAME_MAX } from './palace-coup-copy';

export const SUPPORT_PLACEHOLDERS=['{resourceLink}'] as const;
export const SUPPORT_LABEL_MAX=40;
export const SUPPORT_LINE_MAX=120;

export type Line={text:string;proposal:true};
export type AiLine={text:string;aiBadge:true;proposal:true};
const L=(text:string):Line=>({text,proposal:true});
const A=(text:string):AiLine=>({text,aiBadge:true,proposal:true});

/** The entry point, available from anywhere. */
export const supportLink={
 label:'Need support?',
 accessibleName:'Need support? Open the support panel',
 proposal:true,
} as const;

/** The panel: a game world and not therapy, a pointer to real-world help, the resource slot, and the way back. */
export const supportPanel={
 title:'Support',
 notTherapy:L('Harimu is a game world, and it does not offer therapy.'),
 pointer:L('If things feel hard, reach out to someone you trust or a local support service.'),
 resource:L('Support in your region: {resourceLink}'),
 dismiss:'Back to the world',
 proposal:true,
} as const;

/** What an AI character can say when a player has expressed distress. Each is badged, says it is an AI and points to the panel. */
export const aiDistressFallbacks:readonly AiLine[]=[
 A('I am an AI, stepping out of the story. It sounds like things are hard. The support panel can point you to real help.'),
 A('Stepping out of character: I am an AI, and I am sorry you are going through this. Please reach out to someone you trust.'),
 A('I am an AI and cannot replace real support. A person you trust or a local service can help. See the support panel.'),
 A('Out of character: I am an AI, and what you said matters. Please talk to someone you trust or a local support service.'),
];

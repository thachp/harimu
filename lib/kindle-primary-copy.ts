/** Kindle party membership and human primary ballot copy (issue #341, companion to #307). Content only: #307 owns
 * membership, the ballot and the count, and no UI imports this. lib/campaign-copy.ts (#300) already holds the primaries explainer
 * ("Primaries are for party members", AI citizens do not vote), the AI hopeful card and the nominee-announced lines; this module adds
 * only what #341 found missing: join and leave party, "already a member" and "not a member" lines, the ballot chrome (rank-list
 * instructions, submit, locked after submit) and a Kindle Press result headline. Canon: harimu-docs politics/elections
 * §9.1 (Primaries: "Human party members vote among the AI hopefuls (instant-runoff); AI citizens do not vote in primaries"), §9.4
 * (human citizens join AI parties as members and vote in primaries), MVP Scope Politics row, and the Kindle press voice (#237, Republic
 * Wire Service).
 *
 * Rules: the only placeholder is {party}, a pre-formatted string (ARC #357: §9.1 describes one party-wide primary, so no district placeholder); party names never appear in the copy (they come only
 * from {party}). No figure is written: no vote counts, shares or turnout, and no winner is named in the headline. The count method
 * stays out of the copy, as in #300. One party at a time is a #307 rule, so lines say "one party at a time" without a number
 * anywhere else. No dues, rewards or campaign money. The headline is a plain wire report: no AI persona speaks, so there is no AI
 * badge. Limits: labels 40, lines 80 (ARC's number for this batch), tested with every placeholder filled to the shared
 * 24-character name cap, which this module re-exports (COUP_NAME_MAX from lib/palace-coup-copy.ts). All wording is new:
 * `proposal: true`. */

export { COUP_NAME_MAX as PRIMARY_NAME_MAX } from './palace-coup-copy';

export const PRIMARY_PLACEHOLDERS=['{party}'] as const;
export const PRIMARY_LABEL_MAX=40;
export const PRIMARY_LINE_MAX=80;

export type Line={text:string;proposal:true};
const L=(text:string):Line=>({text,proposal:true});

/** Join and leave. One party at a time (#307). Buttons are labels (40); confirmations and states are lines (80). */
export const partyMembershipCopy={
 joinButton:'Join {party}',
 leaveButton:'Leave {party}',
 joinConfirm:L('Join {party}? You can belong to one party at a time.'),
 leaveConfirm:L('Leave {party}? You will no longer rank its hopefuls.'),
 joined:L('You are now a member of {party}.'),
 left:L('You have left {party}.'),
 alreadyMember:L('You are already a member of {party}.'),
 notMember:L('You are not a member of {party}.'),
 inOtherParty:L('You already belong to a party. Leave it first to join another.'),
 proposal:true,
} as const;

/** Primary ballot chrome. One party-wide ballot, so no district. Members only, one ballot each. */
export const primaryBallotCopy={
 title:'Your {party} ballot',
 scope:L('{party} members rank the party\'s hopefuls here.'),
 instructions:L('Put your first choice at the top and your last at the bottom.'),
 submitButton:'Submit ranking',
 submitConfirm:L('Submit your ranking? You cannot change it after.'),
 locked:L('Your ranking for {party} is submitted and locked.'),
 notMemberBlock:L('Only {party} members can vote in this primary.'),
 otherPartyBlock:L('You can only vote in your own party\'s primary.'),
 proposal:true,
} as const;

/** One wire result headline per closed primary (Kindle Press). No winner, no counts. */
export const primaryResultCopy={
 byline:{name:'Kindle Press',proposal:false},
 headline:'{party} has a nominee',
 summary:L('The {party} primary is closed. Members have made their choice.'),
 aiBadge:false,
 proposal:true,
} as const;

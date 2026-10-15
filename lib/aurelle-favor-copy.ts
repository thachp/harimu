/** Aurelle Royal Favor and charter copy (issue #337). Content only: lib/aurelle.ts owns Royal Favor (earned by service, spent by
 * #289's favor spends) and the food-estate charter, and no UI imports this. Canon: harimu-docs economy-currency §12.2 (Aurelle:
 * crown, nobles and guilds; chartered markets; royal monopolies fix prices on monopoly goods; royal taxes, fief tribute, monopoly
 * rents), territory-cities-warfare §15.1 (Aurelle cities come from a royal charter, often a new fief with estates), politics
 * ai-leadership (Royal Favor is earned by service, gifts, victories, audiences and verse; the AI Monarch reads Favor), religion
 * §14.2 (leaving the Kinward Rite in Aurelle costs Royal Favor, #289) and the Court Gazette voice (#239, "Be it known"; byline
 * from lib/press-templates.ts). Chatter lines follow #117's commoner voice (lib/ambient-chatter.ts).
 *
 * Voice: ornate and deferential. Lines that speak for the Crown ("Be it known", decrees) are AI-badged, the Gazette's own
 * reports and the commoner chatter are not. Overlap: lib/missionary-copy.ts already says "In Aurelle, leaving the Kinward Rite
 * costs Royal Favor." in a missionary context; the lines here are the Favor screen's own cost, spend and refusal lines.
 *
 * Rules: no invented numbers. Favor amounts, costs, balances, prices, tribute and dates come only through placeholders
 * ({favor}, {cost}, {amount}, {holder}, {good}, {price}, {tribute}, {endsAt}), which are pre-formatted strings. Limits: labels 40,
 * lines 80 (ARC's number for this batch, also #117's chatter limit), tested with every placeholder filled to the shared 24-character
 * name cap, which this module re-exports (COUP_NAME_MAX from lib/palace-coup-copy.ts). No real-world references. All wording is
 * new: `proposal: true`. */

export { COUP_NAME_MAX as AURELLE_FAVOR_NAME_MAX } from './palace-coup-copy';

export const AURELLE_FAVOR_PLACEHOLDERS=['{favor}','{cost}','{amount}','{holder}','{good}','{price}','{tribute}','{endsAt}'] as const;
export const AURELLE_FAVOR_LABEL_MAX=40;
export const AURELLE_FAVOR_LINE_MAX=80;

export type Line={text:string;proposal:true};
export type CharterNoticeKey='granted'|'renewed'|'revoked';
export type CharterNotice={key:CharterNoticeKey;headline:string;body:string;aiBadge:boolean;proposal:true};
export type ChatterEvent='favor-gain'|'favor-spend'|'charter-granted'|'charter-renewed'|'charter-revoked';
export type ChatterLine={event:ChatterEvent;text:string;aiText:true;proposal:true};
const L=(text:string):Line=>({text,proposal:true});

/** Canon byline (lib/press-templates.ts aurelleGazette.byline). */
export const AURELLE_FAVOR_BYLINE={name:'Court Gazette',proposal:false} as const;
export const CHARTER_NOTICE_KEYS:readonly CharterNoticeKey[]=['granted','renewed','revoked'];
export const CHATTER_EVENTS:readonly ChatterEvent[]=['favor-gain','favor-spend','charter-granted','charter-renewed','charter-revoked'];

export const royalFavor={
 label:'Royal Favor',
 gain:[
  L('Loyal service is noted. Royal Favor rises by {amount}.'),
  L('Court attendance is noted. Royal Favor rises by {amount}.'),
 ],
 spend:[
  L('You spend {cost} Royal Favor.'),
  L('Spent {cost} Royal Favor. Balance: {favor}.'),
 ],
 notEnough:[
  L('Not enough Royal Favor. Serve the Crown to earn more.'),
  L('You hold {favor} Royal Favor. That is not enough.'),
 ],
 /** Leaving the Kinward Rite costs Royal Favor in Aurelle (§14.2, #289). */
 leaveKinward:{
  cost:L('Leaving the Kinward Rite costs {cost} Royal Favor.'),
  done:L('You left the Kinward Rite. {cost} Royal Favor was spent.'),
  blocked:L('You cannot leave the Kinward Rite yet. Serve the Crown to earn Favor.'),
 },
 proposal:true,
} as const;

/** Charter card: header and labels (40), all values through placeholders. */
export const charterCard={
 header:'Royal charter',
 holder:'Holder: {holder}',
 marketGood:'Market good: {good}',
 monopolyGood:'Monopoly good: {good}',
 fixedPrice:'Fixed price: {price}',
 tribute:'Tribute due: {tribute}',
 renewBy:L('Renew your charter by {endsAt}.'),
 proposal:true,
} as const;

/** Charter notices in Court Gazette voice. The Crown's decrees ("Be it known") are AI-badged. */
const c=(key:CharterNoticeKey,headline:string,body:string,aiBadge:boolean):CharterNotice=>({key,headline,body,aiBadge,proposal:true});
export const charterNotices:Readonly<Record<CharterNoticeKey,CharterNotice>>={
 granted:c('granted','A charter is granted','Be it known: {holder} is granted a royal charter.',true),
 renewed:c('renewed','A charter is renewed','Be it known: the charter of {holder} is renewed.',true),
 revoked:c('revoked','A charter is revoked','Be it known: the charter of {holder} is revoked.',true),
};
/** Gazette reports that name the good and are not decrees (no badge). */
export const charterReports=[
 L('The Court Gazette records a charter for {good}.'),
 L('The Court Gazette records a charter ended for {good}.'),
] as const;

/** One commoner-voice chatter line per event for the city chatter feed (#117 style, aiText true). */
const k=(event:ChatterEvent,text:string):ChatterLine=>({event,text,aiText:true,proposal:true});
export const favorChatter:readonly ChatterLine[]=[
 k('favor-gain','Someone bowed well at court today. The steward noticed.'),
 k('favor-spend','Favor spent is favor gone. Spend it wisely, friend.'),
 k('charter-granted','A new charter was read today. Someone has the Crown\'s ear.'),
 k('charter-renewed','The old charter is renewed. Some things hold, friend.'),
 k('charter-revoked','A charter was pulled today. Mind your tribute, friend.'),
];
export const chatterFor=(event:ChatterEvent)=>favorChatter.find(x=>x.event===event);

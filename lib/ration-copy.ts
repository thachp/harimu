/** Korund ration coupon, quota bar and queue copy (issue #336, companion to #41 and migration 0008's ration queue). Content only:
 * lib/korund-coupons.ts and lib/korund-queue.ts own the coupons, the quota math and the FIFO queue, and no UI imports this.
 * Canon: harimu-docs economy-currency §12.2 (Korund: fixed prices, rations, Five-Year Plan quotas), §12.3 (Labor Note plus weekly
 * ration coupons that expire and are not transferable; extra printing shows up as shortages and queues, not price rises), §12.11
 * (rations are drawn from plan output; a shortfall cuts rations; human over-fulfilment is recognised) and the Korund State Media
 * voice (#238/#244, byline from lib/press-templates.ts). Labels reuse lib/korund-coupons.ts: "Food coupon", "Clothing coupon",
 * "Goods coupon".
 *
 * Voice: State Media (collective, "the plan") except one quiet citizen-voice line for a ration cut. Shortages are always shown as
 * queues and empty shelves, never as price rises, and no line mentions a price at all. Gray market, faith and other nations are
 * out of scope and absent.
 *
 * Rules: no digits and no invented figures. Counts and times come only through placeholders ({days}, {position}, {waiting},
 * {output}, {target}), which are pre-formatted strings (for example {days} = "3 days"). Limits: labels 40 characters, lines 80
 * (ARC's number for this batch), tested with every placeholder filled to the shared 24-character name cap, which this module
 * re-exports (COUP_NAME_MAX from lib/palace-coup-copy.ts). All wording is new: `proposal: true`. */

export { COUP_NAME_MAX as RATION_NAME_MAX } from './palace-coup-copy';

export const RATION_PLACEHOLDERS=['{days}','{position}','{waiting}','{output}','{target}'] as const;
export const RATION_LABEL_MAX=40;
export const RATION_LINE_MAX=80;

export type Line={text:string;proposal:true};
export type CouponKind='food'|'clothing'|'goods';
export type QuotaState='under'|'on'|'over';
export type QueueState='joined'|'waiting'|'served'|'left'|'shelf-empty';
const L=(text:string):Line=>({text,proposal:true});

/** Canon byline (lib/press-templates.ts korundStateMedia.byline): State Media lines carry it. */
export const RATION_BYLINE={name:'Korund State Media',proposal:false} as const;
export const COUPON_KINDS:readonly CouponKind[]=['food','clothing','goods'];
export const QUOTA_STATES:readonly QuotaState[]=['under','on','over'];
export const QUEUE_STATES:readonly QueueState[]=['joined','waiting','served','left','shelf-empty'];

export const couponIssue={
 label:'Weekly coupons issued',
 notice:L('Korund State Media: this week\'s ration coupons are issued.'),
 proposal:true,
} as const;

export const couponCard={
 labels:{food:'Food coupon',clothing:'Clothing coupon',goods:'Goods coupon'},
 states:{expiresIn:'Expires in {days}',expired:'Expired',used:'Used this week'},
 notTransferable:L('Coupons are not transferable. Each is yours alone.'),
 proposal:true,
} as const;

export const quotaBar={
 label:'Brigade quota',
 progress:L('Brigade output: {output} of {target}'),
 captions:{
  under:L('Under target. The plan asks more of the brigade.'),
  on:L('On target. The plan advances.'),
  over:L('Over target. The plan thanks the brigade.'),
 },
 proposal:true,
} as const;

/** Queue and shortage lines. A shortage is a queue and an empty shelf, never a price rise (§12.3). */
export const queueCopy={
 joinButton:'Join the ration queue',
 leaveButton:'Leave the queue',
 states:{
  joined:L('You joined the ration queue.'),
  waiting:L('In the ration queue. Your position: {position}.'),
  served:L('Served. Your ration is ready to collect.'),
  left:L('You left the ration queue.'),
  'shelf-empty':L('The shelf is empty. Come back after the next plan delivery.'),
 },
 queueSize:L('The queue holds {waiting} waiting requests.'),
 shortage:L('Shortage: the queue moves as the plan delivers.'),
 proposal:true,
} as const;

/** Ration cut when plan output falls short (§12.11): a plain notice, one State Media framing line, one quiet citizen-voice line. */
export const rationCut={
 label:'Rations are reduced',
 notice:L('Plan output fell short, so this week\'s rations are reduced.'),
 stateMedia:L('Korund State Media: the plan adjusts rations. The brigades work on.'),
 citizen:L('The portions are smaller. Nobody says much about it.'),
 proposal:true,
} as const;

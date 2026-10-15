/** Kindle city market board copy: board labels, order states, fills, spoilage hints, plain-word rejections and empty
 * states (issue #324, companion to #200's City market board UI; built on lib/order-book.ts #197, lib/market-orders.ts #195
 * and spoilage #199). Content only: #200 owns the board UI and no UI imports this. Canon: harimu-docs economy-currency §12.2
 * (Kindle: free market order book) and the MVP Scope Economy row ("Kindle order-book market").
 *
 * Rejections: one line per rejection the order API (app/api/market/orders/route.ts and executeOrderCommand) returns. Three
 * carry a `reason` code (`traveling`, `closed`, `bad_request`); five are status-plus-message only and have no code, so they get
 * proposed keys here (`unauthenticated`, `cross_origin`, `request_reused`, `order_refused`, `order_not_open`) and a `source`
 * fragment of the API's own message that the test checks is still in the API source. Each line says what the player can do next.
 *
 * Voice: Kindle, plain words; no Korund or Aurelle market (out of scope). Rules: no invented figures. Every number comes
 * through a placeholder (the API's real limits are never written into the copy). Placeholders are pre-formatted strings;
 * {days} and {cost} carry their own unit. They are capped by the shared name cap, which this module re-exports (COUP_NAME_MAX
 * from lib/palace-coup-copy.ts). No price, fee or limit changes. All wording is new: `proposal: true`. */

export { COUP_NAME_MAX as MARKET_BOARD_NAME_MAX } from './palace-coup-copy';

/** {filled},{qty}: quantities. {good}: a good's label. {days}: time left to spoil (with unit). {cost}: Spark held (with unit).
 * {maxQty},{maxPrice},{maxOrders}: the API's order limits (orderBookLimits in lib/order-book-rules.ts), so no limit is written here. */
export const MARKET_BOARD_PLACEHOLDERS=['{filled}','{qty}','{good}','{days}','{cost}','{maxQty}','{maxPrice}','{maxOrders}'] as const;
export const MARKET_BOARD_LABEL_MAX=40;
export const MARKET_BOARD_BODY_MAX=140;

export type Line={text:string;proposal:true};
const L=(text:string):Line=>({text,proposal:true});

export type OrderState='open'|'partly-filled'|'filled'|'cancelled'|'spoiled';
export type RejectionKey='traveling'|'closed'|'bad_request'|'unauthenticated'|'cross_origin'|'request_reused'|'order_refused'|'order_not_open';
export type Rejection={key:RejectionKey;status:number;/** the API `reason` code, or null when the API sends none */code:string|null;/** a fragment of the API's own message, or the reason literal */source:string;line:Line;proposal:true};

export const boardLabels={
 bestBid:'Best bid',
 bestAsk:'Best ask',
 depth:'Depth',
 lastTrade:'Last trade',
 myOpenOrders:'My open orders',
 placeOrder:'Place order',
 escrowPreview:'Escrow preview',
 npcTag:'NPC order',
 proposal:true,
} as const;

/** Escrow preview body lines (#195/#197: an open buy holds Spark, an open sell holds goods, until filled or cancelled). */
export const escrowPreview={
 buy:L('This order holds {cost} until it fills or you cancel it.'),
 sell:L('This order holds {qty} {good} until it fills or you cancel it.'),
 proposal:true,
} as const;

export const ORDER_STATES:readonly OrderState[]=['open','partly-filled','filled','cancelled','spoiled'];
export const orderStateLines:Readonly<Record<OrderState,Line>>={
 open:L('Open: waiting for a match on the board.'),
 'partly-filled':L('Partly filled: {filled} of {qty}. The rest is still open.'),
 filled:L('Filled: all {qty} {good} traded.'),
 cancelled:L('Cancelled. The unfilled part is released back to you.'),
 spoiled:L('Spoiled: some {good} went bad before it sold.'),
};
export const fillNotice=L('Your order traded {filled} of {qty} {good}.');
export const cancelConfirmation=L('Order cancelled. Your held Spark or goods are released.');

/** Spoiling-soon hints: fruit and meat only, time through {days} alone. */
export const spoilageHints={
 fruit:L('Fruit spoils in {days}. Sell or eat it soon.'),
 meat:L('Meat spoils in {days}. Sell or use it soon.'),
 proposal:true,
} as const;

export const emptyStates={
 noOrdersOnGood:L('No orders on this good yet. Post the first.'),
 noOpenOrders:L('You have no open orders.'),
 proposal:true,
} as const;

const r=(key:RejectionKey,status:number,code:string|null,source:string,text:string):Rejection=>({key,status,code,source,line:L(text),proposal:true});
/** Exactly one line per rejection the order API returns. */
export const rejections:readonly Rejection[]=[
 r('unauthenticated',401,null,'Sign in required.','Sign in to use the market board.'),
 r('traveling',409,'traveling','traveling','You are travelling. Orders open again when you arrive.'),
 r('cross_origin',403,null,'Same-origin request required.','That request did not come from the game. Reload the page and try again.'),
 r('closed',403,'closed','closed','The city order book is not open yet. Check back later.'),
 r('bad_request',400,'bad_request','bad_request','That order could not be read. Pick a good, a quantity up to {maxQty} and a price up to {maxPrice}.'),
 r('request_reused',409,null,'Request identifier already used for another intent.','That request was already used for a different order. Start a new order.'),
 r('order_refused',409,null,'Order refused:','The order was not placed. Check your Spark or goods and your open orders (at most {maxOrders}). Kindle citizens only.'),
 r('order_not_open',409,null,'Order not open, already cancelled, or not yours.','That order is no longer open. Refresh your open orders.'),
];
export const REJECTION_KEYS:readonly RejectionKey[]=['unauthenticated','traveling','cross_origin','closed','bad_request','request_reused','order_refused','order_not_open'];
export const rejectionFor=(key:RejectionKey)=>rejections.find(x=>x.key===key);
export const rejectionForReason=(code:string)=>rejections.find(x=>x.code===code);

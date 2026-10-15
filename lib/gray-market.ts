import type { GameDatabase } from './database-contract';
import { laborNoteSql, laborNoteBinds } from './korund-wallet';
import { GRAY_AMOUNT_CAP_MINOR, GRAY_OFFER_LIFETIME_SECONDS, GRAY_STARTING_GRANT_MINOR, GRAY_RATE_MIN, GRAY_RATE_MAX, GRAY_RUMOR_TRADES, GRAY_RUMOR_WINDOW_SECONDS,
  grayCashFor, rumoredRate, validGrayOffer, type GrayOfferInput } from './gray-market-rules';

/** Korund gray market PoC (#43), behind HARIMU_GRAY_MARKET_ENABLED (off). Korund citizens only.
 * FC is smuggled foreign cash: an off-book unit that exists only in gray_cash_grants (one small grant per citizen) and gray_trades. It is
 * never convertible and never touches Labor Notes, official settlements or Tessera except through an accepted trade, which moves LN
 * through lib/korund-wallet. Reads never write: offers expire lazily (a read just filters on expires_at). */
export const grayMarketSchemas = [
  `CREATE TABLE IF NOT EXISTS gray_offers (
 id TEXT PRIMARY KEY,
 clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 amount_minor INTEGER NOT NULL CHECK(amount_minor BETWEEN 1 AND 5000),
 ask_rate INTEGER NOT NULL CHECK(ask_rate BETWEEN 1 AND 10000),
 cash_minor INTEGER NOT NULL CHECK(cash_minor >= 1),
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL CHECK(expires_at > created_at)
)`,
  'CREATE INDEX IF NOT EXISTS idx_gray_offers_citizen ON gray_offers(clerk_user_id, created_at)',
  `CREATE TABLE IF NOT EXISTS gray_trades (
 offer_id TEXT PRIMARY KEY REFERENCES gray_offers(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL UNIQUE,
 seller_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 buyer_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 amount_minor INTEGER NOT NULL CHECK(amount_minor >= 1),
 cash_minor INTEGER NOT NULL CHECK(cash_minor >= 1),
 ask_rate INTEGER NOT NULL CHECK(ask_rate >= 1),
 traded_at INTEGER NOT NULL,
 CHECK(seller_id <> buyer_id)
)`,
  'CREATE INDEX IF NOT EXISTS idx_gray_trades_buyer ON gray_trades(buyer_id)',
  'CREATE INDEX IF NOT EXISTS idx_gray_trades_seller ON gray_trades(seller_id)',
  'CREATE INDEX IF NOT EXISTS idx_gray_trades_time ON gray_trades(traded_at)',
  `CREATE TABLE IF NOT EXISTS gray_cash_grants (
 clerk_user_id TEXT PRIMARY KEY REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 amount_minor INTEGER NOT NULL CHECK(amount_minor >= 0),
 granted_at INTEGER NOT NULL
)`,
] as const;

/** FC balance of a citizen: the one-time grant (a single unique row per citizen), plus FC received as a seller, minus FC paid as a buyer.
 * `user` is `?` (3 binds, see grayCashBinds) or a column. */
export const grayCashSql = (user: string): string => `(COALESCE((SELECT amount_minor FROM gray_cash_grants WHERE clerk_user_id=${user}),0)`
  + `+COALESCE((SELECT SUM(cash_minor) FROM gray_trades WHERE seller_id=${user}),0)-COALESCE((SELECT SUM(cash_minor) FROM gray_trades WHERE buyer_id=${user}),0))`;
const grayCashBinds = (userId: string): string[] => [userId, userId, userId];

export type GrayOfferView = { id: string; amountMinor: number; askRate: number; cashMinor: number; createdAt: string; expiresAt: string };
export type GrayView = {
  enabled: true;
  /** FC balance. Before the first write action the one-time grant is shown as pending (grantPending) and counted. */
  cashMinor: number; grantPending: boolean; startingGrantMinor: number;
  /** The rumored street rate in hundredths of FC per LN, or null until a trade exists. */
  rumoredRate: number | null;
  myOffer: (GrayOfferView & { status: 'open' | 'accepted' | 'expired' }) | null;
  offers: GrayOfferView[];
  limits: { amountCapMinor: number; rateMin: number; rateMax: number; lifetimeSeconds: number };
};
export type GrayResult = { status: number; error?: string; reason?: string; replayed?: boolean };

const iso = (seconds: number) => new Date(seconds * 1000).toISOString();
const openOffer = (alias: string) => `${alias}.expires_at>? AND NOT EXISTS(SELECT 1 FROM gray_trades t WHERE t.offer_id=${alias}.id)`;
type OfferRow = { id: string; amount_minor: number; ask_rate: number; cash_minor: number; created_at: number; expires_at: number };
const offerView = (r: OfferRow): GrayOfferView => ({ id: r.id, amountMinor: Number(r.amount_minor), askRate: Number(r.ask_rate), cashMinor: Number(r.cash_minor), createdAt: iso(Number(r.created_at)), expiresAt: iso(Number(r.expires_at)) });

/** The read model. Never writes: expired offers are simply not listed, and the starting grant is shown but not recorded until the first action. */
export async function readGray(db: GameDatabase, userId: string, now: number): Promise<GrayView> {
  const [grant, flows, mine, others, trades] = await Promise.all([
    db.prepare('SELECT amount_minor FROM gray_cash_grants WHERE clerk_user_id=?').bind(userId).first<{ amount_minor: number }>(),
    db.prepare(`SELECT COALESCE((SELECT SUM(cash_minor) FROM gray_trades WHERE seller_id=?),0)-COALESCE((SELECT SUM(cash_minor) FROM gray_trades WHERE buyer_id=?),0) AS net`).bind(userId, userId).first<{ net: number }>(),
    db.prepare(`SELECT o.*, EXISTS(SELECT 1 FROM gray_trades t WHERE t.offer_id=o.id) AS traded FROM gray_offers o WHERE o.clerk_user_id=? ORDER BY o.created_at DESC, o.id DESC LIMIT 1`).bind(userId).first<OfferRow & { traded: number }>(),
    db.prepare(`SELECT o.* FROM gray_offers o WHERE o.clerk_user_id<>? AND ${openOffer('o')} ORDER BY o.created_at DESC, o.id DESC LIMIT 20`).bind(userId, now).all<OfferRow>(),
    db.prepare('SELECT offer_id, ask_rate, traded_at FROM gray_trades WHERE traded_at>=? ORDER BY traded_at DESC, offer_id DESC LIMIT ?').bind(now - GRAY_RUMOR_WINDOW_SECONDS, GRAY_RUMOR_TRADES).all<{ offer_id: string; ask_rate: number; traded_at: number }>(),
  ]);
  const myStatus = mine ? (Number(mine.traded) ? 'accepted' : Number(mine.expires_at) > now ? 'open' : 'expired') as 'open' | 'accepted' | 'expired' : null;
  return {
    enabled: true,
    cashMinor: Number(grant?.amount_minor ?? GRAY_STARTING_GRANT_MINOR) + Number(flows?.net ?? 0), grantPending: !grant, startingGrantMinor: GRAY_STARTING_GRANT_MINOR,
    rumoredRate: rumoredRate((trades.results ?? []).map(t => ({ offerId: t.offer_id, askRate: Number(t.ask_rate), tradedAt: Number(t.traded_at) })), now),
    myOffer: mine && myStatus ? { ...offerView(mine), status: myStatus } : null,
    offers: (others.results ?? []).map(offerView),
    limits: { amountCapMinor: GRAY_AMOUNT_CAP_MINOR, rateMin: GRAY_RATE_MIN, rateMax: GRAY_RATE_MAX, lifetimeSeconds: GRAY_OFFER_LIFETIME_SECONDS },
  };
}

/** One-time starting grant, idempotent: the citizen id is the primary key. Korund citizens only (the caller has checked). */
async function ensureGrant(db: GameDatabase, userId: string, now: number) {
  await db.prepare(`INSERT INTO gray_cash_grants(clerk_user_id, amount_minor, granted_at) SELECT clerk_user_id,?,? FROM citizens WHERE clerk_user_id=? AND nation_id='korund' ON CONFLICT DO NOTHING`)
    .bind(GRAY_STARTING_GRANT_MINOR, now, userId).run();
}
const laborNotes = async (db: GameDatabase, userId: string) => Number((await db.prepare(`SELECT ${laborNoteSql('?')} AS n`).bind(...laborNoteBinds(userId)).first<{ n: number }>())?.n ?? 0);
const cash = async (db: GameDatabase, userId: string) => Number((await db.prepare(`SELECT ${grayCashSql('?')} AS n`).bind(...grayCashBinds(userId)).first<{ n: number }>())?.n ?? 0);
const openCount = async (db: GameDatabase, userId: string, now: number) => Number((await db.prepare(`SELECT COUNT(*) AS n FROM gray_offers o WHERE o.clerk_user_id=? AND ${openOffer('o')}`).bind(userId, now).first<{ n: number }>())?.n ?? 0);

/** Posts one cash-bundle offer: sell `amountMinor` LN for FC at the asking rate. One open offer per citizen; the LN stays in the poster's
 * wallet until a buyer accepts (the accept re-checks it). The request id is the offer id, so a retry replays and a foreign id is request_reused. */
export async function postOffer(db: GameDatabase, userId: string, input: { amountMinor?: unknown; askRate?: unknown }, requestId: string, now: number): Promise<GrayResult> {
  const terms: GrayOfferInput | null = validGrayOffer(input);
  if (!terms) return { status: 400, reason: 'out_of_range', error: `Offer between 0.01 and ${(GRAY_AMOUNT_CAP_MINOR / 100).toFixed(2)} LN at a whole-hundredths rate.` };
  const priorOffer = await db.prepare('SELECT clerk_user_id FROM gray_offers WHERE id=?').bind(requestId).first<{ clerk_user_id: string }>();
  if (priorOffer) return priorOffer.clerk_user_id === userId ? { status: 200, replayed: true } : { status: 409, reason: 'request_reused', error: 'Request identifier already used.' };
  if (await db.prepare('SELECT 1 AS y FROM gray_trades WHERE request_id=?').bind(requestId).first()) return { status: 409, reason: 'request_reused', error: 'Request identifier already used.' };
  await ensureGrant(db, userId, now);
  const cashMinor = grayCashFor(terms.amountMinor, terms.askRate);
  await db.prepare(`INSERT INTO gray_offers(id, clerk_user_id, amount_minor, ask_rate, cash_minor, created_at, expires_at)
    SELECT ?,clerk_user_id,?,?,?,?,? FROM citizens WHERE clerk_user_id=? AND nation_id='korund'
    AND NOT EXISTS(SELECT 1 FROM gray_offers o WHERE o.clerk_user_id=? AND ${openOffer('o')})
    AND ?<=${laborNoteSql('?')} ON CONFLICT DO NOTHING`)
    .bind(requestId, terms.amountMinor, terms.askRate, cashMinor, now, now + GRAY_OFFER_LIFETIME_SECONDS, userId, userId, now, terms.amountMinor, ...laborNoteBinds(userId)).run();
  const created = await db.prepare('SELECT clerk_user_id FROM gray_offers WHERE id=?').bind(requestId).first<{ clerk_user_id: string }>();
  if (created?.clerk_user_id !== userId) {
    if (await openCount(db, userId, now)) return { status: 409, reason: 'offer_open', error: 'You already have an open offer. It expires on its own.' };
    if ((await laborNotes(db, userId)) < terms.amountMinor) return { status: 409, reason: 'insufficient_ln', error: 'You do not hold that many Labor Notes.' };
    return { status: 409, reason: 'unavailable', error: 'The offer could not be posted.' };
  }
  // Committed re-check (pattern from the coupon guard): under Postgres READ COMMITTED two concurrent posts by one citizen can each pass the
  // insert guard. After commit the later re-check sees both rows and withdraws its own, so at most one offer stays open (ties fail closed).
  if (await openCount(db, userId, now) > 1) {
    await db.prepare('DELETE FROM gray_offers WHERE id=? AND clerk_user_id=? AND NOT EXISTS(SELECT 1 FROM gray_trades WHERE offer_id=gray_offers.id)').bind(requestId, userId).run();
    return { status: 409, reason: 'offer_open', error: 'You already have an open offer. It expires on its own.' };
  }
  return { status: 200 };
}

/** Accepts someone else's open offer: the buyer pays the offer's FC price and receives its LN. One trade per offer (primary key), so of two
 * simultaneous accepts exactly one wins. The accept request id is stored in the trade, so a retry replays and a foreign id is request_reused. */
export async function acceptOffer(db: GameDatabase, userId: string, offerId: string, requestId: string, now: number): Promise<GrayResult> {
  const usedAsOffer = await db.prepare('SELECT 1 AS y FROM gray_offers WHERE id=?').bind(requestId).first();
  if (usedAsOffer) return { status: 409, reason: 'request_reused', error: 'Request identifier already used.' };
  const byRequest = await db.prepare('SELECT buyer_id, offer_id FROM gray_trades WHERE request_id=?').bind(requestId).first<{ buyer_id: string; offer_id: string }>();
  if (byRequest) return byRequest.buyer_id === userId && byRequest.offer_id === offerId ? { status: 200, replayed: true } : { status: 409, reason: 'request_reused', error: 'Request identifier already used.' };
  const offer = await db.prepare('SELECT id, clerk_user_id, amount_minor, cash_minor, expires_at FROM gray_offers WHERE id=?').bind(offerId).first<{ id: string; clerk_user_id: string; amount_minor: number; cash_minor: number; expires_at: number }>();
  if (!offer) return { status: 404, reason: 'no_offer', error: 'That offer is gone.' };
  if (offer.clerk_user_id === userId) return { status: 409, reason: 'own_offer', error: 'You cannot accept your own offer.' };
  const existing = await db.prepare('SELECT buyer_id FROM gray_trades WHERE offer_id=?').bind(offerId).first<{ buyer_id: string }>();
  if (existing) return existing.buyer_id === userId ? { status: 200, replayed: true } : { status: 409, reason: 'taken', error: 'Another player took that offer first.' };
  if (Number(offer.expires_at) <= now) return { status: 409, reason: 'expired', error: 'That offer expired.' };
  await ensureGrant(db, userId, now);
  await db.prepare(`INSERT INTO gray_trades(offer_id, request_id, seller_id, buyer_id, amount_minor, cash_minor, ask_rate, traded_at)
    SELECT o.id,?,o.clerk_user_id,?,o.amount_minor,o.cash_minor,o.ask_rate,? FROM gray_offers o
    JOIN citizens b ON b.clerk_user_id=? AND b.nation_id='korund' JOIN citizens s ON s.clerk_user_id=o.clerk_user_id AND s.nation_id='korund'
    WHERE o.id=? AND o.clerk_user_id<>? AND o.expires_at>?
    AND o.cash_minor<=${grayCashSql('?')} AND o.amount_minor<=${laborNoteSql('o.clerk_user_id')}
    ON CONFLICT DO NOTHING`)
    .bind(requestId, userId, now, userId, offerId, userId, now, ...grayCashBinds(userId)).run();
  const trade = await db.prepare('SELECT buyer_id, request_id FROM gray_trades WHERE offer_id=?').bind(offerId).first<{ buyer_id: string; request_id: string }>();
  if (!trade) {
    if ((await cash(db, userId)) < Number(offer.cash_minor)) return { status: 409, reason: 'insufficient_cash', error: 'You do not hold enough FC for that offer.' };
    return { status: 409, reason: 'seller_short', error: 'The poster no longer holds that many Labor Notes.' };
  }
  if (trade.request_id !== requestId) return trade.buyer_id === userId ? { status: 200, replayed: true } : { status: 409, reason: 'taken', error: 'Another player took that offer first.' };
  // Committed re-check: the guards above read pre-commit balances. If a racing trade or coupon redemption overdrew the buyer's FC or the seller's
  // LN, this trade is withdrawn (fail closed) and nothing has changed hands.
  if ((await cash(db, userId)) < 0 || (await laborNotes(db, offer.clerk_user_id)) < 0) {
    await db.prepare('DELETE FROM gray_trades WHERE offer_id=? AND request_id=?').bind(offerId, requestId).run();
    return { status: 409, reason: 'seller_short', error: 'The trade could not settle and was withdrawn.' };
  }
  return { status: 200 };
}

import { marketTickerOn } from '@/lib/market-visibility';
import { travelBlock } from '@/lib/travel';
import { wearinessEnabled, wearinessLossesEnabled, type WearinessBindings } from '@/lib/war-weariness'; // #423
import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { isSameOriginCommand, readCommandObject } from '@/lib/command-request';
import { advanceWorld } from '@/lib/world-simulation';
import { kindleSalesTaxEnabled } from '@/lib/kindle-sales-tax'; // #844
import { executeOrderCommand, readOrderBook, validOrderCommand, orderBookLimits } from '@/lib/order-book';

export const dynamic = 'force-dynamic';
const privateJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
// #777: goods-market seller fee as a money sink (HARIMU_MARKET_FEE_ENABLED); off = no fee written or read.
const feeOn = () => (env as unknown as { HARIMU_MARKET_FEE_ENABLED?: string }).HARIMU_MARKET_FEE_ENABLED === 'true';
// #844: Kindle sales tax on fills, credited to kindle-treasury (HARIMU_KINDLE_SALES_TAX_ENABLED); off = the options object is unchanged.
const writeOptions = () => ({ fee: feeOn(), ...(kindleSalesTaxEnabled(env as never) ? { salesTax: true } : {}) });
const enabled = () => (env as unknown as { HARIMU_ORDER_BOOK_ENABLED?: string }).HARIMU_ORDER_BOOK_ENABLED === 'true';

// #197: Kindle city order book for fruit, meat and wood. Off unless HARIMU_ORDER_BOOK_ENABLED=true.
// GET stays read-only (#219): no world tick and no NPC posting here.
export async function GET(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return privateJson({ error: 'Sign in required.' }, 401);
  if (!enabled()) return privateJson({ open: false });
  const db = await getDatabase();
  const ticker = marketTickerOn(env); // #459: the board polls only when this key is present
  return privateJson({ open: true, book: await readOrderBook(db, userId, { fee: feeOn() }), ...(ticker ? { ticker: true } : {}) });
}

export async function POST(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return privateJson({ error: 'Sign in required.' }, 401);
  // #384 L1: flag off answers before the travel read or any DB access.
  if (!enabled()) return privateJson({ error: 'The city order book is not open yet.', reason: 'closed' }, 403);
  { // #123: location-bound while travelling (QA1 on #264); no-op unless HARIMU_TRAVEL_ENABLED=true.
    const blocked = await travelBlock(await getDatabase(), userId, Math.floor(Date.now() / 1000), (env as unknown as { HARIMU_TRAVEL_ENABLED?: string }).HARIMU_TRAVEL_ENABLED === 'true');
    if (blocked) return privateJson({ error: blocked, reason: 'traveling' }, 409);
  }
  if (!isSameOriginCommand(request)) return privateJson({ error: 'Same-origin request required.' }, 403);
  let body: Record<string, unknown>;
  try { body = await readCommandObject(request, 1024); } catch { return privateJson({ error: 'Send an order command.', reason: 'bad_request' }, 400); }
  if (!validOrderCommand(body)) return privateJson({ error: `Send a requestId (UUID) and either a buy/sell order for fruit, meat or wood with quantity 1–${orderBookLimits.maxQty} and an integer limit price 1–${orderBookLimits.maxUnitMinor} Spark cents, or an orderId to cancel.`, reason: 'bad_request' }, 400);
  const command = { ...body, requestId: body.requestId.toLowerCase(), ...('orderId' in body && typeof body.orderId === 'string' ? { orderId: body.orderId.toLowerCase() } : {}) } as typeof body;
  const db = await getDatabase();
  await advanceWorld(db, undefined, { religiousHarmony: (env as unknown as { HARIMU_RELIGIOUS_HARMONY_ENABLED?: string }).HARIMU_RELIGIOUS_HARMONY_ENABLED === 'true', // #842
    dormancy: (env as unknown as { HARIMU_DORMANCY_ENABLED?: string }).HARIMU_DORMANCY_ENABLED === 'true', npcSupply: true, faithFestivals: (env as unknown as { HARIMU_FAITH_ENABLED?: string }).HARIMU_FAITH_ENABLED === 'true', warWeariness: wearinessEnabled(env as unknown as WearinessBindings), warWearinessLosses: wearinessLossesEnabled(env as unknown as WearinessBindings) }); // #198
  const result = await executeOrderCommand(db, userId, command, Math.floor(Date.now() / 1000), writeOptions());
  return privateJson({ ...result, book: await readOrderBook(db, userId, { fee: feeOn() }) }, result.status);
}

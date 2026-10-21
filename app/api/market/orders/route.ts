import { travelBlock } from '@/lib/travel';
import { wearinessEnabled, wearinessLossesEnabled, type WearinessBindings } from '@/lib/war-weariness'; // #423
import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { isSameOriginCommand, readCommandObject } from '@/lib/command-request';
import { advanceWorld } from '@/lib/world-simulation';
import { executeOrderCommand, readOrderBook, validOrderCommand, orderBookLimits } from '@/lib/order-book';

export const dynamic = 'force-dynamic';
const privateJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const enabled = () => (env as unknown as { HARIMU_ORDER_BOOK_ENABLED?: string }).HARIMU_ORDER_BOOK_ENABLED === 'true';

// #197: Kindle city order book for fruit, meat and wood. Off unless HARIMU_ORDER_BOOK_ENABLED=true.
// GET stays read-only (#219): no world tick and no NPC posting here.
export async function GET(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return privateJson({ error: 'Sign in required.' }, 401);
  if (!enabled()) return privateJson({ open: false });
  const db = await getDatabase();
  const ticker = (env as unknown as { HARIMU_MARKET_TICKER_ENABLED?: string }).HARIMU_MARKET_TICKER_ENABLED === 'true'; // #459: the board polls only when this key is present
  return privateJson({ open: true, book: await readOrderBook(db, userId), ...(ticker ? { ticker: true } : {}) });
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
  await advanceWorld(db, undefined, { npcSupply: true, faithFestivals: (env as unknown as { HARIMU_FAITH_ENABLED?: string }).HARIMU_FAITH_ENABLED === 'true', warWeariness: wearinessEnabled(env as unknown as WearinessBindings), warWearinessLosses: wearinessLossesEnabled(env as unknown as WearinessBindings) }); // #198
  const result = await executeOrderCommand(db, userId, command, Math.floor(Date.now() / 1000));
  return privateJson({ ...result, book: await readOrderBook(db, userId) }, result.status);
}

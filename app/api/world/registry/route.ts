import { travelBlock } from '@/lib/travel';
import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { isSameOriginCommand, readCommandObject } from '@/lib/command-request';
import { buySquare, parsePurchaseCommand, purchaseBadRequestError, readTessera, registryListingPrice } from '@/lib/world-registry.ts';
import { applyPoster, parsePosterCommand, postersEnabled, readVisiblePoster } from '@/lib/square-posters';
import { buyTessera, parseExchangeCommand, sparkPerTessera, kioskMinTesseraMinor, kioskMaxTesseraMinor } from '@/lib/tessera-exchange';

export const dynamic = 'force-dynamic';
const privateJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const enabled = () => (env as unknown as { HARIMU_SQUARE_PURCHASE_ENABLED?: string }).HARIMU_SQUARE_PURCHASE_ENABLED === 'true';
// #626 (Decision 111): the Spark-to-Tessera kiosk exchange has its own default-off flag; HARIMU_SQUARE_PURCHASE_ENABLED is squares only.
const exchangeEnabled = () => (env as unknown as { HARIMU_TESSERA_EXCHANGE_ENABLED?: string }).HARIMU_TESSERA_EXCHANGE_ENABLED === 'true';

// #122: World Registry listing (price + your Tessera) and the buy-square action.
// #210: buy-tessera at the Clearing House kiosk is the citizen Tessera source; it opens with HARIMU_TESSERA_EXCHANGE_ENABLED (#626), not with the registry.
export async function GET(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return privateJson({ error: 'Sign in required.' }, 401);
  const db = await getDatabase();
  const url = new URL(request.url), x = url.searchParams.get('x'), y = url.searchParams.get('y');
  // #1482 / #1492: listing price for ?x=&y=, or the d = 0 term when both are omitted. Flag on: no nation or no capital is refused on both paths. Non-integer or off-map coords are the purchase 400.
  const priced = await registryListingPrice(db, userId, env, x, y);
  if (!priced.ok) return privateJson({ error: priced.error, reason: priced.reason }, priced.status);
  const listing = { open: enabled(), priceMinor: priced.priceMinor, currency: 'TSR', tesseraMinor: await readTessera(db, userId),
    kiosk: { open: exchangeEnabled(), sparkPerTessera, minTesseraMinor: kioskMinTesseraMinor, maxTesseraMinor: kioskMaxTesseraMinor } };
  // #1341: one square's poster. Flag off leaves this payload unchanged and does not read the poster table. Not attached to GET /api/world/squares.
  if (!postersEnabled(env)) return privateJson(listing);
  if (x === null && y === null) return privateJson(listing);
  const xi = Number(x), yi = Number(y);
  // #1429: fog is applied inside readVisiblePoster. #1503: reportsEnabled and poster.mine (no clerk_user_id).
  const poster = await readVisiblePoster(db, userId, xi, yi, env, Math.floor(Date.now() / 1000));
  return privateJson({ ...listing, poster: poster ?? null, reportsEnabled: (env as unknown as { HARIMU_REPORTS_ENABLED?: string }).HARIMU_REPORTS_ENABLED === 'true' });
}

export async function POST(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return privateJson({ error: 'Sign in required.' }, 401);
  if (!isSameOriginCommand(request)) return privateJson({ error: 'Same-origin request required.' }, 403);
  let body: Record<string, unknown>;
  try { body = await readCommandObject(request, 1024); } catch { return privateJson({ error: 'Send a buy-square or buy-tessera command.', reason: 'bad_request' }, 400); }
  // #384 L1: the travel read runs only when the command's own flag is on; flag off, the lib refuses before any DB statement.
  const posterAction = body.action === 'place-poster' || body.action === 'remove-poster';
  if (!posterAction && (body.action === 'buy-tessera' ? exchangeEnabled() : enabled())) { // #123: location-bound while travelling (QA1 on #264); no-op unless HARIMU_TRAVEL_ENABLED=true. Poster commands are not travel-bound.
    const blocked = await travelBlock(await getDatabase(), userId, Math.floor(Date.now() / 1000), (env as unknown as { HARIMU_TRAVEL_ENABLED?: string }).HARIMU_TRAVEL_ENABLED === 'true');
    if (blocked) return privateJson({ error: blocked, reason: 'traveling' }, 409);
  }
  if (posterAction) { // #1341. Flag off returns before any poster statement.
    if (!postersEnabled(env)) return privateJson({ error: 'Square posters are not open yet.', reason: 'disabled' }, 403);
    const parsed = parsePosterCommand(body);
    if ('status' in parsed) return privateJson({ error: parsed.error, reason: parsed.reason }, parsed.status);
    const result = await applyPoster(await getDatabase(), userId, parsed, Math.floor(Date.now() / 1000), env);
    return result.ok ? privateJson(result) : privateJson({ error: result.error, reason: result.reason }, result.status);
  }
  if (body.action === 'buy-tessera') {
    const exchange = parseExchangeCommand(body);
    if (!exchange) {
      // Distinct reasons so the UI can word them: an amount outside the kiosk range is `out_of_range`; a missing or malformed requestId stays `bad_request`.
      const amount = body.tesseraMinor;
      const inRange = Number.isSafeInteger(amount) && (amount as number) >= kioskMinTesseraMinor && (amount as number) <= kioskMaxTesseraMinor;
      return privateJson({ error: `Send action "buy-tessera", an integer tesseraMinor between ${kioskMinTesseraMinor} and ${kioskMaxTesseraMinor} and a requestId.`, reason: inRange ? 'bad_request' : 'out_of_range' }, 400);
    }
    const bought = await buyTessera(await getDatabase(), userId, exchange, Math.floor(Date.now() / 1000), exchangeEnabled());
    return bought.ok ? privateJson(bought) : privateJson({ error: bought.error, reason: bought.reason }, bought.status);
  }
  const command = parsePurchaseCommand(body);
  if (!command) return privateJson({ error: purchaseBadRequestError, reason: 'bad_request' }, 400);
  const result = await buySquare(await getDatabase(), userId, command, Math.floor(Date.now() / 1000), enabled(), env);
  return result.ok ? privateJson(result) : privateJson({ error: result.error, reason: result.reason }, result.status);
}

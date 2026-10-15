import { travelBlock } from '@/lib/travel';
import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { isSameOriginCommand, readCommandObject } from '@/lib/command-request';
import { buySquare, parsePurchaseCommand, readTessera, squarePriceMinor } from '@/lib/world-registry';
import { buyTessera, parseExchangeCommand, sparkPerTessera, kioskMinTesseraMinor, kioskMaxTesseraMinor } from '@/lib/tessera-exchange';

export const dynamic = 'force-dynamic';
const privateJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const enabled = () => (env as unknown as { HARIMU_SQUARE_PURCHASE_ENABLED?: string }).HARIMU_SQUARE_PURCHASE_ENABLED === 'true';

// #122: World Registry listing (price + your Tessera) and the buy-square action.
// #210: buy-tessera at the Clearing House kiosk is the citizen Tessera source; it opens with the registry.
export async function GET(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return privateJson({ error: 'Sign in required.' }, 401);
  return privateJson({ open: enabled(), priceMinor: squarePriceMinor, currency: 'TSR', tesseraMinor: await readTessera(await getDatabase(), userId),
    kiosk: { sparkPerTessera, minTesseraMinor: kioskMinTesseraMinor, maxTesseraMinor: kioskMaxTesseraMinor } });
}

export async function POST(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return privateJson({ error: 'Sign in required.' }, 401);
  { // #123: location-bound while travelling (QA1 on #264); no-op unless HARIMU_TRAVEL_ENABLED=true.
    const blocked = await travelBlock(await getDatabase(), userId, Math.floor(Date.now() / 1000), (env as unknown as { HARIMU_TRAVEL_ENABLED?: string }).HARIMU_TRAVEL_ENABLED === 'true');
    if (blocked) return privateJson({ error: blocked, reason: 'traveling' }, 409);
  }
  if (!isSameOriginCommand(request)) return privateJson({ error: 'Same-origin request required.' }, 403);
  let body: Record<string, unknown>;
  try { body = await readCommandObject(request, 1024); } catch { return privateJson({ error: 'Send a buy-square or buy-tessera command.', reason: 'bad_request' }, 400); }
  if (body.action === 'buy-tessera') {
    const exchange = parseExchangeCommand(body);
    if (!exchange) {
      // Distinct reasons so the UI can word them: an amount outside the kiosk range is `out_of_range`; a missing or malformed requestId stays `bad_request`.
      const amount = body.tesseraMinor;
      const inRange = Number.isSafeInteger(amount) && (amount as number) >= kioskMinTesseraMinor && (amount as number) <= kioskMaxTesseraMinor;
      return privateJson({ error: `Send action "buy-tessera", an integer tesseraMinor between ${kioskMinTesseraMinor} and ${kioskMaxTesseraMinor} and a requestId.`, reason: inRange ? 'bad_request' : 'out_of_range' }, 400);
    }
    const bought = await buyTessera(await getDatabase(), userId, exchange, Math.floor(Date.now() / 1000), enabled());
    return bought.ok ? privateJson(bought) : privateJson({ error: bought.error, reason: bought.reason }, bought.status);
  }
  const command = parsePurchaseCommand(body);
  if (!command) return privateJson({ error: 'Send action "buy-square", integer x/y and a requestId.', reason: 'bad_request' }, 400);
  const result = await buySquare(await getDatabase(), userId, command, Math.floor(Date.now() / 1000), enabled());
  return result.ok ? privateJson(result) : privateJson({ error: result.error, reason: result.reason }, result.status);
}

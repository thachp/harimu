import { travelBlock } from '@/lib/travel';
import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { isSameOriginCommand, readCommandObject } from '@/lib/command-request';
import { buySquare, parsePurchaseCommand, readTessera, squarePriceMinor } from '@/lib/world-registry';

export const dynamic = 'force-dynamic';
const privateJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const enabled = () => (env as unknown as { HARIMU_SQUARE_PURCHASE_ENABLED?: string }).HARIMU_SQUARE_PURCHASE_ENABLED === 'true';

// #122: World Registry listing (price + your Tessera) and the buy-square action.
export async function GET(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return privateJson({ error: 'Sign in required.' }, 401);
  return privateJson({ open: enabled(), priceMinor: squarePriceMinor, currency: 'TSR', tesseraMinor: await readTessera(await getDatabase(), userId, enabled()) });
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
  try { body = await readCommandObject(request, 1024); } catch { return privateJson({ error: 'Send a buy-square command.', reason: 'bad_request' }, 400); }
  const command = parsePurchaseCommand(body);
  if (!command) return privateJson({ error: 'Send action "buy-square", integer x/y and a requestId.', reason: 'bad_request' }, 400);
  const result = await buySquare(await getDatabase(), userId, command, Math.floor(Date.now() / 1000), enabled());
  return result.ok ? privateJson(result) : privateJson({ error: result.error, reason: result.reason }, result.status);
}

import { env } from 'cloudflare:workers';
import { getDatabase } from '@/lib/db';
import { readActiveWars } from '@/lib/army-map';
import { armyBattlesEnabled, readBattles } from '@/lib/army-battle';

// #738 battles slice: the battles under way or decided at each staged attacker's target capital. Public like the army positions overlay (MVP; a
// future fog-of-war setting may restrict this). Flag off: a 404 that opens no database. GET only; it never writes (results are derived on read).
export const dynamic = 'force-dynamic';
export async function GET() {
  if (!armyBattlesEnabled(env)) return Response.json({ error: 'Not found.', reason: 'not_found' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
  const db = await getDatabase(), now = Math.floor(Date.now() / 1000);
  return Response.json({ battles: await readBattles(db, await readActiveWars(db), now) }, { headers: { 'Cache-Control': 'private, no-store' } });
}

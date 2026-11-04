import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { marchPace, readActiveWars } from '@/lib/army-map';
import { armyBattlesEnabled, presentBattle, readBattles } from '@/lib/army-battle';
import { winterMarchEnabled } from '@/lib/winter-march'; // #1038

// #738 battles slice: the battles under way or decided at each staged attacker's target capital. Public like the army positions overlay (MVP; a
// future fog-of-war setting may restrict this). Flag off: a 404 that opens no database. GET only; it never writes (results are derived on read).
// #1061: a live battle includes stance counts only for the viewer's nation. A resolved battle includes both. Signed-out viewers are not on a side.
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  if (!armyBattlesEnabled(env)) return Response.json({ error: 'Not found.', reason: 'not_found' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
  const db = await getDatabase(), now = Math.floor(Date.now() / 1000);
  const userId = await authenticatedUserId(request);
  const nation = userId ? (await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ nation_id: string | null }>())?.nation_id ?? null : null;
  const battles = await readBattles(db, await readActiveWars(db), now, await marchPace(db, winterMarchEnabled(env)));
  return Response.json({ battles: battles.map(b => presentBattle(b, nation)) }, { headers: { 'Cache-Control': 'private, no-store' } });
}

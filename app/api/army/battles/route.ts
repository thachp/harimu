import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { marchPace, nationCapital, readActiveWars } from '@/lib/army-map';
import { armyBattlesEnabled, battleTerrainEnabled, presentBattle, readBattles } from '@/lib/army-battle';
import { winterMarchEnabled } from '@/lib/winter-march'; // #1038
import { flagOn } from '@/lib/flag-pack.mjs';
import { korundFogSquares, korundMapFogFlag } from '@/lib/korund-map-fog';
import { readWorldSquares } from '@/lib/map-zones';

// #738 battles slice: the battles under way or decided at each staged attacker's target capital. Public like the army positions overlay (MVP; a
// future fog-of-war setting may restrict this). Flag off: a 404 that opens no database. GET only; it never writes (results are derived on read).
// #1061: a live battle includes stance counts only for the viewer's nation. A resolved battle includes both. Signed-out viewers are not on a side.
// #1425: a signed-in Korund viewer, with HARIMU_KORUND_MAP_FOG_ENABLED on, still only sees battles whose defender capital is a Korund square or
// a Chebyshev-1 neighbour (docs §11.5 information fog / §15.3 battle square). That is not general military fog of war.
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  if (!armyBattlesEnabled(env)) return Response.json({ error: 'Not found.', reason: 'not_found' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
  const db = await getDatabase(), now = Math.floor(Date.now() / 1000);
  const userId = await authenticatedUserId(request);
  const nation = userId ? (await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ nation_id: string | null }>())?.nation_id ?? null : null;
  const battles = await readBattles(db, await readActiveWars(db), now, await marchPace(db, winterMarchEnabled(env)), battleTerrainEnabled(env) ? { terrain: true } : undefined);
  const headers = { 'Cache-Control': 'private, no-store' };
  // #1425: flag off skips the squares read so the existing read set stays the same.
  if (!flagOn(env, korundMapFogFlag) || nation !== 'korund') return Response.json({ battles: battles.map(b => presentBattle(b, nation)) }, { headers });
  const visible = new Set(korundFogSquares((await readWorldSquares(db)).squares).map(square => `${square.x},${square.y}`));
  const visibleBattles = battles.filter(battle => {
    const capital = nationCapital(battle.defenderNationId);
    return capital !== null && visible.has(`${capital.x},${capital.y}`);
  });
  return Response.json({ battles: visibleBattles.map(b => presentBattle(b, nation)) }, { headers });
}

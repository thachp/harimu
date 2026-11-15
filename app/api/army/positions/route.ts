import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { armyMapEnabled, marchPace, readActiveWars, readArmyPositions } from '@/lib/army-map';
import { ARMY_SUPPLY_RANGE_SQUARES, armySupplyEnabled, withSupply } from '@/lib/army-supply';
import { winterMarchEnabled } from '@/lib/winter-march'; // #1038
import { armyQuartermasterEnabled, readQuartermasterExtra } from '@/lib/army-quartermaster'; // #1053
import { flagOn } from '@/lib/flag-pack.mjs';
import { korundFogSquares, korundMapFogFlag } from '@/lib/korund-map-fog';
import { readWorldSquares } from '@/lib/map-zones';

// #738 slice 4: unit positions for the "Army positions" map overlay. Public like the other overlay reads (no fog of war yet). Flag off: a 404
// that opens no database. GET only; it never writes.
export const dynamic = 'force-dynamic';
// Visibility (ARC on #891): positions are public for MVP; a future fog-of-war setting may restrict this.
// #1417: a signed-in Korund viewer, with HARIMU_KORUND_MAP_FOG_ENABLED on, still only sees units on Korund and adjacent squares
// (docs §11.5 information fog, same rule as the other map overlays). That is not general military fog of war.
export async function GET(request: Request) {
  if (!armyMapEnabled(env)) return Response.json({ error: 'Not found.', reason: 'not_found' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
  const db = await getDatabase(), now = Math.floor(Date.now() / 1000), wars = await readActiveWars(db), pace = await marchPace(db, winterMarchEnabled(env)), map = await readArmyPositions(db, now, wars, pace);
  // #738 slice 5: each unit's supply only while HARIMU_ARMY_SUPPLY_ENABLED is on (off: the slice-4 shape, same single read). Winter adds a clock read only while its flag is on.
  // #1053: quartermaster shifts widen each unit's range (one read, only while that flag is on).
  const qm = armySupplyEnabled(env) && armyQuartermasterEnabled(env) ? await readQuartermasterExtra(db, now) : null;
  const units = armySupplyEnabled(env) ? withSupply(map.units, wars, now, pace, n => qm?.get(n) ?? 0).map(u => qm ? { ...u, supply: { ...u.supply, rangeSquares: ARMY_SUPPLY_RANGE_SQUARES + (qm.get(u.nationId) ?? 0) } } : u) : null;
  const body = units ? { ...map, units } : map;
  const headers = { 'Cache-Control': 'private, no-store' };
  // #1417: flag off skips the squares read so the wars-table read count stays the same.
  if (!flagOn(env, korundMapFogFlag)) return Response.json(body, { headers });
  const userId = await authenticatedUserId(request);
  if (!userId) return Response.json(body, { headers });
  const row = await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ nation_id: string | null }>();
  if (row?.nation_id !== 'korund') return Response.json(body, { headers });
  const visible = new Set(korundFogSquares((await readWorldSquares(db)).squares).map(square => `${square.x},${square.y}`));
  return Response.json({ ...body, units: body.units.filter(unit => visible.has(`${unit.x},${unit.y}`)) }, { headers });
}

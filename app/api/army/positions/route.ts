import { env } from 'cloudflare:workers';
import { getDatabase } from '@/lib/db';
import { armyMapEnabled, marchPace, readActiveWars, readArmyPositions } from '@/lib/army-map';
import { ARMY_SUPPLY_RANGE_SQUARES, armySupplyEnabled, withSupply } from '@/lib/army-supply';
import { winterMarchEnabled } from '@/lib/winter-march'; // #1038
import { armyQuartermasterEnabled, readQuartermasterExtra } from '@/lib/army-quartermaster'; // #1053

// #738 slice 4: unit positions for the "Army positions" map overlay. Public like the other overlay reads (no fog of war yet). Flag off: a 404
// that opens no database. GET only; it never writes.
export const dynamic = 'force-dynamic';
// Visibility (ARC on #891): positions are public for MVP; a future fog-of-war setting may restrict this.
export async function GET() {
  if (!armyMapEnabled(env)) return Response.json({ error: 'Not found.', reason: 'not_found' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
  const db = await getDatabase(), now = Math.floor(Date.now() / 1000), wars = await readActiveWars(db), pace = await marchPace(db, winterMarchEnabled(env)), map = await readArmyPositions(db, now, wars, pace);
  // #738 slice 5: each unit's supply only while HARIMU_ARMY_SUPPLY_ENABLED is on (off: the slice-4 shape, same single read). Winter adds a clock read only while its flag is on.
  // #1053: quartermaster shifts widen each unit's range (one read, only while that flag is on).
  const qm = armySupplyEnabled(env) && armyQuartermasterEnabled(env) ? await readQuartermasterExtra(db, now) : null;
  const units = armySupplyEnabled(env) ? withSupply(map.units, wars, now, pace, n => qm?.get(n) ?? 0).map(u => qm ? { ...u, supply: { ...u.supply, rangeSquares: ARMY_SUPPLY_RANGE_SQUARES + (qm.get(u.nationId) ?? 0) } } : u) : null;
  return Response.json(units ? { ...map, units } : map, { headers: { 'Cache-Control': 'private, no-store' } });
}

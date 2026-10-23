import { env } from 'cloudflare:workers';
import { getDatabase } from '@/lib/db';
import { armyMapEnabled, readActiveWars, readArmyPositions } from '@/lib/army-map';
import { armySupplyEnabled, withSupply } from '@/lib/army-supply';

// #738 slice 4: unit positions for the "Army positions" map overlay. Public like the other overlay reads (no fog of war yet). Flag off: a 404
// that opens no database. GET only; it never writes.
export const dynamic = 'force-dynamic';
// Visibility (ARC on #891): positions are public for MVP; a future fog-of-war setting may restrict this.
export async function GET() {
  if (!armyMapEnabled(env)) return Response.json({ error: 'Not found.', reason: 'not_found' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
  const db = await getDatabase(), now = Math.floor(Date.now() / 1000), wars = await readActiveWars(db), map = await readArmyPositions(db, now, wars);
  // #738 slice 5: each unit's supply only while HARIMU_ARMY_SUPPLY_ENABLED is on (off: the slice-4 shape, same single read).
  return Response.json(armySupplyEnabled(env) ? { ...map, units: withSupply(map.units, wars, now) } : map, { headers: { 'Cache-Control': 'private, no-store' } });
}

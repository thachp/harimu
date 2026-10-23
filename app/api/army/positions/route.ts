import { env } from 'cloudflare:workers';
import { getDatabase } from '@/lib/db';
import { armyMapEnabled, readArmyPositions } from '@/lib/army-map';

// #738 slice 4: unit positions for the "Army positions" map overlay. Public like the other overlay reads (no fog of war yet). Flag off: a 404
// that opens no database. GET only; it never writes.
export const dynamic = 'force-dynamic';
// Visibility (ARC on #891): positions are public for MVP; a future fog-of-war setting may restrict this.
export async function GET() {
  if (!armyMapEnabled(env)) return Response.json({ error: 'Not found.', reason: 'not_found' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
  return Response.json(await readArmyPositions(await getDatabase(), Math.floor(Date.now() / 1000)), { headers: { 'Cache-Control': 'private, no-store' } });
}

import { travelBlock } from '@/lib/travel';
import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { isSameOriginCommand, readCommandObject } from '@/lib/command-request';
import { foundCity, parseFoundingCommand } from '@/lib/city-founding';
import { cityImportsFields, citySpecialtyFields, cityCaptureNote } from '@/lib/cities'; // #996 / #1001 / #1002
import { cityTierName, cityTierUnlockFields, cityTierFestivalNote } from '@/lib/city-tier'; // #952 / #979 / #984
import { flagOn } from '@/lib/flag-pack.mjs'; // #988 / #1003

export const dynamic = 'force-dynamic';
const privateJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

// #124: found a T1 city on Wildlands via the nation's flag-gated stub authority.
export async function POST(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return privateJson({ error: 'Sign in required.' }, 401);
  const enabled = (env as unknown as { HARIMU_CITY_FOUNDING_ENABLED?: string }).HARIMU_CITY_FOUNDING_ENABLED === 'true';
  // #384 L1: flag off answers before the travel read or the citizen read (same body as foundCity's own refusal).
  if (!enabled) return privateJson({ error: 'City founding is not enabled yet.', reason: 'disabled' }, 403);
  { // #123: location-bound while travelling (QA1 on #264); no-op unless HARIMU_TRAVEL_ENABLED=true.
    const blocked = await travelBlock(await getDatabase(), userId, Math.floor(Date.now() / 1000), (env as unknown as { HARIMU_TRAVEL_ENABLED?: string }).HARIMU_TRAVEL_ENABLED === 'true');
    if (blocked) return privateJson({ error: blocked, reason: 'traveling' }, 409);
  }
  if (!isSameOriginCommand(request)) return privateJson({ error: 'Same-origin request required.' }, 403);
  let body: Record<string, unknown>;
  try { body = await readCommandObject(request, 2048); } catch { return privateJson({ error: 'Send a founding command.', reason: 'bad_request' }, 400); }
  const command = parseFoundingCommand(body);
  if (!command) return privateJson({ error: 'Send action, integer x/y, a 2–40 letter city name and a requestId.', reason: 'bad_request' }, 400);
  const db = await getDatabase();
  const citizen = await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ nation_id: string }>();
  const result = await foundCity(db, userId, citizen?.nation_id ?? null, command, Math.floor(Date.now() / 1000), enabled);
  if (!result.ok) return privateJson({ error: result.error, reason: result.reason }, result.status);
  // #952: flag off keeps the founding body (tier 1, no tier name). Flag on names the stored tier.
  // #979: unlocks flag adds districtSlots + unlocks (and tierName) from the doc table; flag off leaves the body unchanged.
  // #984: festival-note flag adds festivalNote from the Cities tier table; flag off leaves the body unchanged.
  // #996: specialty flag adds specialtyRole/specialtyNote when the city is in the catalog (founded cities omit).
  // #1002: capture-note flag adds captureNote for catalog/outpost cities (founded cities omit until square-zone lookup).
  // #1001: imports flag adds importsNote when the catalog role is Port or Trade zone (founded cities omit).
  const growth = flagOn(env, 'HARIMU_CITY_TIER_GROWTH_ENABLED');
  const unlocksOn = flagOn(env, 'HARIMU_CITY_TIER_UNLOCKS_ENABLED');
  const noteOn = flagOn(env, 'HARIMU_CITY_TIER_FESTIVAL_NOTE_ENABLED');
  const specialtyOn = flagOn(env, 'HARIMU_CITY_SPECIALTY_NOTE_ENABLED');
  const captureOn = flagOn(env, 'HARIMU_CITY_CAPTURE_NOTE_ENABLED');
  const importsOn = flagOn(env, 'HARIMU_CITY_IMPORTS_NOTE_ENABLED'); // direct string still wins
  const tier = growth ? result.city.tier : 1;
  let city: Record<string, unknown> = growth ? { ...result.city, tier, tierName: cityTierName(tier) } : { ...result.city, tier };
  if (unlocksOn) city = { ...city, ...cityTierUnlockFields(tier) };
  if (noteOn) city = { ...city, festivalNote: cityTierFestivalNote(tier) };
  if (specialtyOn) { const s = citySpecialtyFields(result.city.nationId, result.city.id); if (s) city = { ...city, ...s }; }
  if (captureOn) { const n = cityCaptureNote(result.city.nationId, result.city.id); if (n) city = { ...city, captureNote: n }; }
  if (importsOn) { const n = cityImportsFields(result.city.nationId, result.city.id); if (n) city = { ...city, ...n }; }
  return privateJson({ ...result, city });
}

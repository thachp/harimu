import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { isSameOriginCommand, readCommandObject } from '@/lib/command-request';
import { readCityLocation } from '@/lib/city-location';
import { travelBlock } from '@/lib/travel';
import { uuidPattern, validSquareText } from '@/lib/square-chat-validation';
import { isShadowMuted, logShadowMuted, parseShadowMute } from '@/lib/chat-shadow-mute';
import { cityChatFlagOn, postCityChatBinds, postCityChatSql, readCityChat } from '@/lib/city-chat';

// #881: city chat. Flag HARIMU_CITY_CHAT_ENABLED off: 404 before auth or any DB access.
export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const vars = () => env as unknown as { HARIMU_CHAT_SHADOW_MUTE?: string; HARIMU_TRAVEL_ENABLED?: string; HARIMU_REPORTS_ENABLED?: string };
const now = () => Math.floor(Date.now() / 1000);
async function citizen(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return { error: json({ error: 'Sign in required.' }, 401) };
  const db = await getDatabase();
  const nationId = (await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ nation_id: string | null }>())?.nation_id;
  if (!nationId) return { error: json({ error: 'Enroll in a nation first.' }, 403) };
  return { userId, db, nationId };
}
const view = async (db: Awaited<ReturnType<typeof getDatabase>>, userId: string, nationId: string, t: number) =>
  json({ ...await readCityChat(db, userId, nationId, t, parseShadowMute(vars().HARIMU_CHAT_SHADOW_MUTE)), reportsEnabled: vars().HARIMU_REPORTS_ENABLED === 'true' });

export async function GET(request: Request) {
  if (!cityChatFlagOn(env)) return json({ error: 'Not found.', reason: 'not_found' }, 404);
  const c = await citizen(request); if (c.error) return c.error;
  return view(c.db, c.userId, c.nationId, now());
}
export async function POST(request: Request) {
  if (!cityChatFlagOn(env)) return json({ error: 'Not found.', reason: 'not_found' }, 404);
  if (!isSameOriginCommand(request)) return json({ error: 'Same-origin request required.' }, 403);
  let body: Record<string, unknown>;
  try { body = await readCommandObject(request, 4096); } catch { return json({ error: 'Invalid request.' }, 400); }
  const c = await citizen(request); if (c.error) return c.error;
  const { db, userId, nationId } = c, t = now();
  if (typeof body.expectedCityId !== 'string') return json({ error: 'Refresh the city conversation first.', reason: 'bad_request' }, 400);
  const { currentCityId } = await readCityLocation(db, userId, nationId, t);
  if (body.expectedCityId !== currentCityId) return json({ error: 'City changed. Refresh your current city first.', reason: 'city_changed' }, 409);
  if (typeof body.id !== 'string' || !uuidPattern.test(body.id)) return json({ error: 'Invalid message.' }, 400);
  const id = body.id.toLowerCase();
  if (body.action === 'delete') {
    const done = await db.prepare("UPDATE city_chat_messages SET deleted=1,body='[removed]' WHERE id=? AND user_id=? AND nation_id=? AND deleted=0").bind(id, userId, nationId).run();
    if (!done.meta.changes) return json({ error: 'Message unavailable.' }, 404);
    return view(db, userId, nationId, t);
  }
  if (body.action !== 'post') return json({ error: 'Unknown action.' }, 400);
  if (!validSquareText(body.text)) return json({ error: 'Use 1–280 plain-text characters.' }, 400);
  const text = body.text.trim();
  const blocked = await travelBlock(db, userId, t, vars().HARIMU_TRAVEL_ENABLED === 'true'); if (blocked) return json({ error: blocked, reason: 'traveling' }, 409);
  const same = (row: { user_id: string; body: string; city_id: string; deleted: number } | null) => row && row.user_id === userId && row.body === text && row.city_id === currentCityId && !row.deleted;
  const prior = await db.prepare('SELECT user_id,body,city_id,deleted FROM city_chat_messages WHERE id=?').bind(id).first<{ user_id: string; body: string; city_id: string; deleted: number }>();
  if (prior) return same(prior) ? view(db, userId, nationId, t) : json({ error: 'Request already used.' }, 409);
  await db.prepare('INSERT OR IGNORE INTO square_handles(user_id,handle) VALUES (?,?)').bind(userId, `Citizen-${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`).run();
  const result = await db.prepare(postCityChatSql).bind(...postCityChatBinds(id, text, t, userId, nationId, currentCityId)).run();
  if (!result.meta.changes) {
    const replay = await db.prepare('SELECT user_id,body,city_id,deleted FROM city_chat_messages WHERE id=?').bind(id).first<{ user_id: string; body: string; city_id: string; deleted: number }>();
    if (!same(replay)) return json({ error: 'Wait 10 seconds between messages; limit 20 per hour.', reason: 'rate_limited' }, 429);
  } else if (isShadowMuted(parseShadowMute(vars().HARIMU_CHAT_SHADOW_MUTE), userId, t)) logShadowMuted(userId, id); // #790
  return view(db, userId, nationId, t);
}

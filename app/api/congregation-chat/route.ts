import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { isSameOriginCommand, readCommandObject } from '@/lib/command-request';
import { uuidPattern, validSquareText } from '@/lib/square-chat-validation';
import { isShadowMuted, logShadowMuted, parseShadowMute } from '@/lib/chat-shadow-mute';
import { congregationCatalog, currentCongregation } from '@/lib/congregations';
import { congregationChatFlagOn, postCongregationChatBinds, postCongregationChatSql, readCongregationChat } from '@/lib/congregation-chat';

// #1342: congregation channel. Flag HARIMU_CONGREGATION_CHAT_ENABLED off: 404 before auth or any DB access.
export const dynamic = 'force-dynamic';
type Db = Awaited<ReturnType<typeof getDatabase>>;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const vars = () => env as unknown as { HARIMU_CHAT_SHADOW_MUTE?: string };
const now = () => Math.floor(Date.now() / 1000);
const notFound = () => json({ error: 'Not found.', reason: 'not_found' }, 404);
async function citizen(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return { error: json({ error: 'Sign in required.' }, 401) };
  const db = await getDatabase();
  const nationId = (await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ nation_id: string | null }>())?.nation_id;
  if (!nationId) return { error: json({ error: 'Enroll in a nation first.' }, 403) };
  return { userId, db };
}
/** The channel this citizen may use. A named id must be a joinable congregation (Korund public ones have no channel: 404); a non-member gets 403. */
async function channel(db: Db, userId: string, requested: unknown) {
  if (requested !== undefined && !congregationCatalog().some(c => c.id === requested && c.joinable)) return { error: json({ error: 'No such congregation channel.', reason: 'no_channel' }, 404) };
  const cong = await currentCongregation(db, userId);
  if (!cong || (requested !== undefined && cong.id !== requested)) return { error: json({ error: 'Only current members of this congregation can use its channel.', reason: 'not_member' }, 403) };
  return { congregationId: cong.id };
}
const view = async (db: Db, userId: string, congregationId: string, t: number) =>
  json(await readCongregationChat(db, userId, congregationId, t, parseShadowMute(vars().HARIMU_CHAT_SHADOW_MUTE)));

export async function GET(request: Request) {
  if (!congregationChatFlagOn(env)) return notFound();
  const c = await citizen(request); if (c.error) return c.error;
  const ch = await channel(c.db, c.userId, new URL(request.url).searchParams.get('congregationId') ?? undefined); if (ch.error) return ch.error;
  return view(c.db, c.userId, ch.congregationId, now());
}
export async function POST(request: Request) {
  if (!congregationChatFlagOn(env)) return notFound();
  if (!isSameOriginCommand(request)) return json({ error: 'Same-origin request required.' }, 403);
  let body: Record<string, unknown>;
  try { body = await readCommandObject(request, 4096); } catch { return json({ error: 'Invalid request.' }, 400); }
  const c = await citizen(request); if (c.error) return c.error;
  const { db, userId } = c, t = now();
  if (typeof body.id !== 'string' || !uuidPattern.test(body.id)) return json({ error: 'Invalid message.' }, 400);
  const id = body.id.toLowerCase();
  if (body.action === 'delete') { // own post only, even after the author left the congregation
    const done = await db.prepare("UPDATE congregation_messages SET deleted=1,body='[removed]' WHERE id=? AND user_id=? AND deleted=0").bind(id, userId).run();
    if (!done.meta.changes) return json({ error: 'Message unavailable.' }, 404);
    const cong = await currentCongregation(db, userId);
    return cong ? view(db, userId, cong.id, t) : json({ congregationId: null, messages: [] });
  }
  if (body.action !== 'post') return json({ error: 'Unknown action.' }, 400);
  if (typeof body.congregationId !== 'string') return json({ error: 'Name the congregation channel.', reason: 'bad_request' }, 400);
  const ch = await channel(db, userId, body.congregationId); if (ch.error) return ch.error;
  const { congregationId } = ch;
  if (!validSquareText(body.text)) return json({ error: 'Use 1–280 plain-text characters.' }, 400);
  const text = body.text.trim();
  type Prior = { user_id: string; body: string; congregation_id: string; deleted: number };
  const same = (row: Prior | null) => row && row.user_id === userId && row.body === text && row.congregation_id === congregationId && !row.deleted;
  const prior = await db.prepare('SELECT user_id,body,congregation_id,deleted FROM congregation_messages WHERE id=?').bind(id).first<Prior>();
  if (prior) return same(prior) ? view(db, userId, congregationId, t) : json({ error: 'Request already used.' }, 409);
  await db.prepare('INSERT OR IGNORE INTO square_handles(user_id,handle) VALUES (?,?)').bind(userId, `Citizen-${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`).run();
  const result = await db.prepare(postCongregationChatSql).bind(...postCongregationChatBinds(id, text, t, userId, congregationId)).run();
  if (!result.meta.changes) {
    const replay = await db.prepare('SELECT user_id,body,congregation_id,deleted FROM congregation_messages WHERE id=?').bind(id).first<Prior>();
    if (!same(replay)) {
      if (replay) return json({ error: 'Request already used.' }, 409); // another citizen won the same id
      if (!await db.prepare('SELECT 1 AS x FROM congregation_members WHERE user_id=? AND congregation_id=?').bind(userId, congregationId).first()) // left between the check and the write
        return json({ error: 'Only current members of this congregation can use its channel.', reason: 'not_member' }, 403);
      return json({ error: 'Wait 10 seconds between messages; limit 20 per hour.', reason: 'rate_limited' }, 429);
    }
  } else if (isShadowMuted(parseShadowMute(vars().HARIMU_CHAT_SHADOW_MUTE), userId, t)) logShadowMuted(userId, id); // #790
  return view(db, userId, congregationId, t);
}

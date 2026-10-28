import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { isSameOriginCommand, readCommandObject } from '@/lib/command-request';
import { uuidPattern, validSquareText } from '@/lib/square-chat-validation';
import { isShadowMuted, logShadowMuted, parseShadowMute } from '@/lib/chat-shadow-mute';
import { embassyChannelId, embassyChatFlagOn, isEmbassyNation, postEmbassyChatBinds, postEmbassyChatSql, readEmbassyChat } from '@/lib/embassy-chat';

// #882: embassy chat between two live nations. Flag HARIMU_EMBASSY_CHAT_ENABLED off: 404 before auth or any DB access.
export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const vars = () => env as unknown as { HARIMU_CHAT_SHADOW_MUTE?: string; HARIMU_REPORTS_ENABLED?: string };
const now = () => Math.floor(Date.now() / 1000);
async function citizen(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return { error: json({ error: 'Sign in required.' }, 401) };
  const db = await getDatabase();
  const nationId = (await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ nation_id: string | null }>())?.nation_id;
  if (!nationId || !isEmbassyNation(nationId)) return { error: json({ error: 'Enroll in a nation first.' }, 403) };
  return { userId, db, nationId };
}
const peerOf = (value: unknown) => typeof value === 'string' && isEmbassyNation(value) ? value : null;
const view = async (db: Awaited<ReturnType<typeof getDatabase>>, userId: string, nationId: string, peerNation: string, t: number) =>
  json({ ...await readEmbassyChat(db, userId, nationId, peerNation, t, parseShadowMute(vars().HARIMU_CHAT_SHADOW_MUTE)), reportsEnabled: vars().HARIMU_REPORTS_ENABLED === 'true' });

export async function GET(request: Request) {
  if (!embassyChatFlagOn(env)) return json({ error: 'Not found.', reason: 'not_found' }, 404);
  const c = await citizen(request); if (c.error) return c.error;
  const peerNation = peerOf(new URL(request.url).searchParams.get('peerNation'));
  if (!peerNation || peerNation === c.nationId) return json({ error: 'Choose another nation\'s embassy.' }, 400);
  return view(c.db, c.userId, c.nationId, peerNation, now());
}
export async function POST(request: Request) {
  if (!embassyChatFlagOn(env)) return json({ error: 'Not found.', reason: 'not_found' }, 404);
  if (!isSameOriginCommand(request)) return json({ error: 'Same-origin request required.' }, 403);
  let body: Record<string, unknown>;
  try { body = await readCommandObject(request, 4096); } catch (e) { return json({ error: e instanceof Error && e.message === 'Request too large.' ? 'Request too large.' : 'Invalid request.' }, e instanceof Error && e.message === 'Request too large.' ? 413 : 400); }
  const c = await citizen(request); if (c.error) return c.error;
  const { db, userId, nationId } = c, t = now(), peerNation = peerOf(body.peerNation);
  if (!peerNation || peerNation === nationId) return json({ error: 'Choose another nation\'s embassy.' }, 400);
  if (typeof body.id !== 'string' || !uuidPattern.test(body.id)) return json({ error: 'Invalid message.' }, 400);
  const id = body.id.toLowerCase();
  if (body.action === 'delete') {
    const done = await db.prepare("UPDATE embassy_chat_messages SET deleted=1,body='[removed]' WHERE id=? AND user_id=? AND deleted=0").bind(id, userId).run();
    if (!done.meta.changes) return json({ error: 'Message unavailable.' }, 404);
    return view(db, userId, nationId, peerNation, t);
  }
  if (body.action !== 'post') return json({ error: 'Unknown action.' }, 400);
  if (!validSquareText(body.text)) return json({ error: 'Use 1–280 plain-text characters.' }, 400);
  const text = body.text.trim(), channelId = embassyChannelId(nationId, peerNation);
  type Prior = { user_id: string; body: string; deleted: number };
  const same = (row: Prior | null) => row && row.user_id === userId && row.body === text && !row.deleted;
  const prior = await db.prepare('SELECT user_id,body,deleted FROM embassy_chat_messages WHERE id=?').bind(id).first<Prior>();
  if (prior) return same(prior) ? view(db, userId, nationId, peerNation, t) : json({ error: 'Request already used.' }, 409);
  await db.prepare('INSERT OR IGNORE INTO square_handles(user_id,handle) VALUES (?,?)').bind(userId, `Citizen-${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`).run();
  const result = await db.prepare(postEmbassyChatSql).bind(...postEmbassyChatBinds(id, channelId, text, t, userId, nationId)).run();
  if (!result.meta.changes) {
    const replay = await db.prepare('SELECT user_id,body,deleted FROM embassy_chat_messages WHERE id=?').bind(id).first<Prior>();
    if (replay && !same(replay)) return json({ error: 'Request already used.' }, 409);
    if (!replay && !(await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ nation_id: string | null }>())?.nation_id)
      return json({ error: 'Enroll in a nation first.' }, 403);
    if (!replay) return json({ error: 'Wait 10 seconds between messages; limit 20 per hour.', reason: 'rate_limited' }, 429);
  } else if (isShadowMuted(parseShadowMute(vars().HARIMU_CHAT_SHADOW_MUTE), userId, t)) logShadowMuted(userId, id);
  return view(db, userId, nationId, peerNation, t);
}

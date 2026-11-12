import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { isSameOriginCommand, readCommandObject } from '@/lib/command-request';
import { uuidPattern, validSquareText } from '@/lib/square-chat-validation';
import { isShadowMuted, logShadowMuted, parseShadowMute } from '@/lib/chat-shadow-mute';
import { isPartyId } from '@/lib/primaries-rules';
import { currentParty, partyChatFlagOn, postPartyChatBinds, postPartyChatSql, readPartyChat } from '@/lib/party-chat';

// #1353: Kindle party channel. Flag HARIMU_PARTY_CHAT_ENABLED off: 404 before auth or any DB access. Not gated by HARIMU_PRIMARIES_ENABLED.
export const dynamic = 'force-dynamic';
type Db = Awaited<ReturnType<typeof getDatabase>>;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const vars = () => env as unknown as { HARIMU_CHAT_SHADOW_MUTE?: string };
const now = () => Math.floor(Date.now() / 1000);
const notMember = 'Only current members of this party can use its channel.';
const notFound = () => json({ error: 'Not found.', reason: 'not_found' }, 404);
async function citizen(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return { error: json({ error: 'Sign in required.' }, 401) };
  const db = await getDatabase();
  const nationId = (await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ nation_id: string | null }>())?.nation_id;
  if (!nationId) return { error: json({ error: 'Enroll in a nation first.' }, 403) };
  return { userId, db };
}
/** The channel this citizen may use. A named id must be one of the three Kindle parties (else 404); a non-member gets 403. */
async function channel(db: Db, userId: string, requested: unknown) {
  if (requested !== undefined && !isPartyId(requested)) return { error: json({ error: 'No such party channel.', reason: 'no_channel' }, 404) };
  const party = await currentParty(db, userId);
  if (!party || (requested !== undefined && party !== requested)) return { error: json({ error: notMember, reason: 'not_member' }, 403) };
  return { partyId: party };
}
const view = async (db: Db, userId: string, partyId: string, t: number) =>
  json(await readPartyChat(db, userId, partyId, t, parseShadowMute(vars().HARIMU_CHAT_SHADOW_MUTE)));

export async function GET(request: Request) {
  if (!partyChatFlagOn(env)) return notFound();
  const c = await citizen(request); if (c.error) return c.error;
  const ch = await channel(c.db, c.userId, new URL(request.url).searchParams.get('partyId') ?? undefined); if (ch.error) return ch.error;
  return view(c.db, c.userId, ch.partyId, now());
}
export async function POST(request: Request) {
  if (!partyChatFlagOn(env)) return notFound();
  if (!isSameOriginCommand(request)) return json({ error: 'Same-origin request required.' }, 403);
  let body: Record<string, unknown>;
  try { body = await readCommandObject(request, 4096); } catch { return json({ error: 'Invalid request.' }, 400); }
  const c = await citizen(request); if (c.error) return c.error;
  const { db, userId } = c, t = now();
  if (typeof body.id !== 'string' || !uuidPattern.test(body.id)) return json({ error: 'Invalid message.' }, 400);
  const id = body.id.toLowerCase();
  if (body.action === 'delete') { // own post only, even after the author left the party
    const done = await db.prepare("UPDATE party_messages SET deleted=1,body='[removed]' WHERE id=? AND user_id=? AND deleted=0").bind(id, userId).run();
    if (!done.meta.changes) return json({ error: 'Message unavailable.' }, 404);
    const party = await currentParty(db, userId);
    return party ? view(db, userId, party, t) : json({ partyId: null, messages: [] });
  }
  if (body.action !== 'post') return json({ error: 'Unknown action.' }, 400);
  if (typeof body.partyId !== 'string') return json({ error: 'Name the party channel.', reason: 'bad_request' }, 400);
  const ch = await channel(db, userId, body.partyId); if (ch.error) return ch.error;
  const { partyId } = ch;
  if (!validSquareText(body.text)) return json({ error: 'Use 1–280 plain-text characters.' }, 400);
  const text = body.text.trim();
  type Prior = { user_id: string; body: string; party_id: string; deleted: number };
  const same = (row: Prior | null) => row && row.user_id === userId && row.body === text && row.party_id === partyId && !row.deleted;
  const prior = await db.prepare('SELECT user_id,body,party_id,deleted FROM party_messages WHERE id=?').bind(id).first<Prior>();
  if (prior) return same(prior) ? view(db, userId, partyId, t) : json({ error: 'Request already used.' }, 409);
  await db.prepare('INSERT OR IGNORE INTO square_handles(user_id,handle) VALUES (?,?)').bind(userId, `Citizen-${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`).run();
  const result = await db.prepare(postPartyChatSql).bind(...postPartyChatBinds(id, text, t, userId, partyId)).run();
  if (!result.meta.changes) {
    const replay = await db.prepare('SELECT user_id,body,party_id,deleted FROM party_messages WHERE id=?').bind(id).first<Prior>();
    if (!same(replay)) {
      if (replay) return json({ error: 'Request already used.' }, 409); // another citizen won the same id
      if (!await db.prepare('SELECT 1 AS x FROM party_members WHERE clerk_user_id=? AND party_id=?').bind(userId, partyId).first()) // left between the check and the write
        return json({ error: notMember, reason: 'not_member' }, 403);
      return json({ error: 'Wait 10 seconds between messages; limit 20 per hour.', reason: 'rate_limited' }, 429);
    }
  } else if (isShadowMuted(parseShadowMute(vars().HARIMU_CHAT_SHADOW_MUTE), userId, t)) logShadowMuted(userId, id); // #790
  return view(db, userId, partyId, t);
}

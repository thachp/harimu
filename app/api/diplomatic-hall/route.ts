import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { isSameOriginCommand, readCommandObject } from '@/lib/command-request';
import { hallOpenTo, hallMessageMax, postHallSql, purgeExpiredHall, readHall } from '@/lib/diplomatic-hall';
import { hallRefusalFor, type HallRefusalKey } from '@/lib/diplomatic-hall-copy';
import { uuidPattern, validSquareText } from '@/lib/square-chat-validation';
import { travelBlock } from '@/lib/travel';

// #599 slice 1: the Diplomatic Hall, one channel for Kindle and Aurelle citizens. Behind HARIMU_DIPLOMATIC_HALL_ENABLED ("false"): with the flag off there is no route (404 on every method).
export const dynamic = 'force-dynamic';
const privateJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const hallOn = () => (env as unknown as { HARIMU_DIPLOMATIC_HALL_ENABLED?: string }).HARIMU_DIPLOMATIC_HALL_ENABLED === 'true';
const notFound = () => privateJson({ error: 'Not found.', reason: 'not_found' }, 404);
/** A refusal with a stable `reason` code; the line is the copy module's (#606), with {max} filled in. */
const refuse = (status: number, key: HallRefusalKey) => privateJson({ error: (hallRefusalFor(key)?.line.text ?? '').replace('{max}', String(hallMessageMax)), reason: key }, status);
// [ASSUMPTION] #599: a signed-in citizen with no nation yet gets 403 no_nation (the copy module has no line for it; this is the square's wording).
const noNation = () => privateJson({ error: 'Enroll in a nation first.', reason: 'no_nation' }, 403);

/** Signed in, enrolled, and in an open nation (Kindle or Aurelle), else the refusal to send. */
async function member(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return { refusal: refuse(401, 'signed_out') };
  const db = await getDatabase();
  const profile = await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ nation_id: string | null }>();
  if (!profile?.nation_id) return { refusal: noNation() };
  if (!hallOpenTo(profile.nation_id)) return { refusal: refuse(403, 'nation_closed') };
  return { db, userId, now: Math.floor(Date.now() / 1000) };
}

export async function GET(request: Request) {
  if (!hallOn()) return notFound();
  const ctx = await member(request);
  if (!ctx.db) return ctx.refusal;
  return privateJson(await readHall(ctx.db, ctx.userId, ctx.now));
}

export async function POST(request: Request) {
  if (!hallOn()) return notFound();
  if (!isSameOriginCommand(request)) return privateJson({ error: 'Same-origin request required.', reason: 'bad_origin' }, 403);
  const ctx = await member(request);
  if (!ctx.db) return ctx.refusal;
  const { db, userId, now } = ctx;
  let body: Record<string, unknown>;
  try { body = await readCommandObject(request, 4096); } catch { return privateJson({ error: 'Send a Diplomatic Hall command.', reason: 'bad_request' }, 400); }
  if (body.action === 'delete') {
    if (typeof body.id !== 'string' || !uuidPattern.test(body.id)) return privateJson({ error: 'Invalid message.', reason: 'bad_request' }, 400);
    const result = await db.prepare(`UPDATE diplomatic_hall_messages SET deleted=1,body=? WHERE id=? AND user_id=? AND EXISTS(SELECT 1 FROM citizens WHERE clerk_user_id=? AND nation_id IN ('kindle','aurelle'))`).bind('[removed]', body.id.toLowerCase(), userId, userId).run();
    if (!result.meta.changes) return privateJson({ error: 'Message unavailable.', reason: 'not_found' }, 404);
    return privateJson(await readHall(db, userId, now));
  }
  if (body.action !== 'post') return privateJson({ error: 'Unknown action.', reason: 'bad_request' }, 400);
  if (typeof body.id !== 'string' || !uuidPattern.test(body.id)) return privateJson({ error: 'Send a valid request ID.', reason: 'bad_request' }, 400);
  if (typeof body.text === 'string' && body.text.length > hallMessageMax) return refuse(400, 'too_long');
  if (!validSquareText(body.text)) return privateJson({ error: `Use 1–${hallMessageMax} plain-text characters.`, reason: 'bad_request' }, 400);
  const id = body.id.toLowerCase(), text = body.text.trim();
  const blocked = await travelBlock(db, userId, now, (env as unknown as { HARIMU_TRAVEL_ENABLED?: string }).HARIMU_TRAVEL_ENABLED === 'true');
  if (blocked) return privateJson({ error: blocked, reason: 'traveling' }, 409);
  const sameRequest = async () => {
    const existing = await db.prepare('SELECT user_id,body,deleted FROM diplomatic_hall_messages WHERE id=?').bind(id).first<{ user_id: string; body: string; deleted: number }>();
    return existing ? (existing.user_id === userId && existing.body === text && !existing.deleted ? 'replay' as const : 'reused' as const) : null;
  };
  const prior = await sameRequest();
  if (prior === 'reused') return privateJson({ error: 'Request already used.', reason: 'request_reused' }, 409);
  if (!prior) {
    await db.prepare('INSERT OR IGNORE INTO square_handles(user_id,handle) VALUES (?,?)').bind(userId, `Citizen-${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`).run();
    await purgeExpiredHall(db, now);
    const result = await db.prepare(postHallSql).bind(id, text, now, userId, id, userId, now - 10, userId, now - 3600).run();
    if (!result.meta.changes) {
      const again = await sameRequest(); // a concurrent call with this id may have landed
      if (again === 'reused') return privateJson({ error: 'Request already used.', reason: 'request_reused' }, 409);
      if (!again) {
        const current = await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ nation_id: string | null }>();
        return hallOpenTo(current?.nation_id) ? refuse(429, 'rate_limit') : refuse(403, 'nation_closed');
      }
    }
  }
  return privateJson(await readHall(db, userId, now));
}

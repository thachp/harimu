/** #1341: one approved poster on a square the citizen bought (`world_square_purchases.clerk_user_id`).
 *  A poster is one frame and one slogan from that citizen's current nation kit; `frameAccepts` must pass.
 *  Flag off: no statements. ASSUMPTION: `square_poster_commands` keeps each request id after replace and remove,
 *  because the visible row is updated or deleted and could not answer a later replay by itself.
 *  ASSUMPTION: any signed-in citizen may read a square's poster; only the buyer may write. Kit follows `citizens.nation_id`. */
import type { GameDatabase } from './database-contract';
import { flagOn } from './flag-pack.mjs';
import { frameAccepts, posterKit, POSTER_PLACEHOLDERS } from './poster-kits';

export const squarePosterSchemas = [
  `CREATE TABLE IF NOT EXISTS square_posters (
 x INTEGER NOT NULL, y INTEGER NOT NULL,
 clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 nation_id TEXT NOT NULL CHECK(nation_id IN ('kindle','korund','aurelle')),
 frame_id TEXT NOT NULL, slogan_id TEXT NOT NULL,
 request_id TEXT NOT NULL UNIQUE, placed_at INTEGER NOT NULL,
 PRIMARY KEY (x, y))`,
  `CREATE TABLE IF NOT EXISTS square_poster_commands (
 request_id TEXT PRIMARY KEY,
 clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 action TEXT NOT NULL CHECK(action IN ('place','remove')),
 x INTEGER NOT NULL, y INTEGER NOT NULL,
 frame_id TEXT, slogan_id TEXT, placed_at INTEGER NOT NULL)`,
];

export const postersEnabled = (env: unknown) => flagOn(env, 'HARIMU_SQUARE_POSTERS_ENABLED');

const requestOk = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(id);
const int = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);
type Place = { action: 'place'; x: number; y: number; frameId: string; sloganId: string; requestId: string };
type Remove = { action: 'remove'; x: number; y: number; requestId: string };
export type PosterCommand = Place | Remove;
export type PosterView = { frameId: string; sloganId: string; text: string };
type Fail = { ok: false; status: 400 | 403 | 409; reason: string; error: string };
export type PosterResult = { ok: true; poster: PosterView; replay?: true } | { ok: true; removed: true; x: number; y: number; replay?: true } | Fail;
const fail = (status: Fail['status'], reason: string, error: string): Fail => ({ ok: false, status, reason, error });
const textOf = (sloganId: string) => posterKit(sloganId.split('-')[0] ?? '')?.slogans.find(s => s.id === sloganId)?.text ?? '';

export function parsePosterCommand(body: Record<string, unknown>): PosterCommand | Fail {
  if ('text' in body || 'ai' in body || 'prompt' in body || 'slogan' in body) return fail(400, 'free_text', 'Posters use an approved kit slogan, not free or AI text.');
  if ('kind' in body || 'product' in body) return fail(400, 'out_of_scope', 'Banners and billboards are not a separate product.');
  const { x, y, requestId } = body;
  if (!int(x) || !int(y) || !requestOk(requestId)) return fail(400, 'bad_request', 'Send integer x and y and a requestId.');
  if (body.action === 'remove-poster') return { action: 'remove', x, y, requestId };
  if (body.action !== 'place-poster') return fail(400, 'bad_request', 'Send action "place-poster" or "remove-poster".');
  const { frameId, sloganId } = body;
  if (typeof frameId !== 'string' || typeof sloganId !== 'string' || !/^[a-z0-9-]{4,64}$/.test(frameId) || !/^[a-z0-9-]{4,64}$/.test(sloganId)) return fail(400, 'bad_request', 'Send a frameId and sloganId from your nation\'s kit.');
  return { action: 'place', x, y, frameId, sloganId, requestId };
}

type CommandRow = { clerk_user_id: string; action: string; x: number; y: number; frame_id: string | null; slogan_id: string | null };
const same = (row: CommandRow, command: PosterCommand, userId: string) => row.clerk_user_id === userId && Number(row.x) === command.x && Number(row.y) === command.y && row.action === command.action && (command.action === 'remove' || (row.frame_id === command.frameId && row.slogan_id === command.sloganId));

export async function readSquarePoster(db: GameDatabase, x: number, y: number, env: unknown): Promise<PosterView | null | undefined> {
  if (!postersEnabled(env)) return undefined;
  const row = await db.prepare('SELECT nation_id,frame_id,slogan_id FROM square_posters WHERE x=? AND y=?').bind(x, y).first<{ nation_id: string; frame_id: string; slogan_id: string }>();
  return row ? { frameId: row.frame_id, sloganId: row.slogan_id, text: textOf(row.slogan_id) } : null;
}

const record = (db: GameDatabase, userId: string, command: PosterCommand, now: number) => db.prepare(
  'INSERT INTO square_poster_commands(request_id,clerk_user_id,action,x,y,frame_id,slogan_id,placed_at) VALUES (?,?,?,?,?,?,?,?)',
).bind(command.requestId, userId, command.action, command.x, command.y, command.action === 'place' ? command.frameId : null, command.action === 'place' ? command.sloganId : null, now);

export async function applyPoster(db: GameDatabase, userId: string, command: PosterCommand, now: number, env: unknown): Promise<PosterResult> {
  if (!postersEnabled(env)) return fail(403, 'disabled', 'Square posters are not open yet.');
  const row = await db.prepare('SELECT clerk_user_id,action,x,y,frame_id,slogan_id FROM square_poster_commands WHERE request_id=?').bind(command.requestId).first<CommandRow>();
  if (row) return same(row, command, userId)
    ? command.action === 'remove' ? { ok: true, removed: true, x: command.x, y: command.y, replay: true } : { ok: true, poster: { frameId: command.frameId, sloganId: command.sloganId, text: textOf(command.sloganId) }, replay: true }
    : fail(409, 'request_reused', 'That request id was already used for a different command.');
  const citizen = await db.prepare('SELECT nation_id FROM citizens WHERE clerk_user_id=?').bind(userId).first<{ nation_id: string | null }>();
  const kit = posterKit(citizen?.nation_id ?? '');
  if (!kit) return fail(403, 'no_kit', 'Only Kindle, Korund and Aurelle citizens have a poster kit.');
  const owned = await db.prepare('SELECT clerk_user_id FROM world_square_purchases WHERE x=? AND y=?').bind(command.x, command.y).first<{ clerk_user_id: string }>();
  if (owned?.clerk_user_id !== userId) return fail(403, 'not_owner', 'Only the citizen who bought that square can change its poster.');
  if (command.action === 'remove') {
    const existing = await db.prepare('SELECT x FROM square_posters WHERE x=? AND y=? AND clerk_user_id=?').bind(command.x, command.y, userId).first();
    if (!existing) return fail(409, 'no_poster', 'That square has no poster to remove.');
    await db.batch([record(db, userId, command, now), db.prepare('DELETE FROM square_posters WHERE x=? AND y=? AND clerk_user_id=?').bind(command.x, command.y, userId)]);
    return { ok: true, removed: true, x: command.x, y: command.y };
  }
  const frame = kit.frames.find(f => f.id === command.frameId), slogan = kit.slogans.find(s => s.id === command.sloganId);
  if (!frame || !slogan) return fail(409, 'not_in_kit', 'That frame or slogan is not in your nation\'s kit.');
  if (POSTER_PLACEHOLDERS.some(p => slogan.text.includes(p))) return fail(409, 'placeholder', 'Slogans with ledger placeholders are not placed yet.');
  if (!frameAccepts(kit.nationId, frame, slogan)) return fail(409, 'theme_mismatch', 'That frame only accepts a slogan of the same theme.');
  await db.batch([
    record(db, userId, command, now),
    db.prepare(`INSERT INTO square_posters(x,y,clerk_user_id,nation_id,frame_id,slogan_id,request_id,placed_at) VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(x,y) DO UPDATE SET nation_id=excluded.nation_id, frame_id=excluded.frame_id, slogan_id=excluded.slogan_id, request_id=excluded.request_id, placed_at=excluded.placed_at
      WHERE square_posters.clerk_user_id=excluded.clerk_user_id`).bind(command.x, command.y, userId, kit.nationId, frame.id, slogan.id, command.requestId, now),
  ]);
  return { ok: true, poster: { frameId: frame.id, sloganId: slogan.id, text: slogan.text } };
}

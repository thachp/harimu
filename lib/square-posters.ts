/** #1341: one approved poster on a square the citizen bought (`world_square_purchases.clerk_user_id`).
 *  A poster is one frame and one slogan from that citizen's current nation kit; `frameAccepts` must pass.
 *  Flag off: no statements. ASSUMPTION: `square_poster_commands` keeps each request id after replace and remove,
 *  because the visible row is updated or deleted and could not answer a later replay by itself.
 *  ASSUMPTION: any signed-in citizen may read a square's poster; only the buyer may write. Kit follows `citizens.nation_id`.
 *  #1367 (docs §18.2, §18.3): Korund slogans with {output_pct}/{city}/{brigade} are filled from the ledger at place and at read.
 *  Figures are live (not frozen on the row). A missing figure refuses the place; reads never invent a number. */
import type { GameDatabase } from './database-contract';
import { capitalCityForNation, cityForNation } from './cities';
import { flagOn } from './flag-pack.mjs';
import { korundWeeklyQuotaFood } from './korund-coupons';
import { korundPlanWindow, planFulfilmentPercent } from './korund-plan-stats';
import { jobById } from './labor-bureau-rules';
import { frameAccepts, posterKit, POSTER_PLACEHOLDERS } from './poster-kits';

/** Fallback when the owner has no held Labor Bureau assignment (same name as lib/korund.ts `korundJob`). */
const defaultBrigadeName = 'State food-production brigade';
export type PosterFills = Partial<Record<(typeof POSTER_PLACEHOLDERS)[number], string>>;
/** Substitutes known placeholders. Returns null if a used placeholder has no fill, so a caller never invents a figure. */
export function fillPosterText(text: string, fills: PosterFills): string | null {
  let out = text;
  for (const token of POSTER_PLACEHOLDERS) {
    if (!out.includes(token)) continue;
    const value = fills[token];
    if (value === undefined) return null;
    out = out.split(token).join(value);
  }
  return out;
}
/** Read-only fills for a Korund owner. `{output_pct}` is the #981 open-week food percent plus a `%` suffix; `{city}` is home-city name
 *  (capital if no location row; no location writes); `{brigade}` is the held Bureau job name, else the default playable brigade. */
export async function readPosterFills(db: GameDatabase, userId: string, now: number): Promise<PosterFills> {
  const clock = await db.prepare("SELECT epoch_seconds FROM world_clock WHERE id='main'").first<{ epoch_seconds: number }>();
  const epoch = clock ? Number(clock.epoch_seconds) : Math.floor(now / 7200) * 7200;
  const span = korundPlanWindow(epoch, now);
  const food = await db.prepare('SELECT COUNT(*) AS settled, COALESCE(SUM(food_output),0) AS plan_food FROM korund_settlements WHERE settled_at>=? AND settled_at<?').bind(span.start, span.end).first<{ settled: number; plan_food: number }>();
  // #1368 review: an open week with no settlement has no figure yet, so {output_pct} stays unset (place: 409 placeholder; never "0%").
  const percent = Number(food?.settled ?? 0) > 0 ? planFulfilmentPercent(Number(food?.plan_food ?? 0), korundWeeklyQuotaFood) : null;
  const loc = await db.prepare('SELECT home_city_id FROM citizen_city_locations WHERE user_id=? AND nation_id=?').bind(userId, 'korund').first<{ home_city_id: string }>();
  const city = cityForNation('korund', loc?.home_city_id ?? '') ?? capitalCityForNation('korund');
  const last = await db.prepare('SELECT job_id, assigned_at FROM korund_job_assignments WHERE clerk_user_id=? ORDER BY assigned_at DESC LIMIT 1').bind(userId)
    .first<{ job_id: string; assigned_at: number }>();
  const released = await db.prepare('SELECT MAX(released_at) AS at FROM dormant_job_releases WHERE clerk_user_id=?').bind(userId).first<{ at: number | null }>();
  const held = last && Number(last.assigned_at) > Number(released?.at ?? 0) ? last : null;
  return {
    ...(percent !== null ? { '{output_pct}': `${percent}%` } : {}),
    ...(city?.name ? { '{city}': city.name } : {}),
    '{brigade}': held ? (jobById(held.job_id)?.name ?? held.job_id) : defaultBrigadeName,
  };
}
async function filledText(db: GameDatabase, userId: string, sloganId: string, now: number) {
  const raw = textOf(sloganId);
  return POSTER_PLACEHOLDERS.some(p => raw.includes(p)) ? fillPosterText(raw, await readPosterFills(db, userId, now)) : raw;
}

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

export async function readSquarePoster(db: GameDatabase, x: number, y: number, env: unknown, now = Math.floor(Date.now() / 1000)): Promise<PosterView | null | undefined> {
  if (!postersEnabled(env)) return undefined;
  const row = await db.prepare('SELECT clerk_user_id,frame_id,slogan_id FROM square_posters WHERE x=? AND y=?').bind(x, y).first<{ clerk_user_id: string; frame_id: string; slogan_id: string }>();
  if (!row) return null;
  return { frameId: row.frame_id, sloganId: row.slogan_id, text: (await filledText(db, row.clerk_user_id, row.slogan_id, now)) ?? textOf(row.slogan_id) };
}

const record = (db: GameDatabase, userId: string, command: PosterCommand, now: number) => db.prepare(
  'INSERT INTO square_poster_commands(request_id,clerk_user_id,action,x,y,frame_id,slogan_id,placed_at) VALUES (?,?,?,?,?,?,?,?)',
).bind(command.requestId, userId, command.action, command.x, command.y, command.action === 'place' ? command.frameId : null, command.action === 'place' ? command.sloganId : null, now);

export async function applyPoster(db: GameDatabase, userId: string, command: PosterCommand, now: number, env: unknown): Promise<PosterResult> {
  if (!postersEnabled(env)) return fail(403, 'disabled', 'Square posters are not open yet.');
  const row = await db.prepare('SELECT clerk_user_id,action,x,y,frame_id,slogan_id FROM square_poster_commands WHERE request_id=?').bind(command.requestId).first<CommandRow>();
  if (row) {
    if (!same(row, command, userId)) return fail(409, 'request_reused', 'That request id was already used for a different command.');
    if (command.action === 'remove') return { ok: true, removed: true, x: command.x, y: command.y, replay: true };
    return { ok: true, poster: { frameId: command.frameId, sloganId: command.sloganId, text: (await filledText(db, userId, command.sloganId, now)) ?? textOf(command.sloganId) }, replay: true };
  }
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
  if (!frameAccepts(kit.nationId, frame, slogan)) return fail(409, 'theme_mismatch', 'That frame only accepts a slogan of the same theme.');
  const text = fillPosterText(slogan.text, await readPosterFills(db, userId, now));
  if (text === null) return fail(409, 'placeholder', 'That slogan needs a ledger figure that is not available yet.'); // #1367 Architect ruling: keep the #1341 refusal, never a stand-in figure
  await db.batch([
    record(db, userId, command, now),
    db.prepare(`INSERT INTO square_posters(x,y,clerk_user_id,nation_id,frame_id,slogan_id,request_id,placed_at) VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(x,y) DO UPDATE SET nation_id=excluded.nation_id, frame_id=excluded.frame_id, slogan_id=excluded.slogan_id, request_id=excluded.request_id, placed_at=excluded.placed_at
      WHERE square_posters.clerk_user_id=excluded.clerk_user_id`).bind(command.x, command.y, userId, kit.nationId, frame.id, slogan.id, command.requestId, now),
  ]);
  return { ok: true, poster: { frameId: frame.id, sloganId: slogan.id, text } };
}

/** #1469: Korund citizens file kit-only State Media articles (docs §18.2, §18.4). Flag HARIMU_KORUND_STATE_MEDIA_WRITERS_ENABLED (GRAY 95).
 *  Flag off: no query and the action is refused. Placeholders are filled live with #1367 fillPosterText/readPosterFills. */
import type { GameDatabase } from './database-contract.ts';
import type { NewsItem } from './national-news.ts';
import { uuidPattern } from './square-chat-validation.ts';
import { isShadowMuted, parseShadowMute } from './chat-shadow-mute.ts';
import { fillPosterText, readPosterFills } from './square-posters.ts';
import { korundStateMediaEntry, korundStateMediaKit, type StateMediaEntry } from './korund-state-media-kit.ts';

export const KORUND_STATE_MEDIA_FLAG = 'HARIMU_KORUND_STATE_MEDIA_WRITERS_ENABLED';
export const KORUND_STATE_MEDIA_FILING_WINDOW_SECONDS = 24 * 60 * 60;
export const KORUND_STATE_MEDIA_APPROVER = 'directorate';
export const KORUND_STATE_MEDIA_APPROVAL_STATUS = 'approved';
export const KORUND_STATE_MEDIA_APPROVAL_RULE_ID = 'kit-only';
export const korundStateMediaFlagOffError = 'Korund State Media writers are not available yet.';
export const korundStateMediaNationError = 'Only a Korund citizen can file a State Media article.';
export const korundStateMediaKitError = 'That article is not in the State Media kit.';
export const korundStateMediaFigureError = 'That article needs a ledger figure that is not available yet.';
export const korundStateMediaRateError = 'You can file one State Media article every 24 hours.';
export const korundStateMediaRequestReusedError = 'That request id was already used for a different State Media article.';

export const korundStateMediaSchemas = [
  `CREATE TABLE IF NOT EXISTS korund_state_media_articles (id TEXT PRIMARY KEY, author_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id), entry_id TEXT NOT NULL, published_at INTEGER NOT NULL, request_id TEXT NOT NULL UNIQUE, approval_status TEXT NOT NULL, approver TEXT NOT NULL, approval_rule_id TEXT NOT NULL)`,
] as const;

export type KorundStateMediaCommand = { action: 'file-state-media'; requestId: string; entryId: string };

const allowed = new Set(['action', 'requestId', 'entryId']);
export function parseKorundStateMediaCommand(body: Record<string, unknown>): { command: KorundStateMediaCommand } | { error: string } {
  if (Object.keys(body).some(key => !allowed.has(key))) return { error: korundStateMediaKitError };
  if (body.action !== 'file-state-media') return { error: 'Unknown news action.' };
  if (typeof body.requestId !== 'string' || !uuidPattern.test(body.requestId)) return { error: 'A valid requestId is required.' };
  if (!korundStateMediaEntry(body.entryId)) return { error: korundStateMediaKitError };
  return { command: { action: 'file-state-media', requestId: body.requestId, entryId: body.entryId as string } };
}

const fillEntry = (entry: StateMediaEntry, fills: Awaited<ReturnType<typeof readPosterFills>>) => {
  const headline = fillPosterText(entry.headline, fills);
  const paragraphs = entry.paragraphs.map(p => fillPosterText(p, fills));
  if (headline === null || paragraphs.some(p => p === null)) return null;
  return { headline, paragraphs: paragraphs as string[] };
};

type ArticleRow = { id: string; entry_id: string; published_at: number; request_id: string; author_user_id: string; approval_status: string; approver: string; approval_rule_id: string };
const present = (row: ArticleRow, filled: { headline: string; paragraphs: string[] }) =>
  ({ id: row.id, entryId: row.entry_id, headline: filled.headline, paragraphs: filled.paragraphs, publishedAt: Number(row.published_at) * 1000, requestId: row.request_id, approval: { status: row.approval_status, approver: row.approver, ruleId: row.approval_rule_id } });

export async function executeKorundStateMediaCommand(db: GameDatabase, userId: string, command: KorundStateMediaCommand, nowMs: number) {
  const now = Math.floor(nowMs / 1000);
  const prior = await db.prepare('SELECT id,entry_id,published_at,request_id,author_user_id,approval_status,approver,approval_rule_id FROM korund_state_media_articles WHERE request_id=?')
    .bind(command.requestId).first<ArticleRow>();
  if (prior) {
    if (prior.author_user_id !== userId) return { status: 409 as const, error: korundStateMediaRequestReusedError };
    const filled = fillEntry(korundStateMediaEntry(prior.entry_id)!, await readPosterFills(db, userId, Math.floor(nowMs / 1000)));
    return filled ? { status: 200 as const, article: present(prior, filled) } : { status: 409 as const, error: korundStateMediaFigureError };
  }
  const entry = korundStateMediaEntry(command.entryId)!;
  const fills = await readPosterFills(db, userId, Math.floor(nowMs / 1000));
  const filled = fillEntry(entry, fills);
  if (!filled) return { status: 409 as const, error: korundStateMediaFigureError };
  const recent = await db.prepare('SELECT request_id FROM korund_state_media_articles WHERE author_user_id=? AND published_at>?').bind(userId, now - KORUND_STATE_MEDIA_FILING_WINDOW_SECONDS).first();
  if (recent) return { status: 409 as const, error: korundStateMediaRateError };
  const id = crypto.randomUUID();
  await db.prepare('INSERT OR IGNORE INTO korund_state_media_articles (id,author_user_id,entry_id,published_at,request_id,approval_status,approver,approval_rule_id) VALUES (?,?,?,?,?,?,?,?)')
    .bind(id, userId, command.entryId, now, command.requestId, KORUND_STATE_MEDIA_APPROVAL_STATUS, KORUND_STATE_MEDIA_APPROVER, KORUND_STATE_MEDIA_APPROVAL_RULE_ID).run();
  const row = await db.prepare('SELECT id,entry_id,published_at,request_id,author_user_id,approval_status,approver,approval_rule_id FROM korund_state_media_articles WHERE request_id=? AND author_user_id=?')
    .bind(command.requestId, userId).first<ArticleRow>();
  if (!row) {
    const taken = await db.prepare('SELECT id FROM korund_state_media_articles WHERE request_id=?').bind(command.requestId).first();
    return taken ? { status: 409 as const, error: korundStateMediaRequestReusedError } : { status: 500 as const, error: 'The article could not be filed.' };
  }
  return { status: 200 as const, article: present(row, filled) };
}

/** Latest filed State Media articles. Flag-off callers must not invoke this. LIMIT 6. Placeholders re-filled on read; unfilled items are omitted, never 0%. */
export async function readKorundStateMediaArticles(db: GameDatabase, readerId: string, nowMs: number, shadowMuteRaw: unknown): Promise<NewsItem[]> {
  const rows = (await db.prepare(`SELECT a.id,a.entry_id,a.published_at,a.request_id,a.author_user_id,a.approval_status,a.approver,a.approval_rule_id,COALESCE(c.display_name,'A citizen') AS author_name
    FROM korund_state_media_articles a JOIN citizens c ON c.clerk_user_id=a.author_user_id
    ORDER BY a.published_at DESC, a.id DESC LIMIT 6`).all<ArticleRow & { author_name: string }>()).results ?? [];
  const muted = parseShadowMute(shadowMuteRaw);
  const items: NewsItem[] = [];
  for (const row of rows) {
    if (row.author_user_id !== readerId && isShadowMuted(muted, row.author_user_id, Number(row.published_at))) continue;
    const entry = korundStateMediaEntry(row.entry_id);
    if (!entry) continue;
    const filled = fillEntry(entry, await readPosterFills(db, row.author_user_id, Math.floor(nowMs / 1000)));
    if (!filled) continue;
    items.push({
      id: row.id, title: filled.headline, text: filled.paragraphs.join('\n\n'), occurredAt: Number(row.published_at) * 1000,
      source: 'player', kind: 'player-article', paperName: 'Korund State Media', authorName: row.author_name, paragraphs: filled.paragraphs,
    });
  }
  return items;
}

export { korundStateMediaKit };

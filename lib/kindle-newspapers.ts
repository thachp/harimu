/** #1453 slice 1: Kindle citizens may found one newspaper and publish bylined articles (docs §18.2, §18.4).
 *  Flag HARIMU_KINDLE_NEWSPAPERS_ENABLED (GRAY 93). Flag off: no query and every action is refused. */
import type { GameDatabase } from './database-contract';
import type { NewsItem } from './national-news';
import { PRESS_HEADLINE_MAX, PRESS_PARAGRAPH_MAX } from './press-templates';
import { isShadowMuted, parseShadowMute } from './chat-shadow-mute';
import { uuidPattern } from './square-chat-validation';

export const KINDLE_NEWSPAPERS_FLAG = 'HARIMU_KINDLE_NEWSPAPERS_ENABLED';
export const kindleNewspaperFlagOffError = 'Kindle newspapers are not available yet.';
export const kindleNewspaperNationError = 'Only a Kindle citizen can found a newspaper or publish an article.';
export const kindleNewspaperExistsError = 'You already founded a newspaper.';
export const kindleNewspaperMissingError = 'Found a newspaper before publishing an article.';
export const kindleNewspaperRequestReusedError = 'That request id was already used for a different newspaper or article.';
export const kindleNewspaperTextError = `The newspaper name and headline must be 1–${PRESS_HEADLINE_MAX} characters, without control characters.`;
export const kindleNewspaperParagraphError = `Publish one or two paragraphs, each 1–${PRESS_PARAGRAPH_MAX} characters, without control characters.`;

const control = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/; // same class as validSquareText
const validPress = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max && !control.test(value);

export const kindleNewspaperSchemas = [
  `CREATE TABLE IF NOT EXISTS kindle_newspapers (id TEXT PRIMARY KEY, founder_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id), name TEXT NOT NULL, founded_at INTEGER NOT NULL, request_id TEXT NOT NULL UNIQUE)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS kindle_newspapers_founder ON kindle_newspapers(founder_user_id)`,
  `CREATE TABLE IF NOT EXISTS kindle_articles (id TEXT PRIMARY KEY, newspaper_id TEXT NOT NULL REFERENCES kindle_newspapers(id), author_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id), headline TEXT NOT NULL, body TEXT NOT NULL, published_at INTEGER NOT NULL, request_id TEXT NOT NULL UNIQUE)`,
] as const;

export type KindleNewspaperCommand =
  | { action: 'found-paper'; requestId: string; name: string }
  | { action: 'publish'; requestId: string; headline: string; paragraphs: string[] };

export function parseKindleNewspaperCommand(body: Record<string, unknown>): { command: KindleNewspaperCommand } | { error: string } {
  if (body.action !== 'found-paper' && body.action !== 'publish') return { error: 'Unknown news action.' };
  if (typeof body.requestId !== 'string' || !uuidPattern.test(body.requestId)) return { error: 'A valid requestId is required.' };
  if (body.action === 'found-paper') {
    if (!validPress(body.name, PRESS_HEADLINE_MAX)) return { error: kindleNewspaperTextError };
    return { command: { action: 'found-paper', requestId: body.requestId, name: body.name.trim() } };
  }
  if (!validPress(body.headline, PRESS_HEADLINE_MAX)) return { error: kindleNewspaperTextError };
  if (!Array.isArray(body.paragraphs) || body.paragraphs.length < 1 || body.paragraphs.length > 2
    || body.paragraphs.some(p => !validPress(p, PRESS_PARAGRAPH_MAX))) return { error: kindleNewspaperParagraphError };
  return { command: { action: 'publish', requestId: body.requestId, headline: body.headline.trim(), paragraphs: body.paragraphs.map(p => (p as string).trim()) } };
}

export async function executeKindleNewspaperCommand(db: GameDatabase, userId: string, command: KindleNewspaperCommand, nowMs: number) {
  const now = Math.floor(nowMs / 1000);
  if (command.action === 'found-paper') {
    const prior = await db.prepare('SELECT id,name,founded_at,request_id,founder_user_id FROM kindle_newspapers WHERE request_id=?').bind(command.requestId).first<{ id: string; name: string; founded_at: number; request_id: string; founder_user_id: string }>();
    if (prior) {
      if (prior.founder_user_id !== userId) return { status: 409 as const, error: kindleNewspaperRequestReusedError };
      return { status: 200 as const, paper: { id: prior.id, name: prior.name, foundedAt: Number(prior.founded_at) * 1000, requestId: prior.request_id } };
    }
    const mine = await db.prepare('SELECT id FROM kindle_newspapers WHERE founder_user_id=?').bind(userId).first();
    if (mine) return { status: 403 as const, error: kindleNewspaperExistsError };
    const id = crypto.randomUUID();
    await db.prepare('INSERT OR IGNORE INTO kindle_newspapers (id,founder_user_id,name,founded_at,request_id) VALUES (?,?,?,?,?)')
      .bind(id, userId, command.name, now, command.requestId).run();
    const row = await db.prepare('SELECT id,name,founded_at,request_id FROM kindle_newspapers WHERE request_id=? AND founder_user_id=?').bind(command.requestId, userId).first<{ id: string; name: string; founded_at: number; request_id: string }>();
    if (!row) {
      const taken = await db.prepare('SELECT id FROM kindle_newspapers WHERE request_id=?').bind(command.requestId).first();
      if (taken) return { status: 409 as const, error: kindleNewspaperRequestReusedError };
      const again = await db.prepare('SELECT id FROM kindle_newspapers WHERE founder_user_id=?').bind(userId).first();
      return again ? { status: 403 as const, error: kindleNewspaperExistsError } : { status: 500 as const, error: 'The newspaper could not be founded.' };
    }
    return { status: 200 as const, paper: { id: row.id, name: row.name, foundedAt: Number(row.founded_at) * 1000, requestId: row.request_id } };
  }
  const prior = await db.prepare('SELECT a.id,a.headline,a.body,a.published_at,a.request_id,a.author_user_id,n.name AS paper_name FROM kindle_articles a JOIN kindle_newspapers n ON n.id=a.newspaper_id WHERE a.request_id=?')
    .bind(command.requestId).first<{ id: string; headline: string; body: string; published_at: number; request_id: string; author_user_id: string; paper_name: string }>();
  if (prior) {
    if (prior.author_user_id !== userId) return { status: 409 as const, error: kindleNewspaperRequestReusedError };
    return { status: 200 as const, article: presentArticle(prior) };
  }
  const paper = await db.prepare('SELECT id,name FROM kindle_newspapers WHERE founder_user_id=?').bind(userId).first<{ id: string; name: string }>();
  if (!paper) return { status: 403 as const, error: kindleNewspaperMissingError };
  const id = crypto.randomUUID();
  await db.prepare('INSERT OR IGNORE INTO kindle_articles (id,newspaper_id,author_user_id,headline,body,published_at,request_id) VALUES (?,?,?,?,?,?,?)')
    .bind(id, paper.id, userId, command.headline, JSON.stringify(command.paragraphs), now, command.requestId).run();
  const row = await db.prepare('SELECT a.id,a.headline,a.body,a.published_at,a.request_id,n.name AS paper_name FROM kindle_articles a JOIN kindle_newspapers n ON n.id=a.newspaper_id WHERE a.request_id=? AND a.author_user_id=?')
    .bind(command.requestId, userId).first<{ id: string; headline: string; body: string; published_at: number; request_id: string; paper_name: string }>();
  if (!row) {
    const taken = await db.prepare('SELECT id FROM kindle_articles WHERE request_id=?').bind(command.requestId).first();
    if (taken) return { status: 409 as const, error: kindleNewspaperRequestReusedError };
    return { status: 500 as const, error: 'The article could not be published.' };
  }
  return { status: 200 as const, article: presentArticle(row) };
}

const paragraphsOf = (body: string): string[] => {
  try { const parsed = JSON.parse(body); return Array.isArray(parsed) && parsed.every(p => typeof p === 'string') ? parsed : [body]; }
  catch { return [body]; }
};
const presentArticle = (row: { id: string; headline: string; body: string; published_at: number; request_id: string; paper_name: string }) =>
  ({ id: row.id, headline: row.headline, paragraphs: paragraphsOf(row.body), publishedAt: Number(row.published_at) * 1000, requestId: row.request_id, paperName: row.paper_name });

/** Latest Kindle player articles. Flag-off callers must not invoke this (it queries kindle_articles). LIMIT 6 matches the edition's register and market reads. Same-second ties use id DESC (deterministic; UUID is not monotonic, and Postgres has no portable rowid, so 0132 is unchanged). */
export async function readKindlePlayerArticles(db: GameDatabase, readerId: string, shadowMuteRaw: unknown): Promise<NewsItem[]> {
  const rows = (await db.prepare(`SELECT a.id,a.headline,a.body,a.published_at,a.author_user_id,n.name AS paper_name,COALESCE(c.display_name,'A citizen') AS author_name
    FROM kindle_articles a JOIN kindle_newspapers n ON n.id=a.newspaper_id JOIN citizens c ON c.clerk_user_id=a.author_user_id
    ORDER BY a.published_at DESC, a.id DESC LIMIT 6`).all<{ id: string; headline: string; body: string; published_at: number; author_user_id: string; paper_name: string; author_name: string }>()).results ?? [];
  const muted = parseShadowMute(shadowMuteRaw);
  return rows.filter(row => row.author_user_id === readerId || !isShadowMuted(muted, row.author_user_id, Number(row.published_at))).map(row => {
    const paragraphs = paragraphsOf(row.body);
    return {
      id: row.id, title: row.headline, text: paragraphs.join('\n\n'), occurredAt: Number(row.published_at) * 1000,
      source: 'player' as const, kind: 'player-article' as const, paperName: row.paper_name, authorName: row.author_name, paragraphs,
    };
  });
}

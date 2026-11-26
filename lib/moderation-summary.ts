/** #1524: staff aggregate counts for a UTC window (docs §21.3 Transparency). Counts only; no ids, notes, snapshots or output text.
 *  Half-open [from, to) on created_at. A section is null when its flag is off or its table is missing, so a flag-off section is not zero counts. */
import type { GameDatabase } from './database-contract';
import { isMissingRelation } from './db-errors';
import { aiReviewQueueEnabled } from './ai-review-queue';
import { killSwitchEventsEnabled } from './kill-switch-events';

export const summaryMaxDays = 92;
const dateRe = /^(\d{4})-(\d{2})-(\d{2})$/;
const inWindow = 'created_at>=? AND created_at<?';
const badWindow = 'from and to must be UTC dates (YYYY-MM-DD), with from before to and at most 92 days apart.';

export type SummaryEnv = { HARIMU_REPORTS_ENABLED?: string; HARIMU_AI_REVIEW_QUEUE_ENABLED?: string; HARIMU_KILL_SWITCH_EVENTS_ENABLED?: string };
export type CountMap = Record<string, number>;
export type ReportCounts = { total: number; byTargetKind: CountMap; byReasonId: CountMap };
export type AiReviewCounts = { total: number; byReason: CountMap; byFilterResult: CountMap };
export type KillSwitchCounts = { total: number; byReason: CountMap; byState: CountMap };
export type ModerationSummary = { from: number; to: number; reports: ReportCounts | null; aiReview: AiReviewCounts | null; killSwitch: KillSwitchCounts | null };

const utcDay = (raw: string | null): number | null => {
  const m = raw ? dateRe.exec(raw) : null;
  if (!m) return null;
  const year = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
  const ms = Date.UTC(year, month - 1, day);
  const d = new Date(ms);
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return ms / 1000;
};

export function parseModerationSummaryWindow(fromRaw: string | null, toRaw: string | null): { ok: true; from: number; to: number } | { ok: false; error: string } {
  const from = utcDay(fromRaw), to = utcDay(toRaw);
  if (from == null || to == null || from >= to || to - from > summaryMaxDays * 86400) return { ok: false, error: badWindow };
  return { ok: true, from, to };
}

async function grouped(db: GameDatabase, sql: string, from: number, to: number): Promise<CountMap> {
  const rows = (await db.prepare(sql).bind(from, to).all<{ k: string; n: number }>()).results ?? [];
  return Object.fromEntries(rows.map(row => [String(row.k), Number(row.n)]));
}

async function section<T>(on: boolean, read: () => Promise<T>): Promise<T | null> {
  if (!on) return null;
  try { return await read(); }
  catch (error) { if (isMissingRelation(error)) return null; throw error; }
}

async function counts(db: GameDatabase, table: string, groups: readonly [string, string][], from: number, to: number) {
  const total = Number((await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${inWindow}`).bind(from, to).first<{ n: number }>())?.n ?? 0);
  const parts: Record<string, CountMap> = {};
  for (const [column, name] of groups) parts[name] = await grouped(db, `SELECT ${column} AS k,COUNT(*) AS n FROM ${table} WHERE ${inWindow} GROUP BY ${column}`, from, to);
  return { total, ...parts };
}

export async function readModerationSummary(db: GameDatabase, opts: { from: number; to: number; env?: SummaryEnv | null }): Promise<ModerationSummary> {
  const { from, to, env } = opts;
  const reports = await section(env?.HARIMU_REPORTS_ENABLED === 'true', () => counts(db, 'moderation_reports', [['target_kind', 'byTargetKind'], ['reason_id', 'byReasonId']], from, to)) as ReportCounts | null;
  const aiReview = await section(aiReviewQueueEnabled(env), () => counts(db, 'ai_review_queue', [['reason', 'byReason'], ['filter_result', 'byFilterResult']], from, to)) as AiReviewCounts | null;
  const killSwitch = await section(killSwitchEventsEnabled(env), () => counts(db, 'ai_kill_switch_events', [['reason', 'byReason'], ['state', 'byState']], from, to)) as KillSwitchCounts | null;
  return { from, to, reports, aiReview, killSwitch };
}

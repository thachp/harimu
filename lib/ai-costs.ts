import type { GameDatabase } from './database-contract';

/** #614: read-only AI cost dashboard over the existing budget table (harimu_ai_reservations). Aggregates only: no prompts,
 *  no request ids, no user ids. The feature (purpose) comes from the reservation id prefix each caller already writes
 *  (`ai-news:`, `notable:`, `cabinet:`, `townhall:`, `debate:`); anything else reports as `unknown`. */
export const aiCostDays = 14;
export const aiCostPurposes = { 'ai-news': 'news', notable: 'notable', cabinet: 'cabinet', townhall: 'town_hall', debate: 'debate' } as const;
export type AiCostPurpose = (typeof aiCostPurposes)[keyof typeof aiCostPurposes] | 'unknown';
const statuses = ['pending', 'finished', 'uncertain'] as const;
type Status = (typeof statuses)[number];
type Bucket = { reservedMicro: number; settledMicro: number; calls: number };
export type AiCostDay = Bucket & { day: string; budgetMicro: number | null; byStatus: Record<Status, number>; byModel: Record<string, Bucket>; byPurpose: Record<string, Bucket> };

export function aiCostPurpose(requestId: string): AiCostPurpose {
  const prefix = requestId.slice(0, Math.max(0, requestId.indexOf(':')));
  return Object.hasOwn(aiCostPurposes, prefix) ? aiCostPurposes[prefix as keyof typeof aiCostPurposes] : 'unknown';
}
const add = (bucket: Bucket, micro: number, settled: boolean) => { bucket.reservedMicro += micro; bucket.calls++; if (settled) bucket.settledMicro += micro; };
const empty = (): Bucket => ({ reservedMicro: 0, settledMicro: 0, calls: 0 });

/** GET only: one SELECT, no writes. `reservedMicro` counts every row; `settledMicro` only `finished` rows (the metered charge). */
export async function readAiCosts(db: GameDatabase, now: number, budgetMicro: number | null): Promise<{ days: AiCostDay[]; asOf: number; windowDays: number }> {
  const day = (offset: number) => new Date((now - offset * 86400) * 1000).toISOString().slice(0, 10);
  const days = Array.from({ length: aiCostDays }, (_, i) => day(i));
  const rows = (await db.prepare('SELECT utc_day, model, status, request_id, reserved_micro FROM harimu_ai_reservations WHERE utc_day >= ? AND utc_day <= ?').bind(days[aiCostDays - 1], days[0])
    .all<{ utc_day: string; model: string; status: Status; request_id: string; reserved_micro: number }>().catch(() => ({ results: [] }))).results;
  const out = new Map(days.map(d => [d, { day: d, budgetMicro, ...empty(), byStatus: { pending: 0, finished: 0, uncertain: 0 }, byModel: {}, byPurpose: {} } as AiCostDay]));
  for (const row of rows) {
    const entry = out.get(row.utc_day); if (!entry) continue;
    const micro = Number(row.reserved_micro), settled = row.status === 'finished', purpose = aiCostPurpose(row.request_id);
    add(entry, micro, settled);
    if (statuses.includes(row.status)) entry.byStatus[row.status]++;
    add(entry.byModel[row.model] ??= empty(), micro, settled);
    add(entry.byPurpose[purpose] ??= empty(), micro, settled);
  }
  return { days: [...out.values()], asOf: now, windowDays: aiCostDays };
}

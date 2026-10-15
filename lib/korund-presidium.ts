import type { GameDatabase } from './database-contract';
import { isMissingRelation, tolerate } from './db-errors';
import { presidiumConfig, presidiumSeats, resolveSession, seat, sessionReady, unrestSustainedSeconds, type Seat, type SeatId } from './korund-presidium-rules';
export * from './korund-presidium-rules';

/** #70: one row per emergency Presidium session, with its AI decision record. Roster and Chairman are derived from it. */
export const presidiumSessionSchema = `CREATE TABLE IF NOT EXISTS korund_presidium_sessions (
  id TEXT PRIMARY KEY,
  opened_at INTEGER NOT NULL,
  resolves_at INTEGER NOT NULL CHECK(resolves_at > opened_at),
  unrest_at_open INTEGER NOT NULL CHECK(unrest_at_open BETWEEN 0 AND 100),
  sustained_seconds INTEGER NOT NULL CHECK(sustained_seconds >= 0),
  chairman_before TEXT NOT NULL,
  resolved_at INTEGER,
  outcome TEXT CHECK(outcome IS NULL OR outcome IN ('survived','purged')),
  successor TEXT,
  purged_seat TEXT,
  quota_pct INTEGER,
  decision_json TEXT,
  CHECK((resolved_at IS NULL) = (outcome IS NULL)),
  CHECK(outcome IS NULL OR outcome <> 'purged' OR (successor IS NOT NULL AND purged_seat IS NOT NULL))
)`;
export const presidiumIndexes = ['CREATE INDEX IF NOT EXISTS idx_korund_presidium_opened ON korund_presidium_sessions(opened_at)'];
export const presidiumSchemas = [presidiumSessionSchema, ...presidiumIndexes];

type Row = { id: string; opened_at: number; resolves_at: number; resolved_at: number | null; outcome: 'survived' | 'purged' | null; chairman_before: string; successor: string | null; purged_seat: string | null; decision_json: string | null };
export type PresidiumState = {
  chairman: Seat;
  seats: (Seat & { status: 'serving' | 'purged' })[];
  session: { id: string; status: 'open' | 'survived' | 'purged'; openedAt: number; resolvesAt: number; resolvedAt: number | null; reasoning: string | null; successorName: string | null; purgedName: string | null; formerChairmanName: string } | null;
  sessions: Row[];
};

/** Read-only. Works whether or not the flag is on: with no sessions it is the authored roster. */
export async function readPresidium(db: GameDatabase): Promise<PresidiumState> {
  const rows = (await db.prepare('SELECT id, opened_at, resolves_at, resolved_at, outcome, chairman_before, successor, purged_seat, decision_json FROM korund_presidium_sessions ORDER BY opened_at, id')
    .all<Row>().catch(tolerate(isMissingRelation, { results: [] as Row[] }))).results;
  let chairman: SeatId = 'voss'; const purged = new Set<SeatId>();
  for (const r of rows) if (r.outcome === 'purged' && r.successor && r.purged_seat) { purged.add(chairman); purged.add(r.purged_seat as SeatId); chairman = r.successor as SeatId; }
  const chair = seat(chairman)!;
  const seats = presidiumSeats.map(s => s.id === chairman ? { ...s, role: 'Chairman', faction: 'chair' as const, status: 'serving' as const }
    : { ...s, role: s.id === 'voss' ? 'Former Chairman' : s.role, status: purged.has(s.id) ? 'purged' as const : 'serving' as const });
  const last = rows.at(-1);
  return {
    chairman: { ...chair, role: 'Chairman', faction: 'chair' },
    seats: [seats.find(s => s.id === chairman)!, ...seats.filter(s => s.id !== chairman)],
    session: last ? { id: last.id, status: last.outcome ?? 'open', openedAt: Number(last.opened_at), resolvesAt: Number(last.resolves_at), resolvedAt: last.resolved_at === null ? null : Number(last.resolved_at),
      reasoning: last.decision_json ? (JSON.parse(last.decision_json) as { reasoning: string }).reasoning : null,
      successorName: last.successor ? seat(last.successor)?.name ?? null : null, purgedName: last.purged_seat ? seat(last.purged_seat)?.name ?? null : null,
      formerChairmanName: seat(last.chairman_before)?.name ?? last.chairman_before } : null,
    sessions: rows,
  };
}
export const currentChairmanName = async (db: GameDatabase) => (await readPresidium(db)).chairman.name;

async function korundScores(db: GameDatabase) {
  const rows = await db.prepare("SELECT scheduled_at, unrest FROM nation_stability_scores WHERE nation_id = 'korund' ORDER BY tick DESC LIMIT 120")
    .all<{ scheduled_at: number; unrest: number }>().catch(tolerate(isMissingRelation, { results: [] as { scheduled_at: number; unrest: number }[] }));
  return rows.results.map(r => ({ scheduledAt: Number(r.scheduled_at), unrest: Number(r.unrest) }));
}
async function weeklyQuotaPct(db: GameDatabase, now: number) {
  const food = Number((await db.prepare('SELECT COALESCE(SUM(food_output),0) AS f FROM korund_settlements WHERE settled_at >= ? AND settled_at < ?').bind(now - 7 * 86400, now).first<{ f: number }>())?.f ?? 0);
  return Math.max(0, Math.min(100, Math.round(food * 100 / 40))); // korundWeeklyQuotaFood
}

/**
 * World tick (write path, HARIMU_KORUND_PRESIDIUM_ENABLED on): open one emergency session after 7 real days of Unrest ≥ 65,
 * then resolve it exactly once 24 real hours later (Chosen Comrade confirmed, or the Chairman survives with a concession).
 * Guarded inserts/updates make a retry or a racing request a no-op.
 */
export async function runKorundPresidium(db: GameDatabase, now: number) {
  const state = await readPresidium(db);
  const open = state.sessions.find(r => r.resolved_at === null);
  const scores = await korundScores(db);
  if (open) {
    if (now < Number(open.resolves_at)) return;
    // Excluded from succession: purged seats and the sitting Chairman.
    const purged = [...state.seats.filter(s => s.status === 'purged').map(s => s.id), state.chairman.id];
    const sustained = unrestSustainedSeconds(scores, now);
    const quotaPct = await weeklyQuotaPct(db, now);
    const decision = resolveSession({ unrest: scores[0]?.unrest ?? 0, quotaPct, sustainedDays: Math.floor(sustained / 86400), seed: open.id, purged });
    await db.prepare(`UPDATE korund_presidium_sessions SET resolved_at = ?, outcome = ?, successor = ?, purged_seat = ?, quota_pct = ?, decision_json = ?
      WHERE id = ? AND resolved_at IS NULL`).bind(now, decision.outcome, decision.successor, decision.purgedSeat, quotaPct,
      JSON.stringify({ kind: 'ai-decision-record', service: 'rule-bound AI Governance', ...decision }), open.id).run();
    return;
  }
  const last = state.sessions.at(-1);
  if (last?.resolved_at != null && now < Number(last.resolved_at) + presidiumConfig.cooldownSeconds) return;
  const sustained = unrestSustainedSeconds(scores, now);
  if (!sessionReady(sustained)) return;
  await db.prepare(`INSERT OR IGNORE INTO korund_presidium_sessions (id, opened_at, resolves_at, unrest_at_open, sustained_seconds, chairman_before)
    SELECT ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM korund_presidium_sessions WHERE resolved_at IS NULL)`)
    .bind(`presidium:${now}`, now, now + presidiumConfig.confirmSeconds, scores[0].unrest, sustained, state.chairman.id).run();
}

/** State Media rumor copy (citizens never see a vote). Deterministic templates, shown with the AI text tag. */
export function presidiumRumors(state: PresidiumState) {
  return state.sessions.flatMap(r => {
    const before = seat(r.chairman_before)?.name ?? 'the Chairman';
    const items = [{ id: `korund:presidium:${r.id}:open`, title: 'Rumors from Stonehearth: the Presidium meets in emergency session',
      text: 'State Media hears that the Presidium has gathered behind closed doors to discuss the mood of the brigades. Citizens are asked to keep to the plan.', occurredAt: Number(r.opened_at) }];
    if (r.outcome === 'purged') items.push({ id: `korund:presidium:${r.id}:purged`, title: `Comrade ${seat(r.successor!)?.name} confirmed as Chairman`,
      text: `State Media reports that ${before} has stepped aside and ${seat(r.purged_seat!)?.name} has left the Presidium. The Chosen Comrade ${seat(r.successor!)?.name} leads the state.`, occurredAt: Number(r.resolved_at) });
    if (r.outcome === 'survived') items.push({ id: `korund:presidium:${r.id}:survived`, title: `Chairman ${before} thanks the Presidium for its unity`,
      text: 'State Media reports that the Presidium reaffirmed the Chairman and promised a review of ration targets.', occurredAt: Number(r.resolved_at) });
    return items;
  });
}

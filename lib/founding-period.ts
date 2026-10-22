/** Founding Period PoC, slice A (#612; docs coups-transitions §10.6, territory-cities-warfare §15.4). One helper over the existing war clock (shardStartedAt, inFoundingPeriod, foundingPeriodEnd:
 *  no new clock logic, an unknown shard start stays fail-closed = active) and the idempotent day-30 event the world tick records, one row per MVP nation. Everything is behind
 *  HARIMU_FOUNDING_PERIOD_ENABLED ("false"): with the flag off nothing here runs. The war block (lib/war-rules.ts, lib/war.ts) is not changed. */
import { isMissingRelation, tolerate } from './db-errors';
import type { GameDatabase } from './database-contract';
import { claimants } from './aurelle-rising-rules';
import { FOUNDING_NATIONS, dayThirtyPreviewFor, type FoundingNation } from './founding-period-copy';
import { shardStartedAt } from './war';
import { foundingPeriodEnd, inFoundingPeriod } from './war-rules';

export type FoundingState = { active: boolean; endsAt: number | null; dayOfPeriod: number | null };
export type FoundingEventKind = 'first_election' | 'chairman_confirmed' | 'houses_publish_claims';
export const foundingEventKinds: Readonly<Record<FoundingNation, FoundingEventKind>> = { kindle: 'first_election', korund: 'chairman_confirmed', aurelle: 'houses_publish_claims' };
export const isFoundingNation = (id: unknown): id is FoundingNation => typeof id === 'string' && (FOUNDING_NATIONS as readonly string[]).includes(id);

export const foundingSchema = [
  `CREATE TABLE IF NOT EXISTS founding_day30_events (nation_id TEXT PRIMARY KEY CHECK(nation_id IN ('kindle','korund','aurelle')), kind TEXT NOT NULL CHECK(kind IN ('first_election','chairman_confirmed','houses_publish_claims')), occurred_at INTEGER NOT NULL, recorded_at INTEGER NOT NULL, CHECK((nation_id='kindle' AND kind='first_election') OR (nation_id='korund' AND kind='chairman_confirmed') OR (nation_id='aurelle' AND kind='houses_publish_claims')))`,
];

/** Read-only. `active` is the war block's own answer (unknown start = active, endsAt null); dayOfPeriod counts 1.. while active and is null otherwise. */
export function foundingState(started: number | null, now: number): FoundingState {
  const active = inFoundingPeriod(started, now);
  return { active, endsAt: started === null ? null : foundingPeriodEnd(started), dayOfPeriod: started !== null && active ? Math.max(1, Math.floor((now - started) / 86400) + 1) : null };
}
export const readFoundingState = async (db: GameDatabase, now: number) => foundingState(await shardStartedAt(db), now);

/** World-tick write path only. Once day 30 has passed (and the shard start is known: unknown fails closed, nothing is recorded) insert one row per MVP nation; the primary key makes repeats no-ops. */
export async function runFoundingDay30(db: GameDatabase, now: number): Promise<void> {
  const started = await shardStartedAt(db);
  if (started === null || inFoundingPeriod(started, now)) return;
  const at = foundingPeriodEnd(started);
  await db.batch(FOUNDING_NATIONS.map(nation => db.prepare('INSERT INTO founding_day30_events(nation_id,kind,occurred_at,recorded_at) VALUES (?,?,?,?) ON CONFLICT(nation_id) DO NOTHING').bind(nation, foundingEventKinds[nation], at, now)));
}

export type FoundingEvent = { nationId: FoundingNation; kind: FoundingEventKind; occurredAt: number };
export async function readFoundingEvents(db: GameDatabase): Promise<FoundingEvent[]> {
  type EventRow = { nation_id: FoundingNation; kind: FoundingEventKind; occurred_at: number };
  // A database without migration 0053 reads as no events (like readWars).
  const rows = await db.prepare('SELECT nation_id,kind,occurred_at FROM founding_day30_events ORDER BY nation_id').all<EventRow>().catch(tolerate(isMissingRelation, { results: [] as EventRow[] }));
  return rows.results.map(row => ({ nationId: row.nation_id, kind: row.kind, occurredAt: Number(row.occurred_at) }));
}

/** National news line for the nation's recorded day-30 event (derived on read, like the war and treaty lines). [ASSUMPTION] the #499 preview copy is the recorded line as written; Aurelle's also names the houses that already exist in the Rising module. */
export function foundingNewsItems(events: readonly FoundingEvent[], nationId: string) {
  const event = events.find(e => e.nationId === nationId), copy = isFoundingNation(nationId) ? dayThirtyPreviewFor(nationId) : undefined;
  if (!event || !copy) return [];
  const houses = nationId === 'aurelle' ? ` Claimants: ${claimants.map(c => c.house).join(', ')}.` : '';
  return [{ id: `${nationId}:founding-day30`, title: copy.headline, text: copy.body + houses, occurredAt: event.occurredAt, source: 'deterministic' as const, kind: 'template' as const }];
}

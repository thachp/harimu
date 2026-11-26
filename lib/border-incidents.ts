import type { GameDatabase } from './database-contract';
import { isMissingRelation, tolerate } from './db-errors';
import { flagOn } from './flag-pack.mjs';
import { grievanceConfig, isWarNation, warNationNames, type WarNationId } from './war-rules';

/** #1527: border incidents (docs §13.5 casus belli gate: "border incidents, broken treaties, sanctions, Commons disputes"). A nation that gains a square by a
 *  World Registry purchase or a city founding claim, edge- or corner-adjacent to another MVP nation's owned square, records one incident per neighbouring nation per
 *  action, written in that action's batch. Flag HARIMU_BORDER_INCIDENTS_ENABLED (GRAY 105, in HARIMU_GRAY_PACK; preview "true", production "false"). Off: no
 *  border_incidents write or read. Migration 0137. The grievance effect only applies through the existing HARIMU_WAR_DECLARATION_LIMITS_ENABLED path. */
export const BORDER_INCIDENTS_FLAG = 'HARIMU_BORDER_INCIDENTS_ENABLED';
export const borderIncidentsEnabled = (env: unknown) => flagOn(env, BORDER_INCIDENTS_FLAG);
export type BorderIncidentKind = 'purchase' | 'city_founding';
export const borderIncidentSchemas = [
  `CREATE TABLE IF NOT EXISTS border_incidents (id TEXT PRIMARY KEY, request_id TEXT NOT NULL, actor_nation TEXT NOT NULL CHECK(actor_nation IN ('kindle','korund','aurelle')), target_nation TEXT NOT NULL CHECK(target_nation IN ('kindle','korund','aurelle')), x INTEGER NOT NULL, y INTEGER NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('purchase','city_founding')), occurred_at INTEGER NOT NULL, UNIQUE(kind, request_id, target_nation), CHECK(actor_nation <> target_nation))`,
  `CREATE INDEX IF NOT EXISTS border_incidents_pair ON border_incidents(actor_nation, target_nation, occurred_at)`,
];
/** Proposed wire copy for Content to polish. */
export const borderIncidentCopy = { title: { text: 'Border incident', proposal: true }, line: { text: '{actor} expanded to the border with {target} at {x}, {y}.', proposal: true } } as const;

/** Distinct war-capable MVP nations (not `nationId`) owning a square edge- or corner-adjacent to any claimed square. Sorted, so writes are deterministic. */
export function borderIncidentTargets(squares: readonly { x: number; y: number; owner: string | null }[], nationId: string, claimed: readonly { x: number; y: number }[]): WarNationId[] {
  const found = new Set<WarNationId>();
  for (const s of squares) if (s.owner !== nationId && isWarNation(s.owner) && claimed.some(c => Math.max(Math.abs(c.x - s.x), Math.abs(c.y - s.y)) === 1)) found.add(s.owner);
  return [...found].sort();
}

/** ARC on #1536: a side record never blocks the core action. With the flag on and migration 0137 not applied, the purchase or founding still succeeds and records
 *  nothing. Checked before the batch: a failing statement aborts the whole transaction on Postgres (and the D1 batch), so it cannot be tolerated inside it. */
export async function borderIncidentTableReady(db: GameDatabase): Promise<boolean> {
  try { await db.prepare('SELECT 1 AS ok FROM border_incidents LIMIT 1').first(); return true; } catch (error) { if (isMissingRelation(error)) return false; throw error; }
}

/** One INSERT per target, for the action's own batch. Each writes only if the action's row exists (`action`) and the target still owns a square within `radius`
 *  of (x, y), so a refused or raced action records nothing. A replayed request id hits UNIQUE(kind, request_id, target_nation) and writes nothing new. */
export function borderIncidentStatements(db: GameDatabase, a: { kind: BorderIncidentKind; requestId: string; actor: string; x: number; y: number; at: number; radius: number; targets: readonly WarNationId[]; action: { sql: string; binds: unknown[] } }) {
  return a.targets.map(target => db.prepare(`INSERT INTO border_incidents (id,request_id,actor_nation,target_nation,x,y,kind,occurred_at)
    SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (${a.action.sql}) AND EXISTS (SELECT 1 FROM world_squares WHERE owner=? AND x BETWEEN ? AND ? AND y BETWEEN ? AND ?)
    ON CONFLICT DO NOTHING`).bind(`bi-${a.kind}-${a.requestId}-${target}`, a.requestId, a.actor, target, a.x, a.y, a.kind, a.at, ...a.action.binds,
    target, a.x - a.radius, a.x + a.radius, a.y - a.radius, a.y + a.radius));
}

/** Incidents where `actor` expanded against `target` in the last 30 real days (strictly newer than now - window). A missing table reads as 0. */
export async function borderIncidentCount(db: GameDatabase, actor: string, target: string, now: number): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM border_incidents WHERE actor_nation=? AND target_nation=? AND occurred_at>?')
    .bind(actor, target, now - grievanceConfig.borderIncidentWindowSeconds).first<{ n: number }>().catch(tolerate(isMissingRelation, null));
  const n = Number(row?.n ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

type Row = { id: string; actor_nation: WarNationId; target_nation: WarNationId; x: number; y: number; occurred_at: number };
/** National news (derived on read): the 20 newest incidents naming the reader's nation as actor or target, one plain wire line each. */
export async function borderIncidentNewsItems(db: GameDatabase, readerNation: string) {
  if (!isWarNation(readerNation)) return [];
  const rows = (await db.prepare('SELECT id,actor_nation,target_nation,x,y,occurred_at FROM border_incidents WHERE actor_nation=? OR target_nation=? ORDER BY occurred_at DESC, id LIMIT 20')
    .bind(readerNation, readerNation).all<Row>().catch(tolerate(isMissingRelation, { results: [] as Row[] }))).results ?? [];
  return rows.filter(r => isWarNation(r.actor_nation) && isWarNation(r.target_nation)).map(r => ({
    id: `border-incident:${r.id}`, title: borderIncidentCopy.title.text, occurredAt: Number(r.occurred_at) * 1000, source: 'deterministic' as const, kind: 'template' as const,
    text: borderIncidentCopy.line.text.replace('{actor}', warNationNames[r.actor_nation]).replace('{target}', warNationNames[r.target_nation]).replace('{x}', String(Number(r.x))).replace('{y}', String(Number(r.y))),
  }));
}

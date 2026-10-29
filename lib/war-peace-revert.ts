/** #1054: at a treaty ending, squares captured during that war return to the nation that held them when the war was declared, unless a ratified concession ceded them (docs §15.3 Peace).
 *  Behind HARIMU_WAR_PEACE_REVERT_ENABLED, which also needs HARIMU_WAR_ENABLED. Both off: callers do not enter here. Surrender is not a treaty return.
 *  Only `world_squares.owner` moves. Heartland stays. Private title, purchases, leases and relocation rows are never written. */
import type { GameDatabase } from './database-contract';
import { isMissingRelation, tolerate } from './db-errors';
import { flagOn } from './flag-pack.mjs';
import { isWarNation } from './war-rules';

export const peaceRevertSchemas = [
  `CREATE TABLE IF NOT EXISTS war_peace_reverts (
 war_id TEXT PRIMARY KEY REFERENCES wars(id) ON DELETE CASCADE,
 squares INTEGER NOT NULL CHECK(squares >= 0),
 reverted_at INTEGER NOT NULL
)`,
];

/** [ASSUMPTION] A treaty returns every captured square it does not cede. Parent Architect confirms on the PR. */
export const revertUncededCaptures = true;

export const peaceRevertEnabled = (env: unknown) => flagOn(env, 'HARIMU_WAR_ENABLED') && flagOn(env, 'HARIMU_WAR_PEACE_REVERT_ENABLED');

export type PeaceRevertResult = { squares: number; replay: boolean };
type Hit = { x: number; y: number; from_nation: string; at: number; id: string };
const none = <T>(rows: T[]) => tolerate(isMissingRelation, { results: rows });

/** One feed line. The count is how many squares this war's treaty returned. */
export function peaceRevertLine(squares: number): string {
  const n = Math.max(0, Math.trunc(Number(squares)) || 0);
  return `Peace returns ${n} ${n === 1 ? 'square' : 'squares'} to the nation that held ${n === 1 ? 'it' : 'them'} when the war was declared.`;
}

async function capturedDuring(db: GameDatabase, warId: string): Promise<Hit[]> {
  const siege = await db.prepare(`SELECT s.x AS x, s.y AS y, s.from_nation AS from_nation, c.captured_at AS at, c.id AS id
    FROM city_capture_squares s JOIN city_captures c ON c.id=s.capture_id WHERE c.war_id=?`).bind(warId).all<Hit>().catch(none([] as Hit[]));
  const battle = await db.prepare('SELECT x, y, from_nation, transferred_at AS at, id FROM war_frontier_transfers WHERE war_id=?').bind(warId).all<Hit>().catch(none([] as Hit[]));
  return [...siege.results, ...battle.results].map(row => ({ x: Number(row.x), y: Number(row.y), from_nation: String(row.from_nation), at: Number(row.at), id: String(row.id) }));
}

async function cededKeys(db: GameDatabase, warId: string): Promise<Set<string>> {
  const rows = (await db.prepare("SELECT squares_json FROM war_end_terms WHERE war_id=? AND kind='concession' AND status='enacted'").bind(warId).all<{ squares_json: string | null }>().catch(none([] as { squares_json: string | null }[]))).results;
  const keys = new Set<string>();
  for (const row of rows) {
    let parsed: unknown;
    try { parsed = JSON.parse(row.squares_json ?? ''); } catch { continue; }
    if (!Array.isArray(parsed)) continue;
    for (const square of parsed) {
      const x = Number((square as { x?: unknown })?.x), y = Number((square as { y?: unknown })?.y);
      if (Number.isInteger(x) && Number.isInteger(y)) keys.add(`${x},${y}`);
    }
  }
  return keys;
}

type Gate = { gate?: string; gateBinds?: readonly unknown[]; alsoCeded?: readonly { x: number; y: number }[] };
/** Statements for one war. Empty when a marker or an enacted surrender already exists, so a second call writes nothing.
 *  `gate` is appended to every statement (the caller binds it) so the writes can sit in the same batch as the treaty ending and no-op unless that ending landed. */
export async function peaceRevertStatements(db: GameDatabase, warId: string, now: number, options: Gate = {}) {
  if (!revertUncededCaptures) return [];
  const prior = await db.prepare('SELECT 1 AS n FROM war_peace_reverts WHERE war_id=?').bind(warId).first().catch(tolerate(isMissingRelation, null));
  if (prior) return [];
  const surrendered = await db.prepare("SELECT 1 AS n FROM war_end_terms WHERE war_id=? AND kind='surrender' AND status='enacted'").bind(warId).first().catch(tolerate(isMissingRelation, null));
  if (surrendered) return [];
  const ceded = await cededKeys(db, warId);
  for (const square of options.alsoCeded ?? []) if (Number.isInteger(square.x) && Number.isInteger(square.y)) ceded.add(`${square.x},${square.y}`);
  const earliest = new Map<string, Hit>();
  for (const hit of await capturedDuring(db, warId)) {
    const key = `${hit.x},${hit.y}`, prev = earliest.get(key);
    if (!prev || hit.at < prev.at || (hit.at === prev.at && hit.id < prev.id)) earliest.set(key, hit);
  }
  const moves: Hit[] = [];
  for (const [key, hit] of earliest) {
    if (ceded.has(key)) continue;
    const zone = await db.prepare('SELECT zone FROM world_squares WHERE x=? AND y=?').bind(hit.x, hit.y).first<{ zone: string }>();
    if (!zone || zone.zone === 'heartland') continue;
    moves.push(hit);
  }
  const gate = options.gate ? ` AND ${options.gate}` : '', binds = options.gateBinds ?? [];
  return [
    ...moves.map(hit => db.prepare(`UPDATE world_squares SET owner=? WHERE x=? AND y=? AND zone<>'heartland' AND (owner IS NULL OR owner<>?)${gate}`).bind(hit.from_nation, hit.x, hit.y, hit.from_nation, ...binds)),
    db.prepare(`INSERT INTO war_peace_reverts (war_id,squares,reverted_at) SELECT ?,?,? WHERE NOT EXISTS (SELECT 1 FROM war_peace_reverts WHERE war_id=?)${gate}`).bind(warId, moves.length, now, warId, ...binds),
  ];
}

/** Idempotent per war. Surrender, and a war that is not a treaty, move nothing and write no marker. */
export async function revertPeaceCaptures(db: GameDatabase, warId: string, now: number): Promise<PeaceRevertResult> {
  const prior = await db.prepare('SELECT squares FROM war_peace_reverts WHERE war_id=?').bind(warId).first<{ squares: number }>().catch(tolerate(isMissingRelation, null));
  if (prior) return { squares: Number(prior.squares), replay: true };
  const war = await db.prepare('SELECT end_kind FROM wars WHERE id=?').bind(warId).first<{ end_kind: string | null }>();
  if (!war || war.end_kind !== 'treaty') return { squares: 0, replay: false };
  const statements = await peaceRevertStatements(db, warId, now);
  if (!statements.length) return { squares: 0, replay: false };
  await db.batch(statements);
  const saved = await db.prepare('SELECT squares FROM war_peace_reverts WHERE war_id=?').bind(warId).first<{ squares: number }>();
  return { squares: Number(saved?.squares ?? 0), replay: false };
}

/** Treaty endings whose revert never landed (the worker died after the end, before the marker). Surrender is left alone. Idempotent. */
export async function sweepUnrevertedTreaties(db: GameDatabase, now: number): Promise<number> {
  const rows = (await db.prepare(`SELECT id FROM wars w WHERE w.end_kind='treaty'
    AND NOT EXISTS (SELECT 1 FROM war_peace_reverts r WHERE r.war_id=w.id)
    AND NOT EXISTS (SELECT 1 FROM war_end_terms t WHERE t.war_id=w.id AND t.kind='surrender' AND t.status='enacted')
    ORDER BY w.ended_at, w.id LIMIT 20`).all<{ id: string }>().catch(none([] as { id: string }[]))).results;
  let repaired = 0;
  for (const row of rows) if (!(await revertPeaceCaptures(db, row.id, now)).replay) repaired++;
  return repaired;
}

/** Derived on read. Flag off: the caller does not call this, so the table is never read. */
export async function peaceRevertNewsItems(db: GameDatabase, readerNation: string) {
  if (!isWarNation(readerNation)) return [];
  const rows = (await db.prepare('SELECT war_id, squares, reverted_at FROM war_peace_reverts ORDER BY reverted_at DESC, war_id LIMIT 20').all<{ war_id: string; squares: number; reverted_at: number }>().catch(none([] as { war_id: string; squares: number; reverted_at: number }[]))).results;
  const kind = readerNation === 'aurelle' ? 'decree' as const : 'template' as const;
  return rows.map(row => ({ id: `war:${row.war_id}:peace-revert`, title: 'Occupied squares returned', text: peaceRevertLine(Number(row.squares)), occurredAt: Number(row.reverted_at) * 1000, source: 'deterministic' as const, kind }));
}

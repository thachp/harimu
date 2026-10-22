/** #427 slice 2: war endings by surrender and by concession of squares, behind HARIMU_WAR_ENDINGS_ENABLED (needs HARIMU_WAR_ENABLED; off in production). ARC rulings on #427:
 *  surrender needs a majority of the SURRENDERING nation's own assembly; a concession needs ratification by BOTH sides, the same as treaties, and moves only NATIONAL control
 *  (`world_squares.owner` on Frontier squares the ceding nation governs). Private title, leases and relocation are never touched (they wait on #467); a privately bought square is
 *  never ceded. Reparations are deferred (no money path, no field); demilitarized zones are out of scope. Proposed by a war party's authorized office, decided once on the next
 *  world tick (after diplomacy) with a strict rowcount; an enacted ending ends the war as a treaty, so the 10-day peace lock starts. AI-seat war-weariness weighting is a later slice. */
import type { GameDatabase } from './database-contract';
import { isMissingRelation, isUniqueViolation, tolerate } from './db-errors';
import { kindleSeats } from './diplomacy';
import { soleRatification, type PartySeats, type Ratification } from './diplomacy-rules';
import { isWarNation, requestIdOk, type WarNationId } from './war-rules';

export const warEndingsSchemas = [
  `CREATE TABLE IF NOT EXISTS war_end_terms (
 id TEXT PRIMARY KEY,
 request_id TEXT NOT NULL UNIQUE,
 war_id TEXT NOT NULL REFERENCES wars(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('surrender','concession')),
 proposer_nation TEXT NOT NULL CHECK(proposer_nation IN ('kindle','korund','aurelle')),
 other_nation TEXT NOT NULL CHECK(other_nation IN ('kindle','korund','aurelle')),
 squares_json TEXT,
 proposed_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','enacted','rejected')),
 decided_at INTEGER,
 ratification_json TEXT,
 reject_reason TEXT CHECK(reject_reason IS NULL OR length(reject_reason)<=40),
 CHECK(proposer_nation<>other_nation),
 CHECK((kind='concession')=(squares_json IS NOT NULL)),
 CHECK(status='proposed' OR decided_at IS NOT NULL)
)`,
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_war_end_terms_one_pending ON war_end_terms(war_id) WHERE status='proposed'",
];

export const maxCededSquares = 10; // [ASSUMPTION] a cap per concession until Content/ARC name one
const parties = ['steady-hand', 'open-ledger', 'dockside-builders'] as const;
/** [ASSUMPTION] Placeholder Kindle stances (Kindle narrative owns the final table): who backs surrendering, and who backs ceding Kindle squares / receiving squares. */
export const kindleEndingStances = {
  surrender: { 'steady-hand': true, 'open-ledger': true, 'dockside-builders': false },
  cede: { 'steady-hand': true, 'open-ledger': true, 'dockside-builders': false },
  receive: { 'steady-hand': true, 'open-ledger': true, 'dockside-builders': true },
} as const satisfies Record<string, Record<typeof parties[number], boolean>>;
/** Kindle's Assembly: the whole Assembly is the denominator (an unknown party counts as not-yes). Surrender: more than half; a concession: two-thirds, the treaty rule. */
export function kindleEndingVote(stance: keyof typeof kindleEndingStances, seats: PartySeats): Ratification {
  const n = (id: string) => { const v = Math.trunc(Number(seats[id] ?? 0)); return Number.isFinite(v) && v > 0 ? v : 0; };
  const total = Object.keys(seats).reduce((a, id) => a + n(id), 0), yes = parties.reduce((a, id) => a + (kindleEndingStances[stance][id] ? n(id) : 0), 0);
  const rule = stance === 'surrender' ? 'simple-majority' as const : 'two-thirds' as const;
  return { nation: 'kindle', body: 'Assembly', rule, yes, total, passed: total > 0 && (rule === 'two-thirds' ? yes * 3 >= total * 2 : yes * 2 > total) };
}
/** Surrender: the surrendering nation's own body alone. Concession: the ceding and the receiving nation's bodies both (Korund's Chairman, Aurelle's Crown, Kindle's Assembly). */
export function decideEnding(kind: 'surrender' | 'concession', proposer: WarNationId, other: WarNationId, seats: PartySeats) {
  const side = (nation: WarNationId, stance: keyof typeof kindleEndingStances) => nation === 'kindle' ? kindleEndingVote(stance, seats) : soleRatification(nation);
  const ratifications = kind === 'surrender' ? [side(proposer, 'surrender')] : [side(proposer, 'cede'), side(other, 'receive')];
  return { passed: ratifications.every(r => r.passed), ratifications };
}

type Square = { x: number; y: number };
const fail = (status: 400 | 403 | 409, reason: string, error: string) => ({ ok: false as const, status, reason, error });
const cleanSquares = (value: unknown): Square[] | null => {
  if (!Array.isArray(value) || value.length < 1 || value.length > maxCededSquares) return null;
  const out = value.map(s => ({ x: Number((s as Square)?.x), y: Number((s as Square)?.y) }));
  return out.every(s => Number.isInteger(s.x) && Number.isInteger(s.y)) && new Set(out.map(s => `${s.x},${s.y}`)).size === out.length ? out : null;
};
/** Nation squares only: Frontier (Heartland is never ceded), governed by the ceding nation, and never privately bought (title stays with its owner; #467). */
async function ineligibleSquare(db: GameDatabase, ceder: WarNationId, squares: Square[]) {
  for (const s of squares) {
    const row = await db.prepare('SELECT zone,owner,(SELECT COUNT(*) FROM world_square_purchases p WHERE p.x=world_squares.x AND p.y=world_squares.y) AS bought FROM world_squares WHERE x=? AND y=?').bind(s.x, s.y).first<{ zone: string; owner: string | null; bought: number }>();
    if (!row || row.zone !== 'frontier' || row.owner !== ceder || Number(row.bought) > 0) return s;
  }
  return null;
}

type Row = { id: string; request_id: string; war_id: string; kind: 'surrender' | 'concession'; proposer_nation: WarNationId; other_nation: WarNationId; squares_json: string | null; proposed_at: number; status: string; decided_at: number | null; ratification_json: string | null; reject_reason: string | null };
const columns = 'id,request_id,war_id,kind,proposer_nation,other_nation,squares_json,proposed_at,status,decided_at,ratification_json,reject_reason';
const publicTerms = (r: Row) => ({ id: r.id, warId: r.war_id, kind: r.kind, proposer: r.proposer_nation, other: r.other_nation, squares: r.squares_json ? JSON.parse(r.squares_json) as Square[] : [], proposedAt: Number(r.proposed_at),
  status: r.status, decidedAt: r.decided_at === null ? null : Number(r.decided_at), ratifications: r.ratification_json ? JSON.parse(r.ratification_json) as Ratification[] : null, rejectReason: r.reject_reason });

export type ProposeEndingCommand = { nation: WarNationId; warId: string; kind: string; squares?: unknown; requestId: string };
/** A war party's authorized office (checked by the caller) proposes to surrender, or to cede its own squares. Idempotent per requestId; one pending ending per war. */
export async function proposeWarEnding(db: GameDatabase, command: ProposeEndingCommand, now: number) {
  if (!requestIdOk(command.requestId)) return fail(400, 'bad_request', 'A request id is required.');
  if (command.kind !== 'surrender' && command.kind !== 'concession') return fail(400, 'bad_request', 'Propose a surrender or a concession.');
  const read = () => db.prepare(`SELECT ${columns} FROM war_end_terms WHERE request_id=?`).bind(command.requestId).first<Row>();
  const prior = await read();
  if (prior) return prior.war_id === command.warId && prior.proposer_nation === command.nation && prior.kind === command.kind ? { ok: true as const, replay: true as const, terms: publicTerms(prior) } : fail(409, 'request_reused', 'That request id was already used for a different command.');
  const war = await db.prepare('SELECT attacker_nation,defender_nation,ended_at FROM wars WHERE id=?').bind(command.warId).first<{ attacker_nation: WarNationId; defender_nation: WarNationId; ended_at: number | null }>();
  if (!war) return fail(409, 'not_found', 'No such war.');
  if (war.ended_at !== null) return fail(409, 'war_ended', 'That war has already ended.');
  if (war.attacker_nation !== command.nation && war.defender_nation !== command.nation) return fail(403, 'not_a_party', 'Your nation is not a party to that war.');
  const other = war.attacker_nation === command.nation ? war.defender_nation : war.attacker_nation;
  let squares: Square[] | null = null;
  if (command.kind === 'concession') {
    squares = cleanSquares(command.squares);
    if (!squares) return fail(400, 'bad_squares', `Cede 1 to ${maxCededSquares} distinct squares.`);
    if (await ineligibleSquare(db, command.nation, squares)) return fail(409, 'square_not_cedable', 'Only Frontier squares your nation governs, never privately owned, can be ceded.');
  }
  await db.prepare('INSERT INTO war_end_terms (id,request_id,war_id,kind,proposer_nation,other_nation,squares_json,proposed_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING')
    .bind(`wend-${command.requestId}`, command.requestId, command.warId, command.kind, command.nation, other, squares ? JSON.stringify(squares) : null, now).run()
    .catch(error => { if (isUniqueViolation(error)) return null; throw error; });
  const saved = await read();
  return saved ? { ok: true as const, terms: publicTerms(saved) } : fail(409, 'ending_pending', 'An ending of this war is already awaiting ratification.');
}

const changes = (result: unknown) => Number((result as { meta?: { changes?: number } })?.meta?.changes ?? 0);
/** World tick only (after diplomacy; never a route or a GET): decides each pending ending once, atomically with its re-checks (QA3). The enacting UPDATE carries the
 *  re-checks in its own WHERE (war still open; every square still Frontier, governed by the ceding nation and never privately bought), and the square moves and the war's
 *  end in the same batch are gated on that row now being enacted at this tick, so a failed re-check moves nothing and ends nothing. A decision counts only on a strict
 *  rowcount of 1; when the enacting UPDATE changes nothing, a guarded reject records why. Enacted: the war ends as a treaty (peace lock). */
export async function decideWarEndings(db: GameDatabase, now: number) {
  const rows = (await db.prepare(`SELECT ${columns} FROM war_end_terms WHERE status='proposed' ORDER BY proposed_at,id LIMIT 20`).all<Row>()).results;
  if (!rows.length) return 0;
  const seats = await kindleSeats(db);
  let decided = 0;
  for (const row of rows) {
    const vote = decideEnding(row.kind, row.proposer_nation, row.other_nation, seats), json = JSON.stringify(vote.ratifications);
    const squares: Square[] = row.squares_json ? JSON.parse(row.squares_json) : [];
    const reject = (reason: string) => db.prepare("UPDATE war_end_terms SET status='rejected',decided_at=?,ratification_json=?,reject_reason=? WHERE id=? AND status='proposed'").bind(now, json, reason, row.id).run();
    if (!vote.passed) { if (changes(await reject('not_ratified')) === 1) decided++; continue; }
    const cedable = "EXISTS (SELECT 1 FROM world_squares s WHERE s.x=? AND s.y=? AND s.zone='frontier' AND s.owner=?) AND NOT EXISTS (SELECT 1 FROM world_square_purchases p WHERE p.x=? AND p.y=?)";
    const enact = db.prepare(`UPDATE war_end_terms SET status='enacted',decided_at=?,ratification_json=? WHERE id=? AND status='proposed' AND NOT EXISTS (SELECT 1 FROM wars w WHERE w.id=? AND w.ended_at IS NOT NULL) AND EXISTS (SELECT 1 FROM wars w WHERE w.id=?)${squares.map(() => ` AND ${cedable}`).join('')}`)
      .bind(now, json, row.id, row.war_id, row.war_id, ...squares.flatMap(sq => [sq.x, sq.y, row.proposer_nation, sq.x, sq.y]));
    // Two ticks at the same `now` (QA3): both may read this row and both may send this batch, and the gate below (enacted at this decided_at) is then true for both.
    // Only one enacting UPDATE can change the row (status='proposed' is in its WHERE, and the database serializes the two batches), so only that tick counts a decision.
    // The other tick's moves change nothing because each still requires owner = the ceding nation (already moved), and its war end requires ended_at IS NULL (already set).
    const enacted = "EXISTS (SELECT 1 FROM war_end_terms t WHERE t.id=? AND t.status='enacted' AND t.decided_at=?)";
    const moves = squares.map(sq => db.prepare(`UPDATE world_squares SET owner=? WHERE x=? AND y=? AND owner=? AND zone='frontier' AND NOT EXISTS (SELECT 1 FROM world_square_purchases p WHERE p.x=? AND p.y=?) AND ${enacted}`)
      .bind(row.other_nation, sq.x, sq.y, row.proposer_nation, sq.x, sq.y, row.id, now));
    const end = db.prepare(`UPDATE wars SET ended_at=?,end_kind='treaty' WHERE id=? AND ended_at IS NULL AND ${enacted}`).bind(now, row.war_id, row.id, now);
    const results = await db.batch([enact, ...moves, end]);
    if (changes(results[0]) === 1) { decided++; continue; }
    // Not enacted: either another tick decided it, or a re-check failed. Record the reason (guarded, so a decided row is left alone).
    const war = await db.prepare('SELECT ended_at FROM wars WHERE id=?').bind(row.war_id).first<{ ended_at: number | null }>();
    const reason = !war || war.ended_at !== null ? 'war_ended' : await ineligibleSquare(db, row.proposer_nation, squares) ? 'square_not_cedable' : 'stale';
    if (changes(await reject(reason)) === 1) decided++;
  }
  return decided;
}

/** Read-only: pending and recent endings for the world snapshot (no writes; a database without migration 0065 reads as none). */
export async function readWarEndings(db: GameDatabase) {
  const rows = (await db.prepare(`SELECT ${columns} FROM war_end_terms ORDER BY proposed_at DESC, id LIMIT 10`).all<Row>().catch(tolerate(isMissingRelation, { results: [] as Row[] }))).results;
  return rows.map(publicTerms);
}

/** #427 slice 1: the Kindle Assembly votes on the President's war declaration, behind HARIMU_WAR_ASSEMBLY_ENABLED (with HARIMU_WAR_ENABLED).
 *  ARC rulings: a declaration passes with more than half of ALL seats (no quorum; a tie fails); it is decided once, on the next world tick, with a strict
 *  rowcount; the Founding Period, non-aggression pact and peace lock are checked again at decision time (declareWar does that). War-weariness is display
 *  only: it is shown with the vote in the world snapshot and never changes it. Korund and Aurelle declare by decree as before. Migration 0064. */
import type { GameDatabase } from './database-contract';
import { isMissingRelation, isUniqueViolation, tolerate } from './db-errors';
import { kindleSeats } from './diplomacy';
import type { PartySeats } from './diplomacy-rules';
import { declareWar } from './war';
import { cleanLabel, isWarNation, kindlePartyWeary, requestIdOk, warConfig, wearyKindleParties } from './war-rules';
import { kindleVoteWeariness, type VoteWearinessOptions } from './war-weariness'; // #427 slice 3

export const warAssemblySchemas = [
  `CREATE TABLE IF NOT EXISTS war_proposals (
 id TEXT PRIMARY KEY,
 request_id TEXT NOT NULL UNIQUE,
 defender_nation TEXT NOT NULL CHECK(defender_nation IN ('korund','aurelle')),
 casus_belli TEXT NOT NULL DEFAULT '' CHECK(length(casus_belli)<=40),
 declared_by TEXT NOT NULL CHECK(length(declared_by) BETWEEN 1 AND 60),
 proposed_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','approved','rejected')),
 decided_at INTEGER,
 war_id TEXT,
 vote_json TEXT,
 reject_reason TEXT CHECK(reject_reason IS NULL OR length(reject_reason)<=40),
 CHECK(status='proposed' OR decided_at IS NOT NULL),
 CHECK((status='approved')=(war_id IS NOT NULL))
)`,
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_war_proposals_one_pending ON war_proposals(defender_nation) WHERE status='proposed'",
] as const;

const parties = ['steady-hand', 'open-ledger', 'dockside-builders'] as const;
/** [ASSUMPTION] Placeholder war stances (Kindle narrative owns the final table), like kindleStances for treaties: yes = the party backs war on that nation. */
export const kindleWarStances: Readonly<Record<'korund' | 'aurelle', Readonly<Record<typeof parties[number], boolean>>>> = {
  korund: { 'steady-hand': false, 'open-ledger': true, 'dockside-builders': true },
  aurelle: { 'steady-hand': false, 'open-ledger': false, 'dockside-builders': true },
};
export type WarVote = { body: 'Assembly'; rule: 'majority-of-all-seats'; yes: number; total: number; passed: boolean; weariness?: number; weary?: string[] };
/** More than half of ALL seats; no quorum (every seat counts in the total); exactly half is a tie and fails. Integers only.
 *  #427 slice 3: a party that backs the war votes no once Kindle's weariness reaches its tolerance (lib/war-rules.ts). The weariness is recorded with the vote when it is above zero. */
export function kindleWarVote(defender: 'korund' | 'aurelle', seats: PartySeats, weariness = 0): WarVote {
  const n = (id: string) => { const v = Math.trunc(Number(seats[id] ?? 0)); return Number.isFinite(v) && v > 0 ? v : 0; };
  // The denominator is the whole Assembly: every seated party, known or not. An unknown party key is counted as not-yes, never dropped.
  const total = Object.keys(seats).reduce((a, id) => a + n(id), 0), yes = parties.reduce((a, id) => a + (kindleWarStances[defender][id] && !kindlePartyWeary(id, weariness) ? n(id) : 0), 0);
  return { body: 'Assembly', rule: 'majority-of-all-seats', yes, total, passed: total > 0 && yes * 2 > total, ...(weariness > 0 ? { weariness, weary: wearyKindleParties(weariness) } : {}) };
}

const fail = (status: 400 | 409, reason: string, error: string) => ({ ok: false as const, status, reason, error });
type Row = { id: string; request_id: string; defender_nation: 'korund' | 'aurelle'; casus_belli: string; declared_by: string; proposed_at: number; status: string; decided_at: number | null; war_id: string | null; vote_json: string | null; reject_reason: string | null };
const columns = 'id,request_id,defender_nation,casus_belli,declared_by,proposed_at,status,decided_at,war_id,vote_json,reject_reason';
const publicProposal = (r: Row) => ({ id: r.id, defender: r.defender_nation, casusBelli: r.casus_belli, declaredBy: r.declared_by, proposedAt: Number(r.proposed_at), status: r.status,
  decidedAt: r.decided_at === null ? null : Number(r.decided_at), warId: r.war_id, vote: r.vote_json ? JSON.parse(r.vote_json) as WarVote : null, rejectReason: r.reject_reason });

/** Kindle's President proposes; nothing is declared until the Assembly vote on the next tick. Idempotent per requestId; one pending proposal per defender. */
export async function proposeKindleWar(db: GameDatabase, command: { defender: string; casusBelli?: string; declaredBy: string; requestId: string }, now: number) {
  if (!requestIdOk(command.requestId)) return fail(400, 'bad_request', 'A request id is required.');
  if (!isWarNation(command.defender) || command.defender === 'kindle') return fail(400, 'bad_nations', 'Kindle can propose war on Korund or Aurelle.');
  const declaredBy = cleanLabel(command.declaredBy, warConfig.actorMax);
  if (!declaredBy) return fail(400, 'bad_request', 'The declaring AI leader must be named.');
  const read = () => db.prepare(`SELECT ${columns} FROM war_proposals WHERE request_id=?`).bind(command.requestId).first<Row>();
  const prior = await read();
  if (prior) return prior.defender_nation === command.defender ? { ok: true as const, replay: true as const, proposal: publicProposal(prior) } : fail(409, 'request_reused', 'That request id was already used for a different declaration.');
  await db.prepare('INSERT INTO war_proposals (id,request_id,defender_nation,casus_belli,declared_by,proposed_at) VALUES (?,?,?,?,?,?) ON CONFLICT DO NOTHING')
    .bind(`wprop-${command.requestId}`, command.requestId, command.defender, cleanLabel(command.casusBelli ?? '', warConfig.casusBelliMax), declaredBy, now).run()
    .catch(error => { if (isUniqueViolation(error)) return null; throw error; });
  const saved = await read();
  return saved ? { ok: true as const, proposal: publicProposal(saved) } : fail(409, 'proposal_pending', 'The Assembly already has a declaration on that nation to vote on.');
}

/** World tick only (never a route, never a GET): decides each pending proposal once. Approval goes through declareWar, which re-checks the Founding Period,
 *  the pact and the peace lock (and the #426 limits when on) at decision time; a block rejects the proposal with that reason. A decision counts only on a strict rowcount of 1. */
export async function decideKindleWarProposals(db: GameDatabase, now: number, limits = false, wearinessOptions: VoteWearinessOptions = {}) {
  const rows = (await db.prepare(`SELECT ${columns} FROM war_proposals WHERE status='proposed' ORDER BY proposed_at,id LIMIT 20`).all<Row>()).results;
  if (!rows.length) return 0;
  const seats = await kindleSeats(db), weariness = await kindleVoteWeariness(db, now, wearinessOptions); // #427 slice 3: read once, at decision time
  const one = (result: unknown) => Number((result as { meta?: { changes?: number } })?.meta?.changes ?? 0) === 1;
  let decided = 0;
  for (const row of rows) {
    const vote = kindleWarVote(row.defender_nation, seats, weariness), json = JSON.stringify(vote);
    const reject = (reason: string) => db.prepare("UPDATE war_proposals SET status='rejected',decided_at=?,vote_json=?,reject_reason=? WHERE id=? AND status='proposed'").bind(now, json, reason.slice(0, 40), row.id).run();
    if (!vote.passed) { if (one(await reject('assembly_rejected'))) decided++; continue; }
    const declared = await declareWar(db, { attacker: 'kindle', defender: row.defender_nation, casusBelli: row.casus_belli, declaredBy: row.declared_by, requestId: row.request_id }, now, { enabled: true, limits }); // #426 limits too, when that flag is on
    const result = declared.ok
      ? await db.prepare("UPDATE war_proposals SET status='approved',decided_at=?,vote_json=?,war_id=? WHERE id=? AND status='proposed'").bind(now, json, declared.war.id, row.id).run()
      : await reject(declared.reason);
    if (one(result)) decided++;
  }
  return decided;
}

/** Read-only: pending and recent proposals for the world snapshot (no writes; a database without the table reads as none). */
export async function readWarProposals(db: GameDatabase) {
  const rows = (await db.prepare(`SELECT ${columns} FROM war_proposals ORDER BY proposed_at DESC, id LIMIT 10`).all<Row>().catch(tolerate(isMissingRelation, { results: [] as Row[] }))).results;
  return rows.map(publicProposal);
}

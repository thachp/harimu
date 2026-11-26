import type { GameDatabase } from './database-contract';
import { isMissingRelation, tolerate } from './db-errors';
import { flagOn } from './flag-pack.mjs';
import { gameTimeCompression } from './game-time';
import { assemblyIncumbents } from './assembly-rules';
import { brokenPactLine, ratificationFor, ratificationHeadlines, treatyStatusLines, DIPLOMACY_NAME_MAX, type RatificationKey } from './diplomacy-copy';
import { gameYear } from './crown-debasement-rules';
import { cleanTreatyLabel, decideTreaty, isTreatyKind, isTreatyNation, treatyActorMax, treatyKindNames, treatyNationNames, treatyPairKey, treatyRequestIdOk, treatyStatus, treatyTermSeconds, treatyBreakPenaltyFor, treatyAiLeaders, treatyCandidates, treatyProposalCooldownSlots, treatyProposalRequestId, treatyProposalSlotSeconds, treatySlot,
  worldReputationBreaksSql, worldReputationFromBreaks, worldLegitimacyFromBreaks, withWorldReputationRecord, debasementCountInWindow, withDebasementReputation, renewalWindowSeconds, renewedTerm, treatyRenewalRequestId, type PartySeats, type Ratification, type TreatyDbStatus, type TreatyBreakPenalty, type TreatyKind, type TreatyNationId, type TreatyStatus, type WorldReputationMap } from './diplomacy-rules';
export * from './diplomacy-rules';

/** #1505: lib/embargo.ts registers this after both modules have loaded, so diplomacy does not import embargo (that cycle drops the reputation record). */
let runAiTreatyEmbargo: ((db: GameDatabase, now: number, options: { enabled: boolean }) => Promise<unknown>) | null = null;
export function bindAiTreatyEmbargoes(run: NonNullable<typeof runAiTreatyEmbargo>) { runAiTreatyEmbargo = run; }

/** #308: AI treaties PoC (non-aggression pact, trade agreement) behind HARIMU_DIPLOMACY_ENABLED (default "false"). Canon: harimu-docs 13.1, 13.2
 *  (see lib/diplomacy-rules.ts). Treaties are written only by server code (a proposal from the AI leadership path, the world tick that decides
 *  proposals, expires terms, and — when HARIMU_TREATY_BREAK_ENABLED is on — may break one in-force NAP per slot): there is no route that proposes, ratifies or breaks one, and no GET writes. Flag off: nothing is created, read or shown. */
export const treatySchemas = [
  `CREATE TABLE IF NOT EXISTS treaties (
 id TEXT PRIMARY KEY,
 request_id TEXT NOT NULL UNIQUE,
 pair_key TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('non-aggression','trade')),
 proposer_nation TEXT NOT NULL CHECK(proposer_nation IN ('kindle','korund','aurelle')),
 other_nation TEXT NOT NULL CHECK(other_nation IN ('kindle','korund','aurelle')),
 proposed_by TEXT NOT NULL CHECK(length(proposed_by) BETWEEN 1 AND 60),
 proposed_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','in_force','rejected','expired','broken')),
 decided_at INTEGER,
 ratified_at INTEGER,
 ends_at INTEGER,
 ended_at INTEGER,
 ratification_json TEXT,
 broken_by TEXT CHECK(broken_by IS NULL OR broken_by IN ('kindle','korund','aurelle')),
 CHECK(proposer_nation<>other_nation),
 CHECK(status NOT IN ('in_force','expired','broken') OR (ratified_at IS NOT NULL AND ends_at IS NOT NULL AND ends_at>ratified_at)),
 CHECK(status IN ('proposed') OR decided_at IS NOT NULL)
)`,
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_treaties_one_live_per_pair_kind ON treaties(pair_key,kind) WHERE status IN ('proposed','in_force')",
  'CREATE INDEX IF NOT EXISTS idx_treaties_proposed ON treaties(proposed_at)',
];

type Row = { id: string; request_id: string; pair_key: string; kind: TreatyKind; proposer_nation: TreatyNationId; other_nation: TreatyNationId; proposed_by: string; proposed_at: number; status: TreatyDbStatus;
  decided_at: number | null; ratified_at: number | null; ends_at: number | null; ended_at: number | null; ratification_json: string | null; broken_by: TreatyNationId | null };
const columns = 'id,request_id,pair_key,kind,proposer_nation,other_nation,proposed_by,proposed_at,status,decided_at,ratified_at,ends_at,ended_at,ratification_json,broken_by';
export type PublicTreaty = { id: string; kind: TreatyKind; proposer: TreatyNationId; other: TreatyNationId; proposedBy: string; proposedAt: number; status: TreatyStatus;
  ratifiedAt: number | null; endsAt: number | null; brokenAt: number | null; brokenBy: TreatyNationId | null; breakPenalty: TreatyBreakPenalty | null; ratifications: Ratification[]; renewal: boolean };
export type TreatyState = { treaties: PublicTreaty[] };
export type NapReputationRefusal = { id: string; proposer: TreatyNationId; other: TreatyNationId; decidedAt: number; bodies: { nation: TreatyNationId; body: Ratification['body'] }[] };

const num = (value: number | null) => value === null || value === undefined ? null : Number(value);
function publicTreaty(row: Row, now: number): PublicTreaty | null {
  const status = treatyStatus({ status: row.status, endsAt: num(row.ends_at) }, now);
  if (status === 'rejected') return null; // refused proposals are not published
  let ratifications: Ratification[] = [];
  try { const parsed = JSON.parse(row.ratification_json ?? '[]'); if (Array.isArray(parsed)) ratifications = parsed; } catch { ratifications = []; }
  return { id: row.id, kind: row.kind, proposer: row.proposer_nation, other: row.other_nation, proposedBy: row.proposed_by, proposedAt: Number(row.proposed_at), status,
    ratifiedAt: num(row.ratified_at), endsAt: num(row.ends_at), brokenAt: row.status === 'broken' ? num(row.ended_at) : null, brokenBy: row.status === 'broken' ? row.broken_by ?? null : null,
    breakPenalty: row.status === 'broken' && row.broken_by ? treatyBreakPenaltyFor(row.kind, row.broken_by) : null, ratifications, renewal: row.request_id.startsWith('renew-') };
}
const fail = (status: 400 | 403 | 409, reason: string, error: string) => ({ ok: false as const, status, reason, error });

/** Kindle's seats for the ratification vote: the last counted Assembly result (#283), else the incumbent tables (held + up). A database
 *  without the Assembly tables reads as the incumbents. */
export async function kindleSeats(db: GameDatabase): Promise<PartySeats> {
  const row = await db.prepare('SELECT result_json FROM assembly_elections WHERE result_json IS NOT NULL ORDER BY closed_at DESC, id LIMIT 1').first<{ result_json: string }>().catch(tolerate(isMissingRelation, null));
  if (row) { try { const after = JSON.parse(row.result_json)?.totals?.after; if (after && typeof after === 'object') return after as PartySeats; } catch { /* fall through to the incumbents */ } }
  const seats: PartySeats = {};
  for (const d of Object.values(assemblyIncumbents)) for (const [party, n] of Object.entries(d.held)) seats[party] = (seats[party] ?? 0) + n + (d.up[party] ?? 0);
  return seats;
}

async function openWarBetween(db: GameDatabase, a: string, b: string): Promise<boolean> {
  const row = await db.prepare('SELECT id FROM wars WHERE pair_key=? AND ended_at IS NULL').bind(treatyPairKey(a, b)).first().catch(tolerate(isMissingRelation, null));
  return Boolean(row);
}

/** #363: an in-force embargo between the pair (either direction). A direct query so this module does not import lib/embargo.ts (which imports this one); a database without the table reads as none. */
async function embargoInForce(db: GameDatabase, a: string, b: string): Promise<boolean> {
  const row = await db.prepare("SELECT 1 AS found FROM embargoes WHERE pair_key=? AND status='in_force'").bind(treatyPairKey(a, b)).first().catch(tolerate(isMissingRelation, null));
  return Boolean(row);
}

export type ProposeTreatyCommand = { proposer: string; other: string; kind: string; proposedBy: string; requestId: string };
/** Server-side only (the AI leadership path calls this; no route does). Writes one `proposed` row; the world tick decides it. Idempotent per requestId. */
export async function proposeTreaty(db: GameDatabase, command: ProposeTreatyCommand, now: number, options: { enabled: boolean; embargo?: boolean }) {
  if (!options.enabled) return fail(403, 'disabled', 'Treaties are not open yet.');
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid authoritative world time.');
  if (!treatyRequestIdOk(command.requestId)) return fail(400, 'bad_request', 'A request id is required.');
  if (!isTreatyNation(command.proposer) || !isTreatyNation(command.other) || command.proposer === command.other) return fail(400, 'bad_nations', 'A treaty needs two different nations (Kindle, Korund or Aurelle).');
  if (!isTreatyKind(command.kind)) return fail(400, 'bad_kind', 'Treaties are a non-aggression pact or a trade agreement.');
  const proposedBy = cleanTreatyLabel(command.proposedBy, treatyActorMax);
  if (!proposedBy) return fail(400, 'bad_request', 'The proposing AI leader must be named.');
  const prior = await db.prepare(`SELECT ${columns} FROM treaties WHERE request_id=?`).bind(command.requestId).first<Row>();
  if (prior) return prior.proposer_nation === command.proposer && prior.other_nation === command.other && prior.kind === command.kind
    ? { ok: true as const, replay: true as const, treaty: publicTreaty(prior, now) } : fail(409, 'request_reused', 'That request id was already used for a different proposal.');
  await expireDueTreaties(db, now);
  // #363: no new trade agreement while an embargo is in force between the pair, in either direction. `embargo` is the HARIMU_EMBARGO_ENABLED flag the caller passes (off: not checked).
  if (options.embargo === true && command.kind === 'trade' && await embargoInForce(db, command.proposer, command.other)) return fail(409, 'embargo', 'An embargo is in force between these nations, so a trade agreement cannot be proposed.');
  if (await openWarBetween(db, command.proposer, command.other)) return fail(409, 'at_war', 'These nations are at war; a ceasefire or peace treaty is not part of this proposal path.');
  const id = `treaty-${command.requestId}`;
  // The unique live-per-pair-and-kind index and the request id make concurrent proposals safe: only one insert can land.
  await db.prepare(`INSERT INTO treaties (id,request_id,pair_key,kind,proposer_nation,other_nation,proposed_by,proposed_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`)
    .bind(id, command.requestId, treatyPairKey(command.proposer, command.other), command.kind, command.proposer, command.other, proposedBy, now).run();
  const saved = await db.prepare(`SELECT ${columns} FROM treaties WHERE request_id=?`).bind(command.requestId).first<Row>();
  return saved ? { ok: true as const, treaty: publicTreaty(saved, now) } : fail(409, 'treaty_exists', 'That treaty is already proposed or in force.');
}

/** Marks in-force treaties whose game-time term has ended as expired. A write path (tick, proposal): reads derive the same status without writing. */
export async function expireDueTreaties(db: GameDatabase, now: number) {
  await db.prepare("UPDATE treaties SET status='expired',ended_at=ends_at,decided_at=COALESCE(decided_at,ends_at) WHERE status='in_force' AND ends_at<=?").bind(now).run();
}

/** Decides every `proposed` treaty with each signatory's ratifying body (docs 13.1). Approved: in force for the fixed game-time term from this second.
 *  Refused: recorded as rejected (not published). Each update is guarded by `status='proposed'`, so a repeated or concurrent tick decides once. */
export async function decideProposedTreaties(db: GameDatabase, now: number, options: { napReputationGate?: boolean; debasement?: boolean } = {}) {
  const rows = (await db.prepare(`SELECT ${columns} FROM treaties WHERE status='proposed' ORDER BY proposed_at,id LIMIT 20`).all<Row>()).results;
  if (!rows.length) return 0;
  const seats = await kindleSeats(db);
  const scores = options.napReputationGate ? await readWorldReputation(db, now, { debasement: options.debasement === true }) : null;
  let decided = 0;
  for (const row of rows) {
    const verdict = decideTreaty(row.kind, row.proposer_nation, row.other_nation, seats, scores), json = JSON.stringify(verdict.ratifications);
    const result = verdict.approved
      ? await db.prepare("UPDATE treaties SET status='in_force',decided_at=?,ratified_at=?,ends_at=?,ratification_json=? WHERE id=? AND status='proposed'")
        .bind(now, now, now + treatyTermSeconds(row.kind, gameTimeCompression), json, row.id).run()
      : await db.prepare("UPDATE treaties SET status='rejected',decided_at=?,ratification_json=? WHERE id=? AND status='proposed'").bind(now, json, row.id).run();
    if ((result as { meta?: { changes?: number } }).meta?.changes !== 0) decided++;
  }
  return decided;
}

/** #1490: re-ratify trade agreements that expired by term inside the renewal window. Called from the world tick after expiry and before deciding proposals, only when HARIMU_TRADE_RENEWAL_ENABLED is on (and diplomacy is already on). */
export async function renewDueTradeAgreements(db: GameDatabase, now: number, options: { embargo?: boolean } = {}) {
  const rows = (await db.prepare(`SELECT ${columns} FROM treaties WHERE kind='trade' AND status='expired' AND ended_at=ends_at AND ends_at>? ORDER BY ends_at,id LIMIT 20`).bind(now - renewalWindowSeconds).all<Row>()).results;
  if (!rows.length) return 0;
  const seats = await kindleSeats(db);
  let decided = 0;
  for (const row of rows) {
    const requestId = treatyRenewalRequestId(row.id);
    if (await db.prepare('SELECT 1 AS found FROM treaties WHERE request_id=?').bind(requestId).first()) continue;
    const blocked = (options.embargo === true && await embargoInForce(db, row.proposer_nation, row.other_nation)) || await openWarBetween(db, row.proposer_nation, row.other_nation);
    const verdict = blocked ? { approved: false, ratifications: [] as Ratification[] } : decideTreaty('trade', row.proposer_nation, row.other_nation, seats);
    const term = renewedTerm(Number(row.ends_at), gameTimeCompression), id = `treaty-${requestId}`, json = JSON.stringify(verdict.ratifications);
    if (verdict.approved) {
      await db.prepare(`INSERT INTO treaties (id,request_id,pair_key,kind,proposer_nation,other_nation,proposed_by,proposed_at,status,decided_at,ratified_at,ends_at,ratification_json) VALUES (?,?,?,?,?,?,?,?, 'in_force',?,?,?,?) ON CONFLICT DO NOTHING`)
        .bind(id, requestId, row.pair_key, 'trade', row.proposer_nation, row.other_nation, treatyAiLeaders[row.proposer_nation], now, now, term.ratifiedAt, term.endsAt, json).run();
    } else {
      await db.prepare(`INSERT INTO treaties (id,request_id,pair_key,kind,proposer_nation,other_nation,proposed_by,proposed_at,status,decided_at,ratification_json) VALUES (?,?,?,?,?,?,?,?, 'rejected',?,?) ON CONFLICT DO NOTHING`)
        .bind(id, requestId, row.pair_key, 'trade', row.proposer_nation, row.other_nation, treatyAiLeaders[row.proposer_nation], now, now, json).run();
    }
    decided++;
  }
  return decided;
}

/** World tick (HARIMU_DIPLOMACY_ENABLED on): expire due terms, renew due trade agreements when that flag is on, break at most one triggered NAP when HARIMU_TREATY_BREAK_ENABLED is on, then decide pending proposals. */
export async function runDiplomacy(db: GameDatabase, now: number, options: { renewal?: boolean; treatyBreak?: boolean; embargo?: boolean; napReputationGate?: boolean; debasement?: boolean } = {}) {
  await expireDueTreaties(db, now);
  if (options.renewal === true) await renewDueTradeAgreements(db, now, { embargo: options.embargo });
  if (options.treatyBreak === true) await breakDueNonAggressionPacts(db, now);
  await decideProposedTreaties(db, now, options);
}

/** #1507: at most one in-force NAP is broken per treaty slot, only when the counterpart already has an in-force embargo against the breaker. Called from the diplomacy world tick (GET /api/world and POST /api/citizen run advanceWorld; GET /api/citizen only calls readWorldSimulation; readTreaties and readWorldReputation stay read-only) after expiry and trade renewal, when HARIMU_TREATY_BREAK_ENABLED is on (and diplomacy is already on). Reuses breakTreaty. Idempotent: a second call in the same slot is a no-op. */
export async function breakDueNonAggressionPacts(db: GameDatabase, now: number) {
  const slotStart = treatySlot(now) * treatyProposalSlotSeconds;
  // The guard matches any broken treaty in the slot. That is enough while this path only writes NAP breaks; a trade-break follow-up should decide whether trade and NAP breaks share a slot.
  if (await db.prepare("SELECT 1 AS found FROM treaties WHERE status='broken' AND ended_at>=? AND ended_at<?").bind(slotStart, slotStart + treatyProposalSlotSeconds).first().catch(tolerate(isMissingRelation, null))) return { status: 'already' as const };
  // LIMIT is a batch, not a single-candidate stall: if the first row cannot be broken, try the next rather than returning 'none' for the whole slot.
  const rows = (await db.prepare("SELECT t.id AS id, e.target_nation AS breaker FROM treaties t JOIN embargoes e ON e.status='in_force' AND e.target_nation IN (t.proposer_nation, t.other_nation) AND e.actor_nation IN (t.proposer_nation, t.other_nation) AND e.actor_nation<>e.target_nation WHERE t.kind='non-aggression' AND t.status='in_force' AND t.ends_at>? ORDER BY t.proposed_at, t.id, e.target_nation LIMIT 20").bind(now).all<{ id: string; breaker: string }>().catch(tolerate(isMissingRelation, { results: [] as { id: string; breaker: string }[] }))).results ?? [];
  for (const row of rows) {
    if (!isTreatyNation(row.breaker)) continue;
    const result = await breakTreaty(db, { treatyId: row.id, breaker: row.breaker }, now, true);
    if (result.ok) return { status: 'broken' as const, treaty: result.treaty };
  }
  return { status: 'none' as const };
}

export type BreakTreatyCommand = { treatyId: string; breaker: string };
/** Server-side only: a signatory breaks an in-force pact or trade agreement (#400: the breaking nation is named, must be a signatory and is recorded).
 *  Sets the status and records the time and who broke it. The penalty to the breaker's Legitimacy and Reputation is returned as an [ASSUMPTION]
 *  placeholder (`applied: false`): those scores have no store yet. A treaty that is not in force (proposed, expired, already broken) is not broken. */
export async function breakTreaty(db: GameDatabase, command: BreakTreatyCommand, now: number, enabled: boolean) {
  if (!enabled) return fail(403, 'disabled', 'Treaties are not open yet.');
  if (!isTreatyNation(command.breaker)) return fail(400, 'bad_nations', 'The breaking nation must be Kindle, Korund or Aurelle.');
  const before = await db.prepare(`SELECT ${columns} FROM treaties WHERE id=?`).bind(command.treatyId).first<Row>();
  if (!before) return fail(409, 'not_found', 'No such treaty.');
  if (before.proposer_nation !== command.breaker && before.other_nation !== command.breaker) return fail(403, 'not_signatory', 'Only a signatory can break a treaty.');
  // Guarded by status, term and signatory, so a repeated or concurrent break changes one row once.
  const result = await db.prepare("UPDATE treaties SET status='broken',ended_at=?,broken_by=? WHERE id=? AND status='in_force' AND ends_at>? AND (proposer_nation=? OR other_nation=?)")
    .bind(now, command.breaker, command.treatyId, now, command.breaker, command.breaker).run();
  if ((result as { meta?: { changes?: number } }).meta?.changes === 0) return fail(409, 'not_in_force', 'That treaty is not in force.');
  const row = await db.prepare(`SELECT ${columns} FROM treaties WHERE id=?`).bind(command.treatyId).first<Row>();
  const treaty = row ? publicTreaty(row, now) : null;
  if (!treaty || treaty.status !== 'broken') return fail(409, 'not_in_force', 'That treaty is not in force.');
  return { ok: true as const, treaty, penalty: treatyBreakPenaltyFor(treaty.kind, command.breaker) };
}

/** #400: the scheduled AI-leader proposal (called from the scheduled Worker, never from a read or a route). At most one proposal per slot: the slot's
 *  request id makes a repeated cron run a no-op. Walks the slot's rotated candidates and proposes the first one that is allowed: not already live or
 *  proposed (the live-treaty index), not at war, not a trade agreement under an embargo (`proposeTreaty` refuses those), and not refused in the
 *  last few slots. The world tick then decides it with each signatory's ratifying body (docs 13.1). Flag off: nothing happens. */
export async function runAiTreatyProposals(db: GameDatabase, now: number, options: { enabled: boolean; embargo?: boolean }) {
  if (!options.enabled) return { status: 'disabled' as const };
  const slot = treatySlot(now), requestId = treatyProposalRequestId(slot);
  if (await db.prepare('SELECT 1 AS found FROM treaties WHERE request_id=?').bind(requestId).first()) return { status: 'already' as const };
  await expireDueTreaties(db, now);
  const since = now - treatyProposalCooldownSlots * treatyProposalSlotSeconds;
  for (const candidate of treatyCandidates(slot)) {
    const refused = await db.prepare("SELECT 1 AS found FROM treaties WHERE pair_key=? AND kind=? AND status='rejected' AND decided_at>?").bind(treatyPairKey(candidate.proposer, candidate.other), candidate.kind, since).first();
    if (refused) continue;
    const result = await proposeTreaty(db, { ...candidate, proposedBy: treatyAiLeaders[candidate.proposer], requestId }, now, { enabled: true, embargo: options.embargo });
    if (result.ok) return { status: 'proposed' as const, treaty: result.treaty };
  }
  return { status: 'none' as const };
}
/** The scheduled Worker's entry. Treaty proposals need diplomacy. #1507 breaks one triggered NAP before #1505, so a break recorded this pass is visible to the embargo decision. The embargo also needs HARIMU_EMBARGO_ENABLED and HARIMU_AI_TREATY_EMBARGO_ENABLED. */
export async function runDiplomacyCron(db: GameDatabase, now: number, bindings: { HARIMU_DIPLOMACY_ENABLED?: string; HARIMU_EMBARGO_ENABLED?: string; HARIMU_TREATY_BREAK_ENABLED?: string; HARIMU_AI_TREATY_EMBARGO_ENABLED?: string; HARIMU_GRAY_PACK?: unknown }) {
  const diplomacyOn = bindings.HARIMU_DIPLOMACY_ENABLED === 'true';
  const proposals = await runAiTreatyProposals(db, now, { enabled: diplomacyOn, embargo: bindings.HARIMU_EMBARGO_ENABLED === 'true' });
  if (diplomacyOn && flagOn(bindings, 'HARIMU_TREATY_BREAK_ENABLED')) await breakDueNonAggressionPacts(db, now);
  if (runAiTreatyEmbargo) await runAiTreatyEmbargo(db, now, { enabled: diplomacyOn && bindings.HARIMU_EMBARGO_ENABLED === 'true' && flagOn(bindings, 'HARIMU_AI_TREATY_EMBARGO_ENABLED') });
  return proposals;
}

/** #1495: rejected non-aggression pacts whose stored ratification includes reason: 'low_reputation'. Newest first. Flag off: the caller does not call this. The LIMIT 20 is display-only (Foreign affairs refusal lines) and is not a score source; ratification uses uncapped readWorldReputation. */
export async function readNapReputationRefusals(db: GameDatabase): Promise<NapReputationRefusal[]> {
  const rows = (await db.prepare(`SELECT ${columns} FROM treaties WHERE status='rejected' AND kind='non-aggression' ORDER BY decided_at DESC, id LIMIT 20`).all<Row>().catch(tolerate(isMissingRelation, { results: [] as Row[] }))).results ?? [];
  const items: NapReputationRefusal[] = [];
  for (const row of rows) {
    if (!isTreatyNation(row.proposer_nation) || !isTreatyNation(row.other_nation)) continue;
    let parsed: Ratification[] = [];
    try { const value = JSON.parse(row.ratification_json ?? '[]'); if (Array.isArray(value)) parsed = value; } catch { parsed = []; }
    const bodies = parsed.filter(item => item.reason === 'low_reputation' && item.passed === false && isTreatyNation(item.nation)).map(item => ({ nation: item.nation, body: item.body }));
    if (!bodies.length) continue;
    items.push({ id: row.id, proposer: row.proposer_nation, other: row.other_nation, decidedAt: Number(row.decided_at ?? 0), bodies });
  }
  return items;
}

/** Read-only. Flag off: the caller does not call this. A database without migration 0037 reads as no treaties. Newest first. */
export async function readTreaties(db: GameDatabase, now: number): Promise<TreatyState> {
  const rows = (await db.prepare(`SELECT ${columns} FROM treaties WHERE status<>'rejected' ORDER BY proposed_at DESC, id LIMIT 20`).all<Row>().catch(tolerate(isMissingRelation, { results: [] as Row[] }))).results;
  return { treaties: rows.map(row => publicTreaty(row, now)).filter((t): t is PublicTreaty => t !== null) };
}

/** #1477 / #1480 / #1487 / #1496: uncapped per-nation count of broken treaties with a non-zero treatyBreakPenalty[kind].reputation,
 *  plus the broken-treaty record behind each score and Nation Legitimacy from the same rows. Independent of readTreaties
 *  (which stays at LIMIT 20). When options.debasement is on, one parallel uncapped read of crown_decrees.game_year adds
 *  the windowed Aurelle debasement penalty; a missing relation reads as 0. Flag off: the caller does not call this.
 *  A missing treaties table reads as the zero baseline. */
export { worldReputationBreaksSql };
export async function readWorldReputation(db: GameDatabase, now = Math.floor(Date.now() / 1000), options: { debasement?: boolean } = {}): Promise<WorldReputationMap> {
  type Row = { id: string; broken_by: string; kind: string; proposer_nation: string; other_nation: string; ended_at: number | null; n: number };
  type YearRow = { game_year: number };
  const breakQuery = db.prepare(worldReputationBreaksSql).all<Row>().catch(tolerate(isMissingRelation, { results: [] as Row[] }));
  const decreeQuery = options.debasement
    ? db.prepare('SELECT game_year FROM crown_decrees').all<YearRow>().catch(tolerate(isMissingRelation, { results: [] as YearRow[] }))
    : undefined;
  const [breakResult, decreeResult] = options.debasement
    ? await Promise.all([breakQuery, decreeQuery])
    : [await breakQuery, undefined];
  const rows = breakResult?.results ?? [];
  const scores = worldReputationFromBreaks(rows.map(row => ({ brokenBy: row.broken_by, kind: row.kind, n: Number(row.n) })));
  const legitimacy = worldLegitimacyFromBreaks(rows.map(row => ({ brokenBy: row.broken_by, kind: row.kind, n: Number(row.n) })));
  const clock = await db.prepare("SELECT epoch_seconds FROM world_clock WHERE id='main'").first<{ epoch_seconds: number }>().catch(tolerate(isMissingRelation, null));
  const epoch = clock ? Number(clock.epoch_seconds) : Math.floor(now / 7200) * 7200;
  const attached = withWorldReputationRecord(scores, rows.map(row => ({
    id: row.id, kind: row.kind, status: 'broken', brokenBy: row.broken_by, proposer: row.proposer_nation, other: row.other_nation, brokenAt: row.ended_at,
  })), epoch, legitimacy);
  if (!options.debasement) return attached;
  const years = (decreeResult?.results ?? []).map(row => Number(row.game_year));
  return withDebasementReputation(attached, debasementCountInWindow(years, gameYear(now, epoch)));
}

/** For the war declaration path (#309/#348 wires it later): is there a non-aggression pact in force between the two nations? Fails open when the table is missing. */
export async function activeNonAggressionPact(db: GameDatabase, a: string, b: string, now: number): Promise<boolean> {
  const row = await db.prepare("SELECT 1 AS found FROM treaties WHERE pair_key=? AND kind='non-aggression' AND status='in_force' AND ends_at>?").bind(treatyPairKey(a, b), now).first().catch(tolerate(isMissingRelation, null));
  return Boolean(row);
}
/** No open war between the two nations (reads the wars table; a database without it reads as at peace). */
export async function nationsAtPeace(db: GameDatabase, a: string, b: string): Promise<boolean> { return !(await openWarBetween(db, a, b)); }

export type TreatyNewsItem = { id: string; title: string; text: string; occurredAt: number; source: 'deterministic'; kind: 'template' | 'decree' };
const fill = (text: string, values: Record<string, string>) => text.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
/** National news lines for one reader's nation, derived from the treaty records (read-only, never published as a game event): the ratification in that
 *  nation's voice (its own ratifying body, docs 13.1), and a broken-pact line. Occurred-at values are milliseconds. Names are capped by the shared name cap. */
export function treatyNewsItems(treaties: PublicTreaty[], readerNation: string): TreatyNewsItem[] {
  if (!isTreatyNation(readerNation)) return [];
  const items: TreatyNewsItem[] = [], cap = (text: string) => text.slice(0, DIPLOMACY_NAME_MAX);
  for (const treaty of treaties) {
    if (treaty.proposer !== readerNation && treaty.other !== readerNation) continue;
    if (treaty.ratifiedAt === null) continue;
    const other = treaty.proposer === readerNation ? treaty.other : treaty.proposer;
    const values = { nationA: cap(treatyNationNames[readerNation]), nationB: cap(treatyNationNames[other]), treaty: treatyKindNames[treaty.kind], endsAt: treaty.endsAt === null ? '' : new Date(treaty.endsAt * 1000).toISOString().slice(0, 10) };
    const key: RatificationKey = readerNation === 'kindle' ? (treaty.kind === 'trade' ? 'kindle:trade' : 'kindle:treaty') : `${readerNation}:any` as RatificationKey;
    const news = ratificationFor(key)!, kind = news.aiBadge && news.nationId === 'aurelle' ? 'decree' as const : 'template' as const;
    items.push({ id: `treaty:${treaty.id}:ratified`, title: ratificationHeadlines[key], text: fill(news.body, values), occurredAt: treaty.ratifiedAt * 1000, source: 'deterministic', kind });
    if (treaty.status === 'broken' && treaty.brokenAt !== null) items.push({ id: `treaty:${treaty.id}:broken`, title: 'A treaty was broken', text: fill(treaty.kind === 'non-aggression' ? brokenPactLine.text : treatyStatusLines.broken[0].text, values), occurredAt: treaty.brokenAt * 1000, source: 'deterministic', kind });
  }
  return items;
}

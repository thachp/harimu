import type { GameDatabase } from './database-contract';
import { isMissingRelation, tolerate } from './db-errors';
import { gameTimeCompression } from './game-time';
import { assemblyIncumbents } from './assembly-rules';
import { brokenPactLine, ratificationFor, ratificationHeadlines, treatyStatusLines, DIPLOMACY_NAME_MAX, type RatificationKey } from './diplomacy-copy';
import { cleanTreatyLabel, decideTreaty, isTreatyKind, isTreatyNation, treatyActorMax, treatyKindNames, treatyNationNames, treatyPairKey, treatyRequestIdOk, treatyStatus, treatyTermSeconds,
  type PartySeats, type Ratification, type TreatyDbStatus, type TreatyKind, type TreatyNationId, type TreatyStatus } from './diplomacy-rules';
export * from './diplomacy-rules';

/** #308: AI treaties PoC (non-aggression pact, trade agreement) behind HARIMU_DIPLOMACY_ENABLED (default "false"). Canon: harimu-docs 13.1, 13.2
 *  (see lib/diplomacy-rules.ts). Treaties are written only by server code (a proposal from the AI leadership path, the world tick that decides
 *  proposals and expires terms): there is no route that proposes, ratifies or breaks one, and no GET writes. Flag off: nothing is created, read or shown. */
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
 CHECK(proposer_nation<>other_nation),
 CHECK(status NOT IN ('in_force','expired','broken') OR (ratified_at IS NOT NULL AND ends_at IS NOT NULL AND ends_at>ratified_at)),
 CHECK(status IN ('proposed') OR decided_at IS NOT NULL)
)`,
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_treaties_one_live_per_pair_kind ON treaties(pair_key,kind) WHERE status IN ('proposed','in_force')",
  'CREATE INDEX IF NOT EXISTS idx_treaties_proposed ON treaties(proposed_at)',
];

type Row = { id: string; pair_key: string; kind: TreatyKind; proposer_nation: TreatyNationId; other_nation: TreatyNationId; proposed_by: string; proposed_at: number; status: TreatyDbStatus;
  decided_at: number | null; ratified_at: number | null; ends_at: number | null; ended_at: number | null; ratification_json: string | null };
const columns = 'id,pair_key,kind,proposer_nation,other_nation,proposed_by,proposed_at,status,decided_at,ratified_at,ends_at,ended_at,ratification_json';
export type PublicTreaty = { id: string; kind: TreatyKind; proposer: TreatyNationId; other: TreatyNationId; proposedBy: string; proposedAt: number; status: TreatyStatus;
  ratifiedAt: number | null; endsAt: number | null; brokenAt: number | null; ratifications: Ratification[] };
export type TreatyState = { treaties: PublicTreaty[] };
const num = (value: number | null) => value === null || value === undefined ? null : Number(value);
function publicTreaty(row: Row, now: number): PublicTreaty | null {
  const status = treatyStatus({ status: row.status, endsAt: num(row.ends_at) }, now);
  if (status === 'rejected') return null; // refused proposals are not published
  let ratifications: Ratification[] = [];
  try { const parsed = JSON.parse(row.ratification_json ?? '[]'); if (Array.isArray(parsed)) ratifications = parsed; } catch { ratifications = []; }
  return { id: row.id, kind: row.kind, proposer: row.proposer_nation, other: row.other_nation, proposedBy: row.proposed_by, proposedAt: Number(row.proposed_at), status,
    ratifiedAt: num(row.ratified_at), endsAt: num(row.ends_at), brokenAt: row.status === 'broken' ? num(row.ended_at) : null, ratifications };
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
export async function decideProposedTreaties(db: GameDatabase, now: number) {
  const rows = (await db.prepare(`SELECT ${columns} FROM treaties WHERE status='proposed' ORDER BY proposed_at,id LIMIT 20`).all<Row>()).results;
  if (!rows.length) return 0;
  const seats = await kindleSeats(db);
  let decided = 0;
  for (const row of rows) {
    const verdict = decideTreaty(row.kind, row.proposer_nation, row.other_nation, seats), json = JSON.stringify(verdict.ratifications);
    const result = verdict.approved
      ? await db.prepare("UPDATE treaties SET status='in_force',decided_at=?,ratified_at=?,ends_at=?,ratification_json=? WHERE id=? AND status='proposed'")
        .bind(now, now, now + treatyTermSeconds(row.kind, gameTimeCompression), json, row.id).run()
      : await db.prepare("UPDATE treaties SET status='rejected',decided_at=?,ratification_json=? WHERE id=? AND status='proposed'").bind(now, json, row.id).run();
    if ((result as { meta?: { changes?: number } }).meta?.changes !== 0) decided++;
  }
  return decided;
}

/** World tick (HARIMU_DIPLOMACY_ENABLED on): expire due terms, then decide pending proposals. */
export async function runDiplomacy(db: GameDatabase, now: number) {
  await expireDueTreaties(db, now);
  await decideProposedTreaties(db, now);
}

/** Server-side only: a signatory breaks an in-force pact or trade agreement. Sets the status and records the time; the news line names the cost
 *  without a number. Penalties to Legitimacy and Reputation are out of scope for this PoC. */
export async function breakTreaty(db: GameDatabase, treatyId: string, now: number, enabled: boolean) {
  if (!enabled) return fail(403, 'disabled', 'Treaties are not open yet.');
  await db.prepare("UPDATE treaties SET status='broken',ended_at=? WHERE id=? AND status='in_force' AND ends_at>?").bind(now, treatyId, now).run();
  const row = await db.prepare(`SELECT ${columns} FROM treaties WHERE id=?`).bind(treatyId).first<Row>();
  const treaty = row ? publicTreaty(row, now) : null;
  return treaty ? { ok: true as const, treaty } : fail(409, 'not_found', 'No such treaty.');
}

/** Read-only. Flag off: the caller does not call this. A database without migration 0037 reads as no treaties. Newest first. */
export async function readTreaties(db: GameDatabase, now: number): Promise<TreatyState> {
  const rows = (await db.prepare(`SELECT ${columns} FROM treaties WHERE status<>'rejected' ORDER BY proposed_at DESC, id LIMIT 20`).all<Row>().catch(tolerate(isMissingRelation, { results: [] as Row[] }))).results;
  return { treaties: rows.map(row => publicTreaty(row, now)).filter((t): t is PublicTreaty => t !== null) };
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
    const news = ratificationFor(key)!, kind = news.aiBadge ? 'decree' as const : 'template' as const;
    items.push({ id: `treaty:${treaty.id}:ratified`, title: ratificationHeadlines[key], text: fill(news.body, values), occurredAt: treaty.ratifiedAt * 1000, source: 'deterministic', kind });
    if (treaty.status === 'broken' && treaty.brokenAt !== null) items.push({ id: `treaty:${treaty.id}:broken`, title: 'A treaty was broken', text: fill(treaty.kind === 'non-aggression' ? brokenPactLine.text : treatyStatusLines.broken[0].text, values), occurredAt: treaty.brokenAt * 1000, source: 'deterministic', kind });
  }
  return items;
}

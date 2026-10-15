import type { GameDatabase } from './database-contract';
import { isMissingRelation, tolerate } from './db-errors';
import { kindleSeats } from './diplomacy';
import { cleanTreatyLabel, treatyActorMax, type Ratification, type TreatyNationId } from './diplomacy-rules';
import { EMBARGO_NAME_MAX, pressFor, tradeClosed } from './embargo-copy';
import { embargoNationNames, embargoPairKey, embargoRatification, embargoRequestIdOk, embargoStatus, isEmbargoNation, type EmbargoDbStatus, type EmbargoStatus } from './embargo-rules';
export * from './embargo-rules';

/** #363: embargo PoC (a bilateral trade cut between two MVP nations) behind HARIMU_EMBARGO_ENABLED (default "false"). Canon: harimu-docs 13.1, 13.3 (see
 *  lib/embargo-rules.ts). Builds on the #308 treaty helpers (the Assembly seat reader). Embargoes are written only by server code (a proposal from the AI
 *  leadership path, the world tick that decides it): no route proposes, ratifies or lifts one, and no GET writes. Flag off: nothing is created, read or shown.
 *  There is no cross-nation trade path in the game yet (the order book is one Kindle city), so this PoC exports the guard (`checkTrade`, `activeEmbargo`)
 *  for such paths to call and tests it against a fixture trade path. Out of scope: multilateral sanctions, Clearing House suspension, targeted sanctions. */
export const embargoSchemas = [
  `CREATE TABLE IF NOT EXISTS embargoes (
 id TEXT PRIMARY KEY,
 request_id TEXT NOT NULL UNIQUE,
 pair_key TEXT NOT NULL,
 actor_nation TEXT NOT NULL CHECK(actor_nation IN ('kindle','korund','aurelle')),
 target_nation TEXT NOT NULL CHECK(target_nation IN ('kindle','korund','aurelle')),
 proposed_by TEXT NOT NULL CHECK(length(proposed_by) BETWEEN 1 AND 60),
 proposed_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','in_force','rejected','lifted')),
 decided_at INTEGER,
 imposed_at INTEGER,
 lifted_at INTEGER,
 ratification_json TEXT,
 CHECK(actor_nation<>target_nation),
 CHECK(status IN ('proposed') OR decided_at IS NOT NULL),
 CHECK(status NOT IN ('in_force','lifted') OR imposed_at IS NOT NULL),
 CHECK((status='lifted')=(lifted_at IS NOT NULL))
)`,
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_embargoes_one_live_per_direction ON embargoes(actor_nation,target_nation) WHERE status IN ('proposed','in_force')",
  'CREATE INDEX IF NOT EXISTS idx_embargoes_pair ON embargoes(pair_key)',
];

type Row = { id: string; actor_nation: TreatyNationId; target_nation: TreatyNationId; proposed_by: string; proposed_at: number; status: EmbargoDbStatus;
  decided_at: number | null; imposed_at: number | null; lifted_at: number | null; ratification_json: string | null };
const columns = 'id,actor_nation,target_nation,proposed_by,proposed_at,status,decided_at,imposed_at,lifted_at,ratification_json';
export type PublicEmbargo = { id: string; actor: TreatyNationId; target: TreatyNationId; proposedBy: string; proposedAt: number; status: EmbargoStatus;
  imposedAt: number | null; liftedAt: number | null; ratifications: Ratification[] };
export type EmbargoState = { embargoes: PublicEmbargo[] };
const num = (value: number | null) => value === null || value === undefined ? null : Number(value);
function publicEmbargo(row: Row): PublicEmbargo | null {
  const status = embargoStatus(row.status);
  if (status === 'rejected') return null; // refused proposals are not published
  let ratifications: Ratification[] = [];
  try { const parsed = JSON.parse(row.ratification_json ?? '[]'); if (Array.isArray(parsed)) ratifications = parsed; } catch { ratifications = []; }
  return { id: row.id, actor: row.actor_nation, target: row.target_nation, proposedBy: row.proposed_by, proposedAt: Number(row.proposed_at), status,
    imposedAt: num(row.imposed_at), liftedAt: num(row.lifted_at), ratifications };
}
const fail = (status: 400 | 403 | 409, reason: string, error: string) => ({ ok: false as const, status, reason, error });

export type ProposeEmbargoCommand = { actor: string; target: string; proposedBy: string; requestId: string };
/** Server-side only (the AI leadership path calls this; no route does). Writes one `proposed` row; the world tick decides it. Idempotent per requestId. */
export async function proposeEmbargo(db: GameDatabase, command: ProposeEmbargoCommand, now: number, options: { enabled: boolean }) {
  if (!options.enabled) return fail(403, 'disabled', 'Embargoes are not open yet.');
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid authoritative world time.');
  if (!embargoRequestIdOk(command.requestId)) return fail(400, 'bad_request', 'A request id is required.');
  if (!isEmbargoNation(command.actor) || !isEmbargoNation(command.target) || command.actor === command.target) return fail(400, 'bad_nations', 'An embargo needs two different nations (Kindle, Korund or Aurelle).');
  const proposedBy = cleanTreatyLabel(command.proposedBy, treatyActorMax);
  if (!proposedBy) return fail(400, 'bad_request', 'The proposing AI leader must be named.');
  const prior = await db.prepare(`SELECT ${columns} FROM embargoes WHERE request_id=?`).bind(command.requestId).first<Row>();
  if (prior) return prior.actor_nation === command.actor && prior.target_nation === command.target
    ? { ok: true as const, replay: true as const, embargo: publicEmbargo(prior) } : fail(409, 'request_reused', 'That request id was already used for a different proposal.');
  const id = `embargo-${command.requestId}`;
  // The unique live-per-direction index and the request id make concurrent proposals safe: only one insert can land.
  await db.prepare('INSERT INTO embargoes (id,request_id,pair_key,actor_nation,target_nation,proposed_by,proposed_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT DO NOTHING')
    .bind(id, command.requestId, embargoPairKey(command.actor, command.target), command.actor, command.target, proposedBy, now).run();
  const saved = await db.prepare(`SELECT ${columns} FROM embargoes WHERE request_id=?`).bind(command.requestId).first<Row>();
  return saved ? { ok: true as const, embargo: publicEmbargo(saved) } : fail(409, 'embargo_exists', 'That embargo is already proposed or in force.');
}

/** Decides every `proposed` embargo with the imposing nation's ratifying body (docs 13.1 trade rule). Approved: in force from this second, no fixed term.
 *  Refused: recorded as rejected (not published). Each update is guarded by `status='proposed'`, so a repeated or concurrent tick decides once. */
export async function decideProposedEmbargoes(db: GameDatabase, now: number) {
  const rows = (await db.prepare(`SELECT ${columns} FROM embargoes WHERE status='proposed' ORDER BY proposed_at,id LIMIT 20`).all<Row>()).results;
  if (!rows.length) return 0;
  const seats = await kindleSeats(db);
  let decided = 0;
  for (const row of rows) {
    const ratification = embargoRatification(row.actor_nation, row.target_nation, seats), json = JSON.stringify([ratification]);
    const result = ratification.passed
      ? await db.prepare("UPDATE embargoes SET status='in_force',decided_at=?,imposed_at=?,ratification_json=? WHERE id=? AND status='proposed'").bind(now, now, json, row.id).run()
      : await db.prepare("UPDATE embargoes SET status='rejected',decided_at=?,ratification_json=? WHERE id=? AND status='proposed'").bind(now, json, row.id).run();
    if ((result as { meta?: { changes?: number } }).meta?.changes !== 0) decided++;
  }
  return decided;
}

/** World tick (HARIMU_EMBARGO_ENABLED on): decide pending proposals. */
export async function runEmbargo(db: GameDatabase, now: number) { await decideProposedEmbargoes(db, now); }

/** Server-side only: the imposing nation lifts its own in-force embargo (the target cannot). [ASSUMPTION] no vote is needed to lift. */
export async function liftEmbargo(db: GameDatabase, embargoId: string, liftingNation: string, now: number, enabled: boolean) {
  if (!enabled) return fail(403, 'disabled', 'Embargoes are not open yet.');
  const row = await db.prepare(`SELECT ${columns} FROM embargoes WHERE id=?`).bind(embargoId).first<Row>();
  if (!row) return fail(409, 'not_found', 'No such embargo.');
  if (row.actor_nation !== liftingNation) return fail(403, 'not_actor', 'Only the nation that imposed an embargo can lift it.');
  if (row.status !== 'in_force') return fail(409, 'not_in_force', 'That embargo is not in force.');
  await db.prepare("UPDATE embargoes SET status='lifted',lifted_at=? WHERE id=? AND status='in_force'").bind(now, embargoId).run();
  const saved = await db.prepare(`SELECT ${columns} FROM embargoes WHERE id=?`).bind(embargoId).first<Row>();
  const embargo = saved ? publicEmbargo(saved) : null;
  return embargo && embargo.status === 'lifted' ? { ok: true as const, embargo } : fail(409, 'not_in_force', 'That embargo is not in force.');
}

/** Read-only. Flag off: the caller does not call this. A database without migration 0039 reads as no embargoes. Newest first. */
export async function readEmbargoes(db: GameDatabase): Promise<EmbargoState> {
  const rows = (await db.prepare(`SELECT ${columns} FROM embargoes WHERE status<>'rejected' ORDER BY proposed_at DESC, id LIMIT 20`).all<Row>().catch(tolerate(isMissingRelation, { results: [] as Row[] }))).results;
  return { embargoes: rows.map(publicEmbargo).filter((e): e is PublicEmbargo => e !== null) };
}

/** True when either direction forbids trade between the two nations (docs 13.3: a bilateral embargo). Fails open when the table is missing. */
export async function activeEmbargo(db: GameDatabase, a: string, b: string): Promise<boolean> {
  const row = await db.prepare("SELECT 1 AS found FROM embargoes WHERE pair_key=? AND status='in_force'").bind(embargoPairKey(a, b)).first().catch(tolerate(isMissingRelation, null));
  return Boolean(row);
}

const fillText = (text: string, values: Record<string, string>) => text.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);
/** The guard cross-nation trade paths call before posting or filling an order across nations. With the flag off, or the same nation, trade is open.
 *  Refusal copy is Content #359's `tradeClosed`, naming the other nation. */
export async function checkTrade(db: GameDatabase, from: string, to: string, kind: 'post' | 'fill', enabled: boolean) {
  if (!enabled || from === to || !isEmbargoNation(from) || !isEmbargoNation(to)) return { ok: true as const };
  if (!(await activeEmbargo(db, from, to))) return { ok: true as const };
  return { ok: false as const, status: 403 as const, reason: 'embargo' as const, error: fillText(tradeClosed[kind].text, { nation: embargoNationNames[to].slice(0, EMBARGO_NAME_MAX) }) };
}

export type EmbargoNewsItem = { id: string; title: string; text: string; occurredAt: number; source: 'deterministic'; kind: 'template' | 'decree' };
/** National news lines for one reader's nation (the imposing or the target nation), derived from the embargo records (read-only, never published as a game
 *  event): one line on impose and one on lift, in that nation's press voice (Content #359). Occurred-at values are milliseconds. */
export function embargoNewsItems(embargoes: PublicEmbargo[], readerNation: string): EmbargoNewsItem[] {
  if (!isEmbargoNation(readerNation)) return [];
  const press = pressFor(readerNation);
  if (!press) return [];
  const items: EmbargoNewsItem[] = [], cap = (text: string) => text.slice(0, EMBARGO_NAME_MAX);
  for (const embargo of embargoes) {
    if (embargo.actor !== readerNation && embargo.target !== readerNation) continue;
    if (embargo.imposedAt === null) continue;
    const values = { actor: cap(embargoNationNames[embargo.actor]), target: cap(embargoNationNames[embargo.target]) };
    for (const event of ['imposed', 'lifted'] as const) {
      const at = event === 'imposed' ? embargo.imposedAt : embargo.liftedAt;
      if (at === null) continue;
      const crown = readerNation === 'aurelle' && embargo.actor === 'aurelle' && press.crown ? press.crown[event] : null;
      const line = crown ?? press.report[event];
      items.push({ id: `embargo:${embargo.id}:${event}`, title: press.headline[event], text: fillText(line.text, values), occurredAt: at * 1000, source: 'deterministic', kind: line.aiBadge ? 'decree' : 'template' });
    }
  }
  return items;
}

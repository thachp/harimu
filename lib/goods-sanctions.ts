import type { GameDatabase } from './database-contract';
import { isMissingRelation, isUniqueViolation, tolerate } from './db-errors';
import { kindleSeats } from './diplomacy';
import { cleanTreatyLabel, treatyActorMax, type Ratification, type TreatyNationId } from './diplomacy-rules';
import { EMBARGO_NAME_MAX, targetedSanctions } from './embargo-copy';
import { checkTrade, embargoNationNames, embargoPairKey, embargoRatification, embargoRequestIdOk, isEmbargoNation } from './embargo';
import { checkSanctionGoods, goodsColumn, goodsFromColumn, humanitarianGoods, isSanctionGood, sanctionGoodLabels, type SanctionGood } from './goods-sanction-rules';

/** #601: targeted goods sanctions PoC behind HARIMU_TARGETED_SANCTIONS_ENABLED (default "false"), on top of the #363 embargo. One nation bans named goods to another; other trade goes on.
 *  Same shape as #363: written only by server code (a proposal from the AI leadership path, decided by the world tick with the 13.1 trade-measure ratification, the same placeholder Kindle
 *  stances [ASSUMPTION]); no route proposes, ratifies or lifts one, and no GET writes. [ASSUMPTION] one live sanction per direction (to change the list, lift and propose again), no fixed term,
 *  and (ARC) a lift is a proposal ratified by the same body as the impose; one pending lift per sanction, kept on the sanction row. Food goods are refused (13.3.1). Flag off: nothing is created and the trade guard is exactly #363's. */
export const goodsSanctionSchemas = [
  `CREATE TABLE IF NOT EXISTS goods_sanctions (
 id TEXT PRIMARY KEY,
 request_id TEXT NOT NULL UNIQUE,
 pair_key TEXT NOT NULL,
 actor_nation TEXT NOT NULL CHECK(actor_nation IN ('kindle','korund','aurelle')),
 target_nation TEXT NOT NULL CHECK(target_nation IN ('kindle','korund','aurelle')),
 goods TEXT NOT NULL CHECK(length(goods) BETWEEN 3 AND 80),
 proposed_by TEXT NOT NULL CHECK(length(proposed_by) BETWEEN 1 AND 60),
 proposed_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','in_force','rejected','lifted')),
 decided_at INTEGER, imposed_at INTEGER, lifted_at INTEGER,
 ratification_json TEXT,
 lift_request_id TEXT UNIQUE, lift_status TEXT CHECK(lift_status IN ('proposed','rejected','ratified')), lift_proposed_at INTEGER, lift_ratification_json TEXT,
 CHECK((lift_status IS NULL)=(lift_request_id IS NULL)),
 CHECK(lift_status IS NULL OR lift_status<>'ratified' OR status='lifted'),
 CHECK(actor_nation<>target_nation),
 CHECK(status IN ('proposed') OR decided_at IS NOT NULL),
 CHECK(status NOT IN ('in_force','lifted') OR imposed_at IS NOT NULL),
 CHECK((status='lifted')=(lifted_at IS NOT NULL))
)`,
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_goods_sanctions_one_live_per_direction ON goods_sanctions(actor_nation,target_nation) WHERE status IN ('proposed','in_force')",
  'CREATE INDEX IF NOT EXISTS idx_goods_sanctions_pair ON goods_sanctions(pair_key)',
];
export const targetedSanctionsEnabled = (bindings?: { HARIMU_TARGETED_SANCTIONS_ENABLED?: string }) => bindings?.HARIMU_TARGETED_SANCTIONS_ENABLED === 'true';

type Row = { id: string; actor_nation: TreatyNationId; target_nation: TreatyNationId; goods: string; proposed_by: string; status: 'proposed' | 'in_force' | 'rejected' | 'lifted'; imposed_at: number | null; lifted_at: number | null; ratification_json: string | null };
const columns = 'id,actor_nation,target_nation,goods,proposed_by,status,imposed_at,lifted_at,ratification_json';
export type PublicGoodsSanction = { id: string; actor: TreatyNationId; target: TreatyNationId; goods: SanctionGood[]; proposedBy: string; status: 'proposed' | 'in-force' | 'lifted'; imposedAt: number | null; liftedAt: number | null; ratifications: Ratification[] };
const num = (v: number | null) => v === null || v === undefined ? null : Number(v);
function publicSanction(row: Row): PublicGoodsSanction | null {
  if (row.status === 'rejected') return null;
  let ratifications: Ratification[] = [];
  try { const parsed = JSON.parse(row.ratification_json ?? '[]'); if (Array.isArray(parsed)) ratifications = parsed; } catch { ratifications = []; }
  return { id: row.id, actor: row.actor_nation, target: row.target_nation, goods: goodsFromColumn(row.goods), proposedBy: row.proposed_by, status: row.status === 'in_force' ? 'in-force' : row.status, imposedAt: num(row.imposed_at), liftedAt: num(row.lifted_at), ratifications };
}
const fail = (status: 400 | 403 | 409, reason: string, error: string) => ({ ok: false as const, status, reason, error });
const goodsErrors = { bad_goods: 'Name one to three goods from the catalog.', humanitarian_good: 'Food goods are humanitarian and cannot be sanctioned.' } as const;

export type ProposeGoodsSanctionCommand = { actor: string; target: string; goods: unknown; proposedBy: string; requestId: string };
/** Server-side only (the AI leadership path calls this; no route does). Writes one `proposed` row; the world tick decides it. Idempotent per requestId. */
export async function proposeGoodsSanction(db: GameDatabase, command: ProposeGoodsSanctionCommand, now: number, options: { enabled: boolean }) {
  if (!options.enabled) return fail(403, 'disabled', 'Targeted sanctions are not open yet.');
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid authoritative world time.');
  if (!embargoRequestIdOk(command.requestId)) return fail(400, 'bad_request', 'A request id is required.');
  if (!isEmbargoNation(command.actor) || !isEmbargoNation(command.target) || command.actor === command.target) return fail(400, 'bad_nations', 'A sanction needs two different nations (Kindle, Korund or Aurelle).');
  const goods = checkSanctionGoods(command.goods);
  if (!goods.ok) return fail(goods.reason === 'humanitarian_good' ? 409 : 400, goods.reason, goodsErrors[goods.reason]);
  const proposedBy = cleanTreatyLabel(command.proposedBy, treatyActorMax);
  if (!proposedBy) return fail(400, 'bad_request', 'The proposing AI leader must be named.');
  const column = goodsColumn(goods.goods), prior = await db.prepare(`SELECT ${columns} FROM goods_sanctions WHERE request_id=?`).bind(command.requestId).first<Row>();
  if (prior) return prior.actor_nation === command.actor && prior.target_nation === command.target && prior.goods === column
    ? { ok: true as const, replay: true as const, sanction: publicSanction(prior) } : fail(409, 'request_reused', 'That request id was already used for a different proposal.');
  await db.prepare('INSERT INTO goods_sanctions (id,request_id,pair_key,actor_nation,target_nation,goods,proposed_by,proposed_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING')
    .bind(`sanction-${command.requestId}`, command.requestId, embargoPairKey(command.actor, command.target), command.actor, command.target, column, proposedBy, now).run();
  const saved = await db.prepare(`SELECT ${columns} FROM goods_sanctions WHERE request_id=?`).bind(command.requestId).first<Row>();
  return saved ? { ok: true as const, sanction: publicSanction(saved) } : fail(409, 'sanction_exists', 'A sanction by this nation on that nation is already proposed or in force.');
}

/** World tick (flag on): decides each `proposed` sanction with the imposing nation's ratifying body (13.1 trade rule). Each update is guarded by status='proposed', so a repeated tick decides once. */
export async function decideProposedGoodsSanctions(db: GameDatabase, now: number) {
  const rows = (await db.prepare(`SELECT ${columns} FROM goods_sanctions WHERE status='proposed' ORDER BY proposed_at,id LIMIT 20`).all<Row>()).results;
  const seats = await kindleSeats(db);
  let decided = 0;
  const changed = (result: unknown) => Number((result as { meta?: { changes?: number } })?.meta?.changes ?? 0) > 0; // a missing count is never success
  for (const row of rows) {
    // 13.3.1: a row that lists a food good (however it reached the table) is refused, never put in force.
    if (goodsFromColumn(row.goods).some(g => humanitarianGoods.includes(g))) {
      if (changed(await db.prepare("UPDATE goods_sanctions SET status='rejected',decided_at=?,ratification_json=? WHERE id=? AND status='proposed'").bind(now, JSON.stringify([{ refused: 'humanitarian_good' }]), row.id).run())) decided++;
      continue;
    }
    const ratification = embargoRatification(row.actor_nation, row.target_nation, seats), json = JSON.stringify([ratification]);
    const result = ratification.passed
      ? await db.prepare("UPDATE goods_sanctions SET status='in_force',decided_at=?,imposed_at=?,ratification_json=? WHERE id=? AND status='proposed'").bind(now, now, json, row.id).run()
      : await db.prepare("UPDATE goods_sanctions SET status='rejected',decided_at=?,ratification_json=? WHERE id=? AND status='proposed'").bind(now, json, row.id).run();
    if (changed(result)) decided++;
  }
  // Lift proposals: the same 13.1 ratification (ARC). Ratified ends the sanction (the lift news line follows lifted_at); rejected leaves it in force. Guarded by lift_status='proposed'.
  const lifts = (await db.prepare(`SELECT ${columns} FROM goods_sanctions WHERE status='in_force' AND lift_status='proposed' ORDER BY lift_proposed_at,id LIMIT 20`).all<Row>()).results;
  for (const row of lifts) {
    const ratification = embargoRatification(row.actor_nation, row.target_nation, seats), json = JSON.stringify([ratification]);
    const result = ratification.passed
      ? await db.prepare("UPDATE goods_sanctions SET status='lifted',lifted_at=?,lift_status='ratified',lift_ratification_json=? WHERE id=? AND status='in_force' AND lift_status='proposed'").bind(now, json, row.id).run()
      : await db.prepare("UPDATE goods_sanctions SET lift_status='rejected',lift_ratification_json=? WHERE id=? AND status='in_force' AND lift_status='proposed'").bind(json, row.id).run();
    if (changed(result)) decided++;
  }
  return decided;
}

/** Server-side only: the imposing nation proposes lifting its own in-force sanction; the world tick ratifies or rejects it. Idempotent per requestId; one pending lift per sanction. */
export async function proposeGoodsSanctionLift(db: GameDatabase, command: { sanctionId: string; liftingNation: string; requestId: string }, now: number, enabled: boolean) {
  if (!enabled) return fail(403, 'disabled', 'Targeted sanctions are not open yet.');
  if (!embargoRequestIdOk(command.requestId)) return fail(400, 'bad_request', 'A request id is required.');
  const prior = await db.prepare('SELECT id FROM goods_sanctions WHERE lift_request_id=?').bind(command.requestId).first<{ id: string }>();
  if (prior) return prior.id === command.sanctionId ? { ok: true as const, replay: true as const } : fail(409, 'request_reused', 'That request id was already used for a different lift.');
  const row = await db.prepare(`SELECT ${columns} FROM goods_sanctions WHERE id=?`).bind(command.sanctionId).first<Row>();
  if (!row) return fail(409, 'not_found', 'No such sanction.');
  if (row.actor_nation !== command.liftingNation) return fail(403, 'not_actor', 'Only the nation that imposed a sanction can propose lifting it.');
  if (row.status !== 'in_force') return fail(409, 'not_in_force', 'That sanction is not in force.');
  const result = await db.prepare("UPDATE goods_sanctions SET lift_request_id=?,lift_status='proposed',lift_proposed_at=?,lift_ratification_json=NULL WHERE id=? AND status='in_force' AND (lift_status IS NULL OR lift_status='rejected')")
    .bind(command.requestId, now, command.sanctionId).run().catch(error => { if (isUniqueViolation(error)) return null; throw error; }); // only a request-id clash is a lost race, read back below
  if (Number((result as { meta?: { changes?: number } } | null)?.meta?.changes ?? 0) > 0) return { ok: true as const };
  const again = await db.prepare('SELECT id FROM goods_sanctions WHERE lift_request_id=?').bind(command.requestId).first<{ id: string }>();
  return again?.id === command.sanctionId ? { ok: true as const, replay: true as const } : fail(409, 'lift_pending', 'A lift of that sanction is already proposed.');
}

/** Read-only. A database without migration 0059 reads as none. */
export async function readGoodsSanctions(db: GameDatabase) {
  const rows = (await db.prepare(`SELECT ${columns} FROM goods_sanctions WHERE status<>'rejected' ORDER BY proposed_at DESC, id LIMIT 20`).all<Row>().catch(tolerate(isMissingRelation, { results: [] as Row[] }))).results;
  return { sanctions: rows.map(publicSanction).filter((s): s is PublicGoodsSanction => s !== null) };
}

/** True if either nation bans this good to the other while in force. Does not include the embargo (see sanctionedGood). */
export async function goodBanned(db: GameDatabase, a: string, b: string, good: string) {
  if (!isSanctionGood(good) || humanitarianGoods.includes(good)) return false; // food always trades (13.3.1), even if a food row exists
  return Boolean(await db.prepare("SELECT 1 AS found FROM goods_sanctions WHERE pair_key=? AND status='in_force' AND goods LIKE ?").bind(embargoPairKey(a, b), `%,${good},%`).first().catch(tolerate(isMissingRelation, null)));
}

/** The guard a cross-nation trade path calls per good: the #363 embargo first (it refuses everything), then the goods sanction. With both flags off it is open, exactly as before. */
export async function sanctionedGood(db: GameDatabase, from: string, to: string, good: string, kind: 'post' | 'fill', flags: { embargo: boolean; sanctions: boolean }) {
  const embargo = await checkTrade(db, from, to, kind, flags.embargo);
  if (!embargo.ok) return embargo;
  if (!flags.sanctions || from === to || !isEmbargoNation(from) || !isEmbargoNation(to) || !(await goodBanned(db, from, to, good))) return { ok: true as const };
  return { ok: false as const, status: 403 as const, reason: 'sanctioned_good' as const, error: targetedSanctions.good.text.replace('{good}', sanctionGoodLabels[good as SanctionGood].slice(0, EMBARGO_NAME_MAX)) };
}

/** [ASSUMPTION] news copy (no #363 template names goods; Content may replace it): one line on impose and one on lift for the imposing and target nations, derived on read. */
export function goodsSanctionNewsItems(sanctions: PublicGoodsSanction[], readerNation: string) {
  const items: { id: string; title: string; text: string; occurredAt: number; source: 'deterministic'; kind: 'template' }[] = [];
  for (const s of sanctions) {
    if ((s.actor !== readerNation && s.target !== readerNation) || s.imposedAt === null) continue;
    const goods = s.goods.map(g => sanctionGoodLabels[g]).join(', '), who = `${embargoNationNames[s.actor]} on ${embargoNationNames[s.target]}`;
    items.push({ id: `sanction:${s.id}:imposed`, title: 'Targeted sanction imposed', text: `Sanction by ${who}: trade in ${goods} is banned.`, occurredAt: s.imposedAt * 1000, source: 'deterministic', kind: 'template' });
    if (s.liftedAt !== null) items.push({ id: `sanction:${s.id}:lifted`, title: 'Targeted sanction lifted', text: `Lifted by ${embargoNationNames[s.actor]}: trade in ${goods} with ${embargoNationNames[s.target]} is open.`, occurredAt: s.liftedAt * 1000, source: 'deterministic', kind: 'template' });
  }
  return items;
}

/** #613 Aurelle hereditary succession PoC (slice 1, server): the admin-bearer command that moves the succession (illness, vacate, abdicate, accede) and the derived state. Behind
 *  HARIMU_AURELLE_SUCCESSION_ENABLED (default "false") and HARIMU_AURELLE_SUCCESSION_ADMIN_SECRET (a Worker secret, fail closed when unset). Rules live in lib/aurelle-succession-rules.ts.
 *  Idempotent by request id: a retry returns the stored outcome and writes neither a second event nor a second gazette line. Each transition writes exactly one event and one Court Gazette
 *  row in one batch, guarded by the event's own id. [ASSUMPTION] "at war" is any unended war involving Aurelle, including mobilizing. GET paths only read (readSuccession). */
import type { GameDatabase } from './database-contract';
import { isMissingRelation, tolerate } from './db-errors';
import { readCrown } from './aurelle-rising';
import { bearerMatches } from './war-authority';
import { actionAllowed, councilChoice, deriveSuccession, fillGazette, isSuccessionAction, refusalText, successionGazette, successionRequestId, baseRuler, type SuccessionAction, type SuccessionEvent, type SuccessionEventKind, type SuccessionRefusal } from './aurelle-succession-rules';
export * from './aurelle-succession-rules';

export const aurelleSuccessionSchema = `CREATE TABLE IF NOT EXISTS aurelle_succession_events (
  id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL UNIQUE CHECK(seq >= 1),
  request_id TEXT NOT NULL UNIQUE CHECK(length(request_id) BETWEEN 8 AND 64),
  kind TEXT NOT NULL CHECK(kind IN ('illness','vacancy','abdication','accession','great_council')),
  member_id TEXT,
  name TEXT CHECK(name IS NULL OR length(name) BETWEEN 1 AND 24),
  house TEXT CHECK(house IS NULL OR length(house) BETWEEN 1 AND 24),
  occurred_at INTEGER NOT NULL,
  CHECK((kind IN ('accession','great_council')) = (name IS NOT NULL AND house IS NOT NULL))
)`;
export const aurelleSuccessionSchemas = [aurelleSuccessionSchema];

type Row = { id: string; seq: number; request_id: string; kind: SuccessionEventKind; member_id: string | null; name: string | null; house: string | null; occurred_at: number };
const columns = 'id,seq,request_id,kind,member_id,name,house,occurred_at';
const toEvent = (r: Row): SuccessionEvent => ({ seq: Number(r.seq), kind: r.kind, memberId: r.member_id, name: r.name, house: r.house, occurredAt: Number(r.occurred_at) });
const none = { results: [] as Row[] };

/** Read-only (a GET may call it). The events recorded after the crown in force, folded into the state; a database without migration 0055 reads as "reigning, no events". */
export async function readSuccession(db: GameDatabase) {
  const [crown, rows] = await Promise.all([readCrown(db), db.prepare(`SELECT ${columns} FROM aurelle_succession_events ORDER BY seq`).all<Row>().catch(tolerate(isMissingRelation, none))]);
  // A coup or Rising crown at or after an event resets the line: only later events count (the crown wins a tie).
  const fresh = rows.results.filter(r => !crown || Number(r.occurred_at) > crown.crownedAt).map(toEvent);
  return { ...deriveSuccession(crown ? { name: crown.name, house: crown.house } : baseRuler, fresh), maxSeq: rows.results.reduce((m, r) => Math.max(m, Number(r.seq)), 0) };
}

/** Why the succession may not move now: an open palace coup Crisis Window, an open Rising, or any unended war involving Aurelle. */
async function blocker(db: GameDatabase): Promise<SuccessionRefusal | null> {
  const [coup, rising, war] = await Promise.all([
    db.prepare('SELECT 1 AS open FROM aurelle_coups WHERE window_opened_at IS NOT NULL AND outcome IS NULL LIMIT 1').first().catch(tolerate(isMissingRelation, null)),
    db.prepare('SELECT 1 AS open FROM aurelle_risings WHERE outcome IS NULL LIMIT 1').first().catch(tolerate(isMissingRelation, null)),
    db.prepare("SELECT 1 AS open FROM wars WHERE ended_at IS NULL AND (attacker_nation='aurelle' OR defender_nation='aurelle') LIMIT 1").first().catch(tolerate(isMissingRelation, null)),
  ]);
  return coup || rising ? 'crisis_window_open' : war ? 'at_war' : null;
}

const fail = (status: 400 | 401 | 404 | 409, reason: string, error: string) => ({ ok: false as const, status, reason, error });
const kindOf = (action: SuccessionAction): SuccessionEventKind[] => action === 'illness' ? ['illness'] : action === 'vacate' ? ['vacancy'] : action === 'abdicate' ? ['abdication'] : ['accession', 'great_council'];
const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;
const view = (s: Awaited<ReturnType<typeof readSuccession>>) => ({ status: s.status, ruler: s.ruler, heir: s.heir });
const publicEvent = (r: Row) => ({ seq: Number(r.seq), kind: r.kind, name: r.name, house: r.house, occurredAt: Number(r.occurred_at) });

/** Flag first (404, nothing read or written), then the bearer secret (401), then the body (400); then replay, the crisis and war gates, the state machine, and the write. */
export async function handleSuccessionCommand(db: GameDatabase, input: { enabled: boolean; secret: string | undefined; authorization: string | null; body: Record<string, unknown>; now: number }) {
  if (!input.enabled) return fail(404, 'disabled', 'Not found.');
  if (!(await bearerMatches(input.authorization, input.secret))) return fail(401, 'unauthorized', 'A server credential is required.');
  const { body, now } = input;
  if (!isSuccessionAction(body.action) || !successionRequestId(body.requestId) || Object.keys(body).length !== 2) return fail(400, 'bad_request', 'Send {"action": "illness" | "vacate" | "abdicate" | "accede", "requestId": "<8-64 letters, digits, - or _>"}.');
  const action = body.action, requestId = body.requestId;
  const stored = async () => db.prepare(`SELECT ${columns} FROM aurelle_succession_events WHERE request_id=?`).bind(requestId).first<Row>().catch(tolerate(isMissingRelation, null));
  const replay = async (row: Row) => kindOf(action).includes(row.kind) ? { ok: true as const, replay: true as const, event: publicEvent(row), state: view(await readSuccession(db)) } : fail(409, 'request_reused', 'That request id was already used for a different command.');
  const prior = await stored();
  if (prior) return replay(prior);
  const refusal = await blocker(db);
  if (refusal) return fail(409, refusal, refusalText[refusal]);
  const state = await readSuccession(db);
  if (!actionAllowed(action, state.status)) return fail(409, 'wrong_state', refusalText.wrong_state);
  // The event to record: accede installs the named heir, else the most senior member, else the Great Council's next house.
  let kind: SuccessionEventKind, installed: { memberId: string | null; name: string; house: string } | null = null;
  if (action === 'accede') {
    const choice = state.heir ? { memberId: state.heir.memberId, name: state.heir.name, house: state.heir.house } : (() => { const c = councilChoice(state.ruledHouses); return c ? { memberId: null, name: c.name, house: c.house } : null; })();
    if (!choice) return fail(409, 'no_house_left', refusalText.no_house_left);
    kind = state.heir ? 'accession' : 'great_council'; installed = choice;
  } else kind = action === 'illness' ? 'illness' : action === 'vacate' ? 'vacancy' : 'abdication';
  const id = `succ-${crypto.randomUUID()}`, g = successionGazette[kind];
  const names = { ruler: state.ruler.name, heir: installed?.name ?? '', house: installed?.house ?? state.ruler.house };
  const headline = fillGazette(g.headline, names), detail = fillGazette(g.body, names), at = new Date(now * 1000).toISOString();
  await db.batch([
    db.prepare(`INSERT INTO aurelle_succession_events (${columns}) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`).bind(id, state.maxSeq + 1, requestId, kind, installed?.memberId ?? null, installed?.name ?? null, installed?.house ?? null, now),
    db.prepare(`INSERT INTO world_events (kind, headline, detail, location, occurred_at, sort_order)
      SELECT 'court-gazette', ${lit(headline)}, ${lit(detail)}, 'Aurelle', ?, ?
      WHERE EXISTS (SELECT 1 FROM aurelle_succession_events WHERE id = ?)`).bind(at, -now, id),
  ]);
  const row = await stored();
  if (!row) return fail(409, 'state_changed', 'The succession moved at the same moment; read it and try again.');
  return { ok: true as const, ...(row.id === id ? {} : { replay: true as const }), event: publicEvent(row), state: view(await readSuccession(db)) };
}

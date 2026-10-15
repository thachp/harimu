/** #350: server-only commands for declaring a war and ending it (propose, then the other side accepts), behind HARIMU_WAR_ENABLED (default "false").
 *  The caller is a server-only caller (no citizen session; see handleWarCommand), and the acting role is validated against lib/war-authority.ts.
 *  Reuses declareWar / endWar from lib/war.ts, so the Founding Period, the non-aggression pact (#402) and the peace lock are checked there and every command is idempotent by request id.
 *  The section 15 declaration rate limits and casus belli gate (#426) are applied in declareWar behind HARIMU_WAR_DECLARATION_LIMITS_ENABLED. NOT here (follow-up issues): the Kindle Assembly vote, surrender and concession terms. */
import type { GameDatabase } from './database-contract';
import { declareWar, endWar } from './war';
import { isWarNation, requestIdOk, warNationNames, type WarNationId } from './war-rules';
import { authorizeWarRole, bearerMatches, isWarEndKind, warAuthority, type WarEndRequestKind } from './war-authority';
import { leaderPersonas } from './leader-personas';
import { resolveCityAssault } from './siege-actions'; // #419

const fail = (status: 400 | 401 | 403 | 409, reason: string, error: string) => ({ ok: false as const, status, reason, error });
const disabled = () => fail(403, 'disabled', 'War is not open yet.');
type Authority = { office: string; mode: 'proposal' | 'decree'; ratifier: string };
type ActionRow = { id: string; request_id: string; war_id: string; action: string; nation: string; role: string; end_kind: string | null };
type WarRow = { id: string; attacker_nation: WarNationId; defender_nation: WarNationId; ended_at: number | null };

function actor(nation: unknown, role: unknown) {
  if (!isWarNation(nation)) return fail(400, 'bad_nations', 'The acting nation must be Kindle, Korund or Aurelle.');
  const authority = authorizeWarRole(nation, role);
  if (!authority.ok) return fail(403, 'not_authorized', `Only the ${warAuthority[nation].office} of ${warNationNames[nation]} may do that.`);
  return { ok: true as const, nation, authority: { office: authority.office, mode: authority.mode, ratifier: authority.ratifier } as Authority };
}
const record = (db: GameDatabase, row: { requestId: string; warId: string; action: 'declare' | 'propose-end' | 'accept-end'; nation: WarNationId; authority: Authority; endKind?: WarEndRequestKind; now: number }) =>
  db.prepare('INSERT INTO war_actions (id,request_id,war_id,action,nation,role,authority,ratifier,end_kind,acted_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING')
    .bind(`wact-${crypto.randomUUID()}`, row.requestId, row.warId, row.action, row.nation, row.authority.office, row.authority.mode, row.authority.ratifier, row.endKind ?? null, row.now).run();
const byRequest = (db: GameDatabase, requestId: string) => db.prepare('SELECT id,request_id,war_id,action,nation,role,end_kind FROM war_actions WHERE request_id=?').bind(requestId).first<ActionRow>();
const openWar = (db: GameDatabase, warId: string) => db.prepare('SELECT id,attacker_nation,defender_nation,ended_at FROM wars WHERE id=?').bind(warId).first<WarRow>();

export type DeclareCommand = { nation: string; role: string; defender: string; casusBelli?: string; declaredBy?: string; requestId: string };
/** The acting nation's authorized office declares war on `defender`. Kindle's declaration is recorded as a President proposal (ratifier "assembly majority" is data only). */
export async function declareByAuthority(db: GameDatabase, command: DeclareCommand, now: number, enabled: boolean, limits = false) {
  if (!enabled) return disabled();
  if (!requestIdOk(command.requestId)) return fail(400, 'bad_request', 'A request id is required.');
  const who = actor(command.nation, command.role); if (!who.ok) return who;
  const declaredBy = command.declaredBy ?? leaderPersonas[who.nation].name;
  const declared = await declareWar(db, { attacker: who.nation, defender: command.defender, casusBelli: command.casusBelli, declaredBy, requestId: command.requestId }, now, { enabled, limits });
  if (!declared.ok) return declared;
  // The authority record is written on a replay too (ON CONFLICT DO NOTHING), so a crash between the two statements is repaired by the retry.
  await record(db, { requestId: command.requestId, warId: declared.war.id, action: 'declare', nation: who.nation, authority: who.authority, now });
  return { ok: true as const, ...('replay' in declared ? { replay: true as const } : {}), war: declared.war, authority: who.authority };
}

export type ProposeEndCommand = { nation: string; role: string; warId: string; kind: string; requestId: string };
/** Either side's authorized office proposes a ceasefire or peace. One proposal per war; the other side must accept it. */
export async function proposeEnd(db: GameDatabase, command: ProposeEndCommand, now: number, enabled: boolean) {
  if (!enabled) return disabled();
  if (!requestIdOk(command.requestId)) return fail(400, 'bad_request', 'A request id is required.');
  if (!isWarEndKind(command.kind)) return fail(400, 'bad_request', 'Propose a ceasefire or a peace.');
  const who = actor(command.nation, command.role); if (!who.ok) return who;
  const prior = await byRequest(db, command.requestId);
  if (prior) return prior.action === 'propose-end' && prior.war_id === command.warId && prior.nation === who.nation ? { ok: true as const, replay: true as const, kind: prior.end_kind, authority: who.authority }
    : fail(409, 'request_reused', 'That request id was already used for a different command.');
  const war = await openWar(db, command.warId);
  if (!war) return fail(409, 'not_found', 'No such war.');
  if (war.ended_at !== null) return fail(409, 'war_ended', 'That war has already ended.');
  if (war.attacker_nation !== who.nation && war.defender_nation !== who.nation) return fail(403, 'not_a_party', 'Your nation is not a party to that war.');
  await record(db, { requestId: command.requestId, warId: war.id, action: 'propose-end', nation: who.nation, authority: who.authority, endKind: command.kind, now });
  const saved = await byRequest(db, command.requestId);
  if (!saved) return fail(409, 'proposal_pending', 'An end to this war has already been proposed.');
  return { ok: true as const, kind: command.kind, authority: who.authority, awaiting: war.attacker_nation === who.nation ? war.defender_nation : war.attacker_nation };
}

export type AcceptEndCommand = { nation: string; role: string; warId: string; requestId: string };
/** The OTHER side's authorized office accepts the pending proposal; the war then ends through endWar as a treaty (ceasefire or peace: the 10-day peace lock starts). */
export async function acceptEnd(db: GameDatabase, command: AcceptEndCommand, now: number, enabled: boolean) {
  if (!enabled) return disabled();
  if (!requestIdOk(command.requestId)) return fail(400, 'bad_request', 'A request id is required.');
  const who = actor(command.nation, command.role); if (!who.ok) return who;
  const prior = await byRequest(db, command.requestId);
  if (prior) {
    if (prior.action !== 'accept-end' || prior.war_id !== command.warId || prior.nation !== who.nation) return fail(409, 'request_reused', 'That request id was already used for a different command.');
    const again = await endWar(db, prior.war_id, 'treaty', now, enabled); // idempotent: a retry finishes an accepted end that did not complete
    return again.ok ? { ok: true as const, replay: true as const, war: again.war, authority: who.authority } : again;
  }
  const war = await openWar(db, command.warId);
  if (!war) return fail(409, 'not_found', 'No such war.');
  if (war.ended_at !== null) return fail(409, 'war_ended', 'That war has already ended.');
  if (war.attacker_nation !== who.nation && war.defender_nation !== who.nation) return fail(403, 'not_a_party', 'Your nation is not a party to that war.');
  const proposal = await db.prepare("SELECT id,request_id,war_id,action,nation,role,end_kind FROM war_actions WHERE war_id=? AND action='propose-end'").bind(war.id).first<ActionRow>();
  if (!proposal) return fail(409, 'no_proposal', 'Nobody has proposed to end this war.');
  if (proposal.nation === who.nation) return fail(409, 'own_proposal', 'The other side must accept your proposal.');
  await record(db, { requestId: command.requestId, warId: war.id, action: 'accept-end', nation: who.nation, authority: who.authority, now });
  const saved = await byRequest(db, command.requestId);
  if (!saved) return fail(409, 'already_accepted', 'This proposal has already been accepted.');
  const ended = await endWar(db, war.id, 'treaty', now, enabled);
  return ended.ok ? { ok: true as const, kind: proposal.end_kind, war: ended.war, authority: who.authority } : ended;
}

export type WarCommandInput = { enabled: boolean; /** #426: HARIMU_WAR_DECLARATION_LIMITS_ENABLED, default off. */ limits?: boolean; secret: string | undefined; authorization: string | null; body: Record<string, unknown>; now: number };
const text = (value: unknown, max: number) => typeof value === 'string' && value.length > 0 && value.length <= max ? value : '';
/** `authorizeWarCaller` is also called by the route before it parses the body, so a bad body without credentials is 401, not 400. The server-only entry point: flag first (403, nothing read or written), then the bearer secret (HARIMU_WAR_ADMIN_SECRET; missing or wrong never authorizes), then the command. */
export async function authorizeWarCaller(input: { enabled: boolean; secret: string | undefined; authorization: string | null }) {
  if (!input.enabled) return disabled();
  if (!(await bearerMatches(input.authorization, input.secret))) return fail(401, 'unauthorized', 'A server credential is required.');
  return null;
}
export async function handleWarCommand(db: GameDatabase, input: WarCommandInput) {
  const denied = await authorizeWarCaller(input);
  if (denied) return denied;
  const { body, now } = input;
  const base = { nation: text(body.nation, 20), role: text(body.role, 40), requestId: text(body.requestId, 64) };
  if (body.action === 'declare') return declareByAuthority(db, { ...base, defender: text(body.defender, 20), casusBelli: typeof body.casusBelli === 'string' ? body.casusBelli : undefined, declaredBy: typeof body.declaredBy === 'string' ? body.declaredBy : undefined }, now, true, input.limits === true);
  if (body.action === 'propose-end') return proposeEnd(db, { ...base, warId: text(body.warId, 80), kind: text(body.kind, 20) }, now, true);
  if (body.action === 'accept-end') return acceptEnd(db, { ...base, warId: text(body.warId, 80) }, now, true);
  if (body.action === 'assault') return resolveCityAssault(db, { nation: base.nation, warId: text(body.warId, 80), cityKind: text(body.cityKind, 20), cityId: text(body.cityId, 80), requestId: base.requestId }, now, true); // #419: one successful city assault (siege PoC)
  return fail(400, 'bad_request', 'Send action "declare", "propose-end", "accept-end" or "assault".');
}

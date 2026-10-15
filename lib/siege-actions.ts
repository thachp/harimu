/** #419 (siege PoC, slice B): the server-only command that resolves one successful city assault, behind HARIMU_WAR_ENABLED (default "false").
 *  Same caller model as lib/war-actions.ts (no citizen session, no GET; the route requires HARIMU_WAR_ADMIN_SECRET). Rules live in lib/siege.ts (slice A); docs 15.3.
 *  Idempotent by request id: a retry of the same command returns the stored outcome and never counts twice. A siege is one row per (war, city); an assault counts only for a real UTC day it
 *  has not counted on yet. The second counted day captures: national control (`world_squares.owner`) of the city's claim squares that nobody bought moves to the attacker, purchased squares
 *  keep owner and purchase row, and `world_cities.nation_id` moves for a founded city, all in one batch with the capture record. Stand-in for Decision 109 (#468).
 *  Not here: #495 (weariness from captures), UI, how the attacker's strength decides an assault (this PoC records an assault the caller says succeeded). */
import type { GameDatabase } from './database-contract';
import { isMissingRelation, tolerate } from './db-errors';
import { mapHeight, mapWidth, mvpNations } from './map-zones';
import { assaultRefusal, capturableCity, claimSquares, planCapture, recordAssault, siegeCityKey, type CityKind, type SquareFact } from './siege';
import { canResolveCityAssault, isWarNation, requestIdOk, warStatus } from './war-rules';
import { defenseStartHours, readDefenseWindows } from './war';

const fail = (status: 400 | 403 | 409, reason: string, error: string) => ({ ok: false as const, status, reason, error });
const refusalText: Record<string, string> = {
  not_a_city: 'That is not a city that can be besieged.', capital: 'A capital can never be captured.', heartland: 'Heartland cities can never be captured.',
  not_frontier: 'Only Frontier cities and outposts can be captured.', war_not_active: 'That war is not active.', outside_window: "An assault can be resolved only inside the defender's window.",
  wrong_side: 'Only the attacking nation can assault.', already_captured: 'That city has already been captured in this war.',
};
type WarRow = { id: string; attacker_nation: string; defender_nation: string; declared_at: number; mobilization_ends_at: number; ended_at: number | null };
type SiegeRow = { id: string; war_id: string; city_key: string; city_kind: CityKind; center_x: number; center_y: number; attacker_nation: string; defender_nation: string; captured_at: number | null };
const siegeColumns = 'id,war_id,city_key,city_kind,center_x,center_y,attacker_nation,defender_nation,captured_at';
type AssaultRow = { request_id: string; siege_id: string; assault_day: number };

export type AssaultCommand = { nation: string; warId: string; cityKind: string; cityId: string; requestId: string };
export type SiegeView = { id: string; warId: string; cityKey: string; attacker: string; defender: string; days: number; needed: number; capturedAt: number | null };

const progress = async (db: GameDatabase, siegeId: string) => ((await db.prepare('SELECT assault_day FROM siege_assaults WHERE siege_id=? ORDER BY assault_day').bind(siegeId).all<{ assault_day: number }>()).results).map(r => Number(r.assault_day));

/** Resolve one successful assault by the attacking nation on a besieged city. Returns the siege progress, and `captured` with what moved when this assault was the second counted day. */
export async function resolveCityAssault(db: GameDatabase, command: AssaultCommand, now: number, enabled: boolean) {
  if (!enabled) return fail(403, 'disabled', 'War is not open yet.');
  if (!requestIdOk(command.requestId)) return fail(400, 'bad_request', 'A request id is required.');
  if (!isWarNation(command.nation) || (command.cityKind !== 'outpost' && command.cityKind !== 'founded') || !command.cityId || !command.warId) return fail(400, 'bad_request', 'Name the war, the attacking nation and the city.');
  const kind = command.cityKind as CityKind, key = siegeCityKey(kind, command.cityId);
  const prior = await db.prepare('SELECT a.request_id,a.siege_id,a.assault_day FROM siege_assaults a WHERE a.request_id=?').bind(command.requestId).first<AssaultRow>();
  if (prior) {
    const s = await db.prepare(`SELECT ${siegeColumns} FROM city_sieges WHERE id=?`).bind(prior.siege_id).first<SiegeRow>();
    if (!s || s.war_id !== command.warId || s.city_key !== key || s.attacker_nation !== command.nation) return fail(409, 'request_reused', 'That request id was already used for a different command.');
    // A crash between the assault row and the capture is repaired here: the second counted day with no capture yet finishes it (idempotent).
    const finished = s.captured_at === null && (await progress(db, s.id)).length >= 2 ? await capture(db, s, s.city_kind, { x: Number(s.center_x), y: Number(s.center_y) }, command.requestId, now) : undefined;
    const fresh = finished ? (await db.prepare(`SELECT ${siegeColumns} FROM city_sieges WHERE id=?`).bind(s.id).first<SiegeRow>())! : s;
    return { ok: true as const, replay: true as const, ...(finished ? { captured: finished } : {}), siege: await view(db, fresh) };
  }
  const war = await db.prepare('SELECT id,attacker_nation,defender_nation,declared_at,mobilization_ends_at,ended_at FROM wars WHERE id=?').bind(command.warId).first<WarRow>();
  if (!war) return fail(409, 'not_found', 'No such war.');
  // The city and its current holder, read from the map (an outpost's holder is its square's owner; a founded city's is world_cities.nation_id).
  let centre: { x: number; y: number } | null = null, holder: string | null = null;
  if (kind === 'outpost') { const o = mvpNations.find(n => n.id === command.cityId)?.outpost; if (o) { centre = o; holder = (await db.prepare('SELECT owner FROM world_squares WHERE x=? AND y=?').bind(o.x, o.y).first<{ owner: string | null }>())?.owner ?? null; } }
  else { const c = await db.prepare('SELECT nation_id,center_x,center_y FROM world_cities WHERE id=?').bind(command.cityId).first<{ nation_id: string; center_x: number; center_y: number }>().catch(tolerate(isMissingRelation, null)); if (c) { centre = { x: Number(c.center_x), y: Number(c.center_y) }; holder = c.nation_id; } }
  const fact = centre ? await db.prepare('SELECT x,y,zone,owner,feature FROM world_squares WHERE x=? AND y=?').bind(centre.x, centre.y).first<SquareFact>() : null;
  const existing = await db.prepare(`SELECT ${siegeColumns} FROM city_sieges WHERE war_id=? AND city_key=?`).bind(war.id, key).first<SiegeRow>();
  const startHours = defenseStartHours(await readDefenseWindows(db));
  const refusal = assaultRefusal({
    warStatus: warStatus({ declaredAt: war.declared_at, mobilizationEndsAt: war.mobilization_ends_at, endedAt: war.ended_at }, now), attacker: war.attacker_nation, defender: war.defender_nation, actingNation: command.nation,
    inDefenseWindow: canResolveCityAssault(war.defender_nation, now, startHours), city: capturableCity(kind, fact), alreadyCaptured: Boolean(existing?.captured_at),
  });
  if (refusal) return fail(409, refusal, refusalText[refusal] ?? 'Refused.');
  if (holder !== war.defender_nation) return fail(409, 'not_defenders_city', "That city does not belong to the war's defender.");
  const siegeId = existing?.id ?? `siege-${crypto.randomUUID()}`;
  if (!existing) await db.prepare('INSERT INTO city_sieges (id,war_id,city_key,city_kind,center_x,center_y,attacker_nation,defender_nation,created_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING')
    .bind(siegeId, war.id, key, kind, centre!.x, centre!.y, war.attacker_nation, war.defender_nation, now).run();
  const siege = (await db.prepare(`SELECT ${siegeColumns} FROM city_sieges WHERE war_id=? AND city_key=?`).bind(war.id, key).first<SiegeRow>())!;
  const days = await progress(db, siege.id), step = recordAssault(days, now);
  if (step.outcome === 'duplicate_day') return fail(409, 'already_assaulted_today', 'This city was already assaulted successfully today (UTC); a second assault on the same day does not count.');
  await db.prepare('INSERT INTO siege_assaults (request_id,siege_id,assault_day,assaulted_at) VALUES (?,?,?,?) ON CONFLICT DO NOTHING').bind(command.requestId, siege.id, Math.floor(now / 86400), now).run();
  const mine = await db.prepare('SELECT request_id,siege_id,assault_day FROM siege_assaults WHERE request_id=?').bind(command.requestId).first<AssaultRow>();
  if (!mine) return fail(409, 'already_assaulted_today', 'This city was already assaulted successfully today (UTC); a second assault on the same day does not count.');
  if (step.outcome !== 'captured') return { ok: true as const, siege: await view(db, siege) };
  return { ok: true as const, captured: await capture(db, siege, kind, centre!, command.requestId, now), siege: await view(db, (await db.prepare(`SELECT ${siegeColumns} FROM city_sieges WHERE id=?`).bind(siege.id).first<SiegeRow>())!) };
}

/** Moves national control for the claim squares nobody bought; one batch with the capture record, so it lands whole or not at all. A retry after a crash finds the capture and changes nothing. */
async function capture(db: GameDatabase, siege: SiegeRow, kind: CityKind, centre: { x: number; y: number }, requestId: string, now: number) {
  const done = await db.prepare('SELECT id,squares_transferred,squares_kept_private FROM city_captures WHERE siege_id=?').bind(siege.id).first<{ id: string; squares_transferred: number; squares_kept_private: number }>();
  if (done) return { moved: Number(done.squares_transferred), keptPrivate: Number(done.squares_kept_private), replay: true as const };
  const spots = claimSquares(kind, centre, { width: mapWidth, height: mapHeight });
  const facts = (await db.prepare('SELECT x,y,zone,owner,feature FROM world_squares WHERE x BETWEEN ? AND ? AND y BETWEEN ? AND ?').bind(Math.min(...spots.map(s => s.x)), Math.max(...spots.map(s => s.x)), Math.min(...spots.map(s => s.y)), Math.max(...spots.map(s => s.y))).all<SquareFact>()).results
    .filter(f => spots.some(s => s.x === Number(f.x) && s.y === Number(f.y))).map(f => ({ ...f, x: Number(f.x), y: Number(f.y) }));
  const bought = (await db.prepare('SELECT x,y FROM world_square_purchases WHERE x BETWEEN ? AND ? AND y BETWEEN ? AND ?').bind(Math.min(...spots.map(s => s.x)), Math.max(...spots.map(s => s.x)), Math.min(...spots.map(s => s.y)), Math.max(...spots.map(s => s.y))).all<{ x: number; y: number }>().catch(tolerate(isMissingRelation, { results: [] as { x: number; y: number }[] }))).results;
  const plan = planCapture(facts, new Set(bought.map(b => `${Number(b.x)},${Number(b.y)}`)), siege.attacker_nation, siege.defender_nation), id = `cap-${crypto.randomUUID()}`;
  const statements = [
    db.prepare('INSERT INTO city_captures (id,siege_id,war_id,request_id,attacker_nation,defender_nation,squares_transferred,squares_kept_private,captured_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(id, siege.id, siege.war_id, requestId, siege.attacker_nation, siege.defender_nation, plan.transfer.length, plan.keptPrivate.length, now),
    ...plan.transfer.flatMap(t => [
      db.prepare('UPDATE world_squares SET owner=? WHERE x=? AND y=? AND owner=? AND NOT EXISTS (SELECT 1 FROM world_square_purchases WHERE x=? AND y=?)').bind(t.to, t.x, t.y, t.from, t.x, t.y),
      db.prepare('INSERT INTO city_capture_squares (capture_id,x,y,from_nation,to_nation) VALUES (?,?,?,?,?)').bind(id, t.x, t.y, t.from, t.to),
    ]),
    ...(kind === 'founded' ? [db.prepare('UPDATE world_cities SET nation_id=? WHERE id=? AND nation_id=?').bind(siege.attacker_nation, siege.city_key.slice('city:'.length), siege.defender_nation)] : []),
    db.prepare('UPDATE city_sieges SET captured_at=? WHERE id=? AND captured_at IS NULL').bind(now, siege.id),
  ];
  try { await db.batch(statements); } catch (error) {
    const raced = await db.prepare('SELECT squares_transferred,squares_kept_private FROM city_captures WHERE siege_id=?').bind(siege.id).first<{ squares_transferred: number; squares_kept_private: number }>();
    if (!raced) throw error; return { moved: Number(raced.squares_transferred), keptPrivate: Number(raced.squares_kept_private), replay: true as const };
  }
  return { moved: plan.transfer.length, keptPrivate: plan.keptPrivate.length };
}

async function view(db: GameDatabase, s: SiegeRow): Promise<SiegeView> {
  return { id: s.id, warId: s.war_id, cityKey: s.city_key, attacker: s.attacker_nation, defender: s.defender_nation, days: (await progress(db, s.id)).length, needed: 2, capturedAt: s.captured_at === null ? null : Number(s.captured_at) };
}
/** Read-only (a GET may call it; unwired until slice C): the sieges of a war, newest first. A database without migration 0050 reads as none. */
export async function readSieges(db: GameDatabase, warId: string): Promise<SiegeView[]> {
  const rows = (await db.prepare(`SELECT ${siegeColumns} FROM city_sieges WHERE war_id=? ORDER BY created_at DESC,id LIMIT 50`).bind(warId).all<SiegeRow>().catch(tolerate(isMissingRelation, { results: [] as SiegeRow[] }))).results;
  return Promise.all(rows.map(r => view(db, r)));
}

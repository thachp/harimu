/** #419 (siege PoC, slice B): the server-only command that resolves one successful city assault, behind HARIMU_WAR_ENABLED (default "false").
 *  Same caller model as lib/war-actions.ts (no citizen session, no GET; the route requires HARIMU_WAR_ADMIN_SECRET). Rules live in lib/siege.ts (slice A); docs 15.3.
 *  Idempotent by request id: a retry of the same command returns the stored outcome and never counts twice. A siege is one row per (war, city); an assault counts only for a real UTC day it
 *  has not counted on yet. The second counted day captures: national control (`world_squares.owner`) of the city's claim squares that nobody bought moves to the attacker, purchased squares
 *  keep owner and purchase row, and `world_cities.nation_id` moves for a founded city, all in one batch with the capture record. Stand-in for Decision 109 (#468).
 *  Not here: #495 (weariness from captures), UI, how the attacker's strength decides an assault (this PoC records an assault the caller says succeeded). */
import type { GameDatabase } from './database-contract';
import { isMissingRelation, tolerate } from './db-errors';
import { mapHeight, mapWidth, mvpNations } from './map-zones';
import { weeklyLossLimit as weeklyLossLimitOf } from './war-loss-cap';
import { capGuardSql, decideCapture, defenderLockSql, frontierLedger, refusalStatement } from './war-loss-cap'; // #912
import { assaultRefusal, capturableCity, claimSquares, maxCityIdLength, planCapture, recordAssault, siegeCityKey, validSeconds, windowDay, type CityKind, type SquareFact } from './siege';
import { canResolveCityAssault, defenseWindowConfig, isWarNation, requestIdOk, warStatus } from './war-rules';
import { defenseStartHours, readDefenseWindows } from './war';

const fail = (status: 400 | 403 | 409, reason: string, error: string) => ({ ok: false as const, status, reason, error });
const refusalText: Record<string, string> = {
  not_a_city: 'That is not a city that can be besieged.', capital: 'A capital can never be captured.', heartland: 'Heartland cities can never be captured.',
  not_frontier: 'Only Frontier cities and outposts can be captured.', war_not_active: 'That war is not active.', outside_window: "An assault can be resolved only inside the defender's window.",
  wrong_side: 'Only the attacking nation can assault.', already_captured: 'That city has already been captured in this war.',
};
const alreadyToday = "This city was already assaulted successfully in today's defender window; a second assault on the same day does not count.";
const nothingToCapture = 'Every square of that city is privately owned, so there is nothing to capture.';
type WarRow = { id: string; attacker_nation: string; defender_nation: string; declared_at: number; mobilization_ends_at: number; ended_at: number | null };
type SiegeRow = { id: string; war_id: string; city_key: string; city_kind: CityKind; center_x: number; center_y: number; attacker_nation: string; defender_nation: string; captured_at: number | null };
const siegeColumns = 'id,war_id,city_key,city_kind,center_x,center_y,attacker_nation,defender_nation,captured_at';
type AssaultRow = { request_id: string; siege_id: string; assault_day: number };

export type AssaultCommand = { nation: string; warId: string; cityKind: string; cityId: string; requestId: string };
export type SiegeView = { id: string; warId: string; cityKey: string; attacker: string; defender: string; days: number; needed: number; capturedAt: number | null };

const progress = async (db: GameDatabase, siegeId: string) => ((await db.prepare('SELECT assault_day FROM siege_assaults WHERE siege_id=? ORDER BY assault_day').bind(siegeId).all<{ assault_day: number }>()).results).map(r => Number(r.assault_day));

/** Resolve one successful assault by the attacking nation on a besieged city. Returns the siege progress, and `captured` with what moved when this assault was the second counted day. */
export async function resolveCityAssault(db: GameDatabase, command: AssaultCommand, now: number, enabled: boolean, options: { lossCap?: boolean } = {}) {
  const lossCap = options.lossCap === true; // #912
  if (!enabled) return fail(403, 'disabled', 'War is not open yet.');
  if (!requestIdOk(command.requestId)) return fail(400, 'bad_request', 'A request id is required.');
  if (!validSeconds(now)) return fail(400, 'bad_request', 'The time must be unix seconds.');
  // #620: a direct caller can pass a missing or non-string id; refuse before the length check would throw a TypeError.
  if (typeof command.cityId !== 'string') return fail(400, 'bad_request', 'Name the war, the attacking nation and the city.');
  if (command.cityId.length > maxCityIdLength) return fail(409, 'city_id_too_long', 'That city id is too long.');
  if (!isWarNation(command.nation) || (command.cityKind !== 'outpost' && command.cityKind !== 'founded') || !command.cityId || !command.warId) return fail(400, 'bad_request', 'Name the war, the attacking nation and the city.');
  const kind = command.cityKind as CityKind, key = siegeCityKey(kind, command.cityId);
  const replayed = await replayFor(db, command, key, now, lossCap);
  if (replayed) return replayed;
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
  // #577 item 4: a city with nothing the attacker could take (every claim square privately bought) cannot be captured (Decision 109 stand-in): refuse before anything is written.
  if (!existing?.captured_at && !(await capturePlan(db, kind, centre!, war.attacker_nation, war.defender_nation)).transfer.length) return fail(409, 'nothing_to_capture', nothingToCapture);
  const siegeId = existing?.id ?? `siege-${crypto.randomUUID()}`;
  if (!existing) await db.prepare('INSERT INTO city_sieges (id,war_id,city_key,city_kind,center_x,center_y,attacker_nation,defender_nation,created_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING')
    .bind(siegeId, war.id, key, kind, centre!.x, centre!.y, war.attacker_nation, war.defender_nation, now).run();
  const siege = (await db.prepare(`SELECT ${siegeColumns} FROM city_sieges WHERE war_id=? AND city_key=?`).bind(war.id, key).first<SiegeRow>())!;
  const days = await progress(db, siege.id), startHour = startHours[war.defender_nation as keyof typeof startHours];
  let step = recordAssault(days, now, startHour);
  // #620 item 3 [ASSUMPTION]: days stored under an earlier saved window may differ from today's numbering. An assault does not count when an earlier one falls in the SAME real window of the window in force now (re-dated by assaulted_at), so changing the window mid-siege can never speed up a capture. The reverse (one stored number reused across two real windows) is refused by UNIQUE(siege_id, assault_day): it fails safe and the attacker retries in the next window. No migration.
  if ((step.outcome === 'recorded' || step.outcome === 'captured') && await assaultedInSameWindow(db, siege.id, startHour, now)) step = { ...step, outcome: 'duplicate_day' };
  if (step.outcome === 'duplicate_day') {
    // #577 item 1: simultaneous calls with the same request id replay instead of being refused as a second assault today.
    const same = await replayFor(db, command, key, now, lossCap);
    if (same) return same;
    // #577 item 3: a new request id on a day already counted, with two days recorded and no capture (a crash), repairs the capture instead of refusing.
    if (siege.captured_at === null && days.length >= 2) {
      const last = await db.prepare('SELECT request_id FROM siege_assaults WHERE siege_id=? ORDER BY assault_day DESC LIMIT 1').bind(siege.id).first<{ request_id: string }>();
      const repaired = last ? await capture(db, siege, kind, centre!, last.request_id, now, lossCap) : null;
      if (repaired && 'refused' in repaired) return refusedCapture(repaired);
      if (repaired) return { ok: true as const, repaired: true as const, captured: repaired, siege: await view(db, (await db.prepare(`SELECT ${siegeColumns} FROM city_sieges WHERE id=?`).bind(siege.id).first<SiegeRow>())!) };
    }
    return fail(409, 'already_assaulted_today', alreadyToday);
  }
  await db.prepare('INSERT INTO siege_assaults (request_id,siege_id,assault_day,assaulted_at) VALUES (?,?,?,?) ON CONFLICT DO NOTHING').bind(command.requestId, siege.id, windowDay(startHour, now), now).run();
  const mine = await db.prepare('SELECT request_id,siege_id,assault_day FROM siege_assaults WHERE request_id=?').bind(command.requestId).first<AssaultRow>();
  if (!mine) return fail(409, 'already_assaulted_today', alreadyToday);
  if (step.outcome !== 'captured') return { ok: true as const, siege: await view(db, siege) };
  const captured = await capture(db, siege, kind, centre!, command.requestId, now, lossCap);
  if (captured && 'refused' in captured) return refusedCapture(captured);
  if (!captured) return fail(409, 'nothing_to_capture', nothingToCapture);
  return { ok: true as const, captured, siege: await view(db, (await db.prepare(`SELECT ${siegeColumns} FROM city_sieges WHERE id=?`).bind(siege.id).first<SiegeRow>())!) };
}

/** The stored outcome of a request id already counted (null when it was not). A request id reused for another war, city or side is refused. A crash between the second assault row and the capture is repaired here. */
async function replayFor(db: GameDatabase, command: AssaultCommand, key: string, now: number, lossCap = false) {
  const prior = await db.prepare('SELECT a.request_id,a.siege_id,a.assault_day FROM siege_assaults a WHERE a.request_id=?').bind(command.requestId).first<AssaultRow>();
  if (!prior) return null;
  const s = await db.prepare(`SELECT ${siegeColumns} FROM city_sieges WHERE id=?`).bind(prior.siege_id).first<SiegeRow>();
  if (!s || s.war_id !== command.warId || s.city_key !== key || s.attacker_nation !== command.nation) return fail(409, 'request_reused', 'That request id was already used for a different command.');
  const finished = s.captured_at === null && (await progress(db, s.id)).length >= 2 ? await capture(db, s, s.city_kind, { x: Number(s.center_x), y: Number(s.center_y) }, command.requestId, now, lossCap) : null;
  if (finished && 'refused' in finished) return refusedCapture(finished); // #912
  const fresh = finished ? (await db.prepare(`SELECT ${siegeColumns} FROM city_sieges WHERE id=?`).bind(s.id).first<SiegeRow>())! : s;
  return { ok: true as const, replay: true as const, ...(finished ? { captured: finished } : {}), siege: await view(db, fresh) };
}

/** What a capture would move now: the unpurchased claim squares the defender holds. */
async function capturePlan(db: GameDatabase, kind: CityKind, centre: { x: number; y: number }, attacker: string, defender: string) {
  const spots = claimSquares(kind, centre, { width: mapWidth, height: mapHeight });
  const facts = (await db.prepare('SELECT x,y,zone,owner,feature FROM world_squares WHERE x BETWEEN ? AND ? AND y BETWEEN ? AND ?').bind(Math.min(...spots.map(s => s.x)), Math.max(...spots.map(s => s.x)), Math.min(...spots.map(s => s.y)), Math.max(...spots.map(s => s.y))).all<SquareFact>()).results
    .filter(f => spots.some(s => s.x === Number(f.x) && s.y === Number(f.y))).map(f => ({ ...f, x: Number(f.x), y: Number(f.y) }));
  const bought = (await db.prepare('SELECT x,y FROM world_square_purchases WHERE x BETWEEN ? AND ? AND y BETWEEN ? AND ?').bind(Math.min(...spots.map(s => s.x)), Math.max(...spots.map(s => s.x)), Math.min(...spots.map(s => s.y)), Math.max(...spots.map(s => s.y))).all<{ x: number; y: number }>().catch(tolerate(isMissingRelation, { results: [] as { x: number; y: number }[] }))).results;
  return planCapture(facts, new Set(bought.map(b => `${Number(b.x)},${Number(b.y)}`)), attacker, defender);
}

/** Test seam (server-only, no route): the capture step alone, for the real multi-connection race test. */
export const captureSiegeForTest = (...a: Parameters<typeof capture>) => capture(...a);
/** Moves national control for the claim squares nobody bought; one batch with the capture record, so it lands whole or not at all. A retry after a crash finds the capture and changes nothing. */
async function capture(db: GameDatabase, siege: SiegeRow, kind: CityKind, centre: { x: number; y: number }, requestId: string, now: number, lossCap = false) {
  const done = await db.prepare('SELECT id,squares_transferred,squares_kept_private FROM city_captures WHERE siege_id=?').bind(siege.id).first<{ id: string; squares_transferred: number; squares_kept_private: number }>();
  if (done) return { moved: Number(done.squares_transferred), keptPrivate: Number(done.squares_kept_private), replay: true as const };
  const plan = await capturePlan(db, kind, centre, siege.attacker_nation, siege.defender_nation), id = `cap-${crypto.randomUUID()}`;
  if (!plan.transfer.length) return null; // everything was bought since the pre-check: nothing moves, and no capture is recorded
  if (lossCap) { // #912: Heartland never moves; a capture that would take the defender past its weekly frontier-loss limit moves nothing and the city stays contested.
    const zones = await squareZones(db, plan.transfer), ledger = await frontierLedger(db, siege.defender_nation, now);
    const decision = decideCapture(plan.transfer.map(t => ({ ...t, zone: zones.get(`${t.x},${t.y}`) ?? 'frontier' })), ledger.lost, ledger.heldAtWindowStart);
    const log = { siegeId: siege.id, warId: siege.war_id, requestId, attacker: siege.attacker_nation, defender: siege.defender_nation, lost: ledger.lost, now };
    if (!decision.ok) { await refusalStatement(db, { ...log, reason: 'weekly_cap', squares: decision.transfer.length, limit: decision.limit }).run(); return { refused: 'weekly_cap' as const, lost: decision.lost, limit: decision.limit }; }
    if (decision.heartland.length) await refusalStatement(db, { ...log, reason: 'heartland', squares: decision.heartland.length, limit: 1 }).run();
    if (!decision.transfer.length) return null;
    plan.transfer = decision.transfer.map(({ x, y, from, to }) => ({ x, y, from, to }));
    const guard = capGuardSql(siege.defender_nation, decision.transfer.filter(s => s.zone === 'frontier').length, now), landed = 'EXISTS (SELECT 1 FROM city_captures WHERE id=?)';
    try { await db.batch([db.prepare(defenderLockSql).bind(siege.defender_nation), // lock first, then re-check the cap inside the same transaction
      db.prepare(`INSERT INTO city_captures (id,siege_id,war_id,request_id,attacker_nation,defender_nation,squares_transferred,squares_kept_private,captured_at) SELECT ?,?,?,?,?,?,?,?,? WHERE ${guard}`)
        .bind(id, siege.id, siege.war_id, requestId, siege.attacker_nation, siege.defender_nation, plan.transfer.length, plan.keptPrivate.length, now),
      ...plan.transfer.flatMap(t => [
        db.prepare(`UPDATE world_squares SET owner=? WHERE x=? AND y=? AND owner=? AND NOT EXISTS (SELECT 1 FROM world_square_purchases WHERE x=? AND y=?) AND ${landed}`).bind(t.to, t.x, t.y, t.from, t.x, t.y, id),
        db.prepare(`INSERT INTO city_capture_squares (capture_id,x,y,from_nation,to_nation) SELECT ?,?,?,?,? WHERE ${landed}`).bind(id, t.x, t.y, t.from, t.to, id),
      ]),
      ...(kind === 'founded' ? [db.prepare(`UPDATE world_cities SET nation_id=? WHERE id=? AND nation_id=? AND ${landed}`).bind(siege.attacker_nation, siege.city_key.slice('city:'.length), siege.defender_nation, id)] : []),
      db.prepare(`UPDATE city_sieges SET captured_at=? WHERE id=? AND captured_at IS NULL AND ${landed}`).bind(now, siege.id, id),
    ]); } catch (error) {
      const raced = await db.prepare('SELECT squares_transferred,squares_kept_private FROM city_captures WHERE siege_id=?').bind(siege.id).first<{ squares_transferred: number; squares_kept_private: number }>();
      if (!raced) throw error; return { moved: Number(raced.squares_transferred), keptPrivate: Number(raced.squares_kept_private), replay: true as const };
    }
    if (await db.prepare('SELECT 1 AS found FROM city_captures WHERE id=?').bind(id).first()) return { moved: plan.transfer.length, keptPrivate: plan.keptPrivate.length };
    const after = await frontierLedger(db, siege.defender_nation, now), limit = weeklyLossLimitOf(after.heldAtWindowStart); // a concurrent capture took the room
    await refusalStatement(db, { ...log, lost: after.lost, reason: 'weekly_cap', squares: plan.transfer.length, limit }).run();
    return { refused: 'weekly_cap' as const, lost: after.lost, limit };
  }
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

async function squareZones(db: GameDatabase, squares: readonly { x: number; y: number }[]) {
  const zones = new Map<string, string>();
  for (const s of squares) { const row = await db.prepare('SELECT zone FROM world_squares WHERE x=? AND y=?').bind(s.x, s.y).first<{ zone: string }>(); if (row) zones.set(`${s.x},${s.y}`, row.zone); }
  return zones;
}
const refusedCapture = (r: { lost?: number; limit?: number }) => fail(409, 'weekly_loss_cap', `The defender has already lost ${r.lost ?? 0} of the ${r.limit ?? 1} frontier squares it can lose this week; the city stays contested.`);
async function view(db: GameDatabase, s: SiegeRow): Promise<SiegeView> {
  return { id: s.id, warId: s.war_id, cityKey: s.city_key, attacker: s.attacker_nation, defender: s.defender_nation, days: (await progress(db, s.id)).length, needed: 2, capturedAt: s.captured_at === null ? null : Number(s.captured_at) };
}
/** Read-only (a GET may call it; unwired until slice C): the sieges of a war, newest first. A database without migration 0050 reads as none. */
export async function readSieges(db: GameDatabase, warId: string): Promise<SiegeView[]> {
  const rows = (await db.prepare(`SELECT ${siegeColumns} FROM city_sieges WHERE war_id=? ORDER BY created_at DESC,id LIMIT 50`).bind(warId).all<SiegeRow>().catch(tolerate(isMissingRelation, { results: [] as SiegeRow[] }))).results;
  return Promise.all(rows.map(r => view(db, r)));
}

/** #620 item 3: true when an assault already recorded for this siege falls in the same real window as `now`, numbering both by the window in force now. */
async function assaultedInSameWindow(db: GameDatabase, siegeId: string, startHour: number, now: number) {
  const today = windowDay(startHour, now);
  return (await db.prepare('SELECT assaulted_at FROM siege_assaults WHERE siege_id=?').bind(siegeId).all<{ assaulted_at: number }>()).results.some(r => windowDay(startHour, Number(r.assaulted_at)) === today);
}

/** The start (unix seconds) of the next window in which an assault would still count: this window if it is open or still ahead and has no counted assault, else the next day's. */
export function nextAssaultWindowAt(startHour: number, assaultTimes: readonly number[], now: number): number | null {
  const today = windowDay(startHour, now);
  if (Number.isNaN(today)) return null;
  const counted = assaultTimes.some(at => windowDay(startHour, at) === today), end = (day: number) => day * 86400 + startHour * 3600 + defenseWindowConfig.windowSeconds;
  const day = counted || now >= end(today) ? today + 1 : today;
  return day * 86400 + startHour * 3600;
}

export type SiegeSnapshotItem = SiegeView & { cityKind: CityKind; cityName: string | null; nextWindowAt: number | null };
/** #620: read-only snapshot of the sieges that are live or captured (sieges of an ended war that never fell are left out), newest first, with the count of assault days and when the next assault could count.
 *  Served only while HARIMU_WAR_ENABLED is on (readWorldSimulation `war`). One query for the sieges, one for their assaults, one for founded-city names; a database without migration 0050 or 0014 reads as none. */
export async function readSiegeSnapshot(db: GameDatabase, now: number): Promise<SiegeSnapshotItem[]> {
  const rows = (await db.prepare(`SELECT ${siegeColumns.split(',').map(c => `s.${c}`).join(',')} FROM city_sieges s JOIN wars w ON w.id=s.war_id WHERE w.ended_at IS NULL OR s.captured_at IS NOT NULL ORDER BY s.created_at DESC,s.id LIMIT 50`).all<SiegeRow>().catch(tolerate(isMissingRelation, { results: [] as SiegeRow[] }))).results;
  if (!rows.length) return [];
  const marks = rows.map(() => '?').join(',');
  const assaults = (await db.prepare(`SELECT siege_id,assault_day,assaulted_at FROM siege_assaults WHERE siege_id IN (${marks})`).bind(...rows.map(r => r.id)).all<{ siege_id: string; assault_day: number; assaulted_at: number }>()).results;
  const founded = rows.filter(r => r.city_kind === 'founded').map(r => r.city_key.slice('city:'.length));
  const names = new Map(founded.length ? (await db.prepare(`SELECT id,name FROM world_cities WHERE id IN (${founded.map(() => '?').join(',')})`).bind(...founded).all<{ id: string; name: string }>().catch(tolerate(isMissingRelation, { results: [] as { id: string; name: string }[] }))).results.map(c => [c.id, c.name] as const) : []);
  const windows = await readDefenseWindows(db), startHours = defenseStartHours(windows);
  return rows.map(r => {
    const mine = assaults.filter(a => a.siege_id === r.id), captured = r.captured_at !== null;
    return {
      id: r.id, warId: r.war_id, cityKey: r.city_key, attacker: r.attacker_nation, defender: r.defender_nation, days: new Set(mine.map(a => Number(a.assault_day))).size, needed: 2, capturedAt: captured ? Number(r.captured_at) : null,
      cityKind: r.city_kind, cityName: r.city_kind === 'founded' ? names.get(r.city_key.slice('city:'.length)) ?? null : null,
      nextWindowAt: captured ? null : nextAssaultWindowAt(startHours[r.defender_nation as keyof typeof startHours], mine.map(a => Number(a.assaulted_at)), now),
    };
  });
}

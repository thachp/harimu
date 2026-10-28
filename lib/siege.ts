/** #419 (siege PoC, slice A: schema and pure rules). Canon: harimu-docs 15.3 "Sieges" (capturing a city takes at least two successful assaults on two different days inside the defender's
 *  window; Heartland is immune) and "Cities of Harimu" (Frontier outposts and cities founded on Frontier can be captured; capitals and other Heartland cities never). Follow-up to #310
 *  (`canResolveCityAssault`, the defender's 4-hour window, in lib/war-rules.ts). Pure and import-free so tests load it under plain Node; the server path that writes these tables is slice B,
 *  behind HARIMU_WAR_ENABLED (default "false"). Nothing here reads or writes by itself.
 *
 *  Capture rule, a stand-in for Decision 109 (private title survives war and cession; design in #468, not built): a capture moves only NATIONAL control, `world_squares.owner`, of the
 *  city's claim squares to the attacker. A square with a `world_square_purchases` row (privately bought) keeps its owner and its purchase row. `world_cities.nation_id` moves to the attacker.
 *  Each successful assault and each capture is a row #495 (war weariness: lost frontier squares per nation per war) can count later; #495 is not wired here. */
export const assaultsToCapture = 2; // docs 15.3: two successful assaults on two different days
export const claimRadius = 2; // a founded city claims the radius-2 block around its centre (lib/city-founding.ts, #124)
const DAY = 86400;
/** The real UTC day number of a unix second (day 0 = 1970-01-01). The "different days" of docs 15.3 are real UTC days. */
export const utcDay = (at: number): number => validSeconds(at) ? Math.floor(at / DAY) : NaN;
/** #577 item 5 [ASSUMPTION, docs 15.3 "different days"]: the day an assault counts on is the UTC day its defender window STARTED, so one window that spans midnight UTC (Kindle 22:00 to 02:00) is one day, not two.
 *  Inside the window this is floor((at - startHour*3600) / 86400); with start hour 0 it is the plain UTC day. NaN for a bad time or start hour. */
export const windowDay = (startHourUtc: number, at: number): number => validSeconds(at) && Number.isInteger(startHourUtc) && startHourUtc >= 0 && startHourUtc <= 23 && at >= startHourUtc * 3600 ? Math.floor((at - startHourUtc * 3600) / DAY) : NaN;
/** A usable unix timestamp in SECONDS: a finite non-negative integer below the year 3000. Rejects NaN, fractions and millisecond timestamps (about 1.8e12), which would otherwise land on a day far in the future. */
export const validSeconds = (at: unknown): at is number => typeof at === 'number' && Number.isSafeInteger(at) && at >= 0 && at < 32_503_680_000;

export type CityKind = 'outpost' | 'founded';
export type Point = { x: number; y: number };
export type SquareFact = { x: number; y: number; zone: string; owner: string | null; feature: string | null };

export type CityRefusal = 'not_a_city' | 'capital' | 'heartland' | 'not_frontier';
/** Only a Frontier outpost or a city founded on Frontier can be besieged. `square` is the city's centre square as stored in world_squares. Fails closed on anything else. */
export function capturableCity(kind: unknown, square: SquareFact | undefined | null): { ok: true } | { ok: false; reason: CityRefusal } {
  if (kind !== 'outpost' && kind !== 'founded') return { ok: false, reason: 'not_a_city' };
  if (!square) return { ok: false, reason: 'not_a_city' };
  if (square.feature === 'capital') return { ok: false, reason: 'capital' };
  if (square.zone === 'heartland') return { ok: false, reason: 'heartland' };
  if (square.zone !== 'frontier') return { ok: false, reason: 'not_frontier' };
  if (kind === 'outpost' ? square.feature !== 'border outpost' : square.feature !== 'city') return { ok: false, reason: 'not_a_city' };
  return { ok: true };
}

export type AssaultRefusal = CityRefusal | 'war_not_active' | 'outside_window' | 'wrong_side' | 'already_captured';
export type AssaultCheck = { warStatus: string; attacker: string; defender: string; actingNation: string; inDefenseWindow: boolean; city: ReturnType<typeof capturableCity>; alreadyCaptured: boolean };
/** Why an assault is refused, or null when it may be resolved. The order is fixed so one answer is stable: the city first, then the war, the side, the window. */
export function assaultRefusal(check: AssaultCheck): AssaultRefusal | null {
  if (!check.city.ok) return check.city.reason;
  if (check.alreadyCaptured) return 'already_captured';
  if (check.warStatus !== 'active') return 'war_not_active';
  if (check.actingNation !== check.attacker || check.attacker === check.defender) return 'wrong_side';
  if (!check.inDefenseWindow) return 'outside_window';
  return null;
}

/** Outcome of recording one successful assault at `at` against the days already recorded for the siege (windowDay of the defender's start hour; the default 0 is the plain UTC day). One success counts per day; the second distinct day captures. */
export function recordAssault(recordedDays: readonly number[], at: number, startHourUtc = 0): { outcome: 'invalid_time' | 'duplicate_day' | 'recorded' | 'captured'; days: number[]; distinctDays: number } {
  const day = windowDay(startHourUtc, at), days = [...new Set(recordedDays)].sort((a, b) => a - b);
  if (Number.isNaN(day)) return { outcome: 'invalid_time', days, distinctDays: days.length };
  if (days.includes(day)) return { outcome: 'duplicate_day', days, distinctDays: days.length };
  const next = [...days, day].sort((a, b) => a - b);
  return { outcome: next.length >= assaultsToCapture ? 'captured' : 'recorded', days: next, distinctDays: next.length };
}
export const siegeProgress = (recordedDays: readonly number[]) => { const n = new Set(recordedDays).size; return { count: n, needed: assaultsToCapture, captured: n >= assaultsToCapture }; };

/** The squares a capture can move: an outpost is its one square, a founded city its radius-2 block, clipped to the grid (`bounds` = width and height). */
export function claimSquares(kind: CityKind, centre: Point, bounds: { width: number; height: number }): Point[] {
  const r = kind === 'outpost' ? 0 : claimRadius, out: Point[] = [];
  for (let y = centre.y - r; y <= centre.y + r; y++) for (let x = centre.x - r; x <= centre.x + r; x++) if (x >= 0 && y >= 0 && x < bounds.width && y < bounds.height) out.push({ x, y });
  return out;
}
/** What a capture moves and what it leaves. `privateKeys` are "x,y" of squares that have a world_square_purchases row. Only a square the defender holds nationally and nobody bought moves
 *  (to the attacker); a Heartland square never moves (docs 15.3, #912); a purchased square keeps its owner (Decision 109 stand-in, #468); a square the defender does not hold is not touched. */
export function planCapture(squares: readonly SquareFact[], privateKeys: ReadonlySet<string>, attacker: string, defender: string): { transfer: { x: number; y: number; from: string; to: string }[]; keptPrivate: Point[] } {
  const transfer: { x: number; y: number; from: string; to: string }[] = [], keptPrivate: Point[] = [];
  for (const s of squares) {
    if (s.owner !== defender || s.zone === 'heartland') continue; // #912: docs 15.3, Heartland is immune; a city block that reaches into Heartland leaves those squares
    if (privateKeys.has(`${s.x},${s.y}`)) keptPrivate.push({ x: s.x, y: s.y });
    else transfer.push({ x: s.x, y: s.y, from: defender, to: attacker });
  }
  return { transfer, keptPrivate };
}

/** City key for a siege: the outpost of a nation, or a founded city's id. city_sieges.city_key allows 80 characters: callers must keep the id within `maxCityIdLength`. */
export const maxCityIdLength = 72;
export const siegeCityKey = (kind: CityKind, id: string) => kind === 'outpost' ? `outpost:${id}` : `city:${id}`;

/** Additive tables (migration 0050). Nations are checked by lib/nation-openings and an FK to nations(id), not a literal list, so later nations never need this migration repeated. */
export const siegeSchemas = [
  `CREATE TABLE IF NOT EXISTS city_sieges (
 id TEXT PRIMARY KEY,
 war_id TEXT NOT NULL REFERENCES wars(id) ON DELETE CASCADE,
 city_key TEXT NOT NULL CHECK(length(city_key) BETWEEN 3 AND 80),
 city_kind TEXT NOT NULL CHECK(city_kind IN ('outpost','founded')),
 center_x INTEGER NOT NULL, center_y INTEGER NOT NULL,
 attacker_nation TEXT NOT NULL REFERENCES nations(id),
 defender_nation TEXT NOT NULL REFERENCES nations(id),
 created_at INTEGER NOT NULL,
 captured_at INTEGER,
 CHECK(attacker_nation<>defender_nation),
 UNIQUE(war_id, city_key)
)`,
  // One row per SUCCESSFUL assault, keyed by request id (a retry never counts twice); at most one per siege and real UTC day.
  `CREATE TABLE IF NOT EXISTS siege_assaults (
 request_id TEXT PRIMARY KEY,
 siege_id TEXT NOT NULL REFERENCES city_sieges(id) ON DELETE CASCADE,
 assault_day INTEGER NOT NULL CHECK(assault_day >= 0),
 assaulted_at INTEGER NOT NULL,
 UNIQUE(siege_id, assault_day)
)`,
  // One row per capture step (#933: multiple per siege when the weekly frontier-loss cap forces partial capture); request_id stays unique. The per-square child lists what moved.
  `CREATE TABLE IF NOT EXISTS city_captures (
 id TEXT PRIMARY KEY,
 siege_id TEXT NOT NULL REFERENCES city_sieges(id) ON DELETE CASCADE,
 war_id TEXT NOT NULL REFERENCES wars(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL UNIQUE,
 attacker_nation TEXT NOT NULL REFERENCES nations(id),
 defender_nation TEXT NOT NULL REFERENCES nations(id),
 squares_transferred INTEGER NOT NULL CHECK(squares_transferred >= 0),
 squares_kept_private INTEGER NOT NULL CHECK(squares_kept_private >= 0),
 captured_at INTEGER NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS city_capture_squares (
 capture_id TEXT NOT NULL REFERENCES city_captures(id) ON DELETE CASCADE,
 x INTEGER NOT NULL, y INTEGER NOT NULL,
 from_nation TEXT NOT NULL REFERENCES nations(id),
 to_nation TEXT NOT NULL REFERENCES nations(id),
 PRIMARY KEY(capture_id, x, y)
)`,
  'CREATE INDEX IF NOT EXISTS idx_city_sieges_war ON city_sieges(war_id)',
  'CREATE INDEX IF NOT EXISTS idx_city_captures_war ON city_captures(war_id, defender_nation)',
  'CREATE INDEX IF NOT EXISTS idx_city_captures_siege ON city_captures(siege_id)',
] as const;

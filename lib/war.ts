import { env } from 'cloudflare:workers';
import type { GameDatabase } from './database-contract';
import { isMissingRelation, tolerate } from './db-errors';
import { blockedDeclaration, endedNoticesFor, mobilizationStatus, noticesFor, WAR_NAME_MAX } from './war-copy';
import { cleanLabel, declarationBlock, defaultDefenseStartHours, defenseWindowChangeAllowed, defenseWindowConfig, defenseWindowNextChange, isDefenseStartHour, warNations, fillWarText, foundingPeriodEnd, isWarNation, mobilizationEnd, pairKey, peaceLockEnd, requestIdOk, warConfig, warNationNames, warStatus,
  type DeclarationBlock, type WarEndKind, type WarNationId, type WarStatus } from './war-rules';
export * from './war-rules';

/** #309: formal war declarations behind HARIMU_WAR_ENABLED (default "false"). Canon: harimu-docs 15.3, 15.4, 13.2 (see lib/war-rules.ts).
 *  Declarations are written only by server code (the AI leadership path), never by a GET or a citizen action: there is no route for them.
 *  `mobilizing` -> `active` is derived from declared_at + 48 real hours, so reads never write. `ended` is set by endWar (test or admin path). */
export const warSchemas = [
  `CREATE TABLE IF NOT EXISTS wars (
 id TEXT PRIMARY KEY,
 request_id TEXT NOT NULL UNIQUE,
 pair_key TEXT NOT NULL,
 attacker_nation TEXT NOT NULL CHECK(attacker_nation IN ('kindle','korund','aurelle')),
 defender_nation TEXT NOT NULL CHECK(defender_nation IN ('kindle','korund','aurelle')),
 casus_belli TEXT NOT NULL DEFAULT '' CHECK(length(casus_belli)<=40),
 declared_by TEXT NOT NULL CHECK(length(declared_by) BETWEEN 1 AND 60),
 declared_at INTEGER NOT NULL,
 mobilization_ends_at INTEGER NOT NULL,
 ended_at INTEGER,
 end_kind TEXT CHECK(end_kind IN ('treaty','other')),
 CHECK(attacker_nation<>defender_nation),
 CHECK(mobilization_ends_at=declared_at+172800),
 CHECK((ended_at IS NULL)=(end_kind IS NULL))
)`,
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_wars_one_open_per_pair ON wars(pair_key) WHERE ended_at IS NULL',
  'CREATE INDEX IF NOT EXISTS idx_wars_declared ON wars(declared_at)',
  // #310: a nation's saved defense window (start hour, UTC). No row = the seed window (defaultDefenseStartHours). Written only by setDefenseWindow.
  `CREATE TABLE IF NOT EXISTS war_defense_windows (
 nation_id TEXT PRIMARY KEY CHECK(nation_id IN ('kindle','korund','aurelle')),
 start_hour_utc INTEGER NOT NULL CHECK(start_hour_utc BETWEEN 0 AND 23),
 set_by TEXT NOT NULL CHECK(length(set_by) BETWEEN 1 AND 60),
 changed_at INTEGER NOT NULL
)`,
];

type Row = { id: string; attacker_nation: WarNationId; defender_nation: WarNationId; casus_belli: string; declared_by: string; declared_at: number; mobilization_ends_at: number; ended_at: number | null; end_kind: WarEndKind | null };
export type PublicWar = { id: string; attacker: WarNationId; defender: WarNationId; casusBelli: string; declaredBy: string; declaredAt: number; mobilizationEndsAt: number;
  status: WarStatus; endedAt: number | null; endKind: WarEndKind | null; peaceLockEndsAt: number | null };
export type DefenseWindowState = { startHourUtc: number; changedAt: number | null; nextChangeAt: number | null };
export type WarState = { wars: PublicWar[]; foundingPeriodEndsAt: number | null; defenseWindows: Record<WarNationId, DefenseWindowState> };
const columns = 'id,attacker_nation,defender_nation,casus_belli,declared_by,declared_at,mobilization_ends_at,ended_at,end_kind';
const publicWar = (row: Row, now: number): PublicWar => {
  const times = { declaredAt: Number(row.declared_at), mobilizationEndsAt: Number(row.mobilization_ends_at), endedAt: row.ended_at === null ? null : Number(row.ended_at) };
  return { id: row.id, attacker: row.attacker_nation, defender: row.defender_nation, casusBelli: row.casus_belli, declaredBy: row.declared_by, declaredAt: times.declaredAt,
    mobilizationEndsAt: times.mobilizationEndsAt, status: warStatus(times, now), endedAt: times.endedAt, endKind: row.end_kind,
    peaceLockEndsAt: times.endedAt !== null && row.end_kind === 'treaty' ? peaceLockEnd(times.endedAt) : null };
};

/** When the shard started: HARIMU_SHARD_STARTED_AT (epoch seconds or an ISO date) if set and valid, else the world clock's first epoch. null = unknown (fails closed). [ASSUMPTION] */
export async function shardStartedAt(db: GameDatabase, configured: string | undefined = (env as unknown as { HARIMU_SHARD_STARTED_AT?: string }).HARIMU_SHARD_STARTED_AT): Promise<number | null> {
  const text = configured?.trim();
  if (text) { const seconds = /^\d{9,11}$/.test(text) ? Number(text) : Math.floor(Date.parse(text) / 1000); if (Number.isSafeInteger(seconds) && seconds > 0) return seconds; }
  const clock = await db.prepare("SELECT epoch_seconds FROM world_clock WHERE id='main'").first<{ epoch_seconds: number }>().catch(tolerate(isMissingRelation, null));
  return clock ? Number(clock.epoch_seconds) : null;
}

/** Non-aggression pact between the two nations (docs 13.2: a pact bars declarations between its signatories).
 *  TODO(#308): wire this to the treaty store when the diplomacy PoC (#308, docs 13.2) lands. Until then there are no treaties, so it FAILS OPEN:
 *  no pact is assumed and the declaration is not blocked. The same holds if a supplied check reads a treaty table that does not exist yet. */
export const nonAggressionInForce = async (_db: GameDatabase, _a: WarNationId, _b: WarNationId, _now: number) => false;
async function pactInForce(check: NonNullable<DeclareWarOptions['nonAggression']>, db: GameDatabase, a: WarNationId, b: WarNationId, now: number): Promise<boolean> {
  try { return (await check(db, a, b, now)) === true; } catch (error) { if (isMissingRelation(error)) return false; throw error; }
}

export type DeclareWarCommand = { attacker: string; defender: string; casusBelli?: string; declaredBy: string; requestId: string };
export type DeclareWarOptions = { enabled: boolean; shardStartedAt?: number | null; nonAggression?: (db: GameDatabase, a: WarNationId, b: WarNationId, now: number) => Promise<boolean> | boolean };
const fail = (status: 400 | 403 | 409, reason: string, error: string) => ({ ok: false as const, status, reason, error });
const blockedText: Record<DeclarationBlock, (defender: string) => string> = {
  founding_period: () => blockedDeclaration.foundingPeriod.text,
  non_aggression: defender => blockedDeclaration.nonAggression.text.replace('{defender}', defender.slice(0, WAR_NAME_MAX)),
  peace_lock: defender => blockedDeclaration.peaceLock.text.replace('{defender}', defender.slice(0, WAR_NAME_MAX)),
};

/** Server-side only (the AI leadership path calls this; no route does). Rejects during the Founding Period, under a non-aggression pact,
 *  and within 10 real days after a ceasefire or peace treaty. Idempotent per requestId. Writes one `wars` row; mobilization ends 48 real hours later. */
export async function declareWar(db: GameDatabase, command: DeclareWarCommand, now: number, options: DeclareWarOptions) {
  if (!options.enabled) return fail(403, 'disabled', 'War declarations are not open yet.');
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid authoritative world time.');
  if (!requestIdOk(command.requestId)) return fail(400, 'bad_request', 'A request id is required.');
  if (!isWarNation(command.attacker) || !isWarNation(command.defender) || command.attacker === command.defender) return fail(400, 'bad_nations', 'A war needs two different nations (Kindle, Korund or Aurelle).');
  const declaredBy = cleanLabel(command.declaredBy, warConfig.actorMax);
  if (!declaredBy) return fail(400, 'bad_request', 'The declaring AI leader must be named.');
  const casusBelli = cleanLabel(command.casusBelli ?? '', warConfig.casusBelliMax);
  const prior = await db.prepare(`SELECT ${columns} FROM wars WHERE request_id=?`).bind(command.requestId).first<Row>();
  if (prior) return prior.attacker_nation === command.attacker && prior.defender_nation === command.defender
    ? { ok: true as const, replay: true as const, war: publicWar(prior, now) } : fail(409, 'request_reused', 'That request id was already used for a different declaration.');
  const pair = pairKey(command.attacker, command.defender);
  const started = options.shardStartedAt !== undefined ? options.shardStartedAt : await shardStartedAt(db);
  const nonAggression = await pactInForce(options.nonAggression ?? nonAggressionInForce, db, command.attacker, command.defender, now);
  const lastPeace = await db.prepare("SELECT MAX(ended_at) AS ended_at FROM wars WHERE pair_key=? AND end_kind='treaty'").bind(pair).first<{ ended_at: number | null }>();
  const block = declarationBlock({ now, shardStartedAt: started, nonAggression, lastTreatyEndedAt: lastPeace?.ended_at == null ? null : Number(lastPeace.ended_at) });
  if (block) return fail(409, block, blockedText[block](warNationNames[command.defender]));
  const id = `war-${command.requestId}`;
  // The unique open-war-per-pair index and the request id make concurrent declarations safe: only one insert can land.
  await db.prepare(`INSERT INTO wars (id,request_id,pair_key,attacker_nation,defender_nation,casus_belli,declared_by,declared_at,mobilization_ends_at)
    SELECT ?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM wars WHERE pair_key=? AND ended_at IS NULL) ON CONFLICT DO NOTHING`)
    .bind(id, command.requestId, pair, command.attacker, command.defender, casusBelli, declaredBy, now, mobilizationEnd(now), pair).run();
  const saved = await db.prepare(`SELECT ${columns} FROM wars WHERE request_id=?`).bind(command.requestId).first<Row>();
  return saved ? { ok: true as const, war: publicWar(saved, now) } : fail(409, 'war_exists', 'These nations are already at war.');
}

/** Test or admin path: ends an unfinished war. `treaty` (ceasefire or peace) starts the 10-day declaration lock; `other` does not [ASSUMPTION]. */
export async function endWar(db: GameDatabase, warId: string, kind: WarEndKind, now: number, enabled: boolean) {
  if (!enabled) return fail(403, 'disabled', 'War is not open yet.');
  await db.prepare('UPDATE wars SET ended_at=?,end_kind=? WHERE id=? AND ended_at IS NULL').bind(now, kind, warId).run();
  const row = await db.prepare(`SELECT ${columns} FROM wars WHERE id=?`).bind(warId).first<Row>();
  return row ? { ok: true as const, war: publicWar(row, now) } : fail(409, 'not_found', 'No such war.');
}

/** Read-only. With the flag off the caller does not call this; a database without migration 0031 reads as no wars. */
export async function readWars(db: GameDatabase, now: number): Promise<WarState> {
  const rows = (await db.prepare(`SELECT ${columns} FROM wars ORDER BY declared_at DESC, id LIMIT 20`).all<Row>().catch(tolerate(isMissingRelation, { results: [] as Row[] }))).results;
  const started = await shardStartedAt(db);
  return { wars: rows.map(row => publicWar(row, now)), foundingPeriodEndsAt: started === null ? null : foundingPeriodEnd(started), defenseWindows: await readDefenseWindows(db) };
}

type WindowRow = { nation_id: WarNationId; start_hour_utc: number; changed_at: number };
const windowState = (nation: WarNationId, row: WindowRow | null | undefined): DefenseWindowState => row
  ? { startHourUtc: Number(row.start_hour_utc), changedAt: Number(row.changed_at), nextChangeAt: defenseWindowNextChange(Number(row.changed_at)) }
  : { startHourUtc: defaultDefenseStartHours[nation], changedAt: null, nextChangeAt: null };
/** #310: every nation's saved window, or its seed window when none was saved (read-only; a database without migration 0033 reads as all seeds). */
export async function readDefenseWindows(db: GameDatabase): Promise<Record<WarNationId, DefenseWindowState>> {
  const rows = (await db.prepare('SELECT nation_id,start_hour_utc,changed_at FROM war_defense_windows').all<WindowRow>().catch(tolerate(isMissingRelation, { results: [] as WindowRow[] }))).results;
  return Object.fromEntries(warNations.map(nation => [nation, windowState(nation, rows.find(row => row.nation_id === nation))])) as Record<WarNationId, DefenseWindowState>;
}
/** Start hours only, in the shape canResolveCityAssault takes. */
export const defenseStartHours = (windows: Record<WarNationId, DefenseWindowState>) => Object.fromEntries(warNations.map(nation => [nation, windows[nation].startHourUtc])) as Record<WarNationId, number>;

export type SetDefenseWindowCommand = { nation: string; startHourUtc: number; setBy: string };
/** Server-side only (the AI leader's path would call it; no route does). Saves a nation's daily defense window. The first pick is free; after that a window
 *  can change at most once per 7 real days [ASSUMPTION, defenseWindowConfig.changeCooldownSeconds]. One atomic upsert, so concurrent changes cannot both land.
 *  Asking for the hour a nation already has changes nothing and does not start the cooldown. */
export async function setDefenseWindow(db: GameDatabase, command: SetDefenseWindowCommand, now: number, enabled: boolean) {
  if (!enabled) return fail(403, 'disabled', 'War is not open yet.');
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid authoritative world time.');
  if (!isWarNation(command.nation)) return fail(400, 'bad_nations', 'A defense window belongs to Kindle, Korund or Aurelle.');
  if (!isDefenseStartHour(command.startHourUtc)) return fail(400, 'bad_hour', 'The window start must be a whole UTC hour from 0 to 23.');
  const setBy = cleanLabel(command.setBy, warConfig.actorMax);
  if (!setBy) return fail(400, 'bad_request', 'The AI leader setting the window must be named.');
  const current = windowState(command.nation, await db.prepare('SELECT nation_id,start_hour_utc,changed_at FROM war_defense_windows WHERE nation_id=?').bind(command.nation).first<WindowRow>());
  if (current.startHourUtc === command.startHourUtc) return { ok: true as const, unchanged: true as const, window: current };
  if (!defenseWindowChangeAllowed(current.changedAt, now)) return fail(409, 'window_cooldown', 'This nation changed its defense window recently. It can change again after the cooldown.');
  await db.prepare(`INSERT INTO war_defense_windows (nation_id,start_hour_utc,set_by,changed_at) VALUES (?,?,?,?)
    ON CONFLICT(nation_id) DO UPDATE SET start_hour_utc=excluded.start_hour_utc,set_by=excluded.set_by,changed_at=excluded.changed_at WHERE war_defense_windows.changed_at<=?`)
    .bind(command.nation, command.startHourUtc, setBy, now, now - defenseWindowConfig.changeCooldownSeconds).run();
  const saved = windowState(command.nation, await db.prepare('SELECT nation_id,start_hour_utc,changed_at FROM war_defense_windows WHERE nation_id=?').bind(command.nation).first<WindowRow>());
  return saved.startHourUtc === command.startHourUtc ? { ok: true as const, unchanged: false as const, window: saved }
    : fail(409, 'window_cooldown', 'This nation changed its defense window recently. It can change again after the cooldown.');
}

export type WarNewsItem = { id: string; title: string; text: string; occurredAt: number; source: 'deterministic'; kind: 'template' | 'decree' };
const fill = fillWarText;
/** National news lines for one reader's nation, derived from the war records (read-only, never published as a game event): the declaration in that
 *  nation's voice (ours / against us / the world), the end of mobilization, and the end of the war. Occurred-at values are milliseconds. */
export function warNewsItems(wars: PublicWar[], readerNation: string): WarNewsItem[] {
  if (!isWarNation(readerNation)) return [];
  const notices = noticesFor(readerNation);
  if (!notices) return [];
  const kind = readerNation === 'aurelle' ? 'decree' as const : 'template' as const;
  const items: WarNewsItem[] = [];
  for (const war of wars) {
    const names = { attacker: warNationNames[war.attacker], defender: warNationNames[war.defender], casusBelli: war.casusBelli };
    const side = war.attacker === readerNation ? 'ours' as const : war.defender === readerNation ? 'against-us' as const : 'world' as const;
    const notice = notices.notices[side];
    items.push({ id: `war:${war.id}:declared`, title: fill(notice.headline, names), text: fill(war.casusBelli ? notice.body : notice.bodyNoGrievance, names), occurredAt: war.declaredAt * 1000, source: 'deterministic', kind });
    if (war.endedAt === null || war.endedAt >= war.mobilizationEndsAt) {
      if (war.status !== 'mobilizing') {
        const over = endedNoticesFor(readerNation)!.notices[side];
        items.push({ id: `war:${war.id}:mobilized`, title: fill(over.headline, names), text: fill(over.body, names), occurredAt: war.mobilizationEndsAt * 1000, source: 'deterministic', kind: over.aiBadge && readerNation === 'aurelle' ? 'decree' : 'template' });
      }
    }
    if (war.endedAt !== null) {
      const lockEnds = war.peaceLockEndsAt === null ? '' : new Date(war.peaceLockEndsAt * 1000).toISOString().slice(0, 10);
      items.push({ id: `war:${war.id}:ended`, title: 'The war has ended', text: fill(war.endKind === 'treaty' ? mobilizationStatus.ended.treaty.text : mobilizationStatus.ended.other.text, { peaceLockEnds: lockEnds }), occurredAt: war.endedAt * 1000, source: 'deterministic', kind });
    }
  }
  return items;
}

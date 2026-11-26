/** #1537: a city-founding expedition travels from the capital and claims on arrival (docs §15.1). */
import type { GameDatabase } from './database-contract';
import { isMissingRelation, tolerate } from './db-errors';
import { flagOn } from './flag-pack.mjs';
import { formatDuration } from './game-time';
import { marchRoute, moveSeconds, nationCapital, terrainMap } from './army-map';
import { landFor } from './land-copy';
import {
  checkFoundingSite, cityExpeditionEnabled, claimRadius, expeditionMinCitizens, expeditionEnRouteRefusal,
  foundingAuthority, foundingAuthorities, foundingClaimStatements,
  type FoundingCommand, type FoundingNation, type FoundingResult,
} from './city-founding';
import { mapHeight, mapWidth, onGrid, type Zone } from './map-zones';

export const cityExpeditionTravelEnabled = (env: unknown) => flagOn(env, 'HARIMU_CITY_EXPEDITION_TRAVEL_ENABLED');
export const cityExpeditionsSchema = `CREATE TABLE IF NOT EXISTS city_expeditions (
 id TEXT PRIMARY KEY,
 nation_id TEXT NOT NULL CHECK(nation_id IN ('kindle','korund','aurelle')),
 site_x INTEGER NOT NULL, site_y INTEGER NOT NULL,
 name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 40),
 authority TEXT NOT NULL CHECK(authority IN ('kindle-charter','korund-chairman-order','aurelle-royal-charter')),
 founded_by TEXT NOT NULL, request_id TEXT NOT NULL UNIQUE,
 departs_at INTEGER NOT NULL, arrives_at INTEGER NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('en_route','founded','failed')),
 failure_reason TEXT
)`;
export const cityExpeditionsEnRouteIndex = `CREATE UNIQUE INDEX IF NOT EXISTS idx_city_expeditions_one_en_route ON city_expeditions(nation_id) WHERE status = 'en_route'`;

type Point = { x: number; y: number };
type Square = { x: number; y: number; zone: Zone; owner: string | null; feature: string | null };
type ExpeditionRow = { id: string; nation_id: FoundingNation; site_x: number; site_y: number; name: string; authority: string; founded_by: string; request_id: string; departs_at: number; arrives_at: number; status: 'en_route' | 'founded' | 'failed'; failure_reason: string | null };

const siteOf = (x: number, y: number) => `${x}, ${y}`;
/** `proposal: true` status lines for the founding API (issue #1537). */
export const expeditionTravelStatus = {
  enRoute: (site: string, remainingSeconds: number) => `Expedition to ${site} arrives in ${formatDuration(Math.max(0, remainingSeconds) * 1000)}`,
  siteClaimed: 'The expedition found the site already claimed.',
  proposal: true as const,
};

const fail = (reason: string, error: string): FoundingResult => ({ ok: false, status: 409, reason, error });
const pending = (row: ExpeditionRow, now: number, replay?: true): FoundingResult => {
  const site = siteOf(Number(row.site_x), Number(row.site_y));
  const status = row.status === 'failed' ? expeditionTravelStatus.siteClaimed : expeditionTravelStatus.enRoute(site, Number(row.arrives_at) - now);
  return { ok: true, pending: true, arrivesAt: Number(row.arrives_at), status, site, ...(replay ? { replay: true } : {}) };
};

export function expeditionTravelSeconds(capital: Point, site: Point, terrainAt: (p: Point) => string | undefined): number {
  return marchRoute(capital, site, 0).reduce((sum, step) => sum + moveSeconds(terrainAt(step)), 0);
}

async function loadSquares(db: GameDatabase): Promise<Square[] | null> {
  const { results } = await db.prepare('SELECT x,y,zone,owner,feature FROM world_squares').all<Square>();
  const squares = onGrid(results ?? []).map(s => ({ ...s, x: Number(s.x), y: Number(s.y) }));
  return squares.length === mapWidth * mapHeight ? squares : null;
}

export async function departCityExpedition(db: GameDatabase, userId: string, nationId: string | null, command: FoundingCommand, now: number, enabled: boolean, env?: unknown): Promise<FoundingResult> {
  const denied = foundingAuthority(nationId, command.action, enabled); if (denied) return denied;
  const prior = await db.prepare('SELECT id,nation_id,site_x,site_y,name,authority,founded_by,request_id,departs_at,arrives_at,status,failure_reason FROM city_expeditions WHERE request_id=?')
    .bind(command.requestId).first<ExpeditionRow>().catch(tolerate(isMissingRelation, null));
  if (prior) {
    if (prior.founded_by !== userId || Number(prior.site_x) !== command.x || Number(prior.site_y) !== command.y) return fail('request_reused', 'That request id was already used for a different founding.');
    return pending(prior, now, true);
  }
  const nation = (Object.entries(foundingAuthorities).find(([, a]) => a.action === command.action)![0]) as FoundingNation;
  const capital = nationCapital(nation);
  if (!capital) return fail('map_unavailable', 'The world map is not available right now.');
  const squares = await loadSquares(db); if (!squares) return fail('map_unavailable', 'The world map is not available right now.');
  const site = checkFoundingSite(squares, command.x, command.y); if (site) return site;
  if (cityExpeditionEnabled(env)) {
    const row = await db.prepare('SELECT COUNT(*) AS n FROM citizens WHERE nation_id=?').bind(nation).first<{ n: number }>();
    const have = Number(row?.n ?? 0);
    if (have < expeditionMinCitizens) return fail('expedition_short', `An expedition needs at least ${expeditionMinCitizens} citizens of your nation. This nation has ${have}.`);
  }
  const terrain = terrainMap();
  const arrivesAt = now + expeditionTravelSeconds(capital, { x: command.x, y: command.y }, p => terrain.get(`${p.x},${p.y}`));
  const id = `expedition-${command.requestId}`;
  await db.prepare(`INSERT INTO city_expeditions (id,nation_id,site_x,site_y,name,authority,founded_by,request_id,departs_at,arrives_at,status)
    SELECT ?,?,?,?,?,?,?,?,?,?,'en_route' WHERE NOT EXISTS (SELECT 1 FROM city_expeditions WHERE nation_id=? AND status='en_route')
    ON CONFLICT DO NOTHING`).bind(id, nation, command.x, command.y, command.name, command.action, userId, command.requestId, now, arrivesAt, nation).run();
  const created = await db.prepare('SELECT id,nation_id,site_x,site_y,name,authority,founded_by,request_id,departs_at,arrives_at,status,failure_reason FROM city_expeditions WHERE request_id=?')
    .bind(command.requestId).first<ExpeditionRow>();
  if (!created) return expeditionEnRouteRefusal();
  return pending(created, now);
}

export async function settleCityExpeditions(db: GameDatabase, now: number): Promise<void> {
  const due = (await db.prepare("SELECT id,nation_id,site_x,site_y,name,authority,founded_by,request_id,departs_at,arrives_at,status,failure_reason FROM city_expeditions WHERE status='en_route' AND arrives_at<=? ORDER BY arrives_at, request_id")
    .bind(now).all<ExpeditionRow>().catch(tolerate(isMissingRelation, { results: [] as ExpeditionRow[] }))).results;
  if (!due.length) return;
  const squares = await loadSquares(db);
  for (const row of due) {
    const x = Number(row.site_x), y = Number(row.site_y), arrivesAt = Number(row.arrives_at);
    const denied = !squares ? { reason: 'map_unavailable' as const } : checkFoundingSite(squares, x, y);
    if (denied && !('ok' in denied && denied.ok)) {
      await db.prepare("UPDATE city_expeditions SET status='failed', failure_reason=? WHERE id=? AND status='en_route'")
        .bind('reason' in denied ? denied.reason : 'site_taken', row.id).run();
      continue;
    }
    const cityId = `city-${row.nation_id}-${x}-${y}`;
    await db.batch([
      ...foundingClaimStatements(db, { id: cityId, nation: row.nation_id, name: row.name, action: row.authority as FoundingCommand['action'], userId: row.founded_by, requestId: row.request_id, x, y, foundedAt: arrivesAt }),
      db.prepare("UPDATE city_expeditions SET status='founded', failure_reason=NULL WHERE id=? AND status='en_route' AND EXISTS (SELECT 1 FROM world_cities WHERE request_id=?)")
        .bind(row.id, row.request_id),
      db.prepare("UPDATE city_expeditions SET status='failed', failure_reason='site_taken' WHERE id=? AND status='en_route'")
        .bind(row.id),
    ]);
    if (squares) {
      const r = claimRadius;
      for (const s of squares) if (Math.max(Math.abs(s.x - x), Math.abs(s.y - y)) <= r) { s.owner = row.nation_id; s.zone = 'frontier'; if (s.x === x && s.y === y) s.feature = 'city'; }
    }
  }
}

export async function readFoundedExpeditions(db: GameDatabase, nationId: string): Promise<ExpeditionRow[]> {
  return (await db.prepare("SELECT id,nation_id,site_x,site_y,name,authority,founded_by,request_id,departs_at,arrives_at,status,failure_reason FROM city_expeditions WHERE nation_id=? AND status='founded'")
    .bind(nationId).all<ExpeditionRow>().catch(tolerate(isMissingRelation, { results: [] as ExpeditionRow[] }))).results;
}

/** Derived on read from founded expeditions; never writes. Uses lib/land-copy.ts `founded` lines (`proposal: true`). */
export function cityFoundingNewsItems(rows: readonly ExpeditionRow[], nationId: string) {
  const copy = landFor(nationId as 'kindle' | 'korund' | 'aurelle')?.founded;
  if (!copy) return [];
  return rows.filter(row => row.nation_id === nationId).map(row => {
    const city = row.name, title = copy.headline.replaceAll('{city}', city), text = copy.body.text.replaceAll('{city}', city);
    return { id: `city-expedition:${row.id}:founded`, title, text, occurredAt: Number(row.arrives_at) * 1000, source: 'deterministic' as const, kind: copy.body.aiBadge ? 'decree' as const : 'template' as const };
  });
}

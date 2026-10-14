import type { GameDatabase } from './database-contract';
import type { CityLocation } from './city-location';
/**
 * Realtime City square presence spike (#76). Pure helpers shared by the
 * Durable Object, the worker entry and tests. No game state lives here.
 */
export const presenceSocketPath = '/api/presence/ws';
export const presenceRosterCap = 50;
/** Sockets whose last heartbeat is older than this are treated as gone. */
export const presenceStaleMs = 60_000;
export const presenceHeartbeatMs = 20_000;

export type PresenceMember = { id: string; name: string; nationId: string };
export type PresenceMessage = { type: 'presence'; cityKey: string; count: number; members: { name: string; nationId: string }[]; truncated: boolean };

export function presenceEnabled(flag: string | undefined): boolean { return flag === 'true'; }
export function cityPresenceKey(nationId: string, cityId: string): string { return `${nationId}:${cityId}`; }

/** Pseudonymous, capped roster. One entry per account even with several tabs. */
export function presenceRoster(cityKey: string, members: readonly PresenceMember[], cap = presenceRosterCap): PresenceMessage {
  const unique = [...new Map(members.map(m => [m.id, m])).values()].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return { type: 'presence', cityKey, count: unique.length, members: unique.slice(0, cap).map(({ name, nationId }) => ({ name, nationId })), truncated: unique.length > cap };
}

export function isFresh(lastSeen: number | null | undefined, now: number, staleMs = presenceStaleMs): boolean {
  return typeof lastSeen === 'number' && now - lastSeen <= staleMs;
}

/** Validates an incoming server message on the client. */
export function parsePresenceMessage(raw: unknown): PresenceMessage | null {
  if (typeof raw !== 'string') return null;
  try {
    const v = JSON.parse(raw) as PresenceMessage;
    if (v?.type !== 'presence' || !Array.isArray(v.members) || typeof v.count !== 'number') return null;
    return v;
  } catch { return null; }
}


export type PresenceEnv = { HARIMU_REALTIME_PRESENCE?: string; CITY_PRESENCE?: { idFromName(name: string): unknown; get(id: unknown): { fetch(request: Request): Promise<Response> } } };

/** WebSocket upgrade for the realtime presence spike (#76); everything else is the vinext app. */
export type PresenceDeps = {
  authenticatedUserId: (request: Request) => Promise<string | null>;
  getDatabase: () => Promise<GameDatabase>;
  readCityLocation: (db: GameDatabase, userId: string, nationId: string, now: number) => Promise<CityLocation>;
};
export async function presenceUpgrade(request: Request, bindings: PresenceEnv, deps: PresenceDeps): Promise<Response> {
  if (!presenceEnabled(bindings.HARIMU_REALTIME_PRESENCE) || !bindings.CITY_PRESENCE) return new Response('Realtime presence is off.', { status: 404 });
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('Expected WebSocket upgrade.', { status: 426 });
  const origin = request.headers.get('Origin');
  if (!origin || new URL(origin).host !== new URL(request.url).host) return new Response('Same-origin socket required.', { status: 403 });
  const userId = await deps.authenticatedUserId(request); // Clerk session JWT from the same-origin __session cookie.
  if (!userId) return new Response('Sign in required.', { status: 401 });
  const db = await deps.getDatabase();
  const citizen = await db.prepare('SELECT c.nation_id, h.handle FROM citizens c LEFT JOIN square_handles h ON h.user_id=c.clerk_user_id WHERE c.clerk_user_id=?').bind(userId).first<{ nation_id: string; handle: string | null }>();
  if (!citizen) return new Response('Citizenship required.', { status: 403 });
  const location = await deps.readCityLocation(db, userId, citizen.nation_id, Math.floor(Date.now() / 1000));
  const cityKey = cityPresenceKey(citizen.nation_id, location.currentCityId);
  const stub = bindings.CITY_PRESENCE.get(bindings.CITY_PRESENCE.idFromName(cityKey));
  const headers = new Headers(request.headers);
  headers.set('X-Harimu-Presence-User', userId); headers.set('X-Harimu-Presence-Name', citizen.handle ?? 'Citizen');
  headers.set('X-Harimu-Presence-Nation', citizen.nation_id); headers.set('X-Harimu-Presence-City', cityKey);
  return stub.fetch(new Request(request.url, { headers }));
}


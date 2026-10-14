import { DurableObject } from 'cloudflare:workers';
import { isFresh, presenceRoster, type PresenceMember } from '../lib/city-presence';

/**
 * One instance per nation:city (#76). Hibernation WebSockets: heartbeats are
 * answered by the runtime ("ping" -> "pong") without waking the object.
 * Only reachable through the worker entry, which verifies Clerk first.
 */
export class CityPresence extends DurableObject {
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request: Request): Promise<Response> {
    const id = request.headers.get('X-Harimu-Presence-User'), name = request.headers.get('X-Harimu-Presence-Name'),
      nationId = request.headers.get('X-Harimu-Presence-Nation'), cityKey = request.headers.get('X-Harimu-Presence-City');
    if (!id || !name || !nationId || !cityKey || request.headers.get('Upgrade') !== 'websocket') return new Response('Bad presence request', { status: 400 });
    const pair = new WebSocketPair();
    const member: PresenceMember & { cityKey: string; joinedAt: number } = { id, name, nationId, cityKey, joinedAt: Date.now() };
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment(member);
    this.broadcast(cityKey);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    // Explicit refresh request; heartbeats never reach here (auto-response).
    if (message === 'roster') { const m = ws.deserializeAttachment() as { cityKey: string } | null; if (m) this.broadcast(m.cityKey, ws); }
  }
  async webSocketClose(ws: WebSocket, code: number) { try { ws.close(code === 1005 ? 1000 : code, 'bye'); } catch {} this.broadcastFrom(ws); }
  async webSocketError(ws: WebSocket) { this.broadcastFrom(ws); }

  private broadcastFrom(ws: WebSocket) { const m = ws.deserializeAttachment() as { cityKey: string } | null; if (m) this.broadcast(m.cityKey, undefined, ws); }

  private live(exclude?: WebSocket) {
    const now = Date.now();
    return this.ctx.getWebSockets().filter(ws => {
      if (ws === exclude || ws.readyState !== WebSocket.OPEN) return false;
      const m = ws.deserializeAttachment() as { joinedAt: number } | null;
      const fresh = isFresh(this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? m?.joinedAt, now);
      if (!fresh) { try { ws.close(4000, 'stale'); } catch {} }
      return fresh;
    });
  }

  private broadcast(cityKey: string, only?: WebSocket, exclude?: WebSocket) {
    const sockets = this.live(exclude);
    const payload = JSON.stringify(presenceRoster(cityKey, sockets.map(ws => ws.deserializeAttachment() as PresenceMember)));
    for (const ws of only ? [only] : sockets) { try { ws.send(payload); } catch {} }
  }
}

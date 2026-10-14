'use client';
import { useEffect, useState } from 'react';
import { parsePresenceMessage, presenceEnabled, presenceHeartbeatMs, presenceSocketPath, type PresenceMessage } from '@/lib/city-presence';

export const realtimePresenceFlag = presenceEnabled(process.env.NEXT_PUBLIC_HARIMU_REALTIME_PRESENCE);

/**
 * Live City square presence over a Durable Object WebSocket (#76).
 * Returns status 'off' when the flag is off or the socket fails, so callers keep
 * their existing HTTP polling. Never opens a socket while the flag is off.
 */
export function useCityPresence(active: boolean, cityId: string | undefined, enabled = realtimePresenceFlag) {
  const [state, setState] = useState<{ status: 'off' | 'connecting' | 'live'; roster: PresenceMessage | null }>({ status: 'off', roster: null });
  useEffect(() => {
    if (!enabled || !active || !cityId || typeof WebSocket === 'undefined') return;
    let closed = false, heartbeat = 0;
    const url = new URL(presenceSocketPath, window.location.href); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(url);
    queueMicrotask(() => { if (!closed) setState({ status: 'connecting', roster: null }); });
    ws.onopen = () => { heartbeat = window.setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send('ping'); }, presenceHeartbeatMs); };
    ws.onmessage = event => { const roster = parsePresenceMessage(event.data); if (roster && !closed) setState({ status: 'live', roster }); };
    const fallback = () => { window.clearInterval(heartbeat); if (!closed) setState({ status: 'off', roster: null }); };
    ws.onerror = fallback; ws.onclose = fallback;
    return () => { closed = true; window.clearInterval(heartbeat); ws.onclose = null; ws.onerror = null; try { ws.close(1000, 'leave'); } catch {} };
  }, [enabled, active, cityId]);
  return state;
}

/** Live roster for the City square; reports live state so HTTP pings can pause. */
export function LiveCityPresence({ active, cityId, liveRef }: { active: boolean; cityId?: string; liveRef: { current: boolean } }) {
  const live = useCityPresence(active, cityId);
  useEffect(() => { liveRef.current = live.status === 'live'; return () => { liveRef.current = false; }; }, [live.status, liveRef]);
  if (live.status !== 'live' || !live.roster) return null;
  const { roster } = live;
  return <div aria-live="polite" aria-label="Live city presence"><p>Live now: {roster.count} in this city{roster.truncated ? ` (showing ${roster.members.length})` : ''}</p>
    <ul>{roster.members.map((m, i) => <li key={`${m.name}:${i}`}>{m.name} · {m.nationId}</li>)}</ul></div>;
}

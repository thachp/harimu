'use client';
import { useCallback, useEffect, useState } from 'react';
import type { AurelleRisingState } from '../lib/aurelle-rising';
import { disabledReasonProps } from '../lib/action-reasons';
import { GameTimer } from './game-timer';
import { AiBadge } from './ai-disclosure';

type Snapshot = AurelleRisingState & { error?: string; ok?: boolean };
const hours = (seconds: number) => Math.floor(seconds / 3600);

/** #71 view. Copy is placeholder until Content #269 (lib/claimant-copy.ts) lands. */
export function AurelleRisingView({ state, busy, error, onPledge }: { state: AurelleRisingState; busy: boolean; error: string; onPledge: (claimantId: string) => void }) {
  const rising = state.rising;
  const reason = busy ? 'A pledge is being saved. Please wait.' : state.pledge.reason;
  return <section className="citizen-market" aria-label="Aurelle claimants and the Rising">
    {rising?.status === 'open' && <div role="status" aria-label="Rising banner" className="rising-banner">
      <h4>A Rising has begun behind {rising.claimantName} of {rising.house}. The Crisis Window is open.</h4>
      <GameTimer endsAt={rising.closesAt * 1000} label="Crisis Window closes" />
    </div>}
    {rising && rising.status !== 'open' && <p role="status">{rising.status === 'succeeded'
      ? `The Rising succeeded. ${rising.claimantName} is crowned, and ${rising.house} is the new royal house.`
      : `The Rising behind ${rising.claimantName} failed. The Crown holds, but the Grievance remains.`}</p>}
    <h3>Claimants of the rival houses</h3>
    <p>Your pledge is private from other players and counted only in aggregate. Only Tier-1 verified citizens of Aurelle can pledge, and a pledge can be changed once every 7 real days.</p>
    <p>A Rising opens when pledges behind one claimant reach {state.config.pledgeSharePct}% of this week&apos;s verified Aurelle citizens ({state.threshold ?? '—'} of {state.weeklyHumans}) and Unrest stays at {state.config.unrestThreshold} or more for {hours(state.config.unrestSustainSeconds)} real hours. Unrest now: {state.unrest ?? '—'} · sustained {hours(state.unrestSustainedSeconds)}h.</p>
    <p id="aurelle-pledge-reason" role="status">{reason ?? ''}</p>
    <ul>{state.claimants.map(c => <li key={c.id} aria-label={`Claimant ${c.name}`}>
      <strong>{c.name}, claimant of {c.house}</strong> <AiBadge /> {c.crowned && '· crowned'}
      <p>“{c.motto}” · {c.grievance} {c.programme}</p>
      <p>Pledges: {c.pledges}{state.myPledge?.claimantId === c.id ? ' · your pledge' : ''}</p>
      {!c.crowned && state.myPledge?.claimantId !== c.id && <button type="button" {...disabledReasonProps(reason, 'aurelle-pledge-reason')} onClick={() => { if (!reason) onPledge(c.id); }}>Pledge to {c.name}</button>}
    </li>)}</ul>
    {error && <p role="alert">{error}</p>}
  </section>;
}

export function AurelleRisingPanel() {
  const [state, setState] = useState<Snapshot | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try { const response = await fetch('/api/aurelle/rising', { cache: 'no-store', signal }); const data = await response.json() as Snapshot;
      if (!response.ok) throw Error(data.error ?? 'Claimants unavailable.'); setState(data); setError(''); }
    catch (e) { if (!(e instanceof Error && e.name === 'AbortError')) setError(e instanceof Error ? e.message : 'Claimants unavailable.'); }
  }, []);
  useEffect(() => { const controller = new AbortController(); const timer = setTimeout(() => void refresh(controller.signal), 0); return () => { clearTimeout(timer); controller.abort(); }; }, [refresh]);
  const onPledge = async (claimantId: string) => {
    setBusy(true);
    try { const response = await fetch('/api/aurelle/rising', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'aurelle-pledge', requestId: crypto.randomUUID(), claimantId }) });
      const data = await response.json() as Snapshot; if (data.claimants) setState(data); setError(response.ok ? '' : data.error ?? 'Pledge not saved.'); }
    catch { setError('Pledge status is uncertain. Refresh to check.'); }
    finally { setBusy(false); }
  };
  if (!state) return <section aria-label="Aurelle claimants and the Rising"><p role="status">{error || 'Loading claimants…'}</p></section>;
  if (!state.enabled) return null;
  return <AurelleRisingView state={state} busy={busy} error={error} onPledge={claimantId => void onPledge(claimantId)} />;
}

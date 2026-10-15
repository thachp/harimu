'use client';
import { useCallback, useEffect, useState } from 'react';
import type { AurelleRisingState } from '../lib/aurelle-rising';
import { disabledReasonProps } from '../lib/action-reasons';
import { GameTimer } from './game-timer';
import { AiBadge } from './ai-disclosure';
import { pledgeCard, risingStage } from '../lib/claimant-copy';
import { fillClaimantCopy } from '../lib/aurelle-rising';
import { coupStage } from '../lib/palace-coup-copy';

type Snapshot = AurelleRisingState & { error?: string; ok?: boolean };
const hours = (seconds: number) => Math.floor(seconds / 3600);

/** #71 view. Copy from Content #269 (lib/claimant-copy.ts); claimant persona data fills its placeholders. */
export function AurelleRisingView({ state, busy, error, onPledge }: { state: AurelleRisingState; busy: boolean; error: string; onPledge: (claimantId: string) => void }) {
  const rising = state.rising;
  const byId = (id: string) => state.claimants.find(c => c.id === id) ?? { name: rising?.claimantName ?? '', house: rising?.house ?? '', motto: '' };
  const reason = busy ? 'A pledge is being saved. Please wait.' : state.pledge.reason;
  return <section className="citizen-market" aria-label="Aurelle claimants and the Rising">
    {state.coup?.status === 'open' && <div role="status" aria-label="Palace coup banner" className="rising-banner">
      <h4>{coupStage('crisis-window-open')!.leaderPanel.label} <AiBadge /></h4>
      <p>{coupStage('crisis-window-open')!.leaderPanel.line.replaceAll('{leader}', 'The Crown')}</p>
      <GameTimer endsAt={state.coup.closesAt * 1000} label="Crisis Window closes" />
    </div>}
    {state.coup && state.coup.status !== 'open' && <p role="status" aria-label="Palace coup outcome">{coupStage(state.coup.status === 'succeeded' ? 'coup-succeeded' : 'coup-failed')!.leaderPanel.line.replaceAll('{newLeader}', state.coup.newLeader?.name ?? '').replaceAll('{house}', state.coup.newLeader?.house ?? '').replaceAll('{leader}', 'The Crown')}</p>}
    {rising?.status === 'open' && <div role="status" aria-label="Rising banner" className="rising-banner">
      <h4>{risingStage('crisis-window-open')!.notice}</h4>
      <p>{fillClaimantCopy(risingStage('crisis-window-open')!.claimantVoice, byId(rising.claimantId))}</p>
      <GameTimer endsAt={rising.closesAt * 1000} label="Crisis Window closes" />
    </div>}
    {rising && rising.status !== 'open' && <p role="status">{fillClaimantCopy(risingStage(rising.status === 'succeeded' ? 'rising-succeeded' : 'rising-failed')!.notice, byId(rising.claimantId))}</p>}
    <h3>Claimants of the rival houses</h3>
    <p>{pledgeCard.body.text} {pledgeCard.informerNote.text}</p>
    <p>A Rising opens when pledges behind one claimant reach {state.config.pledgeSharePct}% of this week&apos;s verified Aurelle citizens ({state.threshold ?? '—'} of {state.weeklyHumans}) and Unrest stays at {state.config.unrestThreshold} or more for {hours(state.config.unrestSustainSeconds)} real hours. Unrest now: {state.unrest ?? '—'} · sustained {hours(state.unrestSustainedSeconds)}h.</p>
    <p id="aurelle-pledge-reason" role="status">{reason ?? ''}</p>
    <ul>{state.claimants.map(c => <li key={c.id} aria-label={`Claimant ${c.name}`}>
      <strong>{fillClaimantCopy(pledgeCard.nameLine.text, c)}</strong> <AiBadge /> {c.crowned && '· crowned'}
      <p>{fillClaimantCopy(pledgeCard.motto.text, c)} · {c.grievance} {c.programme}</p>
      <p>Pledges: {c.pledges}{state.myPledge?.claimantId === c.id ? ' · your pledge' : ''}</p>
      {!c.crowned && state.myPledge?.claimantId !== c.id && <button type="button" {...disabledReasonProps(reason, 'aurelle-pledge-reason')} onClick={() => { if (!reason) onPledge(c.id); }} aria-label={`${pledgeCard.buttons.pledge} · ${c.name}`}>{pledgeCard.buttons.pledge}</button>}
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

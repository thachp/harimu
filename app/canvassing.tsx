'use client';
import { useCallback, useEffect, useState } from 'react';
import type { CanvassingSnapshot } from '../lib/canvassing';
import { canvassingCopy } from '../lib/campaign-copy';
import { NationDocument } from './nation-document';
import { AiBadge } from './ai-disclosure';
import { ActionButton } from './action-button';
import { SessionRetry, useLoadRetry } from './session-retry';
import { GameTimer } from './game-timer';

type Snapshot = CanvassingSnapshot & { eligibility?: { eligible: boolean; reason: string } };

/** #442: the Kindle canvassing panel. Presentational: the wrapper below owns fetching. Wording comes from `canvassingCopy` (#300); the few labels it lacks are marked for Content.
 *  Visibility is shown as a plain count per district and is display-only: nothing on this panel feeds a vote. */
export function CanvassingPanel({ snapshot, onStart, onComplete, busy, error }: { snapshot: Snapshot; onStart: () => void; onComplete: (questId: string) => void; busy: boolean; error: string }) {
  const party = snapshot.partyName ?? '', candidate = snapshot.candidate?.name ?? '';
  const fill = (text: string) => text.replace('{party}', party).replace('{candidate}', candidate).replace('{district}', snapshot.district.name);
  const quest = snapshot.today;
  const reason = busy ? 'Saving.' : snapshot.eligibility && !snapshot.eligibility.eligible ? snapshot.eligibility.reason : null;
  const startReason = reason ?? (snapshot.capacity < snapshot.cost ? `Canvassing costs ${snapshot.cost} Work Capacity.` : null);
  const mine = snapshot.visibility.find(v => v.candidateId === snapshot.candidate?.id);
  return <NationDocument nationId="kindle" className="ranked-ballot canvassing" label="Kindle canvassing">
    {!snapshot.member && <><h3>Canvassing</h3><p>Join a party to canvass for its candidate.</p></>}
    {snapshot.member && <>
      <h3>{fill(canvassingCopy.questTitle)} <AiBadge /></h3>
      <ul>{canvassingCopy.tasks.map(task => <li key={task.text}>{fill(task.text)}</li>)}</ul>
      <p>{canvassingCopy.note.text}</p>
      <p>Your district: {snapshot.district.name}.</p>
      {(!quest || quest.stage === 'none') && <ActionButton type="button" onClick={onStart} reason={startReason}>Start canvassing</ActionButton>}
      {quest?.stage === 'active' && <GameTimer endsAt={quest.completesAt * 1000} label="Quest finishes" />}
      {quest?.stage === 'ready' && <ActionButton type="button" onClick={() => onComplete(quest.id)} reason={reason}>Finish canvassing</ActionButton>}
      {quest?.stage === 'completed' && <p role="status">{fill(canvassingCopy.completion.text)} Come back tomorrow.</p>}
    </>}
    {mine && <section aria-label="Candidate visibility"><h4>{mine.candidateName} · visibility by district</h4>
      <ul>{mine.districts.map(d => <li key={d.districtId}>{d.districtName}: {d.points}</li>)}</ul></section>}
    {error && <p role="alert">{error}</p>}
  </NationDocument>;
}

/** Renders nothing while the flag is off (GET /api/canvassing answers 404). */
export function Canvassing() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const load = useLoadRetry(), { fail: loadFail, attempt: loadAttempt } = load;
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try { const response = await fetch('/api/canvassing', { cache: 'no-store', signal }); if (!response.ok) { if (response.status >= 500) loadFail(); setSnapshot(null); return; } setSnapshot(await response.json() as Snapshot); } catch { if (!signal?.aborted) loadFail(); /* the panel simply stays as it was; #928: Retry when there is nothing to show */ }
  }, [loadFail]);
  useEffect(() => { const controller = new AbortController(); const timer = setTimeout(() => void refresh(controller.signal), 0); return () => { clearTimeout(timer); controller.abort(); }; }, [refresh, loadAttempt]);
  if (!snapshot) return load.failed ? <SessionRetry name={'Kindle canvassing'} onRetry={load.retry} /> : null;
  const send = async (command: Record<string, unknown>) => {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/canvassing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...command, requestId: crypto.randomUUID() }) });
      const data = await response.json() as Snapshot & { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'That could not be saved.');
      setSnapshot(data);
    } catch (e) { setError(e instanceof Error ? e.message : 'Connection interrupted. Refresh to check.'); } finally { setBusy(false); }
  };
  return <CanvassingPanel snapshot={snapshot} busy={busy} error={error} onStart={() => void send({ action: 'start' })} onComplete={questId => void send({ action: 'complete', questId })} />;
}

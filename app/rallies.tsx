'use client';
// #867: Kindle rallies. Hidden unless GET /api/rallies answers (HARIMU_KINDLE_RALLIES_ENABLED on). Speeches are labeled AI.
import { useEffect, useState } from 'react';
import { SessionRetry, okOr5xx, useLoadRetry } from './session-retry';
import type { Rally } from '@/lib/rallies';

export function Rallies() {
  const [rallies, setRallies] = useState<Rally[] | null>(null), [eligible, setEligible] = useState(false), [note, setNote] = useState('');
  const load = useLoadRetry(), { fail: loadFail, attempt: loadAttempt } = load;
  useEffect(() => { fetch('/api/rallies').then(okOr5xx).then(r => r.ok ? r.json() as Promise<{ rallies?: Rally[]; eligible?: boolean }> : null).then(d => { setRallies(d?.rallies ?? null); setEligible(!!d?.eligible); }).catch(() => { setRallies(null); loadFail(); }); }, [loadAttempt, loadFail]); // #928: a 5xx or offline load offers Retry
  if (!rallies) return load.failed ? <SessionRetry name={'Campaign rallies'} onRetry={load.retry} /> : null;
  const attend = async (rallyId: string) => {
    const res = await fetch('/api/rallies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rallyId }) });
    const data = await (res.json() as Promise<{ rallies?: Rally[]; error?: string }>).catch(() => ({ error: String(res.status) }) as { rallies?: Rally[]; error?: string });
    if (res.ok && data.rallies) { setRallies(data.rallies); setNote(''); } else setNote(data.error ?? '');
  };
  return <section className="rallies" aria-label="Campaign rallies">
    <h3>Campaign rallies</h3>
    <p>Rallies are for visibility only. They never change votes.</p>
    <ul>{rallies.map(r => <li key={r.id}><strong>{r.candidateName}</strong> in {r.cityName}, {new Date(r.startsAt * 1000).toLocaleString()} · crowd {r.crowd} ({r.humans} citizens, {r.aiCrowd} AI citizens)
      <p><span className="ai-badge">AI</span> {r.speech.text}</p>
      {eligible && <button type="button" aria-pressed={r.attending} disabled={r.attending} onClick={() => void attend(r.id)}>{r.attending ? 'Attending' : 'Attend'}</button>}</li>)}</ul>
    {note && <p role="status">{note}</p>}
  </section>;
}

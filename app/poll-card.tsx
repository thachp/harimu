'use client';
// #740 slice 1: Kindle poll card. Hidden unless GET /api/polling answers (HARIMU_KINDLE_POLLING_ENABLED on). Strings from lib/kindle-polling-copy.ts.
import { useEffect, useState } from 'react';
import { pollCard, voterIntentPrompt as P } from '@/lib/kindle-polling-copy';
import type { PollView } from '@/lib/polling';

export function PollCard() {
  const [view, setView] = useState<PollView | null>(null), [eligible, setEligible] = useState(false), [note, setNote] = useState('');
  const load = (d: { polling?: PollView | null; eligible?: boolean } | null) => { setView(d?.polling ?? null); if (d?.eligible !== undefined) setEligible(d.eligible); };
  useEffect(() => { fetch('/api/polling').then(r => r.ok ? r.json() as Promise<{ polling?: PollView; eligible?: boolean }> : null).then(load).catch(() => setView(null)); }, []);
  if (!view) return null;
  const send = async (body: Record<string, unknown>) => {
    const res = await fetch('/api/polling', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await (res.json() as Promise<{ polling?: PollView; error?: string }>).catch(() => ({ error: String(res.status) }));
    if (res.ok) { load(data as { polling?: PollView }); setNote(body.action === 'answer' ? P.thanks.text : P.voluntary.text); } else setNote(data.error ?? '');
  };
  return <section className="poll-card" aria-label={pollCard.title}>
    <h3>{pollCard.title}</h3>
    {view.poll ? <>
      <ul>{view.poll.shares.map(s => <li key={s.candidateId}>{s.name}: {s.share}%</li>)}</ul>
      <p>{pollCard.margin.replace('{margin}', `${view.poll.marginBand} pts or less`)}</p>
      <p>{pollCard.marginExplainer.text} {pollCard.sampleExplainer.text}</p>
    </> : <p>{pollCard.empty.text}</p>}
    {view.open && eligible && <fieldset><legend>{P.title}</legend>
      <p>{P.question.text}</p>
      {view.candidates.map(c => <button key={c.id} type="button" aria-pressed={view.myAnswer === c.id} onClick={() => void send({ action: 'answer', candidateId: c.id, requestId: crypto.randomUUID() })}>{c.name}</button>)}
      <button type="button" onClick={() => void send({ action: 'decline' })}>{P.declineButton}</button>
      <p>{P.voluntary.text} {P.notAVote.text} {P.privacy.text}</p>
    </fieldset>}
    {note && <p role="status">{note}</p>}
  </section>;
}

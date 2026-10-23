'use client';
// #831: Kindle party plank up-votes. Hidden unless GET /api/planks answers (HARIMU_PLANK_VOTES_ENABLED on) and the citizen is a party member.
import { useEffect, useState } from 'react';
import type { PlankView } from '@/lib/plank-votes';

export function PlankVotes() {
  const [view, setView] = useState<PlankView | null>(null), [eligible, setEligible] = useState(false), [note, setNote] = useState('');
  useEffect(() => { fetch('/api/planks').then(r => r.ok ? r.json() as Promise<{ planks?: PlankView; eligible?: boolean }> : null).then(d => { setView(d?.planks ?? null); setEligible(!!d?.eligible); }).catch(() => setView(null)); }, []);
  if (!view?.party) return null;
  const send = async (action: 'upvote' | 'withdraw', pledgeKey: string) => {
    const res = await fetch('/api/planks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, pledgeKey }) });
    const data = await (res.json() as Promise<{ planks?: PlankView; error?: string }>).catch(() => ({ error: String(res.status) }) as { planks?: PlankView; error?: string });
    if (res.ok && data.planks) { setView(data.planks); setNote(''); } else setNote(data.error ?? '');
  };
  return <section className="plank-votes" aria-label={`${view.party.name} platform planks`}>
    <h3>{view.party.name}: platform planks</h3>
    <p>Up-vote up to {view.max} planks for the party AI to consider. Up-votes are not votes.</p>
    <ul>{view.planks.map(p => { const mine = view.mine.includes(p.key); return <li key={p.key}>{p.card} ({p.votes})
      {eligible && <button type="button" aria-pressed={mine} onClick={() => void send(mine ? 'withdraw' : 'upvote', p.key)}>{mine ? 'Withdraw' : 'Up-vote'}</button>}</li>; })}</ul>
    {note && <p role="status">{note}</p>}
  </section>;
}

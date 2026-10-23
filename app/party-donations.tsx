'use client';
// #863: Kindle campaign donations. Hidden unless GET /api/party-donations answers (HARIMU_PARTY_DONATIONS_ENABLED on). Every donation is listed publicly.
import { useEffect, useState } from 'react';
import type { DonationView } from '@/lib/party-donations';

const spk = (minor: number) => (minor / 100).toFixed(2);
export function PartyDonations() {
  const [view, setView] = useState<DonationView | null>(null), [eligible, setEligible] = useState(false), [note, setNote] = useState(''), [amount, setAmount] = useState('10');
  useEffect(() => { fetch('/api/party-donations').then(r => r.ok ? r.json() as Promise<{ donations?: DonationView; eligible?: boolean }> : null).then(d => { setView(d?.donations ?? null); setEligible(!!d?.eligible); }).catch(() => setView(null)); }, []);
  if (!view) return null;
  const give = async (partyId: string) => {
    const amountMinor = Math.round(Number(amount) * 100);
    const res = await fetch('/api/party-donations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ partyId, amountMinor, requestId: crypto.randomUUID() }) });
    const data = await (res.json() as Promise<{ donations?: DonationView; error?: string }>).catch(() => ({ error: String(res.status) }) as { donations?: DonationView; error?: string });
    if (res.ok && data.donations) { setView(data.donations); setNote('Thank you. Your donation is listed publicly.'); } else setNote(data.error ?? '');
  };
  return <section className="party-donations" aria-label="Campaign donations">
    <h3>Campaign donations</h3>
    <p>Donations pay for ads and rallies. They never buy votes. Every donation is public. Limit {spk(view.capMinor)} SPK per party each week.</p>
    {eligible && <label>Amount (SPK) <input type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></label>}
    <ul>{view.parties.map(p => <li key={p.id}><strong>{p.name}</strong>: raised {spk(p.raisedMinor)} SPK
      {eligible && <button type="button" onClick={() => void give(p.id)}>Donate</button>}
      {p.recent.length > 0 && <ul>{p.recent.map((d, i) => <li key={i}>{d.donor} gave {spk(d.amountMinor)} SPK on {new Date(d.donatedAt * 1000).toLocaleString()}</li>)}</ul>}</li>)}</ul>
    {note && <p role="status">{note}</p>}
  </section>;
}

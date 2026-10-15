'use client';
import { useCallback, useEffect, useState } from 'react';
import type { AssemblySnapshot } from '../lib/assembly';
import { ballotExplainer, resultsCaption } from '../lib/assembly-copy';
import { NationDocument } from './nation-document';
import { AiBadge } from './ai-disclosure';
import { ActionButton } from './action-button';
import { GameTimer } from './game-timer';

type Snapshot = AssemblySnapshot & { eligibility?: { eligible: boolean; reason: string }; error?: string };

/** #283: the Kindle mid-term Assembly ballot and published count. Presentational: the wrapper below owns fetching. */
export function AssemblyPanel({ snapshot, selected, onSelect, onVote, reason, error }: { snapshot: Snapshot; selected: string; onSelect: (partyId: string) => void; onVote: () => void; reason: string | null; error?: string }) {
  const name = (id: string) => snapshot.parties.find(p => p.id === id)?.name ?? id;
  const result = snapshot.result;
  return <NationDocument nationId="kindle" className="ranked-ballot assembly-ballot" label="Kindle mid-term Assembly">
    <h3>{ballotExplainer.title}</h3>
    {ballotExplainer.lines.map(line => <p key={line.text}>{line.text}</p>)}
    <p>{ballotExplainer.aiNote.text}</p>
    <ul className="ballot-candidates">{snapshot.parties.map(party => <li key={party.id}><h4>{party.name} <AiBadge /></h4><p>{party.ideology}</p></li>)}</ul>
    <p>Your district: {snapshot.yourDistrict.name}. {snapshot.seats.up} of {snapshot.seats.perDistrict} seats in each district are up.</p>
    {snapshot.status === 'waiting' && <p>Voting has not opened yet.</p>}
    {snapshot.status === 'open' && snapshot.closesAt !== null && <GameTimer endsAt={snapshot.closesAt * 1000} label="Voting closes" />}
    {snapshot.voted && <p className="i-voted" role="status">I Voted · your receipt is recorded.</p>}
    {snapshot.status === 'open' && !snapshot.voted && <form onSubmit={event => { event.preventDefault(); if (!reason && selected) onVote(); }}>
      <fieldset><legend>Pick one party list</legend>
        {snapshot.parties.map(party => <label key={party.id}><input type="radio" name="assembly-party" value={party.id} checked={selected === party.id} onChange={() => onSelect(party.id)} /> {party.name}</label>)}
      </fieldset>
      <ActionButton type="submit" reason={reason ?? (selected ? null : 'Pick one party list.')}>Cast ballot</ActionButton>
    </form>}
    {error && <p role="alert">{error}</p>}
    {snapshot.status === 'closed' && result && <section aria-label="Published Assembly count">
      <p>{resultsCaption.humanAndBloc.text} {resultsCaption.districtCounts.text}</p>
      {result.districts.map(d => <div key={d.districtId}><h4>{d.name}</h4>
        <table><thead><tr><th>Party list</th><th>Human votes</th><th>AI bloc</th><th>Seats won</th><th>Seats now</th></tr></thead>
          <tbody>{snapshot.parties.map(p => <tr key={p.id}><td>{name(p.id)}</td><td>{d.human[p.id]}</td><td>{d.bloc[p.id]}</td><td>{d.seatsWon[p.id]}</td><td>{d.seatsAfter[p.id]}</td></tr>)}</tbody></table>
        {!d.contested && <p>No ballots were cast here, so the seats up stay as they were.</p>}
      </div>)}
      <h4>Republic Wire Service</h4>
      <ul>{snapshot.headlines.map(h => <li key={`${h.districtId}:${h.partyId}`}><strong>{h.headline}</strong> {h.body}</li>)}</ul>
    </section>}
    {snapshot.status === 'closed' && !result && <p>The count is not available yet.</p>}
  </NationDocument>;
}

/** Renders nothing while the flag is off (GET /api/assembly answers 404). */
export function AssemblyBallot() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null), [selected, setSelected] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try { const response = await fetch('/api/assembly', { cache: 'no-store', signal }); if (!response.ok) { setSnapshot(null); return; } setSnapshot(await response.json() as Snapshot); } catch { /* the panel simply stays as it was */ }
  }, []);
  useEffect(() => { const controller = new AbortController(); const timer = setTimeout(() => void refresh(controller.signal), 0); return () => { clearTimeout(timer); controller.abort(); }; }, [refresh]);
  if (!snapshot) return null;
  const reason = busy ? 'Saving your ballot.' : !snapshot.privacyReady ? snapshot.privacyReason : snapshot.eligibility && !snapshot.eligibility.eligible ? snapshot.eligibility.reason : null;
  const vote = async () => {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/assembly', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'vote', electionId: snapshot.id, requestId: crypto.randomUUID(), partyId: selected }) });
      const data = await response.json() as Snapshot;
      if (!response.ok) throw new Error(data.error ?? 'Ballot could not be confirmed.');
      setSnapshot(data);
    } catch (e) { setError(e instanceof Error ? e.message : 'Connection interrupted. Refresh to check your ballot status.'); } finally { setBusy(false); }
  };
  return <AssemblyPanel snapshot={snapshot} selected={selected} onSelect={setSelected} onVote={() => void vote()} reason={reason} error={error} />;
}

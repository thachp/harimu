'use client';
import { useCallback, useEffect, useState } from 'react';
import type { PrimarySnapshot } from '../lib/primaries';
import { primariesCopy } from '../lib/campaign-copy';
import { NationDocument } from './nation-document';
import { AiBadge } from './ai-disclosure';
import { ActionButton } from './action-button';
import { GameTimer } from './game-timer';

type Snapshot = PrimarySnapshot & { eligibility?: { eligible: boolean; reason: string }; error?: string };
const validOrder = (ranking: string[], ids: string[]) => ranking.length === ids.length && ids.every(id => ranking.includes(id));

/** #307: the members-only primary card: join or leave one AI party, rank your own party's hopefuls, read the published count.
 *  Presentational: the wrapper below owns fetching. */
export function PrimaryPanel({ snapshot, ranking, onRank, onJoin, onLeave, onVote, reason, error }: { snapshot: Snapshot; ranking: string[]; onRank: (position: number, id: string) => void; onJoin: (partyId: string) => void; onLeave: () => void; onVote: () => void; reason: string | null; error?: string }) {
  const own = snapshot.hopefuls.filter(h => h.partyId === snapshot.yourParty), ownIds = own.map(h => h.id);
  const partyName = (id: string) => snapshot.parties.find(p => p.id === id)?.name ?? id;
  const hopefulName = (id: string) => snapshot.hopefuls.find(h => h.id === id)?.name ?? id;
  const complete = validOrder(ranking, ownIds);
  const frozen = snapshot.canChangeParty ? null : 'Party membership is frozen while a primary is open.';
  return <NationDocument nationId="kindle" className="ranked-ballot primary-card" label="Kindle party primaries">
    <h3>{primariesCopy.title}</h3>
    {primariesCopy.explainer.map(line => <p key={line.text}>{line.text}</p>)}
    <ul className="ballot-candidates">{snapshot.parties.map(party => <li key={party.id}>
      <h4>{party.name} <AiBadge /></h4><p>{party.ideology} · {party.members} {party.members === 1 ? 'member' : 'members'}</p>
      {snapshot.yourParty === party.id ? <><p role="status">You are a member.</p><ActionButton type="button" reason={frozen} onClick={onLeave}>Leave {party.name}</ActionButton></>
        : <ActionButton type="button" reason={frozen} onClick={() => onJoin(party.id)}>{snapshot.yourParty ? `Switch to ${party.name}` : `Join ${party.name}`}</ActionButton>}
    </li>)}</ul>
    {snapshot.status === 'waiting' && <p>The primary has not opened yet.</p>}
    {snapshot.status === 'open' && snapshot.closesAt !== null && <GameTimer endsAt={snapshot.closesAt * 1000} label="Primary closes" />}
    {snapshot.voted && <p className="i-voted" role="status">I Voted · your receipt is recorded.</p>}
    {snapshot.status === 'open' && !snapshot.voted && (snapshot.yourParty
      ? <form onSubmit={event => { event.preventDefault(); if (!reason && complete) onVote(); }}>
        <h4>Rank the {partyName(snapshot.yourParty)} hopefuls</h4>
        {own.map(h => <p key={h.id}>{h.name} <AiBadge /> · {h.platform}</p>)}
        {own.map((_, position) => <label key={position}>Choice {position + 1}
          <select value={ranking[position] ?? ''} onChange={event => onRank(position, event.target.value)}><option value="">Pick a hopeful</option>{own.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label>)}
        <ActionButton type="submit" reason={reason ?? (complete ? null : 'Rank every hopeful exactly once.')}>Cast primary ballot</ActionButton>
      </form>
      : <p>Join a party to vote in its primary.</p>)}
    {error && <p role="alert">{error}</p>}
    {snapshot.status === 'closed' && snapshot.result && <section aria-label="Published primary count">
      {snapshot.result.parties.map(p => <div key={p.partyId}><h4>{partyName(p.partyId)}</h4>
        <p>{p.ballots} of {p.members} members voted. {p.decided ? `Nominee: ${hopefulName(p.nominee)}.` : `No ballots were cast, so ${hopefulName(p.nominee)} stays the nominee.`}</p>
        <ol>{p.runoff.rounds.map((round, i) => <li key={i}>Round {i + 1}: {p.hopefuls.filter(h => h.id in round.human).map(h => `${h.name} ${round.human[h.id]}`).join(', ')}{round.eliminated ? ` · ${hopefulName(round.eliminated)} out` : ''}</li>)}</ol></div>)}
      <ul>{snapshot.announcements.map(a => <li key={a.partyId}>{a.text}</li>)}</ul>
    </section>}
  </NationDocument>;
}

/** Renders nothing while the flag is off (GET /api/primaries answers 404). */
export function PrimaryCard() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null), [ranking, setRanking] = useState<string[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try { const response = await fetch('/api/primaries', { cache: 'no-store', signal }); if (!response.ok) { setSnapshot(null); return; } setSnapshot(await response.json() as Snapshot); } catch { /* the card simply stays as it was */ }
  }, []);
  useEffect(() => { const controller = new AbortController(); const timer = setTimeout(() => void refresh(controller.signal), 0); return () => { clearTimeout(timer); controller.abort(); }; }, [refresh]);
  if (!snapshot) return null;
  const reason = busy ? 'Saving.' : !snapshot.privacyReady ? snapshot.privacyReason : snapshot.eligibility && !snapshot.eligibility.eligible ? snapshot.eligibility.reason : null;
  const send = async (command: Record<string, unknown>) => {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/primaries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command) });
      const data = await response.json() as Snapshot;
      if (!response.ok) throw new Error(data.error ?? 'That could not be confirmed.');
      setSnapshot(data); setRanking([]);
    } catch (e) { setError(e instanceof Error ? e.message : 'Connection interrupted. Refresh to check.'); } finally { setBusy(false); }
  };
  const rank = (position: number, id: string) => setRanking(current => { const next = [...current]; next[position] = id; return next; });
  return <PrimaryPanel snapshot={snapshot} ranking={ranking} onRank={rank} onJoin={partyId => void send({ action: 'join', partyId })} onLeave={() => void send({ action: 'leave' })}
    onVote={() => void send({ action: 'vote', electionId: snapshot.id, requestId: crypto.randomUUID(), ranking })} reason={reason} error={error} />;
}

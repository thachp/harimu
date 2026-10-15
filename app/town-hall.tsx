'use client';
import { useCallback, useEffect, useState } from 'react';
import type { TownHall, TownHallSnapshot } from '../lib/town-hall';
import { townHallCopy } from '../lib/campaign-copy';
import { NationDocument } from './nation-document';
import { AiBadge, AiTextTag } from './ai-disclosure';
import { ActionButton } from './action-button';
import { GameTimer } from './game-timer';

type Snapshot = TownHallSnapshot & { eligibility?: { eligible: boolean; reason: string } };
const QUESTION_MAX = 200; // mirrors lib/town-hall-rules.ts (kept literal so this client module imports types only)
const say = (lines: readonly { text: string }[], index: number, candidate: string) => lines[index % lines.length].text.replace('{candidate}', candidate);

function AskForm({ hall, reason, onAsk }: { hall: TownHall; reason: string | null; onAsk: (candidateId: string, text: string) => void }) {
  const [text, setText] = useState('');
  return <form onSubmit={event => { event.preventDefault(); if (!reason && text.trim().length >= 10) onAsk(hall.candidateId, text.trim()); }}>
    <label>Your question for {hall.candidateName}<textarea value={text} maxLength={QUESTION_MAX} onChange={event => setText(event.target.value)} /></label>
    <ActionButton type="submit" reason={reason ?? (text.trim().length >= 10 ? null : 'Write at least 10 characters.')}>Ask</ActionButton>
  </form>;
}

/** #441: the Kindle town halls. Presentational: the wrapper below owns fetching. Wording comes from `townHallCopy` (#300); the few labels it lacks are marked for Content. */
export function TownHallPanel({ snapshot, onAsk, onVote, busy, error }: { snapshot: Snapshot; onAsk: (candidateId: string, text: string) => void; onVote: (questionId: string) => void; busy: boolean; error: string }) {
  const writeReason = busy ? 'Saving.' : snapshot.eligibility && !snapshot.eligibility.eligible ? snapshot.eligibility.reason : null;
  return <NationDocument nationId="kindle" className="ranked-ballot town-hall" label="Kindle town halls">
    <h3>{townHallCopy.title}</h3>
    {snapshot.halls.map((hall, index) => <section key={hall.id} aria-label={`Town hall: ${hall.candidateName}`}>
      <h4>{hall.candidateName} <AiBadge /></h4>
      <p>{hall.platform}</p>
      <p>{townHallCopy.aiDisclosure.text.replace('{candidate}', hall.candidateName)}</p>
      {hall.stage === 'waiting' && <p>This town hall has not opened yet.</p>}
      {hall.stage === 'open' && <><p>{say(townHallCopy.callForQuestions, index, hall.candidateName)}</p>
        {hall.closesAt !== null && <GameTimer endsAt={hall.closesAt * 1000} label="Questions close" />}
        {hall.asked ? <p className="i-voted" role="status">Your question is posted.</p> : <AskForm hall={hall} reason={writeReason} onAsk={onAsk} />}</>}
      {hall.stage === 'closed' && <><p>{say(townHallCopy.questionsClosed, index, hall.candidateName)}</p>
        {hall.questions.some(q => q.selected) && <p>{say(townHallCopy.answersIntro, index, hall.candidateName)}</p>}</>}
      {hall.stage !== 'waiting' && hall.questions.length === 0 && <p>No questions yet.</p>}
      <ol>{hall.questions.map(q => <li key={q.id}>
        <p>{q.text} <small>{q.votes} {q.votes === 1 ? 'vote' : 'votes'}</small>{q.mine && <small> · yours</small>}</p>
        {hall.stage === 'open' && !q.mine && <ActionButton type="button" onClick={() => onVote(q.id)} reason={q.voted ? 'You voted for this question.' : writeReason}>Up-vote</ActionButton>}
        {q.answer && <blockquote><AiTextTag provenance="model" /> {q.answer.text}</blockquote>}
        {!q.answer && q.answerStatus === 'pending' && <p>No answer yet.</p>}
      </li>)}</ol>
    </section>)}
    {error && <p role="alert">{error}</p>}
  </NationDocument>;
}

/** Renders nothing while the flag is off (GET /api/town-hall answers 404). */
export function TownHalls() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try { const response = await fetch('/api/town-hall', { cache: 'no-store', signal }); if (!response.ok) { setSnapshot(null); return; } setSnapshot(await response.json() as Snapshot); } catch { /* the panel simply stays as it was */ }
  }, []);
  useEffect(() => { const controller = new AbortController(); const timer = setTimeout(() => void refresh(controller.signal), 0); return () => { clearTimeout(timer); controller.abort(); }; }, [refresh]);
  if (!snapshot) return null;
  const send = async (command: Record<string, unknown>) => {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/town-hall', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...command, requestId: crypto.randomUUID() }) });
      const data = await response.json() as Snapshot & { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'That could not be saved.');
      setSnapshot(data);
    } catch (e) { setError(e instanceof Error ? e.message : 'Connection interrupted. Refresh to check.'); } finally { setBusy(false); }
  };
  return <TownHallPanel snapshot={snapshot} busy={busy} error={error} onAsk={(candidateId, text) => void send({ action: 'ask', candidateId, text })} onVote={questionId => void send({ action: 'vote', questionId })} />;
}

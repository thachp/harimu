'use client';
import { useCallback, useEffect, useState } from 'react';
import type { DebateSnapshot } from '../lib/debate';
import { factCheckCopy, fallbackNotice, moderatorCopy, questionIntakeCopy } from '../lib/debate-copy';
import { NationDocument } from './nation-document';
import { AiBadge, AiTextTag } from './ai-disclosure';
import { ActionButton } from './action-button';
import { SessionRetry, useLoadRetry } from './session-retry';
import { GameTimer } from './game-timer';

type Snapshot = DebateSnapshot & { eligibility?: { eligible: boolean; reason: string } };
const QUESTION_MAX = 200; // mirrors lib/town-hall-rules.ts (kept literal so this client module imports types only)
const verdictLabel = { matches: factCheckCopy.labels.matches, differs: factCheckCopy.labels.differs } as const;

function AskForm({ reason, onAsk }: { reason: string | null; onAsk: (text: string) => void }) {
  const [text, setText] = useState('');
  return <form onSubmit={event => { event.preventDefault(); if (!reason && text.trim().length >= 10) onAsk(text.trim()); }}>
    <label>{questionIntakeCopy.submitLabel}<textarea value={text} maxLength={QUESTION_MAX} onChange={event => setText(event.target.value)} /></label>
    <p>{questionIntakeCopy.submitPrompt.text}</p>
    <ActionButton type="submit" reason={reason ?? (text.trim().length >= 10 ? null : 'Write at least 10 characters.')}>{questionIntakeCopy.submitButton}</ActionButton>
  </form>;
}

/** #282: the Kindle presidential debate. Presentational: the wrapper below owns fetching. Wording is `lib/debate-copy.ts` (#285); the few small labels it lacks are marked for Content. */
export function DebatePanel({ snapshot, onAsk, onVote, busy, error }: { snapshot: Snapshot; onAsk: (text: string) => void; onVote: (questionId: string) => void; busy: boolean; error: string }) {
  const { debate } = snapshot;
  const notEligible = snapshot.eligibility && !snapshot.eligibility.eligible;
  const writeReason = busy ? 'Saving.' : notEligible ? questionIntakeCopy.notEligible.text : null;
  return <NationDocument nationId="kindle" className="ranked-ballot debate" label="Kindle presidential debate">
    <h3>Presidential debate</h3>{/* label: Content */}
    {debate.stage === 'waiting' && <p>The debate has not opened yet.</p>}{/* label: Content */}
    {debate.stage === 'open' && <><p>{questionIntakeCopy.upvoteHint.text}</p>
      {debate.closesAt !== null && <GameTimer endsAt={debate.closesAt * 1000} label="Questions close" />}
      {debate.asked ? <p className="i-voted" role="status">{questionIntakeCopy.submitted.text}</p> : <AskForm reason={writeReason} onAsk={onAsk} />}
      {debate.questions.length === 0 && <p>No questions yet.</p>}
      <ol>{debate.questions.map(q => <li key={q.id}>
        <p>{q.text} <small>{q.votes} {q.votes === 1 ? 'vote' : 'votes'}</small>{q.mine && <small> · yours</small>}</p>
        {!q.mine && <ActionButton type="button" onClick={() => onVote(q.id)} reason={q.voted ? questionIntakeCopy.alreadyVoted.text : writeReason}>{questionIntakeCopy.upvoteButton}</ActionButton>}
      </li>)}</ol></>}
    {debate.stage === 'closed' && <>
      <p>{moderatorCopy.open[0].text}</p>
      {debate.transcript === null && <p>No questions were asked.</p>}{/* label: Content */}
      {debate.usingFallback && <p>{fallbackNotice.text}</p>}
      {debate.transcript !== null && <><h4>{factCheckCopy.panelTitle}</h4><p>{factCheckCopy.explainer.text}</p></>}
      <ol>{(debate.transcript ?? []).map((item, index) => <li key={item.questionId}>
        <p>{moderatorCopy.questionIntro[index % moderatorCopy.questionIntro.length].text}</p>
        <p>{item.text} <small>{item.votes} {item.votes === 1 ? 'vote' : 'votes'}</small></p>
        {item.answers.map(answer => <blockquote key={answer.candidateId}>
          <p><strong>{answer.candidateName}</strong> <AiBadge /> {answer.source === 'ai' && <AiTextTag provenance="model" />}</p>
          <p>{answer.text}</p>
          {answer.factChecks.map((check, i) => <p key={i} className="fact-check"><small>{factCheckCopy.labels.claim}: {check.claim} · {factCheckCopy.labels.systemFigure}: {check.systemFigure}{check.verdict && ` · ${verdictLabel[check.verdict]}`}</small></p>)}
        </blockquote>)}
      </li>)}</ol>
      {debate.transcript !== null && <p>{moderatorCopy.close[0].text}</p>}</>}
    {error && <p role="alert">{error}</p>}
  </NationDocument>;
}

/** Renders nothing while the flag is off (GET /api/debate answers 404). */
export function Debate() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const load = useLoadRetry(), { fail: loadFail, attempt: loadAttempt } = load;
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try { const response = await fetch('/api/debate', { cache: 'no-store', signal }); if (!response.ok) { if (response.status >= 500) loadFail(); setSnapshot(null); return; } setSnapshot(await response.json() as Snapshot); } catch { if (!signal?.aborted) loadFail(); /* the panel simply stays as it was; #928: Retry when there is nothing to show */ }
  }, [loadFail]);
  useEffect(() => { const controller = new AbortController(); const timer = setTimeout(() => void refresh(controller.signal), 0); return () => { clearTimeout(timer); controller.abort(); }; }, [refresh, loadAttempt]);
  if (!snapshot) return load.failed ? <SessionRetry name={'Kindle presidential debate'} onRetry={load.retry} /> : null;
  const send = async (command: Record<string, unknown>) => {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/debate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...command, requestId: crypto.randomUUID() }) });
      const data = await response.json() as Snapshot & { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'That could not be saved.');
      setSnapshot(data);
    } catch (e) { setError(e instanceof Error ? e.message : 'Connection interrupted. Refresh to check.'); } finally { setBusy(false); }
  };
  return <DebatePanel snapshot={snapshot} busy={busy} error={error} onAsk={text => void send({ action: 'ask', text })} onVote={questionId => void send({ action: 'vote', questionId })} />;
}

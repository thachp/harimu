'use client';
// #599 slice 2: the Diplomatic Hall panel (Kindle and Aurelle citizens). All player-facing lines come from the #606 copy module; "Remove" and "Posting…" are plain placeholders for Content.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDisplayTimestamp } from './display-preferences';
import { NationCrest } from './nation-crest';
import { hallChrome, hallComposer, hallExplainer, hallRefusalFor, HALL_NAME_MAX, type HallRefusalKey } from '../lib/diplomatic-hall-copy';
import { nationMark } from '../lib/nation-themes';
import { validSquareText } from '../lib/square-chat-validation';

type HallPost = { id: string; handle: string; nationId: string; body: string; postedAt: number; mine: boolean };
const fill = (template: string, nation: string) => template.replace('{nation}', nation.slice(0, HALL_NAME_MAX));
const nationName = (id: string) => nationMark(id)?.name ?? id;
/** One post: crest and "{nation} citizen" next to the handle. Exported for the render tests. */
export function HallPostRow({ post, onRemove, formatTime, disabled }: { post: HallPost; onRemove?: (id: string) => void; formatTime: (ms: number) => string; disabled?: boolean }) {
  const name = nationName(post.nationId);
  return <li><div><NationCrest id={post.nationId} size={20} /> <strong>{post.handle}</strong> <span aria-label={fill(hallComposer.nationTag.accessibleName, name)}>{fill(hallComposer.nationTag.text, name)}</span> <time dateTime={new Date(post.postedAt * 1000).toISOString()}>{formatTime(post.postedAt * 1000)}</time></div>
    <p>{post.body}</p>{post.mine && onRemove && <button type="button" disabled={disabled} onClick={() => onRemove(post.id)}>Remove</button>}</li>;
}

export function DiplomaticHall() {
  const formatTime = useDisplayTimestamp();
  const [posts, setPosts] = useState<HallPost[] | null>(null), [text, setText] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const intent = useRef<{ id: string; text: string } | null>(null), busyRef = useRef(false);
  const call = useCallback(async (init?: RequestInit) => {
    const response = await fetch('/api/diplomatic-hall', { cache: 'no-store', ...init });
    const data = await response.json() as { messages?: HallPost[]; error?: string; reason?: string };
    if (!response.ok) throw new Error(hallRefusalFor(data.reason as HallRefusalKey)?.line.text.replace('{max}', '280') ?? data.error ?? 'The Diplomatic Hall could not be loaded.');
    return data.messages ?? [];
  }, []);
  useEffect(() => {
    let live = true; const load = () => { if (!busyRef.current) call().then(next => { if (live && !busyRef.current) setPosts(next); }).catch(e => { if (live) setError(e instanceof Error ? e.message : String(e)); }); };
    const first = setTimeout(load, 0), timer = setInterval(() => { if (!document.hidden) load(); }, 15000);
    return () => { live = false; clearTimeout(first); clearInterval(timer); };
  }, [call]);
  async function send(payload: Record<string, unknown>, onDone?: () => void) {
    if (busyRef.current) return; busyRef.current = true; setBusy(true); setError('');
    try { setPosts(await call({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })); onDone?.(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Connection uncertain. Retry the same message.'); }
    finally { busyRef.current = false; setBusy(false); }
  }
  const submit = () => { const pending = intent.current?.text === text.trim() ? intent.current : { id: crypto.randomUUID(), text: text.trim() }; intent.current = pending; void send({ action: 'post', id: pending.id, text: pending.text }, () => { intent.current = null; setText(''); }); };
  const canSend = !busy && validSquareText(text);
  return <section className="square-chat" aria-labelledby="diplomatic-hall-title"><h3 id="diplomatic-hall-title">{hallChrome.headerTitle}</h3><p>{hallExplainer.line.text} {hallExplainer.nationNote.text}</p>
    <ol aria-label="Recent Diplomatic Hall posts">{posts?.map(post => <HallPostRow key={post.id} post={post} formatTime={formatTime} disabled={busy} onRemove={id => void send({ action: 'delete', id })} />)}</ol>
    {posts && !posts.length && <p>{hallChrome.emptyState.text}</p>}
    <form onSubmit={e => { e.preventDefault(); if (canSend) submit(); }}>
      <label>{hallComposer.placeholder}<textarea value={text} maxLength={280} onChange={e => setText(e.target.value)} placeholder={hallComposer.placeholder} /></label>
      <button type="submit" disabled={!canSend}>{busy ? 'Posting…' : hallComposer.sendButton}</button>
    </form>
    {error && <p role="alert">{error}</p>}
  </section>;
}

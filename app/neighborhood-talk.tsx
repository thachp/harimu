'use client';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useDisplayTimestamp } from './display-preferences';
import { validSquareText } from '@/lib/square-chat-validation';
import { ReportButton } from './report-button';
type Msg = { id: string; handle: string; body: string; postedAt: number; mine: boolean };
type State = { cityId: string; messages: Msg[]; reportsEnabled?: boolean; error?: string };
const unavailable = 'City conversation unavailable.';
/** #1445 slice 2. Opens the existing city channel (/api/city-chat). It is the current city, not a line with one resident. */
export function NeighborhoodCityTalk({ cityName }: { cityName: string }) {
  const formatTime = useDisplayTimestamp();
  const [state, setState] = useState<State | null>(null), [text, setText] = useState(''), [error, setError] = useState(''), [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const button = useRef<HTMLButtonElement>(null), field = useRef<HTMLTextAreaElement>(null), intent = useRef<string | null>(null), posting = useRef(false);
  useEffect(() => { if (!open) return; let live = true; void fetch('/api/city-chat', { cache: 'no-store' }).then(async response => { const data = await response.json() as State; if (!live) return; if (!response.ok) throw Error(typeof data.error === 'string' ? data.error : unavailable); setState(data); setError(''); }).catch(reason => { if (live) setError(reason instanceof Error ? reason.message : unavailable); }); return () => { live = false; }; }, [open]);
  useEffect(() => { if (open) field.current?.focus(); }, [open]);
  async function command(body: Record<string, unknown>, posted = false) {
    if (busy || posting.current) return; posting.current = true; setBusy(true);
    try { const response = await fetch('/api/city-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const data = await response.json() as State; if (!response.ok) { if (posted) intent.current = null; setError(typeof data.error === 'string' ? data.error : unavailable); return; } setState(data); setError(''); if (posted) { intent.current = null; setText(''); } }
    catch { setError(unavailable); } finally { posting.current = false; setBusy(false); }
  }
  const send = (event: FormEvent) => { event.preventDefault(); if (!state || busy || posting.current || !validSquareText(text)) return; intent.current ??= crypto.randomUUID(); void command({ action: 'post', id: intent.current, text: text.trim(), expectedCityId: state.cityId }, true); };
  const close = (event: KeyboardEvent) => { if (event.key !== 'Escape') return; if ((event.target as HTMLElement).closest?.('.report-dialog')) { event.stopPropagation(); return; } event.preventDefault(); event.stopPropagation(); setOpen(false); button.current?.focus(); };
  return <><button ref={button} type="button" aria-expanded={open} onClick={() => setOpen(true)}>Talk</button>{open ? <section className="neighborhood-talk" aria-label={`${cityName} city conversation`} onKeyDown={close}><h3>{cityName}</h3>{error ? <p role="alert">{error}</p> : null}<ol aria-label="Recent citizen messages">{state?.messages.map(message => <li key={message.id}><strong>{message.handle}</strong> <time dateTime={new Date(message.postedAt * 1000).toISOString()}>{formatTime(message.postedAt * 1000)}</time><p>{message.body}</p>{message.mine ? <button type="button" disabled={busy} onClick={() => void command({ action: 'delete', id: message.id })}>Remove my message</button> : state.reportsEnabled === true ? <ReportButton kind="citizen-message" targetId={message.id} /> : null}</li>)}</ol><form onSubmit={send}><label htmlFor="neighborhood-talk-message">Message ({text.length}/280)</label><textarea ref={field} id="neighborhood-talk-message" maxLength={280} value={text} disabled={!state || busy} onChange={event => setText(event.target.value)} /><button type="submit" disabled={!state || busy || !validSquareText(text)}>Send message</button></form></section> : null}</>;
}

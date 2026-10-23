'use client';
import { useState, type FormEvent } from 'react';
import { loadReviewQueue, modConsoleCopy as C, queueStatus, utc, type QueueResult } from '@/lib/mod-console';
import styles from './mod-console.module.css';

/** #880: read-only view of the AI review queue (GET /api/admin/ai-review-queue). Labels are the route's own field and filter names; Copy: modConsoleCopy (lib/mod-console.ts). */
/** The route returns the newest 50 (lib/ai-review-queue.ts; ARC: 50 a page, 200 at most once the route pages). */
const PAGE = 50;
/** ARC (#880): no data shows before the server accepts the token: the table renders only from an accepted (2xx) response, and nothing loads before Load. */
export function ModConsole({ load = loadReviewQueue }: { load?: typeof loadReviewQueue }) {
  const [token, setToken] = useState(''), [reason, setReason] = useState(''), [nation, setNation] = useState('');
  const [busy, setBusy] = useState(false), [result, setResult] = useState<QueueResult | null>(null);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!token) return; setBusy(true); setResult(null); setResult(await load(token, { reason, nation })); setBusy(false); };
  return <main className={styles.console}>
    <h1>{C.title}</h1>
    <form className={styles.filters} onSubmit={submit} aria-label="AI review queue filters">
      <label>{C.token}<input type="password" autoComplete="off" required value={token} onChange={e => setToken(e.target.value)} /></label>
      <label>reason<select value={reason} onChange={e => setReason(e.target.value)}><option value="">all</option><option value="flagged">flagged</option><option value="sample">sample</option></select></label>
      <label>nation<select value={nation} onChange={e => setNation(e.target.value)}><option value="">all</option><option value="kindle">kindle</option><option value="korund">korund</option><option value="aurelle">aurelle</option></select></label>
      <button type="submit" disabled={busy} aria-busy={busy}>{C.load}</button>
    </form>
    <p role="status" className={styles.status}>{busy ? C.loading : result ? (result.ok ? queueStatus(result.items.length, Boolean(reason || nation), PAGE) : `${result.status || 'Error'}: ${result.error}`) : ''}</p>
    {result?.ok && result.items.length > 0 && <div className={styles.scroll} tabIndex={0} role="region" aria-label="AI review queue">
      <table className={styles.table}><caption>AI review queue</caption>
        <thead><tr>{['created_at', 'nation_id', 'persona', 'source', 'reason', 'filter_result', 'output_text', 'reviewed_at', 'reviewer_note'].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{result.items.map(item => <tr key={item.id}><td>{utc(item.created_at)}</td><td>{item.nation_id}</td><td>{item.persona}</td><td>{item.source}</td><td>{item.reason}</td>
          <td>{item.filter_result}{item.filter_detail ? ` (${item.filter_detail})` : ''}</td><td className={styles.text}>{item.output_text}</td><td>{utc(item.reviewed_at)}</td><td>{item.reviewer_note ?? ''}</td></tr>)}</tbody>
      </table>
    </div>}
  </main>;
}

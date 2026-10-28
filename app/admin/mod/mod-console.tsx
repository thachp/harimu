'use client';
import { useState, type FormEvent } from 'react';
import { loadAiCosts, loadAiDecisions, loadLedger, loadReports, loadReviewQueue, loadRiskScores, loadVoteBuying, markReviewed, modConsoleCopy as C, modPanels, queueStatus, utc, type ModPanel, type PanelResult } from '@/lib/mod-console';
import styles from './mod-console.module.css';

/** #880: staff console over admin GETs + queue mark-reviewed POST (#959 contract). Column labels are the route field names. */
/** Queue/reports/decisions page at 50 (route default; max 200). */
const PAGE = 50;
/** ARC (#880): no data shows before the server accepts the token: tables render only from an accepted (2xx) response, and nothing loads before Load. */
export function ModConsole({
  loadQueue = loadReviewQueue, loadCosts = loadAiCosts, loadReport = loadLedger, loadVotes = loadVoteBuying, loadRisk = loadRiskScores,
  loadReportsList = loadReports, loadDecisions = loadAiDecisions, markItem = markReviewed,
}: {
  loadQueue?: typeof loadReviewQueue; loadCosts?: typeof loadAiCosts; loadReport?: typeof loadLedger; loadVotes?: typeof loadVoteBuying; loadRisk?: typeof loadRiskScores;
  loadReportsList?: typeof loadReports; loadDecisions?: typeof loadAiDecisions; markItem?: typeof markReviewed;
}) {
  const [token, setToken] = useState(''), [panel, setPanel] = useState<ModPanel>('ai-review-queue');
  const [reason, setReason] = useState(''), [nation, setNation] = useState(''), [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(false), [result, setResult] = useState<PanelResult | null>(null);
  const [note, setNote] = useState(''), [markStatus, setMarkStatus] = useState('');
  /** QA2 on #923: whether filters were set when this load was submitted, so changing a menu afterwards does not change the empty-result message. */
  const [loadedFiltered, setLoadedFiltered] = useState(false);
  const page = { reason, nation, limit: PAGE, offset };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!token) return; setBusy(true); setLoadedFiltered(Boolean(reason || nation || offset)); setResult(null); setMarkStatus('');
    setResult(panel === 'ai-review-queue' ? await loadQueue(token, page)
      : panel === 'ai-costs' ? await loadCosts(token)
      : panel === 'ledger-reconciliation' ? await loadReport(token)
      : panel === 'vote-buying' ? await loadVotes(token)
      : panel === 'risk-scores' ? await loadRisk(token)
      : panel === 'reports' ? await loadReportsList(token, { limit: PAGE, offset })
      : await loadDecisions(token, page));
    setBusy(false);
  };
  const mark = async (id: string) => {
    if (!token || !note.trim()) return; setBusy(true); setMarkStatus('');
    const out = await markItem(token, id, note.trim());
    setMarkStatus(out.ok ? C.marked : `${out.status || 'Error'}: ${out.error}`);
    if (out.ok) setResult(await loadQueue(token, page));
    setBusy(false);
  };
  const status = !result ? '' : !result.ok ? `${result.status || 'Error'}: ${result.error}`
    : result.panel === 'ai-review-queue' ? queueStatus(result.items.length, loadedFiltered, PAGE)
    : result.panel === 'ai-costs' ? (result.days.length ? C.count(result.days.length) : C.emptyPanel)
    : result.panel === 'vote-buying' ? (result.events.length ? C.count(result.events.length) : C.emptyPanel)
    : result.panel === 'risk-scores' ? (result.accounts.length ? C.count(result.accounts.length) : C.emptyPanel)
    : result.panel === 'reports' ? (result.reports.length ? C.count(result.reports.length) : C.emptyPanel)
    : result.panel === 'ai-decisions' ? (result.decisions.length ? C.count(result.decisions.length) : C.emptyPanel)
    : result.report ? C.count(1) : C.noReport;
  const paged = panel === 'ai-review-queue' || panel === 'reports' || panel === 'ai-decisions';
  return <main className={styles.console}>
    <h1>{C.title}</h1>
    <form className={styles.filters} onSubmit={submit} aria-label="Admin panel filters">
      <label>{C.token}<input type="password" autoComplete="off" required value={token} onChange={e => setToken(e.target.value)} /></label>
      <label>{C.panel}<select value={panel} onChange={e => { setPanel(e.target.value as ModPanel); setResult(null); setMarkStatus(''); }}>{modPanels.map(p => <option key={p} value={p}>{p}</option>)}</select></label>
      {(panel === 'ai-review-queue' || panel === 'ai-decisions') && <>
        <label>reason<select value={reason} onChange={e => setReason(e.target.value)}><option value="">all</option><option value="flagged">flagged</option><option value="sample">sample</option></select></label>
        <label>nation<select value={nation} onChange={e => setNation(e.target.value)}><option value="">all</option><option value="kindle">kindle</option><option value="korund">korund</option><option value="aurelle">aurelle</option></select></label>
      </>}
      {paged && <label>offset<input type="number" min={0} step={PAGE} value={offset} onChange={e => setOffset(Math.max(0, Number(e.target.value) || 0))} /></label>}
      <button type="submit" disabled={busy} aria-busy={busy}>{panel === 'ai-review-queue' ? C.load : C.loadAny}</button>
    </form>
    <p role="status" className={styles.status}>{busy ? C.loading : (markStatus || status)}</p>
    {result?.ok && result.panel === 'ai-review-queue' && result.items.length > 0 && <div className={styles.scroll} tabIndex={0} role="region" aria-label="ai-review-queue">
      <table className={styles.table}><caption>ai-review-queue</caption>
        <thead><tr>{['created_at', 'nation_id', 'persona', 'source', 'reason', 'filter_result', 'output_text', 'reviewed_at', 'reviewer_note', C.note].map(h => <th key={h} scope="col" className={h === C.note ? styles.mark : undefined}>{h}</th>)}</tr></thead>
        <tbody>{result.items.map(item => <tr key={item.id}><td>{utc(item.created_at)}</td><td>{item.nation_id}</td><td>{item.persona}</td><td>{item.source}</td><td>{item.reason}</td>
          <td>{item.filter_result}{item.filter_detail ? ` (${item.filter_detail})` : ''}</td><td className={styles.text}>{item.output_text}</td><td>{utc(item.reviewed_at)}</td><td>{item.reviewer_note ?? ''}</td>
          <td className={styles.mark}>{item.reviewed_at == null ? <div className={styles.filters}><input aria-label={C.note} value={note} onChange={e => setNote(e.target.value)} /><button type="button" disabled={busy || !note.trim()} onClick={() => mark(item.id)}>{C.mark}</button></div> : C.marked}</td></tr>)}</tbody>
      </table>
    </div>}
    {result?.ok && result.panel === 'ai-costs' && result.days.length > 0 && <div className={styles.scroll} tabIndex={0} role="region" aria-label="ai-costs">
      <table className={styles.table}><caption>ai-costs</caption>
        <thead><tr>{['day', 'reservedMicro', 'settledMicro', 'calls', 'budgetMicro'].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{result.days.map(d => <tr key={d.day}><td>{d.day}</td><td>{d.reservedMicro}</td><td>{d.settledMicro}</td><td>{d.calls}</td><td>{d.budgetMicro ?? ''}</td></tr>)}</tbody>
      </table>
    </div>}
    {result?.ok && result.panel === 'ledger-reconciliation' && result.report && <div className={styles.scroll} tabIndex={0} role="region" aria-label="ledger-reconciliation">
      <table className={styles.table}><caption>ledger-reconciliation</caption>
        <thead><tr>{['gameDay', 'reconciledAt', 'mismatchCount'].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody><tr><td>{result.report.gameDay}</td><td>{utc(result.report.reconciledAt)}</td><td>{result.report.mismatchCount}</td></tr></tbody>
      </table>
    </div>}
    {result?.ok && result.panel === 'vote-buying' && result.events.length > 0 && <div className={styles.scroll} tabIndex={0} role="region" aria-label="vote-buying">
      <table className={styles.table}><caption>vote-buying</caption>
        <thead><tr>{['createdAt', 'electionKey', 'reason', 'voterId', 'senderId', 'transferId'].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{result.events.map(e => <tr key={e.transferId}><td>{utc(e.createdAt)}</td><td>{e.electionKey}</td><td>{e.reason}</td><td>{e.voterId}</td><td>{e.senderId}</td><td>{e.transferId}</td></tr>)}</tbody>
      </table>
    </div>}
    {result?.ok && result.panel === 'risk-scores' && result.accounts.length > 0 && <div className={styles.scroll} tabIndex={0} role="region" aria-label="risk-scores">
      <table className={styles.table}><caption>risk-scores</caption>
        <thead><tr>{['updatedAt', 'score', 'civicActCount', 'reasons', 'userId'].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{result.accounts.map(a => <tr key={a.userId}><td>{utc(a.updatedAt)}</td><td>{a.score}</td><td>{a.civicActCount}</td><td>{a.reasons.join(', ')}</td><td>{a.userId}</td></tr>)}</tbody>
      </table>
    </div>}
    {result?.ok && result.panel === 'reports' && result.reports.length > 0 && <div className={styles.scroll} tabIndex={0} role="region" aria-label="reports">
      <table className={styles.table}><caption>reports</caption>
        <thead><tr>{['created_at', 'reason_id', 'target_kind', 'target_id', 'reporter_id', 'request_id', 'note', 'id'].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{result.reports.map(r => <tr key={r.id}><td>{utc(r.created_at)}</td><td>{r.reason_id}</td><td>{r.target_kind}</td><td>{r.target_id}</td><td>{r.reporter_id}</td><td>{r.request_id}</td><td>{r.note ?? ''}</td><td>{r.id}</td></tr>)}</tbody>
      </table>
    </div>}
    {result?.ok && result.panel === 'ai-decisions' && result.decisions.length > 0 && <div className={styles.scroll} tabIndex={0} role="region" aria-label="ai-decisions">
      <table className={styles.table}><caption>ai-decisions</caption>
        <thead><tr>{['reviewed_at', 'nation_id', 'persona', 'source', 'reason', 'filter_result', 'output_text', 'reviewer_note', 'id'].map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>{result.decisions.map(d => <tr key={d.id}><td>{utc(d.reviewed_at)}</td><td>{d.nation_id}</td><td>{d.persona}</td><td>{d.source}</td><td>{d.reason}</td>
          <td>{d.filter_result}{d.filter_detail ? ` (${d.filter_detail})` : ''}</td><td className={styles.text}>{d.output_text}</td><td>{d.reviewer_note ?? ''}</td><td>{d.id}</td></tr>)}</tbody>
      </table>
    </div>}
  </main>;
}

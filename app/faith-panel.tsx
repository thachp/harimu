'use client';
/** #280: faith card and picker (#67), congregation panel (#286) and the public-holiday / festival banner (#291, #304).
 *  All three ride HARIMU_FAITH_ENABLED: while the flag is off the API reports `enabled: false` and nothing renders.
 *  Copy comes from Content's lib/faith-copy.ts, lib/clergy-gate-copy.ts and the server state (worship copy, stance lines),
 *  so no doctrine is written here. Devotion is described as social standing only. */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { readFaith } from '../lib/faith';
import type { readCongregations } from '../lib/congregations';
import { faithCopy, korundFaithCopy, unaffiliatedCopy, type FaithId } from '../lib/faith-copy';
import { clergyGateHelp } from '../lib/clergy-gate-copy';
import { holySiteCopy, holySites, type HolySiteId } from '../lib/holy-sites';
import { ActionButton } from './action-button';
import { GameTimer } from './game-timer';
import { AiBadge } from './ai-disclosure';

export type FaithState = Awaited<ReturnType<typeof readFaith>>;
export type CongregationState = Awaited<ReturnType<typeof readCongregations>>;
type Festival = FaithState['festivals'][number];

/** One fetch for the whole page: faith state, the congregation panel, and the commands that change them. */
export function useFaith(active: boolean) {
  const [faith, setFaith] = useState<FaithState | null>(null);
  const [congregations, setCongregations] = useState<CongregationState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const intent = useRef<{ key: string; requestId: string } | null>(null);

  const loadCongregations = useCallback(async (signal?: AbortSignal) => {
    try { const r = await fetch('/api/congregations', { cache: 'no-store', signal }); if (r.ok) setCongregations(await r.json()); } catch { /* panel stays hidden */ }
  }, []);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const r = await fetch('/api/faith', { cache: 'no-store', signal: controller.signal });
        if (!r.ok) return; // signed out, demo or unavailable: no faith UI
        const state = await r.json() as FaithState;
        if (!state.enabled || !state.supported) return; // flag off (or a nation without faith yet): nothing renders
        setFaith(state); await loadCongregations(controller.signal);
      } catch { /* hidden */ }
    })();
    return () => controller.abort();
  }, [active, loadCongregations]);

  async function post(url: string, body: Record<string, unknown>) {
    if (busy) return;
    // A retry after a dropped connection reuses its requestId, so the server can answer idempotently.
    const key = url + JSON.stringify(body);
    const requestId = intent.current?.key === key ? intent.current.requestId : crypto.randomUUID();
    intent.current = { key, requestId }; setBusy(true); setError(''); setMessage('');
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, requestId }) });
      const data = await r.json().catch(() => ({})) as { error?: string; completion?: string; state?: unknown };
      if (!r.ok) { if (r.status < 500) intent.current = null; throw new Error(data.error ?? 'That did not work. Try again.'); }
      intent.current = null;
      if (data.state) (url === '/api/faith' ? setFaith : setCongregations)(data.state as never);
      if (data.completion) setMessage(data.completion);
      if (url === '/api/faith') void loadCongregations(); // a faith change can end a membership
    } catch (e) { setError(e instanceof Error ? e.message : 'Connection interrupted. Retry to confirm the saved result.'); }
    finally { setBusy(false); }
  }
  return {
    faith: active ? faith : null, congregations: active ? congregations : null, busy, message, error,
    chooseFaith: (faithId: string) => post('/api/faith', { action: 'choose-faith', faithId }),
    attendWorship: () => post('/api/faith', { action: 'attend-worship' }),
    worshipUnderground: () => post('/api/faith', { action: 'worship-underground' }), // #295
    appealDuty: () => post('/api/faith', { action: 'appeal-duty' }), // #382 PR B
    requestMission: (hostNation: string) => post('/api/faith', { action: 'request-mission', hostNation }), // #225
    acceptMission: () => post('/api/faith', { action: 'accept-mission' }),
    answerMission: (missionId: string, answer: 'accept' | 'decline') => post('/api/faith', { action: 'answer-mission', missionId, answer }),
    muteMissionaries: (muted: boolean) => post('/api/faith', { action: 'mute-missionaries', muted }),
    joinFestival: (festivalId: string) => post('/api/faith', { action: 'join-festival', festivalId }),
    congregation: (action: 'join-congregation' | 'leave-congregation' | 'stand-for-officiant' | 'stand-down' | 'officiate') => post('/api/congregations', { action }),
  };
}
export type FaithApi = ReturnType<typeof useFaith>;

const copyFor = (id: string) => id === 'unaffiliated' ? { name: unaffiliatedCopy.name, tagline: '', description: unaffiliatedCopy.description } : (() => { const c = faithCopy[id as FaithId]; return { name: c.name, tagline: c.tagline, description: c.description }; })();
const isoDate = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 10);

/** Public holiday (endorsed festival) and, for followers, the festival banner with its Join button. Shown on the work board and household. */
export function HolidayBanner({ faith, busy, onJoin }: { faith: FaithState | null; busy: boolean; onJoin: (festivalId: string) => void }) {
  if (!faith) return null;
  const festivals = faith.festivals.filter((f: Festival) => f.banner);
  if (!faith.holiday && !festivals.length) return null;
  return <section className="holiday-banner" aria-label="Today's festival and holiday">
    {faith.holiday && <div role="status" className="holiday-line"><strong>Public holiday · {faith.holiday.name}</strong>{faith.holiday.line && <p>{faith.holiday.line}</p>}</div>}
    {festivals.map((f: Festival) => <div key={f.id} className="festival-line"><p><strong>{f.name}</strong> · {f.banner!.text}</p>
      <ActionButton type="button" reason={busy ? 'Saving…' : f.joinBlockedReason} onClick={() => onJoin(f.id)}>{f.joined ? 'Joined' : f.banner!.joinButton}</ActionButton></div>)}
  </section>;
}

/** `initialPick` only seeds the radio (used by tests and the layout check to render the "picked away" state). */
export function FaithPanel({ api, initialPick = null }: { api: FaithApi; initialPick?: string | null }) {
  const { faith, congregations, busy, message, error } = api;
  const [picked, setPicked] = useState<string | null>(initialPick);
  if (!faith) return null;
  const current = faith.faith.id, choice = picked ?? current, korund = faith.nationId === 'korund';
  const cooldown = faith.changeBlockedReason;
  const leaves = choice !== current; // picking away from the current faith
  const leaving = leaves ? faith.leaveBlockedReason : null;
  const leaveCost = leaves && faith.leaveCost != null ? faith.leaveCost : null; // #289/#311: Royal Favor cost of leaving the Kinward Rite in Aurelle
  const changeReason = busy ? 'Saving…' : cooldown ?? (choice === current ? 'Pick a different faith to change.' : leaving);
  const copy = copyFor(current), worship = faith.worship;
  const devotion = faith.devotion;
  const harmony = (faith as FaithState & { harmony?: { line: string } }).harmony; // #842: present only with HARIMU_RELIGIOUS_HARMONY_ENABLED on
  return <section className="faith-panel" aria-labelledby="faith-heading">
    <h2 id="faith-heading">Faith and Devotion</h2>
    {harmony && <p className="faith-harmony">{harmony.line}</p>}
    {harmony && <HolySiteActions />}
    <div className="faith-current">
      <h3>{copy.name}</h3>
      {copy.tagline && <p className="faith-tagline">{copy.tagline}</p>}
      <p>{copy.description}</p>
      {worship ? <>
        <div className="devotion-row"><span id="devotion-label">Devotion</span>
          <div className="devotion-meter" role="meter" aria-labelledby="devotion-label" aria-valuemin={0} aria-valuemax={devotion.max} aria-valuenow={devotion.value} aria-valuetext={`${devotion.value} of ${devotion.max}${devotion.tier ? `, ${devotion.tier.label}` : ''}`}><span style={{ width: `${Math.min(100, Math.max(0, devotion.value / devotion.max * 100))}%` }} /></div>
          <strong>{devotion.value} / {devotion.max}</strong></div>
        {devotion.tier && <p><strong>{devotion.tier.label}.</strong> {devotion.tier.line}</p>}
      </> : null}
      <p className="faith-note">{devotion.explanation}</p>
    </div>

    {worship ? <div className="faith-worship">
      <h3>Daily worship</h3>
      {worship.body.map(line => <p key={line}>{line}</p>)}
      <ActionButton type="button" reason={busy ? 'Saving…' : faith.worshipBlockedReason} onClick={() => api.attendWorship()}>{worship.label}</ActionButton>
      {worship.worshippedToday && worship.nextAt && <GameTimer compact endsAt={new Date(worship.nextAt * 1000).toISOString()} label="Next worship" readyLabel="Worship is open again" />}
    </div> : faith.worshipBlockedReason && <p className="faith-note">{faith.worshipBlockedReason}</p>}
    {faith.underground && <div className="faith-underground" aria-label="Private practice">{/* #295: private to the holder, no banner, nothing posted */}
      <ActionButton type="button" reason={busy ? 'Saving…' : faith.underground.blockedReason} onClick={() => api.worshipUnderground()}>{faith.underground.label}</ActionButton>
      {faith.underground.lastRaid && <p className="faith-note" role="status">{faith.underground.lastRaid.text} {faith.underground.lastRaid.devotionNote}</p>}
      {faith.underground.quietWeek && <p className="faith-note">{faith.underground.quietWeek}</p>}
      {faith.underground.duty && <div className="faith-duty" role="status" aria-label={faith.underground.duty.label}>
        {faith.underground.duty.banner && <p className="faith-note"><strong>{faith.underground.duty.label}</strong> <AiBadge /> {faith.underground.duty.banner}</p>}
        {faith.underground.duty.daysLeft && <p className="faith-note">{faith.underground.duty.daysLeft}</p>}
        {faith.underground.duty.lines.map(line => <p key={line} className="faith-note">{line}</p>)}
        {faith.underground.duty.appeal.statusLine && <p className="faith-note">{faith.underground.duty.appeal.statusLine}</p>}
        {faith.underground.duty.appeal.available && <><p className="faith-note">{faith.underground.duty.appeal.explainer}</p><ActionButton type="button" reason={busy ? 'Saving…' : null} onClick={() => api.appealDuty()}>Appeal</ActionButton></>}
      </div>}
      {faith.underground.suspicion && <p className="faith-note faith-suspicion" title={faith.underground.suspicion.tooltip.join(' ')}>{faith.underground.suspicion.line} <small>({faith.underground.suspicion.privateTag})</small></p>}
    </div>}

    {faith.missionary && <MissionaryBlock missionary={faith.missionary} busy={busy} api={api} />}

    {korund ? <p className="faith-note">{korundFaithCopy.publicChoice}</p> : <fieldset className="faith-picker" disabled={Boolean(cooldown) || busy}>
      <legend>Choose your faith</legend>
      <p className="faith-note">Your first choice is free. After that you can change faith once every 60 real days.</p>
      {faith.options.public.map(option => { const c = copyFor(option.id); return <label key={option.id}>
        <input type="radio" name="faith-choice" value={option.id} checked={choice === option.id} onChange={() => setPicked(option.id)} />
        <span><strong>{c.name}</strong>{option.id === current && <em> · current</em>}<small>{c.description}</small></span></label>; })}
      {leaveCost !== null && <p className="faith-note faith-leave-cost" role="status">Leaving the Kinward Rite costs {leaveCost} Royal Favor.{faith.royalFavor != null && <> You have {faith.royalFavor}.</>}</p>}
      <ActionButton type="button" reason={changeReason} onClick={() => { void api.chooseFaith(choice).then(() => setPicked(null)); }}>Confirm faith</ActionButton>
      {cooldown && faith.changeAvailableAt && <p className="faith-note">Faith is locked until {isoDate(faith.changeAvailableAt)}.</p>}
    </fieldset>}

    {!korund && congregations && <CongregationBlock faith={faith} state={congregations} api={api} />}
    <div aria-live="polite" className="faith-status">{message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}</div>
  </section>;
}

/** #225: cross-border missionaries. Every string comes from the server payload (this file never imports the Content copy). The badge never names the missionary. */
function MissionaryBlock({ missionary: m, busy, api }: { missionary: NonNullable<FaithState['missionary']>; busy: boolean; api: FaithApi }) {
  const mission = m.mission;
  return <div className="faith-missionary" aria-labelledby="missionary-heading">
    <h3 id="missionary-heading">{m.labels.heading}</h3>
    {m.here.map(h => <p key={h.missionId} className="faith-note faith-missionary-here" role="status">{h.line}</p>)}
    {m.offer && <div className="faith-missionary-offer" role="group" aria-label={m.offer.pitch}>
      <p><strong>{m.offer.pitch}</strong></p>
      <p>{m.offer.body}</p>
      {m.offer.warnings.map(line => <p key={line} className="faith-note">{line}</p>)}
      <ActionButton type="button" reason={busy ? 'Saving…' : null} onClick={() => api.answerMission(m.offer!.missionId, 'accept')}>{m.offer.buttons.accept}</ActionButton>
      <ActionButton type="button" reason={busy ? 'Saving…' : null} onClick={() => api.answerMission(m.offer!.missionId, 'decline')}>{m.offer.buttons.notNow}</ActionButton>
    </div>}
    {m.notice && <p className="faith-note" role="status">{m.notice}</p>}
    {mission ? <div className="faith-missionary-mission">
      <p role="status">{mission.statusText}</p>
      {mission.status === 'invited' && <ActionButton type="button" reason={busy ? 'Saving…' : null} onClick={() => api.acceptMission()}>{m.labels.setOut}</ActionButton>}
      {mission.status === 'invited' && <GameTimer compact endsAt={new Date(mission.expiresAt * 1000).toISOString()} label="Invitation lapses" readyLabel="Invitation lapsed" />}
      {mission.status === 'traveling' && mission.arrivesAt && <GameTimer compact endsAt={new Date(mission.arrivesAt * 1000).toISOString()} label="Arrives" readyLabel="Arrived" />}
      {mission.status === 'present' && mission.endsAt && <GameTimer compact endsAt={new Date(mission.endsAt * 1000).toISOString()} label="Mission ends" readyLabel="Mission ended" />}
    </div> : <div className="faith-missionary-request">
      <p className="faith-note">{m.labels.intro}</p>
      {m.request.hosts.map(host => <div key={host.nationId}>
        <ActionButton type="button" reason={busy ? 'Saving…' : m.request.blockedReason ?? host.reason} onClick={() => api.requestMission(host.nationId)}>{m.labels.send[host.nationId]}</ActionButton>
      </div>)}
    </div>}
    <ActionButton type="button" aria-pressed={m.muted} reason={busy ? 'Saving…' : null} onClick={() => api.muteMissionaries(!m.muted)}>{m.mute.label}</ActionButton>
    <p className="faith-note">{m.muted ? m.mute.muted : m.mute.unmuted}</p>
  </div>;
}

/** The citizen's own congregation (one per faith per capital). Korund has none in public (§14.6), so the block is not rendered there. */
function CongregationBlock({ faith, state, api }: { faith: FaithState; state: CongregationState; api: FaithApi }) {
  const you = state.you; if (!you) return null;
  const own = state.congregations.find(c => c.id === you.congregationId);
  const target = own ?? state.congregations.find(c => c.nationId === faith.nationId && c.faithId === faith.faith.id);
  const busy = api.busy;
  const joinReason = busy ? 'Saving…' : you.changeBlockedReason ?? (!target ? 'Choose a faith to join its congregation.' : !faith.faith.chosen ? 'Confirm your faith first (choose it or attend worship once).' : null);
  const leaveReason = busy ? 'Saving…' : you.changeBlockedReason;
  return <div className="faith-congregation">
    <h3>Congregation</h3>
    {target ? <p><strong>{target.faithName} · {target.cityName}</strong><br />
      {target.members} {target.members === 1 ? 'member' : 'members'} · {target.officiant ? `Officiant: ${target.officiant.name}` : 'No Officiant yet'}</p> : <p>Choose a faith to join its congregation.</p>}
    <p className="faith-note">{clergyGateHelp.line} A member with more Devotion can take the seat once the holder has served {state.officiantChallengeGameDays} game days.</p>
    <div className="faith-actions">
      {!own ? <ActionButton type="button" reason={joinReason} onClick={() => api.congregation('join-congregation')}>Join congregation</ActionButton> : <>
        <ActionButton type="button" reason={leaveReason} onClick={() => api.congregation('leave-congregation')}>Leave congregation</ActionButton>
        <ActionButton type="button" reason={busy ? 'Saving…' : null} aria-pressed={you.officiantOptIn} onClick={() => api.congregation(you.officiantOptIn ? 'stand-down' : 'stand-for-officiant')}>{you.officiantOptIn ? 'Stand down as Officiant' : 'Stand for Officiant'}</ActionButton>
        {you.isOfficiant && <ActionButton type="button" reason={busy ? 'Saving…' : you.officiatedToday ? 'You have already led a service this game day.' : null} onClick={() => api.congregation('officiate')}>Lead today&apos;s service</ActionButton>}
      </>}
    </div>
    <p className="faith-note">{state.explanation}</p>
  </div>;
}

/** #889: pilgrimage and clergy-charity buttons, shown only with the harmony line (HARIMU_RELIGIOUS_HARMONY_ENABLED on). POST /api/faith/holy-sites. */
export function HolySiteActions() {
  const [note, setNote] = useState('');
  const act = async (body: Record<string, unknown>) => {
    try {
      const res = await fetch('/api/faith/holy-sites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, requestId: crypto.randomUUID() }) });
      const data = await (res.json() as Promise<{ outcome?: string; error?: string }>).catch(() => ({} as { outcome?: string; error?: string }));
      setNote(res.ok && data.outcome ? holySiteCopy.outcome[data.outcome] ?? '' : holySiteCopy.failed.replace('{reason}', data.error ?? String(res.status)));
    } catch { setNote(holySiteCopy.failed.replace('{reason}', 'network')); }
  };
  return <div className="faith-holy-sites"><h3>{holySiteCopy.heading}</h3>
    {(Object.keys(holySites) as HolySiteId[]).map(id => <button key={id} type="button" onClick={() => void act({ action: 'pilgrimage', siteId: id })}>{holySiteCopy.pilgrimage[id]}</button>)}
    <p className="faith-holy-help">{holySiteCopy.helper.pilgrimage}</p>
    <button type="button" onClick={() => void act({ action: 'charity' })}>{holySiteCopy.charity}</button>
    <p className="faith-holy-help">{holySiteCopy.helper.charity}</p>
    {note && <p role="status">{note}</p>}
  </div>;
}

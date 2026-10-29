'use client';
// #738 slice 1: "Your unit". Hidden unless GET /api/army answers (HARIMU_ARMIES_ENABLED and HARIMU_WAR_ENABLED on). Strings from lib/army-copy.ts.
import { useEffect, useState } from 'react';
import { armyFailureNote, squadStance, unitCard, unitMembership } from '@/lib/army-copy';
import { armyStances, type ArmyCommand } from '@/lib/army-rules';
import { SessionRetry, okOr5xx, useLoadRetry } from './session-retry';
import type { ArmyView } from '@/lib/army';

const fill = (text: string, unit: string, officer = '') => text.replace('{unit}', unit).replace('{officer}', officer);
export function ArmyCard() {
  const [army, setArmy] = useState<ArmyView | null>(null), [note, setNote] = useState('');
  const load = useLoadRetry(), { fail: loadFail, attempt: loadAttempt } = load;
  useEffect(() => { fetch('/api/army/draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"action":"open"}' }).catch(() => null).then(() => fetch('/api/army')).then(okOr5xx).then(r => r.ok ? r.json() as Promise<{ army?: ArmyView }> : null).then(d => setArmy(d?.army ?? null)).catch(() => { setArmy(null); loadFail(); }); }, [loadAttempt, loadFail]); // #928: a 5xx or offline load offers Retry
  if (!army?.unit) return load.failed ? <SessionRetry name={'Your unit'} onRetry={load.retry} /> : null;
  const unit = army.unit;
  const send = async (body: Record<string, unknown>, done: string) => {
    const res = await fetch('/api/army', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, requestId: crypto.randomUUID() }) });
    const data: { army?: ArmyView; error?: string } = await (res.json() as Promise<{ army?: ArmyView; error?: string }>).catch(() => ({}));
    if (res.ok) { setArmy(data.army ? { ...data.army, march: data.army.march ?? army.march } : null); setNote(done); } else setNote(armyFailureNote(body.action as ArmyCommand['action'], unit.name, String(data.error ?? res.status)));
  };
  // #738 slice 2: shown only when the GET carried strength (HARIMU_ARMY_DRILLS_ENABLED on).
  const drill = async () => {
    const res = await fetch('/api/army/drill', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: crypto.randomUUID() }) });
    const data: { army?: ArmyView; reason?: string; error?: string } = await (res.json() as Promise<{ army?: ArmyView; reason?: string; error?: string }>).catch(() => ({}));
    if (res.ok) { setArmy(data.army ? { ...data.army, march: data.army.march ?? army.march } : null); setNote(fill(unitMembership.drilled.text, unit.name)); }
    else setNote(data.reason === 'already_drilled' ? unitMembership.drilledToday.text : armyFailureNote('stance', unit.name, String(data.error ?? res.status)));
  };
  return <section className="army-card" aria-label="Your unit">
    <h3>{fill(unitCard.title, unit.name)}</h3>
    <p>{fill(unitCard.commanderLabel, unit.name, unit.officer)}</p>
    <p>{unitCard.memberCountLabel}: {unit.memberCount}</p>
    {unit.strength !== undefined && <p>{unitCard.strengthLabel}: {unit.strength} · {unitCard.moraleLabel}: {unit.morale}</p>}
    {army.march && <p>Winter roads: marches take longer. {army.march.time}</p>}
    {unit.supply?.cut && <p>{supplyCutLine(unit.supply)}</p>}
    {unit.battle && <p>{battleLine(unit.battle)}</p>}
    {unit.battle?.stances && <p>{stanceMixLine(unit.battle.stances)}</p>}
    {unit.battle?.opponentStances && <p>{opponentStanceLine(unit.battle)}</p>}
    {army.woundedUntil && <p>{woundedLine(army.woundedUntil)}</p>}
    {army.member ? <>
      <fieldset><legend>{squadStance.label}</legend>
        {armyStances.map(s => <label key={s}><input type="radio" name="stance" checked={army.stance === s} onChange={() => void send({ action: 'stance', stance: s }, squadStance.helpers[s].text)} />{squadStance.labels[s]}</label>)}
      </fieldset>
      <p>{squadStance.oneInput.text}</p>
      {unit.strength !== undefined && <><p>{unitMembership.drillsHelper.text}</p><button type="button" onClick={() => void drill()}>{unitMembership.drillButton}</button></>}
      {army.serveUntil ? <><p>{fill(unitMembership.calledUp.text, unit.name)}</p><button type="button" onClick={() => void fetch('/api/army/draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"action":"stay"}' }).then(async r => { const reason = r.ok ? '' : ((await r.json().catch(() => ({}))) as { reason?: string }).reason; setNote(r.ok ? fill(unitMembership.stayed.text, unit.name) : r.status === 409 && reason === 'not_conscripted' ? fill(unitMembership.stayRefused.text, unit.name) : armyFailureNote('stance', unit.name, String(r.status))); }).catch(() => setNote(armyFailureNote('stance', unit.name, 'network')))}>{unitMembership.stayButton}</button></> : <button type="button" onClick={() => void send({ action: 'leave' }, fill(unitMembership.left.text, unit.name))}>{unitMembership.leaveButton}</button>}
    </> : !unit.openToVolunteers ? <p>{unitMembership.notOpenYet.text}</p> : <button type="button" onClick={() => void send({ action: 'join', unitId: unit.id }, fill(unitMembership.joined.text, unit.name))}>{unitMembership.joinButton}</button>}
    {note && <p role="status">{note}</p>}
  </section>;
}

/** #738 slice 5: the cut-supply line (Content copy from army-copy, #887 follow-up). */
export const supplyCutLine = (s: { cutDays: number; strengthLossPct: number }) => unitMembership.supplyCut.text.replace('{days}', String(s.cutDays)).replace('{pct}', String(s.strengthLossPct));
/** #738 battles: the card's battle line (placeholder copy from army-copy, marked for Content). */
export const battleLine = (b: { opponentNationId: string; attacking: boolean; rounds: number; status: string }) => {
  const won = b.status === (b.attacking ? 'attacker_won' : 'defender_won');
  const line = b.status === 'ongoing' ? unitMembership.battleOngoing : won ? unitMembership.battleWon : unitMembership.battleLost;
  return line.text.replace('{nation}', b.opponentNationId.charAt(0).toUpperCase() + b.opponentNationId.slice(1)).replace('{round}', String(b.rounds));
};
/** #1052: the unit's stance mix during a battle (counts only; placeholder copy from army-copy). */
export const stanceMixLine = (s: { hold: number; advance: number; fall_back: number }) =>
  unitMembership.battleStances.text.replace('{hold}', String(s.hold)).replace('{advance}', String(s.advance)).replace('{fall_back}', String(s.fall_back));
/** #1061: the other side's mix, only when the server sent it (after the battle resolves). */
export const opponentStanceLine = (b: { opponentNationId: string; opponentStances?: { hold: number; advance: number; fall_back: number } }) => {
  const s = b.opponentStances;
  if (!s) return '';
  const nation = b.opponentNationId.charAt(0).toUpperCase() + b.opponentNationId.slice(1);
  return unitMembership.opponentBattleStances.text.replace('{nation}', nation).replace('{hold}', String(s.hold)).replace('{advance}', String(s.advance)).replace('{fall_back}', String(s.fall_back));
};
/** #911: the wounded line (placeholder copy from army-copy, marked for Content). */
export const woundedLine = (until: number) => unitMembership.wounded.text.replace('{time}', new Date(until * 1000).toLocaleString());

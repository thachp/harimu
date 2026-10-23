'use client';
// #738 slice 1: "Your unit". Hidden unless GET /api/army answers (HARIMU_ARMIES_ENABLED and HARIMU_WAR_ENABLED on). Strings from lib/army-copy.ts.
import { useEffect, useState } from 'react';
import { armyFailureNote, squadStance, unitCard, unitMembership } from '@/lib/army-copy';
import { armyStances, type ArmyCommand } from '@/lib/army-rules';
import type { ArmyView } from '@/lib/army';

const fill = (text: string, unit: string, officer = '') => text.replace('{unit}', unit).replace('{officer}', officer);
export function ArmyCard() {
  const [army, setArmy] = useState<ArmyView | null>(null), [note, setNote] = useState('');
  useEffect(() => { fetch('/api/army').then(r => r.ok ? r.json() as Promise<{ army?: ArmyView }> : null).then(d => setArmy(d?.army ?? null)).catch(() => setArmy(null)); }, []);
  if (!army?.unit) return null;
  const unit = army.unit;
  const send = async (body: Record<string, unknown>, done: string) => {
    const res = await fetch('/api/army', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, requestId: crypto.randomUUID() }) });
    const data: { army?: ArmyView; error?: string } = await (res.json() as Promise<{ army?: ArmyView; error?: string }>).catch(() => ({}));
    if (res.ok) { setArmy(data.army ?? null); setNote(done); } else setNote(armyFailureNote(body.action as ArmyCommand['action'], unit.name, String(data.error ?? res.status)));
  };
  // #738 slice 2: shown only when the GET carried strength (HARIMU_ARMY_DRILLS_ENABLED on).
  const drill = async () => {
    const res = await fetch('/api/army/drill', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: crypto.randomUUID() }) });
    const data: { army?: ArmyView; reason?: string; error?: string } = await (res.json() as Promise<{ army?: ArmyView; reason?: string; error?: string }>).catch(() => ({}));
    if (res.ok) { setArmy(data.army ?? null); setNote(fill(unitMembership.drilled.text, unit.name)); }
    else setNote(data.reason === 'already_drilled' ? unitMembership.drilledToday.text : armyFailureNote('stance', unit.name, String(data.error ?? res.status)));
  };
  return <section className="army-card" aria-label="Your unit">
    <h3>{fill(unitCard.title, unit.name)}</h3>
    <p>{fill(unitCard.commanderLabel, unit.name, unit.officer)}</p>
    <p>{unitCard.memberCountLabel}: {unit.memberCount}</p>
    {unit.strength !== undefined && <p>{unitCard.strengthLabel}: {unit.strength} · {unitCard.moraleLabel}: {unit.morale}</p>}
    {army.member ? <>
      <fieldset><legend>{squadStance.label}</legend>
        {armyStances.map(s => <label key={s}><input type="radio" name="stance" checked={army.stance === s} onChange={() => void send({ action: 'stance', stance: s }, squadStance.helpers[s].text)} />{squadStance.labels[s]}</label>)}
      </fieldset>
      <p>{squadStance.oneInput.text}</p>
      {unit.strength !== undefined && <><p>{unitMembership.drillsHelper.text}</p><button type="button" onClick={() => void drill()}>{unitMembership.drillButton}</button></>}
      {army.serveUntil ? <p>{fill(unitMembership.calledUp.text, unit.name)}</p> : <button type="button" onClick={() => void send({ action: 'leave' }, fill(unitMembership.left.text, unit.name))}>{unitMembership.leaveButton}</button>}
    </> : !unit.openToVolunteers ? <p>{unitMembership.notOpenYet.text}</p> : <button type="button" onClick={() => void send({ action: 'join', unitId: unit.id }, fill(unitMembership.joined.text, unit.name))}>{unitMembership.joinButton}</button>}
    {note && <p role="status">{note}</p>}
  </section>;
}

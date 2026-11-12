'use client';
// #1315 M1. Read-only armies, wars, sieges and mobilization. No commands and no new copy.
import { useEffect, useState } from 'react';
import { PanelV2 } from './panel-v2';
import { NationCrest } from './nation-crest';
import { militaryEnabled } from '@/lib/military';
import { unitCard, unitMembership } from '@/lib/army-copy';
import type { ArmyView } from '@/lib/army';
import { fillWarText, isWarNation, warNationNames } from '@/lib/war-rules';
import { citizenSafety, defenseWindow, mobilizationStatus, noticesFor, warBanner } from '@/lib/war-copy';
import { siegeRules, siegeStrip } from '@/lib/siege-copy';
import { nationMark } from '@/lib/nation-themes';
import { useDisplayTimestamp } from './display-preferences';
import type { WarState } from '@/lib/war';
import type { SiegeItem } from './siege-panel';
import './military.css';

const fill = (text: string, unit: string, officer = '') => text.replace('{unit}', unit).replace('{officer}', officer);
const who = (id: string) => nationMark(id)?.name ?? id;
const cityOf = (s: SiegeItem) => s.cityKind === 'outpost' ? `${who(s.cityKey.slice('outpost:'.length))} outpost` : s.cityName ?? 'A founded city';
export function MilitaryPanel({ nation, citizenNationId = null, wars = null, sieges = null, enabled = militaryEnabled() }: { nation: { id: string; name: string }; citizenNationId?: string | null; wars?: WarState | null; sieges?: readonly SiegeItem[] | null; enabled?: boolean }) {
  const own = enabled && !!citizenNationId && citizenNationId === nation.id;
  const [army, setArmy] = useState<ArmyView | null>(null);
  useEffect(() => { if (!own) return; let live = true; fetch('/api/army').then(r => r.ok ? r.json() : null).then(d => { if (live) setArmy((d as { army?: ArmyView } | null)?.army ?? null); }).catch(() => { if (live) setArmy(null); }); return () => { live = false; }; }, [own]);
  const formatTime = useDisplayTimestamp();
  if (!enabled) return null;
  const shown = own ? army : null, unit = shown?.unit ?? null, viewer = isWarNation(nation.id) ? nation.id : null, supply = unit?.supply;
  const mine = viewer ? (wars?.wars ?? []).filter(war => war.status !== 'ended' && (war.attacker === viewer || war.defender === viewer)) : [];
  const notices = viewer ? noticesFor(viewer) : undefined, held = (sieges ?? []).filter(s => s.attacker === nation.id || s.defender === nation.id);
  return <div className="military-v2"><PanelV2 title="Military" subtitle={nation.name} household={{ lead: nation.id ? <NationCrest id={nation.id} size={44} force /> : null }} rowsLabel="Military" rows={[]} stats={[]} />
    {unit && <section aria-label={unit.name}><h3>{fill(unitCard.title, unit.name)}</h3><p>{fill(unitCard.commanderLabel, unit.name, unit.officer)}</p><p>{unitCard.memberCountLabel}: {unit.memberCount}</p>{unit.strength !== undefined && <p>{unitCard.strengthLabel}: {unit.strength} · {unitCard.moraleLabel}: {unit.morale}</p>}{supply && <p>{unitCard.supplyLabel}: {supply.cut ? unitCard.supplyStates.cut : unitCard.supplyStates.supplied}</p>}{supply?.cut && <p>{unitMembership.supplyCut.text.replace('{days}', String(supply.cutDays)).replace('{pct}', String(supply.strengthLossPct))}</p>}{supply?.rangeSquares !== undefined && <p>{unitMembership.supplyRange.text.replace('{n}', String(supply.rangeSquares)).replace('{k}', String(supply.quartermasterSquares ?? 0))}</p>}</section>}
    {notices && mine.map(war => { const names = { attacker: warNationNames[war.attacker], defender: warNationNames[war.defender], casusBelli: war.casusBelli, endsAt: formatTime(war.mobilizationEndsAt * 1000) }; const notice = notices.notices[own ? (war.attacker === viewer ? 'ours' : 'against-us') : 'world']; return <article key={war.id} aria-label={`War: ${names.attacker} and ${names.defender}`}><h4>{fillWarText(war.attacker === viewer ? warBanner.header.ours : warBanner.header.againstUs, names)}</h4><p>{fillWarText(notice.headline, names)}</p><p>{fillWarText(war.casusBelli ? notice.body : notice.bodyNoGrievance, names)}</p>{war.status === 'mobilizing' ? <p>{fillWarText(warBanner.countdownCaption.text, names)}</p> : <p>{mobilizationStatus.active[1].text} {mobilizationStatus.active[0].text}</p>}<p>{citizenSafety.lines[0].text}</p></article>; })}
    {held.length > 0 && <section aria-label="Sieges"><h4>Sieges</h4><ul>{held.map(s => <li key={s.id}><strong>{cityOf(s)}</strong>{own ? ` · ${s.attacker === nation.id ? `Your nation is besieging ${who(s.defender)}` : `${who(s.attacker)} is besieging your nation`}` : null}<p>{siegeStrip.caption.text.replace('{city}', cityOf(s)).replace('{n}', String(s.days))}</p><p>{s.capturedAt !== null ? `Captured ${formatTime(s.capturedAt * 1000)}.` : s.nextWindowAt !== null ? `Next assault that counts: ${formatTime(s.nextWindowAt * 1000)}.` : 'Not captured.'}</p></li>)}</ul><small>{siegeRules.lines[0].text}</small></section>}
    {viewer && mine.length > 0 && wars?.defenseWindows?.[viewer] ? defenseWindow.explainer.map(line => <p key={line.text}>{line.text}</p>) : null}</div>;
}

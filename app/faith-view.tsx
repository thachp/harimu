'use client';
// #1329 F1. Read-only nation faith facts from existing §14 strings. No commands and no new wording.
import { useEffect, useState } from 'react'; import { PanelV2 } from './panel-v2'; import { NationCrest } from './nation-crest'; import { faithEnabled } from '@/lib/faith-flag';
import { faithCopy, korundFaithCopy, type FaithId } from '@/lib/faith-copy'; import { holySites } from '@/lib/holy-sites'; import { capitalCityForNation } from '@/lib/cities';
import { festivalStance, festivalStanceLine } from '@/lib/festival-stance'; import { nationFestivalSlots } from '@/lib/game-season'; import './faith-view.css';
const faithIds = Object.keys(faithCopy) as FaithId[]; const houses = ['kinward-rite', 'fair-wind-vow', 'open-hand'] as const;
type FaithGet = { enabled?: boolean; supported?: boolean; faith?: { name?: string }; hiddenFaith?: { name?: string } | null; devotion?: { value?: number; max?: number; tier?: { label?: string; line?: string } | null; explanation?: string } };
type CongGet = { enabled?: boolean; you?: { congregationId?: string | null } | null; congregations?: { id: string; faithName: string; cityName: string; nationId: string }[] };
const add = (lines: string[], line: string | null | undefined) => { if (line && !lines.includes(line)) lines.push(line); };
function publicFacts(nation: { id: string; name?: string | null; religion?: string | null }) {
  const lines: string[] = [], religion = nation.religion ?? '';
  add(lines, religion || null);
  if (nation.id === 'korund') add(lines, korundFaithCopy.publicChoice);
  for (const id of faithIds) if (religion.includes(faithCopy[id].name)) { add(lines, faithCopy[id].name); add(lines, faithCopy[id].description); add(lines, faithCopy[id].holySite); }
  if (nation.id !== 'korund') { const city = capitalCityForNation(nation.id); if (city && (nation.id === 'kindle' || nation.id === 'aurelle')) for (const id of houses) add(lines, `${faithCopy[id].name} · ${city.name}`); }
  for (const stance of ['endorsed', 'tolerated', 'banned'] as const) if (faithIds.some(id => festivalStance(nation.id, id) === stance)) add(lines, festivalStanceLine(nation.id, stance));
  if (nation.id !== 'korund') for (const slot of nationFestivalSlots[nation.id] ?? []) add(lines, slot.name);
  for (const id of faithIds) { const site = faithCopy[id].holySite; if (site.toLowerCase().includes(nation.id) || (nation.name && site.includes(nation.name))) add(lines, site); }
  for (const site of Object.values(holySites)) if (site.custodian === nation.id) add(lines, faithCopy[site.faithId].holySite);
  return lines;
}
export function FaithView({ nation, citizenNationId = null, faith: given = null, congregations: givenCongregations = null, enabled = faithEnabled() }: {
  nation: { id: string; name: string; religion?: string | null }; citizenNationId?: string | null; faith?: FaithGet | null; congregations?: CongGet | null; enabled?: boolean;
}) {
  const own = enabled && !!citizenNationId && citizenNationId === nation.id;
  const [faith, setFaith] = useState<FaithGet | null>(given);
  const [congregations, setCongregations] = useState<CongGet | null>(givenCongregations);
  useEffect(() => { if (!own) return; let live = true; const load = (path: string, apply: (data: unknown) => void) => { fetch(path).then(r => r.ok ? r.json() : null).then(data => { if (live) apply(data); }).catch(() => { if (live) apply(null); }); }; load('/api/faith', data => setFaith(data as FaithGet | null)); load('/api/congregations', data => setCongregations(data as CongGet | null)); return () => { live = false; }; }, [own]);
  if (!enabled) return null;
  const mine = own && faith?.enabled && faith.supported ? faith : null;
  const yours = own && congregations?.enabled ? congregations.congregations?.find(row => row.id === congregations.you?.congregationId && row.nationId === nation.id) : undefined;
  const devotion = mine?.devotion;
  return <div className="faith-v2"><PanelV2 title="Faith" subtitle={nation.name} household={{ lead: nation.id ? <NationCrest id={nation.id} size={44} force /> : null }} rowsLabel="Faith" rows={[]} stats={[]} />
    {publicFacts(nation).map(line => <p key={line}>{line}</p>)}
    {own && nation.id === 'korund' ? <p>{korundFaithCopy.hiddenFaithHint}</p> : null}
    {mine?.faith?.name ? <p>{mine.faith.name}</p> : null}{own && nation.id === 'korund' && mine?.hiddenFaith?.name ? <p>{mine.hiddenFaith.name}</p> : null}
    {devotion?.tier?.label && devotion.tier.line ? <p>{devotion.tier.label}. {devotion.tier.line}</p> : null}
    {typeof devotion?.value === 'number' && typeof devotion.max === 'number' ? <p>Devotion {devotion.value} / {devotion.max}</p> : null}
    {devotion?.explanation ? <p>{devotion.explanation}</p> : null}
    {yours ? <p>{yours.faithName} · {yours.cityName}</p> : null}</div>;
}

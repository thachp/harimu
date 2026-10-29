'use client';
import type { DefenseWindowState, PublicWar } from '@/lib/war';
import { citizenSafety, defenseWindow, mobilizationStatus, noticesFor, warBanner, type WarNation } from '@/lib/war-copy';
import { endingBodyFor, endingResults, type EndingKind, type EndingNation } from '@/lib/war-ending-copy'; // #1026
import { defenseWindowLocal, fillWarText, isWarNation, peaceLockEnd, warNationNames } from '@/lib/war-rules';
import { wearinessBanners, wearinessStrip, type WearinessLevel } from '@/lib/war-weariness-copy'; // #423
import { useSyncExternalStore } from 'react';
import { GameTimer } from './game-timer';
import { useDisplayTimestamp } from './display-preferences';

/** Rows already returned by readWarEndings. Passed only while HARIMU_WAR_ENDINGS_ENABLED is on; absent, the banner is unchanged. */
type EndingNotice = { warId: string; kind: EndingKind; proposer: EndingNation; other: EndingNation; status: string; decidedAt: number | null; proposedAt?: number };
const ratifierLines = (ending: EndingNotice) => (ending.kind === 'surrender' ? [ending.proposer] : [ending.proposer, ending.other]).map(id => <p key={`${ending.kind}:${id}`}>{endingBodyFor(id, ending.kind).text}</p>);
const resultLine = (ending: EndingNotice, viewer: EndingNation) => {
  const other = ending.proposer === viewer ? ending.other : ending.proposer;
  const key = ending.kind === 'concession' ? ending.status === 'enacted' ? 'concessionEnacted' : 'concessionRejected' : ending.status === 'enacted' ? 'surrenderEnacted' : 'surrenderRejected';
  return fillWarText(endingResults[key].text, { other: warNationNames[other] });
};
const peaceLine = (ending: EndingNotice, war: PublicWar | undefined, formatTime: (ms: number) => string) => {
  const ready = war?.peaceLockEndsAt ?? (ending.decidedAt == null ? null : peaceLockEnd(ending.decidedAt));
  return ready == null ? null : fillWarText(endingResults.peaceLock.text, { readyAt: formatTime(ready * 1000) });
};
/** #309: war banner on the nation's government view while a declared war is mobilizing or active (HARIMU_WAR_ENABLED; the server sends no wars while it is off).
 *  Presentation only: the countdown is the shared GameTimer (real and game time, #29). Copy comes from lib/war-copy.ts (#315).
 *  #1026: with ending rows, a pending line names each ratifying body; a decided ending shows the result, and an enacted one the peace lock until {readyAt}. */
export function WarBanner({ wars, nationId, weariness, endings }: { wars: PublicWar[] | undefined; nationId: string; weariness?: WearinessLevel | null; endings?: readonly EndingNotice[] | null }) {
  const formatTime = useDisplayTimestamp();
  if (!isWarNation(nationId)) return null;
  const viewer = nationId;
  const mine = (wars ?? []).filter(war => war.status !== 'ended' && (war.attacker === viewer || war.defender === viewer));
  const noted: EndingNotice[] = [];
  if (endings) for (const ending of endings) {
    if (ending.proposer !== viewer && ending.other !== viewer) continue;
    const index = noted.findIndex(item => item.warId === ending.warId);
    if (index < 0) noted.push(ending);
    else if ((ending.proposedAt ?? 0) >= (noted[index].proposedAt ?? 0)) noted[index] = ending;
  }
  const settled = noted.filter(ending => ending.status === 'enacted' && !mine.some(war => war.id === ending.warId));
  if (!mine.length && !settled.length) return null;
  const notices = noticesFor(viewer)!;
  return <section aria-label="War status">{mine.map(war => {
    const names = { attacker: warNationNames[war.attacker], defender: warNationNames[war.defender], casusBelli: war.casusBelli, endsAt: formatTime(war.mobilizationEndsAt * 1000) };
    const notice = notices.notices[war.attacker === viewer ? 'ours' : 'against-us'];
    const ending = noted.find(item => item.warId === war.id);
    const ready = ending && ending.status === 'enacted' ? peaceLine(ending, war, formatTime) : null;
    return <article key={war.id} aria-label={`War: ${names.attacker} and ${names.defender}`}>
      <h4>{fillWarText(war.attacker === viewer ? warBanner.header.ours : warBanner.header.againstUs, names)}</h4>
      <h5>{fillWarText(notice.headline, names)}</h5>
      <p>{fillWarText(war.casusBelli ? notice.body : notice.bodyNoGrievance, names)}</p>
      {war.status === 'mobilizing'
        ? <><p>{fillWarText(warBanner.countdownCaption.text, names)}</p><GameTimer endsAt={war.mobilizationEndsAt * 1000} label="Mobilization ends in" readyLabel={fillWarText(warBanner.countdownLabel, names)} /></>
        : <p>{mobilizationStatus.active[1].text} {mobilizationStatus.active[0].text}</p>}
      <p>{citizenSafety.lines[0].text}</p>
      {ending && ending.status === 'proposed' ? ratifierLines(ending) : null}
      {ending && (ending.status === 'rejected' || ending.status === 'enacted') ? <p>{resultLine(ending, viewer)}</p> : null}
      {ready ? <p>{ready}</p> : null}
    </article>;
  })}{settled.map(ending => {
    const war = (wars ?? []).find(item => item.id === ending.warId);
    const ready = peaceLine(ending, war, formatTime);
    return <article key={ending.warId} aria-label={`War ending: ${warNationNames[ending.proposer]} and ${warNationNames[ending.other]}`}>
      <p>{resultLine(ending, viewer)}</p>
      {ready ? <p>{ready}</p> : null}
    </article>;
  })}{mine.length > 0 && weariness && <p role="status" aria-label={nationId === 'korund' ? wearinessStrip.korundLabel : wearinessStrip.label}>{wearinessBanners[nationId as WarNation][weariness]}</p>}</section>;
}

const subscribeNever = () => () => {};
const browserOffsetMinutes = (): number | null => -new Date().getTimezoneOffset();
const serverOffset = (): number | null => null;
/** #310: "Defense window: HH:MM–HH:MM your time" on the nation's Country view (HARIMU_WAR_ENABLED; the server sends no windows while it is off).
 *  The window is saved in UTC and shown in the viewer's own time: the offset is read in the browser (useSyncExternalStore with a null server snapshot), so nothing renders on the server pass.
 *  `offsetMinutes` (minutes east of UTC) is for tests and previews. Copy comes from lib/war-copy.ts (#312). */
export function DefenseWindow({ windows, nationId, offsetMinutes }: { windows: Record<string, DefenseWindowState> | undefined; nationId: string; offsetMinutes?: number }) {
  const browserOffset = useSyncExternalStore(subscribeNever, browserOffsetMinutes, serverOffset);
  const offset = offsetMinutes ?? browserOffset;
  const state = windows?.[nationId];
  if (!isWarNation(nationId) || !state || offset === null) return null;
  const { start, end } = defenseWindowLocal(state.startHourUtc, offset);
  return <section aria-label="Defense window">
    <p><strong>{fillWarText(defenseWindow.line.text, { start, end })}</strong></p>
    {defenseWindow.explainer.map(line => <p key={line.text}>{line.text}</p>)}
  </section>;
}

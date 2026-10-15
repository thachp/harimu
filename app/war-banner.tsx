'use client';
import type { DefenseWindowState, PublicWar } from '@/lib/war';
import { citizenSafety, defenseWindow, mobilizationStatus, noticesFor, warBanner, type WarNation } from '@/lib/war-copy';
import { defenseWindowLocal, fillWarText, isWarNation, warNationNames } from '@/lib/war-rules';
import { useSyncExternalStore } from 'react';
import { GameTimer } from './game-timer';
import { useDisplayTimestamp } from './display-preferences';

/** #309: war banner on the nation's government view while a declared war is mobilizing or active (HARIMU_WAR_ENABLED; the server sends no wars while it is off).
 *  Presentation only: the countdown is the shared GameTimer (real and game time, #29). Copy comes from lib/war-copy.ts (#315). */
export function WarBanner({ wars, nationId }: { wars: PublicWar[] | undefined; nationId: string }) {
  const formatTime = useDisplayTimestamp();
  if (!isWarNation(nationId)) return null;
  const mine = (wars ?? []).filter(war => war.status !== 'ended' && (war.attacker === nationId || war.defender === nationId));
  if (!mine.length) return null;
  const notices = noticesFor(nationId as WarNation)!;
  return <section aria-label="War status">{mine.map(war => {
    const names = { attacker: warNationNames[war.attacker], defender: warNationNames[war.defender], casusBelli: war.casusBelli, endsAt: formatTime(war.mobilizationEndsAt * 1000) };
    const notice = notices.notices[war.attacker === nationId ? 'ours' : 'against-us'];
    return <article key={war.id} aria-label={`War: ${names.attacker} and ${names.defender}`}>
      <h4>{fillWarText(war.attacker === nationId ? warBanner.header.ours : warBanner.header.againstUs, names)}</h4>
      <h5>{fillWarText(notice.headline, names)}</h5>
      <p>{fillWarText(war.casusBelli ? notice.body : notice.bodyNoGrievance, names)}</p>
      {war.status === 'mobilizing'
        ? <><p>{fillWarText(warBanner.countdownCaption.text, names)}</p><GameTimer endsAt={war.mobilizationEndsAt * 1000} label="Mobilization ends in" readyLabel={fillWarText(warBanner.countdownLabel, names)} /></>
        : <p>{mobilizationStatus.active[1].text} {mobilizationStatus.active[0].text}</p>}
      <p>{citizenSafety.lines[0].text}</p>
    </article>;
  })}</section>;
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
  const window = windows?.[nationId];
  if (!isWarNation(nationId) || !window || offset === null) return null;
  const { start, end } = defenseWindowLocal(window.startHourUtc, offset);
  return <section aria-label="Defense window">
    <p><strong>{fillWarText(defenseWindow.line.text, { start, end })}</strong></p>
    {defenseWindow.explainer.map(line => <p key={line.text}>{line.text}</p>)}
  </section>;
}

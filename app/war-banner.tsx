'use client';
import type { PublicWar } from '@/lib/war';
import { citizenSafety, mobilizationStatus, noticesFor, type WarNation } from '@/lib/war-copy';
import { fillWarText, isWarNation, warNationNames } from '@/lib/war-rules';
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
      <h4>{fillWarText(notice.headline, names)}</h4>
      <p>{fillWarText(war.casusBelli ? notice.body : notice.bodyNoGrievance, names)}</p>
      {war.status === 'mobilizing'
        ? <><p>{fillWarText(mobilizationStatus.mobilizing[0].text, names)}</p><GameTimer endsAt={war.mobilizationEndsAt * 1000} label="Mobilization ends in" readyLabel="Mobilization over" /></>
        : <p>{mobilizationStatus.active[1].text} {mobilizationStatus.active[0].text}</p>}
      <p>{citizenSafety.lines[0].text}</p>
    </article>;
  })}</section>;
}

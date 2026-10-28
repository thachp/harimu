/** #969: top-bar countdown to the citizen's next scheduled event (docs §23.1). Build flag NEXT_PUBLIC_HARIMU_TOPBAR_COUNTDOWN
 *  ("true" in preview, "false" in production). No sibling imports: node tests load this file directly.
 *  Dates are the #878 calendars (Kindle election and Assembly, Korund Congress, Aurelle claims), the election snapshot
 *  the client already holds, or an active war's mobilization end or daily defense window. Nothing is invented. */
export function topbarCountdownEnabled(value: string | undefined = process.env.NEXT_PUBLIC_HARIMU_TOPBAR_COUNTDOWN): boolean { return value === 'true'; }

export type CountdownLabel = 'Election' | 'Assembly' | 'Congress' | 'Claims' | 'Defense' | 'Mobilization';
export type CountdownMark = { label: CountdownLabel; at: number; when: 'opens' | 'closes' | 'ends' };
export type CountdownWar = { attacker: string; defender: string; status: string; mobilizationEndsAt: number; endedAt: number | null };
export type CountdownInput = {
  nationId: string; now: number; cycleStartAt?: number | null;
  election?: { opensAt: number | null; closesAt: number | null } | null;
  wars?: { wars: CountdownWar[]; defenseWindows?: Record<string, { startHourUtc: number }> } | null;
};

const day = 86400, cycleDays = 120, voteSeconds = 72 * 3600, cycleSeconds = cycleDays * day, defenseSeconds = 4 * 3600;
const isHour = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 23;
const formatDuration = (milliseconds: number) => {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return 'Unavailable';
  const seconds = Math.ceil(milliseconds / 1000);
  if (seconds === 0) return '0s';
  const days = Math.floor(seconds / day), hours = Math.floor(seconds % day / 3600), minutes = Math.floor(seconds % 3600 / 60), rest = seconds % 60;
  return [days ? `${days}d` : '', hours ? `${hours}h` : '', minutes ? `${minutes}m` : '', rest ? `${rest}s` : ''].filter(Boolean).join(' ');
};
/** Days and hours, the way the chip reads ("3d 4h"). Smaller units drop once a larger one is shown. Null when nothing remains. */
export function compactCountdown(remainingMs: number): string | null {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return null;
  const seconds = Math.ceil(remainingMs / 1000);
  const days = Math.floor(seconds / day), hours = Math.floor(seconds % day / 3600), minutes = Math.floor(seconds % 3600 / 60);
  if (days > 0) return hours ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  return minutes ? `${minutes}m` : `${seconds}s`;
}
/** Game day at an epoch second, the same count as the world clock (day 1 at the epoch). */
export const gameDayAt = (epochSeconds: number, atSeconds: number) => Math.floor(Math.max(0, atSeconds - epochSeconds) * 12 / day) + 1;
/** Tooltip: the event, then real time and game time (docs §23.2). Game day only when the world epoch is known. */
export function countdownTip(mark: CountdownMark, nowMs: number, epochSeconds?: number): string {
  const remaining = Math.max(0, mark.at * 1000 - nowMs);
  const verb = mark.when === 'opens' ? 'opens' : mark.when === 'ends' ? 'ends' : 'closes';
  const gameDay = typeof epochSeconds === 'number' && Number.isFinite(epochSeconds) ? ` Game day ${gameDayAt(epochSeconds, mark.at)}.` : '';
  return `${mark.label} ${verb}. ${formatDuration(remaining)} real time; ${formatDuration(remaining * 12)} game time.${gameDay}`;
}
const nextOn = (start: number, firstDay: number, everyDays: number, now: number) => {
  const first = start + firstDay * day, every = everyDays * day;
  const k = now <= first ? 0 : Math.ceil((now - first) / every);
  return first + k * every;
};
/** Next open, or the close when `now` falls inside the 72-hour vote that started at the previous open. */
function voteMark(nextAt: number, now: number, label: CountdownLabel): CountdownMark | null {
  if (!Number.isSafeInteger(nextAt)) return null;
  if (nextAt === now) return { label, at: now + voteSeconds, when: 'closes' };
  if (nextAt < now) return null;
  const opened = nextAt - cycleSeconds, closes = opened + voteSeconds;
  return now >= opened && now < closes ? { label, at: closes, when: 'closes' } : { label, at: nextAt, when: 'opens' };
}
/** The next UTC instant the daily defense window opens, or closes when `now` is already inside it. */
export function defenseWindowBoundary(startHourUtc: number, now: number): { at: number; when: 'opens' | 'closes' } | null {
  if (!isHour(startHourUtc) || !Number.isFinite(now)) return null;
  const sec = ((Math.floor(now) % day) + day) % day, start = startHourUtc * 3600, into = (sec - start + day) % day, day0 = Math.floor(now / day) * day;
  if (into < defenseSeconds) { const at = Math.floor(now) - into + defenseSeconds; return at > now ? { at, when: 'closes' } : null; }
  const at = sec < start ? day0 + start : day0 + day + start;
  return at > now ? { at, when: 'opens' } : null;
}
/** The soonest future mark for this nation, or null when nothing scheduled is known. */
export function nextNationEvent(input: CountdownInput): CountdownMark | null {
  const { nationId, now } = input;
  if (!Number.isSafeInteger(now)) return null;
  const marks: CountdownMark[] = [];
  const add = (mark: CountdownMark | null) => { if (mark && Number.isSafeInteger(mark.at) && mark.at > now) marks.push(mark); };
  const start = typeof input.cycleStartAt === 'number' && Number.isSafeInteger(input.cycleStartAt) && input.cycleStartAt > 0 && String(input.cycleStartAt).length <= 12 ? input.cycleStartAt : null;
  if (start !== null && nationId === 'kindle') {
    add(voteMark(nextOn(start, 30, cycleDays, now), now, 'Election'));
    add(voteMark(nextOn(start, 60, cycleDays, now), now, 'Assembly'));
  } else if (start !== null && nationId === 'korund') { const at = nextOn(start, 30, 150, now); add(at > now ? { label: 'Congress', at, when: 'opens' } : null); }
  else if (start !== null && nationId === 'aurelle') { const at = start + 30 * day; add(now < at ? { label: 'Claims', at, when: 'opens' } : null); }
  if (nationId === 'kindle' && input.election) {
    add(input.election.closesAt != null ? { label: 'Election', at: input.election.closesAt, when: 'closes' } : null);
    add(input.election.opensAt != null ? { label: 'Election', at: input.election.opensAt, when: 'opens' } : null);
  }
  let active = false, mobilization: number | null = null;
  for (const war of input.wars?.wars ?? []) {
    if (war.endedAt !== null || (war.attacker !== nationId && war.defender !== nationId)) continue;
    if (war.status === 'mobilizing' && (mobilization === null || war.mobilizationEndsAt < mobilization)) mobilization = war.mobilizationEndsAt;
    if (war.status === 'active') active = true;
  }
  if (mobilization !== null) add({ label: 'Mobilization', at: mobilization, when: 'ends' });
  if (active) { const boundary = defenseWindowBoundary(input.wars?.defenseWindows?.[nationId]?.startHourUtc ?? -1, now); if (boundary) add({ label: 'Defense', at: boundary.at, when: boundary.when }); }
  return marks.reduce<CountdownMark | null>((best, mark) => !best || mark.at < best.at ? mark : best, null);
}

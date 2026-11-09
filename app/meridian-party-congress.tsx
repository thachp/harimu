'use client';
import { useState, type CSSProperties } from 'react';
import { nationCrest } from '../lib/nation-crests';
import { nationMark } from '../lib/nation-themes';
import { useDisplayTimestamp } from './display-preferences';

/** #1152: Meridian's Party Congress on the Civic panel (docs §7.3).
 *  Build flag NEXT_PUBLIC_HARIMU_MERIDIAN_PARTY_CONGRESS ("true" in preview, "false" in production),
 *  a HARIMU_UI_PACK key. Only the exact string "true" enables it. Layout bundles that omit the
 *  define have no `process`. The date, seat count and suspension rule come from partyState on the
 *  government read. No partyState, or any nation but Meridian: nothing renders. This chooses no
 *  leader and suspends no term limit. */
export function meridianPartyCongressFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_MERIDIAN_PARTY_CONGRESS; }
  catch { return undefined; }
}
export function meridianPartyCongressEnabled(value: string | undefined = meridianPartyCongressFlag()): boolean {
  return value === 'true';
}

const unit = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** Spoken remainder until a future instant. Null when the clock cannot say one. The last minute stays "under 1 minute". */
export function congressRelative(atMs: number, nowMs: number): string | null {
  if (!Number.isSafeInteger(atMs) || atMs < 0 || !Number.isFinite(nowMs)) return null;
  const remaining = atMs - nowMs;
  if (!(remaining > 0)) return null;
  const seconds = Math.floor(remaining / 1000);
  const days = Math.floor(seconds / 86400), hours = Math.floor((seconds % 86400) / 3600), minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return hours ? `in ${unit(days, 'day', 'days')} ${unit(hours, 'hour', 'hours')}` : `in ${unit(days, 'day', 'days')}`;
  if (hours > 0) return minutes ? `in ${unit(hours, 'hour', 'hours')} ${unit(minutes, 'minute', 'minutes')}` : `in ${unit(hours, 'hour', 'hours')}`;
  if (minutes > 0) return `in ${unit(minutes, 'minute', 'minutes')}`;
  return 'in under 1 minute';
}

type PartyState = {
  standingCommitteeSeats?: number | null;
  nextCongressAt?: number | null;
  termLimitsSuspendable?: boolean | null;
  suspendSupermajority?: string | null;
};

/** A safe millisecond instant, in the same UTC words other Civic surfaces use. A missing date is omitted. */
function congressDate(value: number | null | undefined, formatTime: (stamp: string | number) => string): { dateTime: string; label: string } | null {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const label = formatTime(value);
  return label === 'Time unavailable' ? null : { dateTime: date.toISOString(), label };
}

/** Accessible name for the date row: the shared timestamp, then the spoken remainder when one exists. */
export function congressWhenName(dateLabel: string, relative: string | null): string {
  return relative ? `Next Party Congress, ${dateLabel}, ${relative}.` : `Next Party Congress, ${dateLabel}.`;
}

export function MeridianPartyCongress({ nationId, partyState, nowMs }: {
  nationId: string;
  partyState?: PartyState | null;
  nowMs?: number;
}) {
  const formatTime = useDisplayTimestamp();
  // A caller (the congress tests) passes nowMs. The Civic panel does not: sample the clock once, the same way the dock does, so render stays pure.
  const [sampledNow] = useState(() => nowMs ?? Date.now());
  const now = nowMs ?? sampledNow;
  if (!meridianPartyCongressEnabled() || nationId !== 'meridian' || partyState == null || typeof partyState !== 'object') return null;
  const dated = congressDate(partyState.nextCongressAt, formatTime);
  const relative = dated ? congressRelative(partyState.nextCongressAt as number, now) : null;
  const seats = typeof partyState.standingCommitteeSeats === 'number' && Number.isSafeInteger(partyState.standingCommitteeSeats) && partyState.standingCommitteeSeats > 0
    ? partyState.standingCommitteeSeats : null;
  const supermajority = partyState.termLimitsSuspendable === true && typeof partyState.suspendSupermajority === 'string' && partyState.suspendSupermajority.trim()
    ? partyState.suspendSupermajority.trim() : null;
  if (!dated && seats == null && !supermajority) return null;
  const mark = nationMark('meridian'), crest = nationCrest('meridian');
  const style = {
    '--md-field': crest?.field ?? '#8c3d22', '--md-paper': crest?.mark ?? '#f6ead3',
    '--md-slate': crest?.accent ?? '#d8d4cc', '--md-accent': mark?.accent ?? '#b88cac',
  } as CSSProperties;
  const when = dated ? congressWhenName(dated.label, relative) : null;
  const seatText = seats == null ? null : `${seats}-seat Standing Committee`;
  const limitText = supermajority ? `Term limits can be suspended by a ${supermajority} Congress vote.` : null;
  return <section className="meridian-congress" style={style} aria-label="Party Congress" data-nation-pattern={mark?.pattern ?? 'crosshatch'}>
    <h3>
      <span className="meridian-congress-mark" data-nation-pattern={mark?.pattern ?? 'crosshatch'} aria-hidden="true">{mark?.symbol ?? '▲'}</span>
      Party Congress
    </h3>
    {dated ? <p className="meridian-congress-when" aria-label={when ?? undefined}>
      <span className="meridian-congress-line">
        <span className="meridian-congress-label">Next Party Congress</span>
        <time className="meridian-congress-date" dateTime={dated.dateTime}>{dated.label}</time>
        {relative ? <span className="meridian-congress-relative">{relative}</span> : null}
      </span>
    </p> : null}
    {seatText ? <p className="meridian-congress-seats">{seatText}</p> : null}
    {limitText ? <p className="meridian-congress-limits">{limitText}</p> : null}
  </section>;
}

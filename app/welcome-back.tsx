'use client';
/** #739 slice 1: the Welcome back briefing (docs §17.4), shown once when GET /api/citizen reports a return after Away or longer.
 *  Copy from lib/dormancy-copy.ts (#608). A nation without its own frame gets the plain civic frame, which has no byline. */
import { WELCOME_BACK_TITLE, welcomeBackFor, dormancyStatusFor, DORMANCY_NAME_MAX, type DormancyNation } from '@/lib/dormancy-copy';

export type WelcomeBackData = { status: 'away' | 'dormant' | 'archived'; since: string };

export function daysAwayText(since: string, now: number) {
  const days = Math.max(1, Math.floor((now - Date.parse(since)) / 86_400_000));
  return `${days} real day${days === 1 ? '' : 's'}`.slice(0, DORMANCY_NAME_MAX);
}

export function WelcomeBack({ nationId, data, now, onClose }: { nationId: string | null | undefined; data: WelcomeBackData; now: number; onClose: () => void }) {
  const frame = welcomeBackFor(nationId as DormancyNation) ?? welcomeBackFor('kindle')!, status = dormancyStatusFor(data.status);
  return <section className="game-first-loop game-welcome-back" role="status" aria-label={WELCOME_BACK_TITLE}>
    <strong>{WELCOME_BACK_TITLE}</strong>{' '}
    <span>{frame.greeting.text.replace('{daysAway}', daysAwayText(data.since, now))}</span>
    {status && <span> {status.label}: {status.paused.at(-1)?.text}</span>}{' '}
    <button type="button" onClick={onClose}>Dismiss</button>
  </section>;
}

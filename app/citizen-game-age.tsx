'use client';
import { citizenGameAge, citizenGameAgeEnabled, formatCitizenGameAge } from '@/lib/citizen-game-age';

export { citizenGameAgeEnabled };

/** #1042: one line on the player's own citizen card. Nothing when the flag is off, this is the guest demo, or the world clock is missing. */
export function CitizenGameAgeLine({ enabled = citizenGameAgeEnabled(), guest = false, clock, enrolledAt }: {
  enabled?: boolean;
  guest?: boolean;
  clock?: { epochSeconds?: number | null; nowSeconds?: number | null } | null;
  enrolledAt?: string | null;
}) {
  if (!enabled || guest) return null;
  const joinedAtMs = typeof enrolledAt === 'string' ? Date.parse(enrolledAt) : Number.NaN;
  const age = citizenGameAge(clock, joinedAtMs);
  if (!age) return null;
  return <p className="citizen-game-age">{formatCitizenGameAge(age)}</p>;
}

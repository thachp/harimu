/** #1048, docs §17.1: the next faith festival on the #68 game-day clock, with that nation's stance.
 *  [ASSUMPTION] only the six festivals #68 schedules are placed. Lumen Canon, The Round and the Quiet Path
 *  have #209 copy but no #68 day, so they are not on this line.
 *  [ASSUMPTION] the game date is the festival's day of the 360-day year (not the world-epoch season).
 *  [ASSUMPTION] Kindle, Aurelle and Korund are the only nations with a #68 stance; any other nation omits the line.
 *  Short labels only. The tooltip reuses #270 festivalStanceCopy. HARIMU_FAITH_FESTIVAL_HUD_ENABLED is read
 *  with flagOn on the server (HARIMU_UI_PACK). This module never reads process.env. */
import { flagOn } from './flag-pack.mjs';
import { festivalStance, type FestivalStance } from './festival-stance.ts';
import { festivalStanceCopy, type MvpNationId } from './mvp-festival-copy.ts';
import { faithFestivalSlots, festivalInstant } from './game-season.ts';

export const faithFestivalHudEnabled = (env?: unknown) => flagOn(env, 'HARIMU_FAITH_FESTIVAL_HUD_ENABLED');

const stanceLabels: Record<FestivalStance, string> = {
  endorsed: 'Endorsed (public holiday)',
  tolerated: 'Tolerated',
  banned: 'Banned',
};

const mvpNation = (id: string): MvpNationId | null => (id === 'kindle' || id === 'aurelle' || id === 'korund' ? id : null);

export type FaithFestivalHud = {
  name: string; dayOfYear: number; stance: FestivalStance; stanceLabel: string; tip: string | null;
  startsAt: number; endsAt: number; active: boolean;
};

/** The next (or current) faith festival for `nationId` at `nowMs`. Null when the clock is bad or the nation has no #68 stance. */
export function nextFaithFestivalAt(nationId: string, nowMs: number): FaithFestivalHud | null {
  if (!Number.isFinite(nowMs)) return null;
  const picks = faithFestivalSlots.map(slot => ({ ...slot, ...festivalInstant(0, slot.dayOfYear, nowMs) })).sort((a, b) => a.startsAt - b.startsAt || a.dayOfYear - b.dayOfYear);
  const pick = picks[0];
  if (!pick) return null;
  const stance = festivalStance(nationId, pick.faithId);
  if (!stance) return null;
  const nation = mvpNation(nationId);
  return {
    name: pick.name, dayOfYear: pick.dayOfYear, stance, stanceLabel: stanceLabels[stance],
    tip: nation ? festivalStanceCopy[nation][stance]?.text ?? null : null,
    startsAt: pick.startsAt, endsAt: pick.endsAt, active: pick.active,
  };
}

export const faithFestivalHudLine = (f: Pick<FaithFestivalHud, 'name' | 'dayOfYear' | 'stanceLabel' | 'active'>) =>
  `Next faith festival: ${f.name} · day ${f.dayOfYear} · ${f.stanceLabel}${f.active ? ' · today' : ''}`;

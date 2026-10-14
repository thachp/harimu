/** #68: festivals for the three MVP faiths (docs §14.1, §14.4). Two festivals per faith on the game clock. Each MVP nation's
 * stance follows its official faith stance (§14.2): Kindle treats all faiths equally (secular pluralism: it never endorses or
 * bans one faith, so every festival is tolerated), Aurelle endorses the Kinward Rite's festivals as public holidays and
 * tolerates the others in private worship, and Korund bans all of them publicly. Everything here is derived on read; the only
 * write is a citizen joining a festival (POST /api/faith, action "join-festival"). Behind HARIMU_FAITH_ENABLED. */
import { festivalStanceCopy, mvpFestivalCopy, type MvpFestivalId, type MvpNationId } from './mvp-festival-copy';
import type { GameDatabase } from './database-contract';

export const festivalYearGameDays = 360; // [ASSUMPTION] a game year is 360 game days (30 real days at the 12x clock)
export const devotionPerFestival = 3; // [ASSUMPTION] joining once per festival occurrence
export type FestivalStance = 'endorsed' | 'tolerated' | 'banned';

/** Day of the game year each festival falls on; each lasts one game day (2 real hours). Spaced 60 game days apart. [ASSUMPTION] */
export const festivalDayOfYear: Readonly<Record<MvpFestivalId, number>> = {
  'launching': 30, 'oath-day': 90, 'bread-day': 150, 'safe-return': 210, 'night-of-names': 270, 'day-of-the-open-door': 330,
};

export const festivalSchemas = [
  `CREATE TABLE IF NOT EXISTS citizen_festival_joins (
 user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id) ON DELETE CASCADE,
 festival_id TEXT NOT NULL CHECK(festival_id IN ('night-of-names','oath-day','launching','safe-return','bread-day','day-of-the-open-door')),
 occurrence INTEGER NOT NULL,
 faith_id TEXT NOT NULL CHECK(faith_id IN ('kinward-rite','fair-wind-vow','open-hand')),
 game_day INTEGER NOT NULL,
 joined_at INTEGER NOT NULL,
 request_id TEXT NOT NULL UNIQUE,
 PRIMARY KEY(user_id, festival_id, occurrence)
)`,
];

/** Stance of a nation toward a festival of a faith (pure). Kindle: equal treatment of all faiths. */
export function festivalStance(nationId: string, faithId: string): FestivalStance | null {
  if (nationId === 'kindle') return 'tolerated';
  if (nationId === 'aurelle') return faithId === 'kinward-rite' ? 'endorsed' : 'tolerated';
  if (nationId === 'korund') return 'banned';
  return null;
}

const iso = (seconds: number) => new Date(seconds * 1000).toISOString();

/** Calendar, stances and today's effects for one nation and one citizen faith, at game day `today` (pure). */
export function festivalCalendar(nationId: string, citizenFaith: string | null, today: number, gameDaySeconds: number, joined: ReadonlySet<string>, enabled: boolean) {
  const year = Math.floor(today / festivalYearGameDays); const dayOfYear = today - year * festivalYearGameDays;
  const nation = (['kindle', 'korund', 'aurelle'] as const).includes(nationId as MvpNationId) ? nationId as MvpNationId : null;
  const festivals = mvpFestivalCopy.map(copy => {
    const fixed = festivalDayOfYear[copy.id];
    const occurrence = dayOfYear <= fixed ? year : year + 1;
    const gameDay = occurrence * festivalYearGameDays + fixed;
    const active = gameDay === today;
    const stance = nation ? festivalStance(nation, copy.faithId) : null;
    const stanceLine = nation && stance ? festivalStanceCopy[nation][stance]?.text ?? null : null;
    const adherent = citizenFaith === copy.faithId;
    const hasJoined = joined.has(`${copy.id}:${occurrence}`);
    const joinBlockedReason = !enabled ? 'Faith is not open yet.' : !nation ? 'Festivals are held in Kindle, Korund and Aurelle for now.'
      : stance === 'banned' ? 'Faith festivals are not held publicly in Korund.' : !adherent ? `Only followers of this faith can join ${copy.name}.`
      : !active ? `${copy.name} has not begun yet.` : hasJoined ? `You already joined ${copy.name}.` : null;
    return {
      id: copy.id, faithId: copy.faithId, name: copy.name, description: copy.description, stance, stanceLine,
      occurrence, gameDay, gameYear: occurrence, dayOfYear: fixed, startsAt: iso(gameDay * gameDaySeconds), endsAt: iso((gameDay + 1) * gameDaySeconds),
      active, publicHoliday: stance === 'endorsed',
      // A banned festival shows no public banner in that nation (§14.6); adherents see the banner while it is active.
      banner: active && stance !== 'banned' && adherent ? { text: copy.active, joinButton: copy.joinButton } : null,
      joined: hasJoined, joinBlockedReason,
    };
  }).sort((a, b) => a.gameDay - b.gameDay);
  const activeToday = festivals.filter(f => f.active);
  const holidayToday = activeToday.find(f => f.publicHoliday) ?? null;
  return {
    festivals,
    holiday: holidayToday ? { festivalId: holidayToday.id, name: holidayToday.name, shiftReduction: 1, stabilityRaised: true, line: holidayToday.stanceLine } : null,
    // Derived ban notices: one per active festival in a banning nation. Named without the faith (§14.6).
    banEvents: activeToday.filter(f => f.stance === 'banned').map(f => ({ festivalId: f.id, gameDay: f.gameDay, at: f.startsAt, text: f.stanceLine })),
  };
}

/** Festival joins on record for a citizen (absent before migration 0027 is applied, so read as none). */
export async function festivalJoins(db: GameDatabase, userId: string): Promise<{ festival_id: string; occurrence: number; faith_id: string; game_day: number; joined_at: number }[]> {
  try { return (await db.prepare('SELECT festival_id,occurrence,faith_id,game_day,joined_at FROM citizen_festival_joins WHERE user_id=? ORDER BY game_day').bind(userId).all<{ festival_id: string; occurrence: number; faith_id: string; game_day: number; joined_at: number }>()).results; }
  catch { return []; }
}

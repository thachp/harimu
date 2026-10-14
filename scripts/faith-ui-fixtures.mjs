/** #280: faith / congregation API states for the UI checks, built from the real copy files (no wording is written here).
 *  Shapes mirror readFaith() and readCongregations(); tests/faith-panel.test.mjs compares them with the live routes
 *  so these cannot drift. Used by the layout check (npm run test:layout) and the screenshot script. */
import { faithCopy, unaffiliatedCopy, devotionTier } from '../lib/faith-copy.ts';
import { worshipCopy } from '../lib/worship-copy.ts';
import { mvpFestivalCopy, festivalStanceCopy } from '../lib/mvp-festival-copy.ts';
export const kinwardLeaveBlockedReason = 'Leaving the Kinward Rite costs Royal Favor in Aurelle. Spending Royal Favor is not built yet, so this change is unavailable for now.';
const publicOptions = { kindle: ['kinward-rite', 'fair-wind-vow', 'open-hand', 'unaffiliated'], aurelle: ['kinward-rite', 'fair-wind-vow', 'open-hand', 'unaffiliated'], korund: ['unaffiliated'] };
const label = id => id === 'unaffiliated' ? unaffiliatedCopy.name : faithCopy[id].name;
const festival = (id, extra) => { const c = mvpFestivalCopy.find(f => f.id === id); return { id, faithId: c.faithId, name: c.name, description: c.description, stance: 'tolerated', stanceLine: null, occurrence: 2, gameDay: 1000, gameYear: 2, dayOfYear: 280, startsAt: '2026-10-14T00:00:00.000Z', endsAt: '2026-10-14T02:00:00.000Z', active: false, publicHoliday: false, banner: null, joined: false, joinBlockedReason: `Only followers of this faith can join ${c.name}.`, ...extra }; };

/** nation: kindle|aurelle|korund. Options: faith, devotion, chosen, worshippedToday, locked (cooldown), holiday (oath-day in Aurelle), festival (a joinable banner). */
export function faithState({ nation = 'kindle', faith = nation === 'aurelle' ? 'kinward-rite' : nation === 'korund' ? 'unaffiliated' : 'fair-wind-vow', devotion = 34, chosen = true, worshippedToday = false, locked = false, holiday = false, festivalBanner = false } = {}) {
  const w = faith !== 'unaffiliated' ? worshipCopy[faith] : null;
  const festivals = [];
  if (holiday) { const line = festivalStanceCopy.aurelle.endorsed.text; festivals.push(festival('oath-day', { stance: 'endorsed', stanceLine: line, active: true, publicHoliday: true, banner: faith === 'kinward-rite' ? { text: mvpFestivalCopy.find(f => f.id === 'oath-day').active, joinButton: 'Join the festival' } : null, joinBlockedReason: faith === 'kinward-rite' ? null : 'Only followers of this faith can join Oath Day.' })); }
  if (festivalBanner) festivals.push(festival('launching', { active: true, banner: { text: mvpFestivalCopy.find(f => f.id === 'launching').active, joinButton: 'Join the festival' }, joinBlockedReason: null }));
  const holidayInfo = holiday ? { festivalId: 'oath-day', name: 'Oath Day', shiftReduction: 1, stabilityRaised: true, line: festivalStanceCopy.aurelle.endorsed.text } : null;
  const lockedAt = 1_800_000_000 + 60 * 86400;
  return {
    enabled: true, supported: true, nationId: nation,
    faith: { id: faith, name: label(faith), chosen, chosenAt: chosen ? 1_800_000_000 : null },
    hiddenFaith: null, options: { public: publicOptions[nation].map(id => ({ id, name: label(id) })), hidden: nation === 'korund' ? ['kinward-rite', 'fair-wind-vow', 'open-hand'].map(id => ({ id, name: faithCopy[id].name })) : [] },
    devotion: { value: devotion, max: 100, tier: w ? devotionTier(devotion) : null, explanation: 'Devotion gives social standing only. It never changes wages, production, prices or combat.' },
    worship: w ? { ...w, gameDay: 1000, worshippedToday, nextAt: worshippedToday ? 1_800_007_200 : null } : null,
    worshipBlockedReason: !w ? (nation === 'korund' ? 'Public worship is not permitted in Korund.' : 'Choose a faith to attend worship.') : worshippedToday ? 'You have already attended worship this game day. Come back tomorrow.' : null,
    changeAvailableAt: locked ? lockedAt : null,
    changeBlockedReason: locked ? `You can change faith once every 60 real days. Next change: ${new Date(lockedAt * 1000).toISOString().slice(0, 10)}.` : null,
    festivals, holiday: holidayInfo, banEvents: [],
    leaveBlockedReason: nation === 'aurelle' && faith === 'kinward-rite' ? kinwardLeaveBlockedReason : null,
  };
}

const capitals = { kindle: ['Forgehaven', 'Kindle Republic'], korund: ['Stonehearth', 'Korund'], aurelle: ['Highspire', 'Aurelle'] };
const faithsFor = { kindle: ['kinward-rite', 'fair-wind-vow', 'open-hand'], aurelle: ['kinward-rite', 'fair-wind-vow', 'open-hand'], korund: ['kinward-rite', 'fair-wind-vow', 'open-hand'] };
/** The congregations panel. member: joined (or not); officiant: the viewer is the Officiant; opt: standing for Officiant. */
export function congregationState({ nation = 'kindle', faith = 'fair-wind-vow', member = false, opt = false, officiant = false, blocked = null } = {}) {
  const congregations = Object.keys(capitals).flatMap(n => faithsFor[n].map(f => ({ id: `${f}:${n}`, faithId: f, faithName: faithCopy[f].name, nationId: n, cityId: n, cityName: capitals[n][0], joinable: n !== 'korund',
    members: n === nation && f === faith ? (member ? 12 : 11) : 3, officiant: n === nation && f === faith ? { name: 'Mira of the Long Wharf', sinceGameDay: 990 } : null })));
  return { enabled: true, congregations, you: { congregationId: member ? `${faith}:${nation}` : null, officiantOptIn: member && opt, isOfficiant: member && officiant, officiatedToday: false, changeBlockedReason: blocked }, officiantChallengeGameDays: 7,
    explanation: 'Congregations and clergy office give social standing only. They never change wages, production, prices or combat.' };
}

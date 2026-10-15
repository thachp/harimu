/** #280: faith / congregation API states for the UI checks, built from the real copy files (no wording is written here).
 *  Shapes mirror readFaith() and readCongregations(); tests/faith-panel.test.mjs compares them with the live routes
 *  so these cannot drift. Used by the layout check (npm run test:layout) and the screenshot script. */
import { faithCopy, unaffiliatedCopy, devotionTier } from '../lib/faith-copy.ts';
import { worshipCopy } from '../lib/worship-copy.ts';
import { hostPermissionNotices, invitationCopy, muteCopy, acceptStepLines } from '../lib/missionary-copy.ts';
import { hostDecision, missionaryConfig, missionaryLabels, missionNations } from '../lib/missionary-rules.ts';
import { mvpFestivalCopy, festivalStanceCopy } from '../lib/mvp-festival-copy.ts';
export const kinwardLeaveFavorCost = 10; // lib/faith.ts
export const kinwardLeaveBlockedReason = balance => `Leaving the Kinward Rite costs ${kinwardLeaveFavorCost} Royal Favor in Aurelle. You have ${balance}. Serve the Crown to earn more.`;
const publicOptions = { kindle: ['kinward-rite', 'fair-wind-vow', 'open-hand', 'unaffiliated'], aurelle: ['kinward-rite', 'fair-wind-vow', 'open-hand', 'unaffiliated'], korund: ['unaffiliated'] };
const label = id => id === 'unaffiliated' ? unaffiliatedCopy.name : faithCopy[id].name;
const festival = (id, extra) => { const c = mvpFestivalCopy.find(f => f.id === id); return { id, faithId: c.faithId, name: c.name, description: c.description, stance: 'tolerated', stanceLine: null, occurrence: 2, gameDay: 1000, gameYear: 2, dayOfYear: 280, startsAt: '2026-10-14T00:00:00.000Z', endsAt: '2026-10-14T02:00:00.000Z', active: false, publicHoliday: false, banner: null, joined: false, joinBlockedReason: `Only followers of this faith can join ${c.name}.`, ...extra }; };

const nationNames = { kindle: 'Kindle', korund: 'Korund', aurelle: 'Aurelle' };
const refusal = (home, host, faith) => { const d = hostDecision(home, host, faith); return d.allowed ? null : d.reason === 'host_banned' ? hostPermissionNotices.korund[0].text : d.reason === 'host_private_only' ? hostPermissionNotices.aurelle[0].text : 'A missionary preaches abroad. Pick another nation.'; };
/** #225: mirrors readMissionary(). mission: null | { status, host }; offer: a faith id a host-city citizen is invited to; here: faith ids of badges in the viewer's city. */
export function missionaryState({ nation = 'kindle', faith = 'fair-wind-vow', devotion = 34, mission = null, offer = null, here = [], muted = false, notice = null } = {}) {
  const publicFaith = faith !== 'unaffiliated' ? faith : null;
  const devotionReason = !publicFaith ? 'Choose a public faith before you can send a missionary.' : devotion < missionaryConfig.minDevotion ? `Reach ${missionaryConfig.minDevotion} Devotion before you can send a missionary abroad. You have ${devotion}.` : null;
  const at = 1_800_000_000;
  const m = mission && { id: 'mission-fixture', faithId: faith, faithName: label(faith), hostNation: mission.host, hostName: nationNames[mission.host], status: mission.status, statusText: missionaryLabels.statusText(mission.status, nationNames[mission.host]),
    requestedAt: at, expiresAt: at + 86400, arrivesAt: mission.status === 'invited' ? null : at + 600, endsAt: mission.status === 'invited' ? null : at + 600 + 3 * 7200, travelSeconds: 600 };
  const card = offer && invitationCopy[offer];
  return {
    minDevotion: missionaryConfig.minDevotion, presenceGameDays: missionaryConfig.presenceGameDays, mission: m,
    request: { blockedReason: m ? 'You already have a mission. Finish it before you start another.' : devotionReason,
      hosts: missionNations.filter(n => n !== nation).map(host => { const reason = publicFaith ? refusal(nation, host, publicFaith) : null; return { nationId: host, name: nationNames[host], allowed: reason === null, reason }; }) },
    here: here.map((id, i) => ({ missionId: `mission-here-${i}`, faithId: id, faithName: label(id), until: at + 3600, line: missionaryLabels.here(label(id)) })),
    offer: card ? { missionId: 'mission-offer', faithId: offer, faithName: label(offer), pitch: card.pitch, body: card.body, buttons: { ...card.buttons }, warnings: acceptStepLines(nation, publicFaith, offer).map(l => l.text) } : null,
    notice, muted,
    labels: { heading: missionaryLabels.heading, intro: missionaryLabels.intro, setOut: missionaryLabels.setOut, send: Object.fromEntries(missionNations.map(n => [n, missionaryLabels.send(nationNames[n])])) },
    mute: { label: muteCopy.label.text, muted: muteCopy.muted.text, unmuted: muteCopy.unmuted.text },
  };
}

/** nation: kindle|aurelle|korund. Options: faith, devotion, chosen, worshippedToday, locked (cooldown), holiday (oath-day in Aurelle), festival (a joinable banner). */
export function faithState({ nation = 'kindle', faith = nation === 'aurelle' ? 'kinward-rite' : nation === 'korund' ? 'unaffiliated' : 'fair-wind-vow', devotion = 34, chosen = true, missionary: missionaryOptions = {}, worshippedToday = false, locked = false, holiday = false, festivalBanner = false, royalFavor = 14 } = {}) {
  const leaving = nation === 'aurelle' && faith === 'kinward-rite'; // lib/faith.ts leavesKinward
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
    leaveCost: leaving ? kinwardLeaveFavorCost : null, royalFavor: leaving ? royalFavor : null,
    leaveBlockedReason: leaving && royalFavor < kinwardLeaveFavorCost ? kinwardLeaveBlockedReason(royalFavor) : null,
    underground: null, // #295: only a Korund hidden-faith holder gets this block
    missionary: nation === 'korund' ? null : missionaryState({ nation, faith, devotion, ...missionaryOptions }), // #404: Korund has no public faith, so no missionary state // #225 (the live read is null only when the flag is off or the nation is unsupported)
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

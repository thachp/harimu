/** #225: the write side of cross-border missionaries (POST actions only; see lib/missionaries.ts for the rules and the read side). Behind HARIMU_FAITH_ENABLED.
 *  request-mission (host permission) -> accept-mission (travel timer, then presence) -> a host citizen's answer-mission (Accept converts through chooseFaith, so the
 *  60-real-day cooldown applies; Not now declines) and mute-missionaries. Idempotent per requestId. */
import type { GameDatabase } from './database-contract';
import { chooseFaith, readFaith } from './faith';
import { missionColumns, missionTimes, missionTravelSeconds, openMission, answered, citizenCity, faithName, hostCityId, hostRefusal, lastAnswerAt, isMuted, nationName, outcomeText, presenceSeconds,
  type MissionRow } from './missionaries';
import { invitationAllowed, isMissionFaith, isMissionNation, missionaryConfig as cfg, missionStatus, nextInvitationAt } from './missionary-rules';
import { missionaryCooldowns } from './missionary-notice-copy';

const fail = (status: 400 | 403 | 409, reason: string, error: string) => ({ ok: false as const, status, reason, error });
const isoDate = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 10);
const disabled = () => fail(403, 'disabled', 'Faith is not open yet.');
const byRequest = (db: GameDatabase, requestId: string) => db.prepare(`SELECT ${missionColumns} FROM faith_missions WHERE request_id=?`).bind(requestId).first<MissionRow>();

/** Ask for an invitation to another nation's capital. The host's stance decides at once (Kindle yes, Aurelle only the Kinward Rite, Korund no). One open mission per citizen. */
export async function requestMission(db: GameDatabase, userId: string, command: { requestId: string; hostNation: string }, now: number, enabled: boolean) {
  if (!enabled) return disabled();
  const prior = await byRequest(db, command.requestId);
  if (prior) return prior.user_id === userId && prior.host_nation === command.hostNation ? { ok: true as const, replay: true as const, state: await readFaith(db, userId, now, enabled) }
    : fail(409, 'request_reused', 'That request id was already used for a different mission.');
  const state = await readFaith(db, userId, now, enabled);
  if (!state.supported) return fail(403, 'unsupported_nation', 'Missionaries are available to Kindle, Korund and Aurelle citizens for now.');
  if (!isMissionNation(command.hostNation)) return fail(400, 'bad_nations', 'A missionary can go to Kindle, Korund or Aurelle.');
  if (!state.worship) return fail(409, 'no_public_faith', 'Choose a public faith before you can send a missionary.');
  if (state.devotion.value < cfg.minDevotion) return fail(409, 'devotion_too_low', `Reach ${cfg.minDevotion} Devotion before you can send a missionary abroad. You have ${state.devotion.value}.`);
  const faithId = state.worship.faithId; const home = state.nationId as string;
  if (!isMissionFaith(faithId) || !isMissionNation(home)) return fail(403, 'unsupported_nation', 'Missionaries are available to Kindle, Korund and Aurelle citizens for now.');
  const refusal = hostRefusal(home, command.hostNation, faithId);
  if (refusal) return fail(command.hostNation === 'korund' ? 403 : 409, command.hostNation === home ? 'same_nation' : command.hostNation === 'korund' ? 'host_banned' : 'host_private_only', refusal);
  if (await openMission(db, userId, now)) return fail(409, 'mission_active', 'You already have a mission. Finish it before you start another.');
  // Close a finished mission, then insert. The unique one-open-per-citizen index makes a concurrent second request a no-op.
  await db.batch([
    db.prepare(`UPDATE faith_missions SET closed_at=? WHERE user_id=? AND closed_at IS NULL AND ((accepted_at IS NULL AND expires_at<=?) OR (accepted_at IS NOT NULL AND ends_at<=?))`).bind(now, userId, now, now),
    db.prepare(`INSERT INTO faith_missions (id,user_id,faith_id,home_nation,host_nation,host_city_id,requested_at,expires_at,request_id)
      SELECT ?,?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM faith_missions WHERE user_id=? AND closed_at IS NULL) ON CONFLICT DO NOTHING`)
      .bind(`mission-${crypto.randomUUID()}`, userId, faithId, home, command.hostNation, hostCityId(command.hostNation), now, now + cfg.inviteTtlSeconds, command.requestId, userId),
  ]);
  const saved = await byRequest(db, command.requestId);
  if (!saved) return fail(409, 'mission_active', 'You already have a mission. Finish it before you start another.');
  return { ok: true as const, completion: `${nationName[command.hostNation]} will receive your missionary. Accept the invitation to set out.`, state: await readFaith(db, userId, now, enabled) };
}

/** Accept the issued invitation: the missionary sets out and arrives after the capital-to-capital travel time, then holds the badge for 3 game days. */
export async function acceptMission(db: GameDatabase, userId: string, command: { requestId: string }, now: number, enabled: boolean) {
  if (!enabled) return disabled();
  const prior = await db.prepare(`SELECT ${missionColumns} FROM faith_missions WHERE accept_request_id=?`).bind(command.requestId).first<MissionRow>();
  if (prior) return prior.user_id === userId ? { ok: true as const, replay: true as const, state: await readFaith(db, userId, now, enabled) } : fail(409, 'request_reused', 'That request id was already used.');
  const rows = (await db.prepare(`SELECT ${missionColumns} FROM faith_missions WHERE user_id=? AND closed_at IS NULL AND accepted_at IS NULL`).bind(userId).all<MissionRow>()).results;
  const mission = rows[0];
  if (!mission) return fail(409, 'no_invitation', 'You have no invitation waiting.');
  if (missionStatus(missionTimes(mission), now) === 'lapsed') return fail(409, 'invitation_expired', 'That invitation has lapsed. Ask for a new one.');
  const arrives = now + missionTravelSeconds(mission.home_nation, mission.host_nation);
  await db.prepare(`UPDATE faith_missions SET accepted_at=?,arrives_at=?,ends_at=?,accept_request_id=? WHERE id=? AND user_id=? AND accepted_at IS NULL AND closed_at IS NULL AND expires_at>?`)
    .bind(now, arrives, arrives + presenceSeconds(), command.requestId, mission.id, userId, now).run();
  const saved = await db.prepare(`SELECT ${missionColumns} FROM faith_missions WHERE accept_request_id=?`).bind(command.requestId).first<MissionRow>();
  if (!saved || saved.user_id !== userId) return fail(409, 'no_invitation', 'You have no invitation waiting.');
  return { ok: true as const, completion: `Your missionary is on the way to ${nationName[mission.host_nation]}.`, state: await readFaith(db, userId, now, enabled) };
}

/** A host-capital citizen answers the invitation of a missionary present in their city. Accept converts through chooseFaith (60-day cooldown, Royal Favor cost, host faiths);
 *  Not now declines. One answer per citizen per mission, and one invitation per citizen per 14 real days. Nothing here converts anyone without this explicit call. */
export async function answerMission(db: GameDatabase, userId: string, command: { requestId: string; missionId: string; answer: 'accept' | 'decline' }, now: number, enabled: boolean) {
  if (!enabled) return disabled();
  const prior = await db.prepare('SELECT user_id,mission_id,outcome FROM missionary_responses WHERE request_id=?').bind(command.requestId).first<{ user_id: string; mission_id: string; outcome: string }>();
  if (prior) {
    if (prior.user_id !== userId || prior.mission_id !== command.missionId) return fail(409, 'request_reused', 'That request id was already used.');
    // A retry of an accepted answer finishes the conversion idempotently (chooseFaith keys on the same request id), so a dropped connection never leaves "accepted" without the faith change.
    if (prior.outcome === 'accepted') {
      const mission = await db.prepare(`SELECT ${missionColumns} FROM faith_missions WHERE id=?`).bind(command.missionId).first<MissionRow>();
      if (mission) { const converted = await chooseFaith(db, userId, { requestId: command.requestId, faithId: mission.faith_id, hiddenFaithId: null }, now, enabled); if (!converted.ok) { await release(db, userId, command); return converted; } }
    }
    return { ok: true as const, replay: true as const, state: await readFaith(db, userId, now, enabled) };
  }
  const state = await readFaith(db, userId, now, enabled);
  if (!state.supported) return fail(403, 'unsupported_nation', 'Missionaries visit Kindle, Korund and Aurelle citizens for now.');
  const mission = await db.prepare(`SELECT ${missionColumns} FROM faith_missions WHERE id=?`).bind(command.missionId).first<MissionRow>();
  const nation = state.nationId as string;
  const here = mission && mission.user_id !== userId && mission.host_nation === nation && missionStatus(missionTimes(mission), now) === 'present' && mission.host_city_id === await citizenCity(db, userId, nation);
  if (!mission || !here) return fail(409, 'no_mission_here', 'No missionary is in your city right now.');
  if (await isMuted(db, userId)) return fail(409, 'muted', 'You have muted missionaries.');
  if (await answered(db, userId, mission.id)) return fail(409, 'already_answered', 'You have already answered this invitation.');
  const last = await lastAnswerAt(db, userId);
  if (!invitationAllowed(last, now)) return fail(409, 'invitation_recent', missionaryCooldowns.invitation.text.replace('{readyAt}', isoDate(nextInvitationAt(last)!)));
  if (mission.faith_id === state.faith.id) return fail(409, 'same_faith', 'That is already your faith.');
  // #404: the (user_id, mission_id) response row is the single claim and is taken BEFORE any faith change. Whoever inserts it decides: a second answer (Accept then Not now,
  // two tabs, concurrent calls, different request ids) finds the row owned by another request and stops, so the stored outcome always matches what happened.
  await db.prepare('INSERT INTO missionary_responses (user_id,mission_id,outcome,responded_at,request_id) VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING')
    .bind(userId, mission.id, command.answer === 'accept' ? 'accepted' : 'declined', now, command.requestId).run();
  const claim = await db.prepare('SELECT request_id FROM missionary_responses WHERE user_id=? AND mission_id=?').bind(userId, mission.id).first<{ request_id: string }>();
  if (claim?.request_id !== command.requestId) return fail(409, 'already_answered', 'You have already answered this invitation.');
  let completion: string = outcomeText.declined;
  if (command.answer === 'accept') {
    const converted = await chooseFaith(db, userId, { requestId: command.requestId, faithId: mission.faith_id, hiddenFaithId: null }, now, enabled);
    if (!converted.ok) { await release(db, userId, command); return converted; } // cooldown, insufficient_royal_favor, not_allowed: nothing changed, the claim is given back and the invitation stays open
    completion = outcomeText.success(faithName(mission.faith_id));
  }
  return { ok: true as const, completion, state: await readFaith(db, userId, now, enabled) };
}
/** Give back a claim whose conversion did not happen (only the request that took it can). */
const release = (db: GameDatabase, userId: string, command: { requestId: string }) => db.prepare('DELETE FROM missionary_responses WHERE user_id=? AND request_id=?').bind(userId, command.requestId).run();

/** Full mute: no invitations reach the citizen while muted. Safe to repeat. */
export async function setMissionaryMute(db: GameDatabase, userId: string, command: { muted: boolean }, now: number, enabled: boolean) {
  if (!enabled) return disabled();
  const state = await readFaith(db, userId, now, enabled);
  if (!state.supported || state.nationId === 'korund') return fail(403, 'unsupported_nation', 'Missionaries visit Kindle and Aurelle citizens for now.'); // #404: Korund has no missionary block
  if (command.muted) await db.prepare('INSERT INTO missionary_mutes (user_id,muted_at) VALUES (?,?) ON CONFLICT DO NOTHING').bind(userId, now).run();
  else await db.prepare('DELETE FROM missionary_mutes WHERE user_id=?').bind(userId).run();
  return { ok: true as const, state: await readFaith(db, userId, now, enabled) };
}

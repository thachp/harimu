import { env } from 'cloudflare:workers';
import { authenticatedUserId } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { isSameOriginCommand, readCommandObject } from '@/lib/command-request';
import { appealDuty, attendWorship, chooseFaith, joinFestival, parseFaithCommand, readFaith, withGraySuspicion, worshipUnderground } from '@/lib/faith';
import { travelBlock } from '@/lib/travel';
import { harmonyEnabled, harmonyLine, readHarmonySignals, religiousHarmony, type HarmonyNation } from '@/lib/religious-harmony';
import { festivalStance, holidayNationsOn } from '@/lib/festivals';
import { acceptMission, answerMission, requestMission, setMissionaryMute } from '@/lib/missionary-actions'; // #225

export const dynamic = 'force-dynamic';
const privateJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
const flags = () => env as unknown as { HARIMU_FAITH_ENABLED?: string; HARIMU_TRAVEL_ENABLED?: string; HARIMU_FAVOR_DECAY_ENABLED?: string; HARIMU_GRAY_SUSPICION_ENABLED?: string };
/** #752: the faith panel's underground Suspicion band includes gray-market trades, the same band as the Korund panel. Off: discoveries only (#382). */
const graySuspicionOn = () => flags().HARIMU_GRAY_SUSPICION_ENABLED === 'true';
const faithEnabled = () => flags().HARIMU_FAITH_ENABLED === 'true';
/** #529: the time (seconds) Royal Favor decay is evaluated at, only while HARIMU_FAVOR_DECAY_ENABLED is on; undefined (the default) keeps the flat Favor rule. */
const favorDecayAt = (now: number) => flags().HARIMU_FAVOR_DECAY_ENABLED === 'true' ? now : undefined;

// #67: faith, Devotion and worship state. Read-only (#217/#246): Devotion is derived, nothing is written here.
export async function GET(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return privateJson({ error: 'Sign in required.' }, 401);
  const db = await getDatabase(), now = Math.floor(Date.now() / 1000);
  const faith = await readFaith(db, userId, now, faithEnabled(), favorDecayAt(now), { graySuspicion: graySuspicionOn() });
  // #842: the nation's Religious Harmony line (Korund: band only). Flag off: no extra reads and no harmony key.
  const nation = faith.nationId as HarmonyNation | null;
  if (!harmonyEnabled(env) || !nation || !['kindle', 'korund', 'aurelle'].includes(nation)) return privateJson(faith);
  const score = religiousHarmony(nation, await readHarmonySignals(db, nation, now, holidayNationsOn(Math.floor(now / 7200), 7200).has(nation), festivalStance));
  return privateJson({ ...faith, harmony: { line: harmonyLine(nation, score) } });
}

// #67: choose-faith (once per 60 real days) and attend-worship (once per game day, idempotent per requestId).
export async function POST(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return privateJson({ error: 'Sign in required.' }, 401);
  if (!isSameOriginCommand(request)) return privateJson({ error: 'Same-origin request required.' }, 403);
  let body: Record<string, unknown>;
  try { body = await readCommandObject(request, 1024); } catch { return privateJson({ error: 'Send a faith command.', reason: 'bad_request' }, 400); }
  const command = parseFaithCommand(body);
  if (!command) return privateJson({ error: 'Send action "choose-faith" with faithId, "attend-worship", "worship-underground", "appeal-duty", "join-festival" with festivalId, "request-mission" with hostNation, "accept-mission", "answer-mission" with missionId and answer, or "mute-missionaries" with muted, and a requestId.', reason: 'bad_request' }, 400);
  const db = await getDatabase(); const now = Math.floor(Date.now() / 1000);
  if (command.action === 'attend-worship' || command.action === 'join-festival') {
    // Worship and festivals happens at the city temple/meeting house, so it waits for arrival like other location-bound actions (#123).
    const blocked = await travelBlock(db, userId, now, flags().HARIMU_TRAVEL_ENABLED === 'true');
    if (blocked) return privateJson({ error: blocked, reason: 'traveling' }, 409);
  }
  const raw = command.action === 'attend-worship' ? await attendWorship(db, userId, command.requestId, now, faithEnabled())
    : command.action === 'join-festival' ? await joinFestival(db, userId, command, now, faithEnabled()) // #68
    : command.action === 'request-mission' ? await requestMission(db, userId, command, now, faithEnabled(), favorDecayAt(now)) // #225: no travel wait, the mission has its own timer
    : command.action === 'accept-mission' ? await acceptMission(db, userId, command, now, faithEnabled(), favorDecayAt(now))
    : command.action === 'answer-mission' ? await answerMission(db, userId, command, now, faithEnabled(), favorDecayAt(now))
    : command.action === 'mute-missionaries' ? await setMissionaryMute(db, userId, command, now, faithEnabled(), favorDecayAt(now))
    : command.action === 'appeal-duty' ? await appealDuty(db, userId, command.requestId, now, faithEnabled()) // #382 PR B: no travel wait
    : command.action === 'worship-underground' ? await worshipUnderground(db, userId, command.requestId, now, faithEnabled()) // #295: at home, so no travel wait
    : await chooseFaith(db, userId, command, now, faithEnabled(), favorDecayAt(now));
  const result = graySuspicionOn() ? await withGraySuspicion(db, userId, now, raw) : raw;
  return result.ok ? privateJson(result) : privateJson({ error: result.error, reason: result.reason }, result.status);
}

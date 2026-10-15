import type { GameDatabase } from './database-contract';
import { assemblyDistricts, citizenDistrict } from './assembly';
import { electionCandidates } from './elections';
import { kindleCandidatePlatforms, kindleParty } from './kindle-parties';
import { memberParty } from './primaries';
import { maximumCapacity, readCapacityProjection, recoverCapacity } from './economy';
import { canvassBasePoints, canvassCapacityCost, canvassDay, canvassDecayPoints, canvassDurationSeconds, questStage, type QuestStage } from './canvassing-rules';
export * from './canvassing-rules';

/** #442: Kindle canvassing PoC behind HARIMU_CANVASSING_ENABLED (default "false"). Flag off: the route answers 404 before auth and nothing is read or written.
 *  A party member starts one quest per real day for their party's presidential candidate in their home district (WC spent through the existing capacity debit),
 *  and completes it after a fixed duration; completion adds diminishing visibility points to (candidate, district). Writes happen only in POST. GET writes nothing.
 *  Visibility is display-only: no ballot, count, tally or AI share module reads this table (a test scans for it), and the count modules are not imported here. */
export type CanvassingBindings = { HARIMU_CANVASSING_ENABLED?: string; HARIMU_CAPACITY_RECOVERY_SECONDS?: string; NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW?: string; HARIMU_ACCOUNT_ELECTION_POC_ENABLED?: string };
export const canvassingEnabled = (b: CanvassingBindings) => b.HARIMU_CANVASSING_ENABLED === 'true';

export const canvassSchemas = [
  `CREATE TABLE IF NOT EXISTS canvass_quests (
 id TEXT PRIMARY KEY,
 clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id),
 party_id TEXT NOT NULL,
 candidate_id TEXT NOT NULL,
 district_id TEXT NOT NULL,
 utc_day TEXT NOT NULL,
 request_id TEXT NOT NULL UNIQUE,
 complete_request_id TEXT UNIQUE,
 capacity_spent INTEGER NOT NULL CHECK(capacity_spent > 0),
 started_at INTEGER NOT NULL,
 completes_at INTEGER NOT NULL,
 completed_at INTEGER,
 points INTEGER CHECK(points IS NULL OR points >= 1),
 CHECK(completes_at > started_at),
 CHECK((completed_at IS NULL AND points IS NULL AND complete_request_id IS NULL) OR (completed_at IS NOT NULL AND points IS NOT NULL AND complete_request_id IS NOT NULL)),
 UNIQUE(clerk_user_id, utc_day)
)`,
  'CREATE INDEX IF NOT EXISTS idx_canvass_quests_visibility ON canvass_quests(candidate_id, district_id)',
];

/** The party's presidential candidate slot (the fixed slate in lib/elections.ts; slot ids stay stable when a primary swaps in a nominee). */
export function candidateForParty(partyId: string) {
  const id = Object.keys(kindleCandidatePlatforms).find(c => kindleCandidatePlatforms[c].partyId === partyId);
  const candidate = electionCandidates.find(c => c.id === id);
  return candidate ? { id: candidate.id, name: candidate.name } : null;
}
const districtName = (id: string) => assemblyDistricts.find(d => d.id === id)?.name ?? id;

type QuestRow = { id: string; party_id: string; candidate_id: string; district_id: string; started_at: number; completes_at: number; completed_at: number | null; points: number | null };
export type CanvassQuest = { id: string; candidateId: string; districtId: string; districtName: string; startedAt: number; completesAt: number; completedAt: number | null; points: number | null; stage: QuestStage };
export type CanvassingSnapshot = {
  enabled: true; member: boolean; partyId: string | null; partyName: string | null; candidate: { id: string; name: string } | null; district: { id: string; name: string };
  cost: number; capacity: number; durationSeconds: number; today: CanvassQuest | null;
  /** Display-only totals per candidate and district. Never read by any count. */
  visibility: { candidateId: string; candidateName: string; districts: { districtId: string; districtName: string; points: number }[] }[];
};
const publicQuest = (row: QuestRow, now: number): CanvassQuest => ({ id: row.id, candidateId: row.candidate_id, districtId: row.district_id, districtName: districtName(row.district_id), startedAt: Number(row.started_at),
  completesAt: Number(row.completes_at), completedAt: row.completed_at === null ? null : Number(row.completed_at), points: row.points === null ? null : Number(row.points),
  stage: questStage(now, { completesAt: Number(row.completes_at), completedAt: row.completed_at === null ? null : Number(row.completed_at) }) });

/** Read-only. Capacity is the recovery projection at `now`; nothing is recovered, created or completed. */
export async function readCanvassing(db: GameDatabase, userId: string, now: number, interval: number): Promise<CanvassingSnapshot> {
  const partyId = await memberParty(db, userId), district = await citizenDistrict(db, userId);
  const today = partyId ? await db.prepare('SELECT id,party_id,candidate_id,district_id,started_at,completes_at,completed_at,points FROM canvass_quests WHERE clerk_user_id=? AND utc_day=?').bind(userId, canvassDay(now)).first<QuestRow>() : null;
  const totals = (await db.prepare('SELECT candidate_id,district_id,SUM(points) AS points FROM canvass_quests WHERE completed_at IS NOT NULL GROUP BY candidate_id,district_id').all<{ candidate_id: string; district_id: string; points: number }>()).results;
  const capacity = (await readCapacityProjection(db, userId, now, interval))?.capacity ?? 0;
  return { enabled: true, member: partyId !== null, partyId, partyName: partyId ? kindleParty(partyId)?.name ?? null : null, candidate: partyId ? candidateForParty(partyId) : null, district: { id: district, name: districtName(district) },
    cost: canvassCapacityCost, capacity: Math.min(capacity, maximumCapacity), durationSeconds: canvassDurationSeconds, today: today ? publicQuest(today, now) : null,
    visibility: electionCandidates.map(c => ({ candidateId: c.id, candidateName: c.name, districts: assemblyDistricts.map(d => ({ districtId: d.id, districtName: d.name,
      points: Number(totals.find(t => t.candidate_id === c.id && t.district_id === d.id)?.points ?? 0) })) })) };
}

const fail = (status: 400 | 403 | 404 | 409, error: string) => ({ ok: false as const, status, error });
/** The points one completion adds, computed in the same statement that records it: base * decay / (decay + points already completed for that candidate and district), at least 1.
 *  Integer division (the SUM is cast to BIGINT: Postgres sums bigint to numeric, whose division would round instead of truncate), identical on SQLite and Postgres, and equal to `visibilityGain` (a test checks). */
const gainSql = `MAX(1, (${canvassBasePoints * canvassDecayPoints}) / (${canvassDecayPoints} + CAST(COALESCE((SELECT SUM(v.points) FROM canvass_quests v WHERE v.candidate_id=canvass_quests.candidate_id AND v.district_id=canvass_quests.district_id AND v.completed_at IS NOT NULL),0) AS BIGINT)))`;

/** Start today's quest. Members only (#307 membership), one per citizen per UTC day, request-id idempotent. The district comes from the citizen's home city, never the request.
 *  The quest row and the Work Capacity debit are one batch: the debit applies only if this batch's own new quest row landed, so a replay or a race never debits twice. */
export async function startQuest(db: GameDatabase, userId: string, now: number, interval: number, input: { requestId: string }) {
  const partyId = await memberParty(db, userId);
  if (!partyId) return fail(403, 'Join a party to canvass for its candidate.');
  const candidate = candidateForParty(partyId);
  if (!candidate) return fail(403, 'Your party has no presidential candidate to canvass for.');
  const prior = await db.prepare('SELECT clerk_user_id FROM canvass_quests WHERE request_id=?').bind(input.requestId).first<{ clerk_user_id: string }>();
  if (prior) return prior.clerk_user_id === userId ? { ok: true as const, alreadyRecorded: true } : fail(409, 'Quest receipt already used.');
  const day = canvassDay(now);
  if (await db.prepare('SELECT 1 AS yes FROM canvass_quests WHERE clerk_user_id=? AND utc_day=?').bind(userId, day).first()) return fail(409, 'You have already canvassed today. Come back tomorrow.');
  await recoverCapacity(db, userId, new Date(now * 1000).toISOString(), interval);
  const id = crypto.randomUUID(), district = await citizenDistrict(db, userId);
  const [started] = await db.batch([
    db.prepare(`INSERT INTO canvass_quests (id,clerk_user_id,party_id,candidate_id,district_id,utc_day,request_id,capacity_spent,started_at,completes_at)
 SELECT ?,c.clerk_user_id,?,?,?,?,?,?,?,? FROM citizens c WHERE c.clerk_user_id=? AND c.nation_id='kindle' AND c.capacity>=? ON CONFLICT DO NOTHING`)
      .bind(id, partyId, candidate.id, district, day, input.requestId, canvassCapacityCost, now, now + canvassDurationSeconds, userId, canvassCapacityCost),
    db.prepare('UPDATE citizens SET capacity=capacity-?,updated_at=? WHERE clerk_user_id=? AND capacity>=? AND EXISTS(SELECT 1 FROM canvass_quests WHERE id=? AND clerk_user_id=?)')
      .bind(canvassCapacityCost, new Date(now * 1000).toISOString(), userId, canvassCapacityCost, id, userId),
  ]);
  if (started.meta.changes !== 1) {
    const raced = await db.prepare('SELECT request_id FROM canvass_quests WHERE clerk_user_id=? AND utc_day=?').bind(userId, day).first<{ request_id: string }>();
    if (raced?.request_id === input.requestId) return { ok: true as const, alreadyRecorded: true };
    return fail(409, raced ? 'You have already canvassed today. Come back tomorrow.' : 'Not enough Work Capacity to canvass.');
  }
  return { ok: true as const, alreadyRecorded: false };
}

/** Complete a finished quest: adds its visibility points to (candidate, district) once. Idempotent: a repeat, with any request id, is a no-op. */
export async function completeQuest(db: GameDatabase, userId: string, now: number, input: { questId: unknown; requestId: string }) {
  if (typeof input.questId !== 'string' || input.questId.length > 64) return fail(400, 'Pick a quest.');
  const quest = await db.prepare('SELECT clerk_user_id,completes_at,completed_at,complete_request_id FROM canvass_quests WHERE id=?').bind(input.questId).first<{ clerk_user_id: string; completes_at: number; completed_at: number | null; complete_request_id: string | null }>();
  if (!quest || quest.clerk_user_id !== userId) return fail(404, 'That quest does not exist.');
  if (quest.completed_at !== null) return { ok: true as const, alreadyRecorded: true };
  if (Number(quest.completes_at) > now) return fail(409, 'This quest is not finished yet.');
  const used = await db.prepare('SELECT 1 AS yes FROM canvass_quests WHERE complete_request_id=?').bind(input.requestId).first();
  if (used) return fail(409, 'Quest receipt already used.');
  const done = await db.prepare(`UPDATE canvass_quests SET completed_at=?,complete_request_id=?,points=${gainSql} WHERE id=? AND clerk_user_id=? AND completed_at IS NULL AND completes_at<=?`)
    .bind(now, input.requestId, input.questId, userId, now).run();
  return { ok: true as const, alreadyRecorded: done.meta.changes !== 1 };
}

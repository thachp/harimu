import type { GameDatabase } from './database-contract';
import { accountElectionEnabled } from './preview-election';
import { trustedBallotPrivacyReady, ballotPrivacyReason } from './ballot-privacy';
import { kindleParties } from './kindle-parties';
import { assemblyDistricts, assemblyIncumbents, assemblyPartyIds, assemblyResult, assemblyHeadlines, assemblySeatsPerDistrict, assemblySeatsUp, assemblyWindowSeconds, capitalDistrict, isDistrict, type AssemblyResult, type PartySeats } from './assembly-rules';
export * from './assembly-rules';

/** #283: Kindle mid-term Assembly election (party list, D'Hondt per district; the AI bloc is a fixed separate block).
 *  Three additive tables, separate from the presidential civic_* tables. The ballot table has no timestamp and no citizen, and its
 *  random id is not the receipt id, so a ballot cannot be tied to a voter by a column, an id or an insertion time. Writes to the
 *  two ballot tables are fenced on PostgreSQL exactly like the civic_* ones (lib/postgres/database.ts). */
const districtList = assemblyDistricts.map(d => `'${d.id}'`).join(',');
const partyList = assemblyPartyIds.map(id => `'${id}'`).join(',');
export const assemblyElectionSchema = `CREATE TABLE IF NOT EXISTS assembly_elections (
  id TEXT PRIMARY KEY,
  nation_id TEXT NOT NULL CHECK(nation_id='kindle'),
  policy TEXT NOT NULL CHECK(policy IN ('tier1-human-v1','preview-citizen-v1')),
  opens_at INTEGER NOT NULL,
  closes_at INTEGER NOT NULL,
  closed_at INTEGER,
  result_json TEXT,
  CHECK(closes_at=opens_at+259200),
  CHECK(closed_at IS NULL OR closed_at>=closes_at),
  CHECK(result_json IS NULL OR closed_at IS NOT NULL)
)`;
export const assemblyReceiptSchema = `CREATE TABLE IF NOT EXISTS assembly_voter_receipts (
  election_id TEXT NOT NULL REFERENCES assembly_elections(id),
  clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id),
  district_id TEXT NOT NULL CHECK(district_id IN (${districtList})),
  request_id TEXT NOT NULL UNIQUE,
  checked_at INTEGER NOT NULL,
  ballot_written INTEGER NOT NULL DEFAULT 0 CHECK(ballot_written IN (0,1)),
  policy TEXT NOT NULL CHECK(policy IN ('tier1-human-v1','preview-citizen-v1')),
  PRIMARY KEY(election_id,clerk_user_id)
)`;
export const assemblyBallotSchema = `CREATE TABLE IF NOT EXISTS assembly_anonymous_ballots (
  id TEXT PRIMARY KEY,
  election_id TEXT NOT NULL REFERENCES assembly_elections(id),
  district_id TEXT NOT NULL CHECK(district_id IN (${districtList})),
  party_id TEXT NOT NULL CHECK(party_id IN (${partyList})),
  policy TEXT NOT NULL CHECK(policy IN ('tier1-human-v1','preview-citizen-v1'))
)`;
export const assemblyIndexes = ['CREATE INDEX IF NOT EXISTS idx_assembly_ballots_election ON assembly_anonymous_ballots(election_id)'];
export const assemblySchemas = [assemblyElectionSchema, assemblyReceiptSchema, assemblyBallotSchema, ...assemblyIndexes];

export const assemblyElectionId = 'kindle-assembly-midterm-1';
export const assemblyAccountElectionId = 'kindle-assembly-account-poc-1';
export type AssemblyBindings = { HARIMU_KINDLE_ASSEMBLY_ENABLED?: string; HARIMU_KINDLE_ASSEMBLY_OPEN_AT?: string; NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW?: string; HARIMU_ACCOUNT_ELECTION_POC_ENABLED?: string };
export type AssemblyScope = { id: string; policy: 'tier1-human-v1' | 'preview-citizen-v1'; scope: 'tier1' | 'preview-citizen' };

export const assemblyEnabled = (b: AssemblyBindings) => b.HARIMU_KINDLE_ASSEMBLY_ENABLED === 'true';
/** The manual/test-only trigger (no day-60 scheduler yet): an operator sets this to an epoch-second timestamp. Unset: never opens. */
export function assemblyOpenAt(b: AssemblyBindings): number | null {
  const raw = b.HARIMU_KINDLE_ASSEMBLY_OPEN_AT;
  if (typeof raw !== 'string' || !/^\d{1,12}$/.test(raw)) return null;
  return Number(raw);
}
/** Same privacy gate as the presidential PoC: the certified Tier-1 gate (hard-false today) or the owner-approved account preview. Null means closed. */
export function assemblyScope(b: AssemblyBindings, privacyReady = trustedBallotPrivacyReady()): AssemblyScope | null {
  if (!assemblyEnabled(b)) return null;
  if (accountElectionEnabled(b)) return { id: assemblyAccountElectionId, policy: 'preview-citizen-v1', scope: 'preview-citizen' };
  if (privacyReady) return { id: assemblyElectionId, policy: 'tier1-human-v1', scope: 'tier1' };
  return null;
}
/** What the world tick needs, or null (flag off, privacy gate closed): a complete no-op. */
export function assemblyTickConfig(b: AssemblyBindings): { scope: AssemblyScope; openAt: number | null } | null {
  const scope = assemblyScope(b);
  return scope ? { scope, openAt: assemblyOpenAt(b) } : null;
}

export const assemblyReceiptSql = `INSERT INTO assembly_voter_receipts (election_id,clerk_user_id,district_id,request_id,checked_at,policy)
 SELECT e.id,c.clerk_user_id,?,?,?,e.policy FROM assembly_elections e JOIN citizens c ON c.clerk_user_id=?
 WHERE e.id=? AND c.nation_id='kindle' AND e.nation_id='kindle' AND e.closed_at IS NULL AND e.opens_at<=? AND e.closes_at>?
 ON CONFLICT DO NOTHING`;
/** The district comes from the receipt (derived server-side), never from the request. */
export const assemblyBallotSql = `INSERT INTO assembly_anonymous_ballots (id,election_id,district_id,party_id,policy)
 SELECT ?,r.election_id,r.district_id,?,r.policy FROM assembly_voter_receipts r WHERE r.request_id=? AND r.clerk_user_id=? AND r.election_id=? AND r.ballot_written=0`;
export const assemblyMarkWrittenSql = 'UPDATE assembly_voter_receipts SET ballot_written=1 WHERE request_id=? AND clerk_user_id=? AND election_id=? AND ballot_written=0';

/** Read-only: the citizen's district is the home city when it is one of the Assembly districts, else the capital. */
export async function citizenDistrict(db: GameDatabase, userId: string): Promise<string> {
  const row = await db.prepare("SELECT home_city_id FROM citizen_city_locations WHERE user_id=? AND nation_id='kindle'").bind(userId).first<{ home_city_id: string }>();
  return row && isDistrict(row.home_city_id) ? row.home_city_id : capitalDistrict;
}

/** Opens the election once its configured time has come and while its 72-hour window is still running. Write paths only. */
export async function ensureAssemblyElection(db: GameDatabase, scope: AssemblyScope, openAt: number | null, now: number) {
  if (openAt === null || now < openAt || now >= openAt + assemblyWindowSeconds) return;
  await db.prepare(`INSERT INTO assembly_elections (id,nation_id,policy,opens_at,closes_at) VALUES (?,'kindle',?,?,?) ON CONFLICT(id) DO NOTHING`).bind(scope.id, scope.policy, openAt, openAt + assemblyWindowSeconds).run();
}

async function counted(db: GameDatabase, scope: AssemblyScope): Promise<AssemblyResult> {
  const rows = await db.prepare('SELECT district_id,party_id,COUNT(*) AS count FROM assembly_anonymous_ballots WHERE election_id=? AND policy=? GROUP BY district_id,party_id').bind(scope.id, scope.policy).all<{ district_id: string; party_id: string; count: number }>();
  const byDistrict: Record<string, PartySeats> = {};
  for (const row of rows.results) { (byDistrict[row.district_id] ??= {})[row.party_id] = Number(row.count); }
  const receipts = await db.prepare('SELECT district_id,COUNT(*) AS count FROM assembly_voter_receipts WHERE election_id=? AND ballot_written=1 AND policy=? GROUP BY district_id').bind(scope.id, scope.policy).all<{ district_id: string; count: number }>();
  for (const d of assemblyDistricts) {
    const ballots = Object.values(byDistrict[d.id] ?? {}).reduce((a, b) => a + b, 0), receipt = Number(receipts.results.find(r => r.district_id === d.id)?.count ?? 0);
    if (ballots !== receipt) throw Error('Assembly count could not be confirmed. No result published.');
  }
  return assemblyResult(byDistrict);
}

/** Closes a due election and records its count. Write paths only: the world tick and POST /api/assembly. */
export async function finalizeAssembly(db: GameDatabase, scope: AssemblyScope, now: number) {
  await db.prepare('UPDATE assembly_elections SET closed_at=? WHERE id=? AND closed_at IS NULL AND closes_at<=?').bind(now, scope.id, now).run();
  const row = await db.prepare('SELECT result_json FROM assembly_elections WHERE id=? AND closed_at IS NOT NULL').bind(scope.id).first<{ result_json: string | null }>();
  if (row && !row.result_json) await db.prepare('UPDATE assembly_elections SET result_json=? WHERE id=? AND closed_at IS NOT NULL AND result_json IS NULL').bind(JSON.stringify(await counted(db, scope)), scope.id).run();
}
/** World tick (flag on, gate open): open at the configured time, close and count when due. */
export async function runKindleAssembly(db: GameDatabase, now: number, config: { scope: AssemblyScope; openAt: number | null }) {
  await ensureAssemblyElection(db, config.scope, config.openAt, now);
  await finalizeAssembly(db, config.scope, now);
}

export type AssemblySnapshot = {
  enabled: true; nationId: 'kindle'; id: string; scope: 'tier1' | 'preview-citizen' | null;
  status: 'waiting' | 'open' | 'closed'; opensAt: number | null; closesAt: number | null;
  seats: { perDistrict: number; up: number };
  districts: { id: string; name: string; seatsUp: PartySeats; seatsHeld: PartySeats }[];
  parties: { id: string; name: string; ideology: string; color: string; blurb: string; ai: true }[];
  yourDistrict: { id: string; name: string }; voted: boolean; privacyReady: boolean; privacyReason: string;
  result: AssemblyResult | null; headlines: ReturnType<typeof assemblyHeadlines>;
};

/** Read-only (GETs write nothing, not even the election row): a due open or close is shown as the write path will record it. */
export async function readAssembly(db: GameDatabase, userId: string, now: number, scope: AssemblyScope | null, openAt: number | null): Promise<AssemblySnapshot> {
  const base = {
    enabled: true as const, nationId: 'kindle' as const, scope: scope?.scope ?? null, seats: { perDistrict: assemblySeatsPerDistrict, up: assemblySeatsUp },
    districts: assemblyDistricts.map(d => ({ id: d.id, name: d.name, seatsUp: assemblyIncumbents[d.id].up, seatsHeld: assemblyIncumbents[d.id].held })),
    parties: kindleParties.map(p => ({ id: p.id, name: p.name, ideology: p.ideology, color: p.color, blurb: p.blurb, ai: true as const })),
    privacyReady: scope !== null, privacyReason: scope === null ? ballotPrivacyReason : 'Account-level preview privacy: operators may correlate submissions.',
  };
  const district = await citizenDistrict(db, userId);
  const yourDistrict = { id: district, name: assemblyDistricts.find(d => d.id === district)!.name };
  const id = scope?.id ?? assemblyElectionId;
  const empty = { id, yourDistrict, voted: false, result: null, headlines: [] as ReturnType<typeof assemblyHeadlines> };
  if (!scope) return { ...base, ...empty, status: 'waiting', opensAt: null, closesAt: null };
  const election = await db.prepare('SELECT opens_at,closes_at,closed_at,result_json FROM assembly_elections WHERE id=?').bind(scope.id).first<{ opens_at: number; closes_at: number; closed_at: number | null; result_json: string | null }>();
  if (!election) {
    if (openAt !== null && now >= openAt && now < openAt + assemblyWindowSeconds) return { ...base, ...empty, status: 'open', opensAt: openAt, closesAt: openAt + assemblyWindowSeconds };
    return { ...base, ...empty, status: 'waiting', opensAt: openAt !== null && openAt > now ? openAt : null, closesAt: null };
  }
  const own = await db.prepare('SELECT ballot_written FROM assembly_voter_receipts WHERE election_id=? AND clerk_user_id=?').bind(scope.id, userId).first<{ ballot_written: number }>();
  const closed = election.closed_at !== null || now >= election.closes_at;
  let result: AssemblyResult | null = null;
  if (closed) {
    result = await counted(db, scope);
    if (election.result_json && election.result_json !== JSON.stringify(result)) throw Error('Saved Assembly count does not match the confirmed count.');
  }
  return { ...base, ...empty, voted: Number(own?.ballot_written) === 1, status: closed ? 'closed' : 'open', opensAt: election.opens_at, closesAt: election.closes_at, result, headlines: result ? assemblyHeadlines(result) : [] };
}

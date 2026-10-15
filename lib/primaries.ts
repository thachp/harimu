import type { GameDatabase } from './database-contract';
import { accountElectionEnabled } from './preview-election';
import { trustedBallotPrivacyReady, ballotPrivacyReason } from './ballot-privacy';
import { kindleParties } from './kindle-parties';
import { electionCandidates } from './elections';
import { hopefuls, hopefulsOf, hopefulIdsOf, generalSlate, isPartyId, partyIds, nomineeAnnouncements, primaryResult, primaryWindowSeconds, type PrimaryResult } from './primaries-rules';
export * from './primaries-rules';

/** #307: Kindle party membership and human primaries. Four additive tables, separate from the presidential civic_* tables.
 *  Membership is one party per citizen (the citizen id is the key). Primary ballots follow the same split as the presidential ones: a
 *  receipt names the voter and the party but never the ranking; a ballot names the party and the ranking but no citizen, receipt id
 *  or time. Writes to the two ballot tables are fenced on PostgreSQL like the civic_* ones (lib/postgres/database.ts). */
const partyList = partyIds.map(id => `'${id}'`).join(',');
export const partyMemberSchema = `CREATE TABLE IF NOT EXISTS party_members (
  clerk_user_id TEXT PRIMARY KEY REFERENCES citizens(clerk_user_id),
  party_id TEXT NOT NULL CHECK(party_id IN (${partyList})),
  joined_at INTEGER NOT NULL
)`;
export const primaryElectionSchema = `CREATE TABLE IF NOT EXISTS primary_elections (
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
export const primaryReceiptSchema = `CREATE TABLE IF NOT EXISTS primary_voter_receipts (
  election_id TEXT NOT NULL REFERENCES primary_elections(id),
  clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id),
  party_id TEXT NOT NULL CHECK(party_id IN (${partyList})),
  request_id TEXT NOT NULL UNIQUE,
  checked_at INTEGER NOT NULL,
  ballot_written INTEGER NOT NULL DEFAULT 0 CHECK(ballot_written IN (0,1)),
  policy TEXT NOT NULL CHECK(policy IN ('tier1-human-v1','preview-citizen-v1')),
  PRIMARY KEY(election_id,clerk_user_id)
)`;
export const primaryBallotSchema = `CREATE TABLE IF NOT EXISTS primary_anonymous_ballots (
  id TEXT PRIMARY KEY,
  election_id TEXT NOT NULL REFERENCES primary_elections(id),
  party_id TEXT NOT NULL CHECK(party_id IN (${partyList})),
  ranking TEXT NOT NULL,
  policy TEXT NOT NULL CHECK(policy IN ('tier1-human-v1','preview-citizen-v1'))
)`;
export const primaryIndexes = ['CREATE INDEX IF NOT EXISTS idx_primary_ballots_election ON primary_anonymous_ballots(election_id)'];
export const primarySchemas = [partyMemberSchema, primaryElectionSchema, primaryReceiptSchema, primaryBallotSchema, ...primaryIndexes];

export const primaryElectionId = 'kindle-primary-1';
export const primaryAccountElectionId = 'kindle-primary-account-poc-1';
export type PrimaryBindings = { HARIMU_PRIMARIES_ENABLED?: string; HARIMU_PRIMARIES_OPEN_AT?: string; NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW?: string; HARIMU_ACCOUNT_ELECTION_POC_ENABLED?: string };
export type PrimaryScope = { id: string; policy: 'tier1-human-v1' | 'preview-citizen-v1'; scope: 'tier1' | 'preview-citizen' };

export const primariesEnabled = (b: PrimaryBindings) => b.HARIMU_PRIMARIES_ENABLED === 'true';
/** Manual/test-only trigger, like the Assembly's: an operator sets an epoch-second open time. Unset: no primary ever opens. [ASSUMPTION] */
export function primaryOpenAt(b: PrimaryBindings): number | null {
  const raw = b.HARIMU_PRIMARIES_OPEN_AT;
  return typeof raw === 'string' && /^\d{1,12}$/.test(raw) ? Number(raw) : null;
}
/** The presidential privacy gate, unchanged: certified Tier-1 (hard-false today) or the owner-approved account preview. Null means closed. */
export function primaryScope(b: PrimaryBindings, privacyReady = trustedBallotPrivacyReady()): PrimaryScope | null {
  if (!primariesEnabled(b)) return null;
  if (accountElectionEnabled(b)) return { id: primaryAccountElectionId, policy: 'preview-citizen-v1', scope: 'preview-citizen' };
  if (privacyReady) return { id: primaryElectionId, policy: 'tier1-human-v1', scope: 'tier1' };
  return null;
}
export function primaryTickConfig(b: PrimaryBindings): { scope: PrimaryScope; openAt: number | null } | null {
  const scope = primaryScope(b);
  return scope ? { scope, openAt: primaryOpenAt(b) } : null;
}

/** Membership is frozen while a primary window is open, so nobody can switch party between the receipt and the count. */
const frozenSql = '(SELECT 1 FROM primary_elections WHERE closed_at IS NULL AND opens_at<=? AND closes_at>?)';
export const joinPartySql = `INSERT INTO party_members (clerk_user_id,party_id,joined_at)
 SELECT c.clerk_user_id,?,? FROM citizens c WHERE c.clerk_user_id=? AND c.nation_id='kindle' AND NOT EXISTS ${frozenSql}
 ON CONFLICT(clerk_user_id) DO UPDATE SET party_id=excluded.party_id,joined_at=excluded.joined_at WHERE party_members.party_id!=excluded.party_id`;
export const leavePartySql = `DELETE FROM party_members WHERE clerk_user_id=? AND NOT EXISTS ${frozenSql}`;
export const primaryReceiptSql = `INSERT INTO primary_voter_receipts (election_id,clerk_user_id,party_id,request_id,checked_at,policy)
 SELECT e.id,c.clerk_user_id,m.party_id,?,?,e.policy FROM primary_elections e JOIN citizens c ON c.clerk_user_id=? JOIN party_members m ON m.clerk_user_id=c.clerk_user_id
 WHERE e.id=? AND c.nation_id='kindle' AND e.nation_id='kindle' AND e.closed_at IS NULL AND e.opens_at<=? AND e.closes_at>?
 ON CONFLICT DO NOTHING`;
/** The party comes from the receipt (itself from the membership row), never from the request. */
export const primaryBallotSql = `INSERT INTO primary_anonymous_ballots (id,election_id,party_id,ranking,policy)
 SELECT ?,r.election_id,r.party_id,?,r.policy FROM primary_voter_receipts r WHERE r.request_id=? AND r.clerk_user_id=? AND r.election_id=? AND r.ballot_written=0`;
export const primaryMarkWrittenSql = 'UPDATE primary_voter_receipts SET ballot_written=1 WHERE request_id=? AND clerk_user_id=? AND election_id=? AND ballot_written=0';

export async function memberParty(db: GameDatabase, userId: string): Promise<string | null> {
  const row = await db.prepare('SELECT party_id FROM party_members WHERE clerk_user_id=?').bind(userId).first<{ party_id: string }>();
  return row && isPartyId(row.party_id) ? row.party_id : null;
}
async function memberCounts(db: GameDatabase): Promise<Record<string, number>> {
  const rows = await db.prepare('SELECT party_id,COUNT(*) AS count FROM party_members GROUP BY party_id').all<{ party_id: string; count: number }>();
  return Object.fromEntries(partyIds.map(id => [id, Number(rows.results.find(r => r.party_id === id)?.count ?? 0)]));
}

export async function ensurePrimary(db: GameDatabase, scope: PrimaryScope, openAt: number | null, now: number) {
  if (openAt === null || now < openAt || now >= openAt + primaryWindowSeconds) return;
  await db.prepare(`INSERT INTO primary_elections (id,nation_id,policy,opens_at,closes_at) VALUES (?,'kindle',?,?,?) ON CONFLICT(id) DO NOTHING`).bind(scope.id, scope.policy, openAt, openAt + primaryWindowSeconds).run();
}

async function counted(db: GameDatabase, scope: PrimaryScope, members: Record<string, number>): Promise<PrimaryResult> {
  const rows = await db.prepare('SELECT party_id,ranking,COUNT(*) AS count FROM primary_anonymous_ballots WHERE election_id=? AND policy=? GROUP BY party_id,ranking').bind(scope.id, scope.policy).all<{ party_id: string; ranking: string; count: number }>();
  const receipts = await db.prepare('SELECT party_id,COUNT(*) AS count FROM primary_voter_receipts WHERE election_id=? AND ballot_written=1 AND policy=? GROUP BY party_id').bind(scope.id, scope.policy).all<{ party_id: string; count: number }>();
  const byParty: Record<string, { groups: { ranking: string[]; count: number }[]; members: number }> = {};
  for (const id of partyIds) byParty[id] = { groups: [], members: members[id] ?? 0 };
  for (const row of rows.results) byParty[row.party_id]?.groups.push({ ranking: JSON.parse(row.ranking) as string[], count: Number(row.count) });
  for (const id of partyIds) {
    const ballots = byParty[id].groups.reduce((a, g) => a + g.count, 0), receipt = Number(receipts.results.find(r => r.party_id === id)?.count ?? 0);
    if (ballots !== receipt) throw Error('Primary count could not be confirmed. No result published.');
  }
  return primaryResult(byParty);
}
export async function finalizePrimary(db: GameDatabase, scope: PrimaryScope, now: number) {
  await db.prepare('UPDATE primary_elections SET closed_at=? WHERE id=? AND closed_at IS NULL AND closes_at<=?').bind(now, scope.id, now).run();
  const row = await db.prepare('SELECT result_json FROM primary_elections WHERE id=? AND closed_at IS NOT NULL').bind(scope.id).first<{ result_json: string | null }>();
  if (row && !row.result_json) await db.prepare('UPDATE primary_elections SET result_json=? WHERE id=? AND closed_at IS NOT NULL AND result_json IS NULL').bind(JSON.stringify(await counted(db, scope, await memberCounts(db))), scope.id).run();
}
/** World tick (flag on, gate open): open at the configured time, close and count when due. */
export async function runPrimaries(db: GameDatabase, now: number, config: { scope: PrimaryScope; openAt: number | null }) {
  await ensurePrimary(db, config.scope, config.openAt, now);
  await finalizePrimary(db, config.scope, now);
}

/** Published count, verified. Membership turnout uses the member counts recorded at close (or live ones before the tick records them). */
async function closedResult(db: GameDatabase, scope: PrimaryScope, saved: string | null): Promise<PrimaryResult> {
  const stored = saved ? JSON.parse(saved) as PrimaryResult : null;
  const members = stored ? Object.fromEntries(stored.parties.map(p => [p.partyId, p.members])) : await memberCounts(db);
  const result = await counted(db, scope, members);
  if (saved && saved !== JSON.stringify(result)) throw Error('Saved primary count does not match the confirmed count.');
  return result;
}

/** What the general election should use. Flag off: nothing is read and nothing changes. Flag on: while a primary is open (or is due to
 *  open) the general ballot waits; once it has closed the slate is one nominee per party; with no primary scheduled, today's candidates. */
export async function generalElectionSlate(db: GameDatabase, b: PrimaryBindings, now: number): Promise<{ slate: readonly { id: string; name: string; platform: string }[]; blocked: boolean }> {
  const plain = { slate: electionCandidates as readonly { id: string; name: string; platform: string }[], blocked: false };
  const scope = primaryScope(b);
  if (!scope) return plain;
  const openAt = primaryOpenAt(b);
  const row = await db.prepare('SELECT closes_at,closed_at,result_json FROM primary_elections WHERE id=?').bind(scope.id).first<{ closes_at: number; closed_at: number | null; result_json: string | null }>();
  if (!row) return openAt !== null && now >= openAt && now < openAt + primaryWindowSeconds ? { ...plain, blocked: true } : plain;
  if (row.closed_at === null && now < row.closes_at) return { ...plain, blocked: true };
  return { slate: generalSlate((await closedResult(db, scope, row.result_json)).nominees), blocked: false };
}

export type PrimarySnapshot = {
  enabled: true; nationId: 'kindle'; id: string; scope: 'tier1' | 'preview-citizen' | null;
  status: 'waiting' | 'open' | 'closed'; opensAt: number | null; closesAt: number | null;
  parties: { id: string; name: string; ideology: string; color: string; members: number }[];
  hopefuls: { id: string; partyId: string; name: string; platform: string; ai: true }[];
  yourParty: string | null; canChangeParty: boolean; voted: boolean; privacyReady: boolean; privacyReason: string;
  result: PrimaryResult | null; announcements: ReturnType<typeof nomineeAnnouncements>;
};

/** Read-only (GETs write nothing, not even the election row). Only the caller's own party and own vote flag are shown; hopefuls and member totals are public. */
export async function readPrimaries(db: GameDatabase, userId: string, now: number, scope: PrimaryScope | null, openAt: number | null): Promise<PrimarySnapshot> {
  const counts = await memberCounts(db), yourParty = await memberParty(db, userId);
  const election = scope ? await db.prepare('SELECT opens_at,closes_at,closed_at,result_json FROM primary_elections WHERE id=?').bind(scope.id).first<{ opens_at: number; closes_at: number; closed_at: number | null; result_json: string | null }>() : null;
  const base = {
    enabled: true as const, nationId: 'kindle' as const, id: scope?.id ?? primaryElectionId, scope: scope?.scope ?? null,
    parties: kindleParties.map(p => ({ id: p.id, name: p.name, ideology: p.ideology, color: p.color, members: counts[p.id] })),
    hopefuls: hopefuls.map(h => ({ id: h.id, partyId: h.partyId, name: h.name, platform: h.platform, ai: true as const })),
    yourParty, privacyReady: scope !== null, privacyReason: scope === null ? ballotPrivacyReason : 'Account-level preview privacy: operators may correlate submissions.',
    voted: false, result: null, announcements: [] as ReturnType<typeof nomineeAnnouncements>,
  };
  const windowOpen = (opens: number, closes: number, closed: number | null) => closed === null && now >= opens && now < closes;
  if (!scope) return { ...base, status: 'waiting', opensAt: null, closesAt: null, canChangeParty: true };
  if (!election) {
    const projected = openAt !== null && now >= openAt && now < openAt + primaryWindowSeconds;
    return { ...base, status: projected ? 'open' : 'waiting', opensAt: openAt !== null && (projected || openAt > now) ? openAt : null, closesAt: projected ? openAt! + primaryWindowSeconds : null, canChangeParty: !projected };
  }
  const own = await db.prepare('SELECT ballot_written FROM primary_voter_receipts WHERE election_id=? AND clerk_user_id=?').bind(scope.id, userId).first<{ ballot_written: number }>();
  const closed = election.closed_at !== null || now >= election.closes_at;
  const result = closed ? await closedResult(db, scope, election.result_json) : null;
  return { ...base, voted: Number(own?.ballot_written) === 1, status: closed ? 'closed' : 'open', opensAt: election.opens_at, closesAt: election.closes_at,
    canChangeParty: !windowOpen(election.opens_at, election.closes_at, election.closed_at), result, announcements: result ? nomineeAnnouncements(result) : [] };
}
export { hopefulsOf, hopefulIdsOf };

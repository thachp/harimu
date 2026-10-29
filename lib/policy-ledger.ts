/** #985 Kindle Policy Ledger (docs ai-leadership §8.6). [ASSUMPTION] A published decision is not stored as its own history:
 *  government_reviews keeps one petition-day snapshot, and world_ticks repeats the whole proposal every tick. This table is the
 *  smallest append-only record, written when a Kindle proposal is committed on a world tick, idempotent per public decision
 *  (title + public brief). Private rationale and staff fields are never columns. Flag off: no read and no write. */
import type { GameDatabase } from './database-contract';
import type { GovernmentSnapshot } from './government';
import { leaderPersonas } from './leader-personas';

export const POLICY_LEDGER_LIMIT = 20;
export const policyLedgerEnabled = (env: unknown) => (env as { HARIMU_KINDLE_POLICY_LEDGER_ENABLED?: string } | null)?.HARIMU_KINDLE_POLICY_LEDGER_ENABLED === 'true';
export type PolicyLedgerEntry = { id: string; publishedAt: number; office: string; title: string; brief: string };

export const kindlePolicyLedgerSchemas = [
  `CREATE TABLE IF NOT EXISTS kindle_policy_decisions (
  decision_key TEXT PRIMARY KEY CHECK(length(decision_key)=64),
  published_at INTEGER NOT NULL CHECK(published_at>=0),
  office TEXT NOT NULL CHECK(length(office) BETWEEN 1 AND 40),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 80),
  brief TEXT NOT NULL CHECK(length(brief) BETWEEN 1 AND 2000)
)`,
  `CREATE INDEX IF NOT EXISTS idx_kindle_policy_decisions_published ON kindle_policy_decisions(published_at)`,
] as const;

const office = leaderPersonas.kindle.office;

async function decisionKey(title: string, brief: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${title}\n${brief}`));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Insert the public decision once. The same title and public brief are one decision; a later publish does not add a row. */
export async function recordPublishedKindleDecision(db: GameDatabase, snapshot: GovernmentSnapshot | null | undefined, publishedAt: number): Promise<boolean> {
  const title = snapshot?.decision?.title, brief = snapshot?.decision?.reason;
  if (snapshot?.nationId !== 'kindle' || typeof title !== 'string' || typeof brief !== 'string' || title.length < 1 || title.length > 80 || brief.length < 1 || brief.length > 2000 || !Number.isSafeInteger(publishedAt) || publishedAt < 0) return false;
  const result = await db.prepare('INSERT OR IGNORE INTO kindle_policy_decisions (decision_key, published_at, office, title, brief) VALUES (?,?,?,?,?)').bind(await decisionKey(title, brief), publishedAt, office, title, brief).run();
  return result.meta.changes === 1;
}

/** Newest first, capped. The projection is only the public columns. */
export async function readKindlePolicyLedger(db: GameDatabase): Promise<PolicyLedgerEntry[]> {
  const rows = (await db.prepare('SELECT decision_key, published_at, office, title, brief FROM kindle_policy_decisions ORDER BY published_at DESC, decision_key DESC LIMIT ?').bind(POLICY_LEDGER_LIMIT).all<{ decision_key: string; published_at: number; office: string; title: string; brief: string }>()).results ?? [];
  return rows.map(row => ({ id: String(row.decision_key), publishedAt: Number(row.published_at), office: String(row.office), title: String(row.title), brief: String(row.brief) }));
}

/** Flag off, or any nation but Kindle: the snapshot is returned unchanged and the ledger is not read. */
export async function withPolicyLedger<T extends { nationId: string }>(db: GameDatabase, snapshot: T | null, env: unknown): Promise<T | (T & { policyLedger: PolicyLedgerEntry[] }) | null> {
  if (!snapshot || snapshot.nationId !== 'kindle' || !policyLedgerEnabled(env)) return snapshot;
  return { ...snapshot, policyLedger: await readKindlePolicyLedger(db) };
}

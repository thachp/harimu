/** #886 (b): Korund's Labor Bureau posts (quarry gang, foundry hand, rail crew, plan archive clerk) become playable shifts paid in Labor Notes.
 *  ARC ruling on #886: wages come from the Korund state pool (korund_resources 'state'), and every payment writes one Labor Note issuance record
 *  (labor_note_issuances), the ledger #885's Labor Note cap will read. Behind HARIMU_MVP_JOB_TYPES_ENABLED (lib/mvp-job-types): with the flag on,
 *  `korund-start-work` starts the citizen's latest Labor Bureau post when it is one of these four, otherwise the food brigade exactly as before.
 *  Off: no post shift can start, so both tables stay empty and every read (wallet, pool, reconciliation) sums to what it did before.
 *  A shift already started settles even if the flag is later turned off (its claim is keyed on the shift's work order, not the flag).
 *  Migration 0089. No runtime imports beyond types, so tests load it directly. */
/** [ASSUMPTION] (ARC: copy the existing Korund shift values): the food brigade's WC cost, length and LN wage (lib/korund korundJob). */
export const korundPostTerms = { capacityCost: 4, hours: 2, wageMinor: 800 } as const;
export const korundPosts: Readonly<Record<string, { name: string; output: string }>> = {
  'korund-quarry-gang': { name: 'Stonehearth quarry gang', output: 'Stone cut for the plan at Stonehearth Quarry' },
  'korund-foundry-hand': { name: 'Foundry hand', output: 'Castings poured at the Plan Foundry' },
  'korund-rail-crew': { name: 'Rail maintenance crew', output: 'Track kept open for plan freight' },
  'korund-plan-clerk': { name: 'Plan archive clerk', output: 'Plan returns filed in the archive' },
};
export const isKorundPost = (id: unknown): id is string => typeof id === 'string' && Object.hasOwn(korundPosts, id);
const postList = Object.keys(korundPosts).map(id => `'${id}'`).join(','); // code constants, never user input

export const korundPostSchemas = [
  `CREATE TABLE IF NOT EXISTS korund_post_settlements (shift_id TEXT PRIMARY KEY REFERENCES work_shifts(id), clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id),
 job_id TEXT NOT NULL, wage_minor INTEGER NOT NULL CHECK(wage_minor > 0), settled_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS labor_note_issuances (id TEXT PRIMARY KEY, shift_id TEXT NOT NULL UNIQUE REFERENCES korund_post_settlements(shift_id), clerk_user_id TEXT NOT NULL,
 amount_minor INTEGER NOT NULL CHECK(amount_minor > 0), source TEXT NOT NULL CHECK(source IN ('korund-post-wage')), issued_at INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS idx_labor_note_issuances_issued ON labor_note_issuances(issued_at)',
] as const;
/** The state pool's spendable Labor Notes: both wage tables come out of korund_resources 'state'. */
export const korundPoolSql = `(initial_minor-COALESCE((SELECT SUM(wage_minor) FROM korund_settlements),0)-COALESCE((SELECT SUM(wage_minor) FROM korund_post_settlements),0))`;
/** Bind (userId): the citizen's latest Labor Bureau post, or null. */
export const latestPostSql = 'SELECT job_id FROM korund_job_assignments WHERE clerk_user_id=? ORDER BY assigned_at DESC, id DESC LIMIT 1';
/** Bind (jobId, name, output): the post's work order, written lazily (closed, so it never shows on the open work board). */
export const postWorkOrderSql = `INSERT OR IGNORE INTO work_orders (id,nation_id,name,detail,capacity_cost,status,sort_order) VALUES (?,'korund',?,?,${korundPostTerms.capacityCost},'closed',1000)`;
/** Bind (id, jobId, name, output, startedIso, completesIso, userId, userId): same guards as the brigade (Korund citizen, enough WC, no active shift). */
export const postStartSql = `INSERT OR IGNORE INTO work_shifts (id,clerk_user_id,work_order_id,order_name,output,capacity_spent,started_at,completes_at)
 SELECT ?,clerk_user_id,?,?,?,${korundPostTerms.capacityCost},?,? FROM citizens
 WHERE clerk_user_id=? AND nation_id='korund' AND capacity>=${korundPostTerms.capacityCost} AND NOT EXISTS(SELECT 1 FROM work_shifts WHERE clerk_user_id=? AND claimed_at IS NULL)`;
/** Bind (id, userId, jobId). The receipt that lets the existing WC debit run once. */
export const postReceiptSql = 'INSERT OR IGNORE INTO korund_work_starts(id,capacity_applied) SELECT id,0 FROM work_shifts WHERE id=? AND clerk_user_id=? AND work_order_id=?';
/** Bind (iso, userId, id): debit the post's WC once (the brigade's korundDebitSql is fixed at 4; this follows korundPostTerms). */
export const postDebitSql = `UPDATE citizens SET capacity=capacity-${korundPostTerms.capacityCost},updated_at=? WHERE clerk_user_id=? AND EXISTS(SELECT 1 FROM korund_work_starts k JOIN work_shifts s ON s.id=k.id WHERE k.id=? AND s.clerk_user_id=citizens.clerk_user_id AND k.capacity_applied=0)`;
/** Bind (now, shiftId, userId, nowIso). Pays only a finished, unclaimed post shift, and only while the state pool can cover it. */
export const postSettleSql = `INSERT OR IGNORE INTO korund_post_settlements(shift_id,clerk_user_id,job_id,wage_minor,settled_at)
 SELECT s.id,s.clerk_user_id,s.work_order_id,${korundPostTerms.wageMinor},? FROM work_shifts s JOIN korund_work_starts k ON k.id=s.id
 WHERE s.id=? AND s.clerk_user_id=? AND s.work_order_id IN (${postList}) AND k.capacity_applied=1 AND s.claimed_at IS NULL AND s.completes_at<=?
 AND ${korundPostTerms.wageMinor}<=(SELECT ${korundPoolSql} FROM korund_resources WHERE id='state')`;
/** Bind (shiftId): one issuance record per payment, same batch as the settlement; nothing when it did not land. */
export const laborNoteIssuanceSql = `INSERT OR IGNORE INTO labor_note_issuances(id,shift_id,clerk_user_id,amount_minor,source,issued_at)
 SELECT 'ln-wage:'||shift_id,shift_id,clerk_user_id,wage_minor,'korund-post-wage',settled_at FROM korund_post_settlements WHERE shift_id=?`;

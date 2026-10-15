import type { GameDatabase } from './database-contract';
import { isMissingRelation, tolerate } from './db-errors';
import { leaderPersonas } from './leader-personas';
import { pressPack } from './press-templates';
import { confidenceAfter, crownConfig, crownDecreeIdOk, debasedParity, debasementBpOk, gameYear, monarchPlan, officialTesseraMilli, rumoredPremiumBp } from './crown-debasement-rules';
export * from './crown-debasement-rules';

/** #362: Aurelle Crown debasement PoC behind HARIMU_CROWN_DEBASEMENT_ENABLED (default "false"). Canon and numbers: lib/crown-debasement-rules.ts.
 *  One immutable row per decree. The declared mint parity and Currency Confidence are simply the latest row (or the baseline before any decree), so there is
 *  no mutable state to drift. A decree is written only by server code: `decreeDebasement` (idempotent per request id, at most one per game year, capped) and the
 *  scheduled Worker (`runCrownCron`, the AI Monarch's fixed rule). No route calls either of them and no GET writes. The decree and its Court Gazette line are one batch.
 *  Out of scope: the treasury windfall, physical coin and cash-bundle hoarding, noble revolt, swap lines, Clearing House suspension, non-Aurelle regimes. */
export const crownDecreeSchemas = [
  `CREATE TABLE IF NOT EXISTS crown_decrees (
 id TEXT PRIMARY KEY,
 request_id TEXT NOT NULL UNIQUE,
 game_year INTEGER NOT NULL CHECK(game_year >= 1),
 percent_bp INTEGER NOT NULL CHECK(percent_bp BETWEEN 1 AND 1500),
 parity_before INTEGER NOT NULL CHECK(parity_before > 0),
 parity_after INTEGER NOT NULL CHECK(parity_after > parity_before),
 confidence_before INTEGER NOT NULL CHECK(confidence_before BETWEEN 0 AND 100),
 confidence_after INTEGER NOT NULL CHECK(confidence_after BETWEEN 0 AND 100),
 decreed_by TEXT NOT NULL CHECK(length(decreed_by) BETWEEN 1 AND 60),
 decreed_at INTEGER NOT NULL
)`,
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_crown_decrees_one_per_year ON crown_decrees(game_year)',
];

type Row = { id: string; request_id: string; game_year: number; percent_bp: number; parity_before: number; parity_after: number; confidence_before: number; confidence_after: number; decreed_by: string; decreed_at: number };
const columns = 'id,request_id,game_year,percent_bp,parity_before,parity_after,confidence_before,confidence_after,decreed_by,decreed_at';
export type CrownDecree = { id: string; gameYear: number; percentBp: number; parityBefore: number; parityAfter: number; confidenceBefore: number; confidenceAfter: number; decreedBy: string; decreedAt: number };
const publicDecree = (row: Row): CrownDecree => ({ id: row.id, gameYear: Number(row.game_year), percentBp: Number(row.percent_bp), parityBefore: Number(row.parity_before), parityAfter: Number(row.parity_after),
  confidenceBefore: Number(row.confidence_before), confidenceAfter: Number(row.confidence_after), decreedBy: row.decreed_by, decreedAt: Number(row.decreed_at) });

/** Read-only strip for an Aurelle citizen's wallet panel. `rumoredFullWeightPremiumBp` is a noisy rumor (never an official rate, never an order book). */
export type CrownMint = { mintParity: number; baselineParity: number; currencyConfidence: number;
  officialRate: { from: 'CRN'; to: 'TSR'; tesseraMilliPerCrown: number; source: string }; rumoredFullWeightPremiumBp: number | null; lastDecree: CrownDecree | null };
export const crownRateSource = 'PoC placeholder quote, moved by the declared mint parity';
const fail = (status: 400 | 403 | 409, reason: string, error: string) => ({ ok: false as const, status, reason, error });

async function worldEpoch(db: GameDatabase): Promise<number> {
  const clock = await db.prepare("SELECT epoch_seconds FROM world_clock WHERE id='main'").first<{ epoch_seconds: number }>().catch(tolerate(isMissingRelation, null));
  return clock ? Number(clock.epoch_seconds) : 0;
}
async function latestDecree(db: GameDatabase): Promise<Row | null> {
  return db.prepare(`SELECT ${columns} FROM crown_decrees ORDER BY game_year DESC LIMIT 1`).first<Row>().catch(tolerate(isMissingRelation, null));
}

/** Read-only. Flag off: the caller does not call this. A database without migration 0042 reads as the baseline. */
export async function readCrownMint(db: GameDatabase, now: number): Promise<CrownMint> {
  const row = await latestDecree(db);
  const parity = row ? Number(row.parity_after) : crownConfig.baselineParity;
  return { mintParity: parity, baselineParity: crownConfig.baselineParity, currencyConfidence: row ? Number(row.confidence_after) : crownConfig.baselineConfidence,
    officialRate: { from: 'CRN', to: 'TSR', tesseraMilliPerCrown: officialTesseraMilli(parity), source: crownRateSource },
    rumoredFullWeightPremiumBp: rumoredPremiumBp(parity, now), lastDecree: row ? publicDecree(row) : null };
}

export type DecreeCommand = { requestId: string; percentBp: number; decreedBy?: string };
const sqlText = (value: string) => `'${value.replace(/'/g, "''")}'`;
/** Server-side only. The Monarch's debasement decree: parity rises by `percentBp` (1-1500, the docs' 15% cap), Currency Confidence falls by a fixed amount and one
 *  Court Gazette line is posted, in one batch. A second decree inside the same game year is refused (409); a repeated request id replays the first receipt. */
export async function decreeDebasement(db: GameDatabase, command: DecreeCommand, now: number, options: { enabled: boolean }) {
  if (!options.enabled) return fail(403, 'disabled', 'Crown debasement is not open yet.');
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid authoritative world time.');
  if (!crownDecreeIdOk(command.requestId)) return fail(400, 'bad_request', 'A request id is required.');
  if (!debasementBpOk(command.percentBp)) return fail(400, 'over_cap', 'A debasement is between 0.01% and 15% of mint parity.');
  const decreedBy = (command.decreedBy ?? leaderPersonas.aurelle.name).trim();
  if (!decreedBy || decreedBy.length > 60 || /[\u0000-\u001f\u007f]/.test(decreedBy)) return fail(400, 'bad_request', 'The decreeing Monarch must be named.');
  const prior = await db.prepare(`SELECT ${columns} FROM crown_decrees WHERE request_id=?`).bind(command.requestId).first<Row>();
  if (prior) return Number(prior.percent_bp) === command.percentBp
    ? { ok: true as const, replay: true as const, decree: publicDecree(prior) } : fail(409, 'request_reused', 'That request id was already used for a different decree.');
  const year = gameYear(now, await worldEpoch(db));
  if ((await db.prepare('SELECT 1 AS found FROM crown_decrees WHERE game_year=?').bind(year).first())) return fail(409, 'already_debased_this_year', 'The Crown has already been debased this game year.');
  const before = await latestDecree(db);
  const parityBefore = before ? Number(before.parity_after) : crownConfig.baselineParity, confBefore = before ? Number(before.confidence_after) : crownConfig.baselineConfidence;
  const parityAfter = debasedParity(parityBefore, command.percentBp);
  if (parityAfter <= parityBefore) return fail(400, 'too_small', 'That debasement is too small to move the mint parity.');
  const id = `crown-decree-${command.requestId}`;
  const gazette = pressPack('aurelle')?.templates.find(template => template.id === 'aurelle-debasement');
  const headline = gazette?.headline ?? 'A decree on the coinage', detail = gazette?.body.join(' ') ?? 'By royal decree, the coinage is reissued at a new weight.';
  const iso = new Date(now * 1000).toISOString();
  // The unique game-year index and request id make concurrent decrees safe: only one insert lands. The gazette line is guarded by `decreed_at = now`, so a run whose insert
  // did nothing (a concurrent run of the same request wrote the row at its own `now`) adds no second line.
  await db.batch([
    db.prepare(`INSERT INTO crown_decrees (${columns}) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`)
      .bind(id, command.requestId, year, command.percentBp, parityBefore, parityAfter, confBefore, confidenceAfter(confBefore), decreedBy, now),
    db.prepare(`INSERT INTO world_events (kind, headline, detail, location, occurred_at, sort_order)
      SELECT 'court-gazette', ${sqlText(headline)}, ${sqlText(detail)}, 'Aurelle', ?, ?
      WHERE EXISTS (SELECT 1 FROM crown_decrees WHERE id = ? AND decreed_at = ?) AND NOT EXISTS (SELECT 1 FROM world_events WHERE kind = 'court-gazette' AND headline = ${sqlText(headline)} AND occurred_at = ?)`)
      .bind(iso, -now, id, now, iso),
  ]);
  const saved = await db.prepare(`SELECT ${columns} FROM crown_decrees WHERE request_id=?`).bind(command.requestId).first<Row>();
  if (saved && Number(saved.percent_bp) !== command.percentBp) return fail(409, 'request_reused', 'That request id was already used for a different decree.'); // a concurrent run with another amount won the insert
  if (saved) return { ok: true as const, decree: publicDecree(saved) };
  return fail(409, 'already_debased_this_year', 'The Crown has already been debased this game year.');
}

/** The scheduled Worker's AI Monarch (never a read): once a game year the fixed rule in `monarchPlan` may decree a debasement on its seeded day. Idempotent: the request
 *  id is derived from the game year, so repeated or overlapping cron runs decree at most once. Flag off: nothing happens. */
export async function runCrownCron(db: GameDatabase, now: number, options: { enabled: boolean }) {
  if (!options.enabled) return { status: 'disabled' as const };
  const epoch = await worldEpoch(db), year = gameYear(now, epoch), plan = monarchPlan(year);
  if (!plan.debases) return { status: 'idle' as const };
  if (now < epoch + (year - 1) * crownConfig.gameYearSeconds + plan.offsetSeconds) return { status: 'idle' as const };
  const result = await decreeDebasement(db, { requestId: `monarch-year-${year}`, percentBp: plan.percentBp }, now, { enabled: true });
  return result.ok && !('replay' in result) ? { status: 'decreed' as const, decree: result.decree } : { status: 'idle' as const };
}

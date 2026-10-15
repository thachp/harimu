import type { GameDatabase } from './database-contract';
import { isMissingRelation, tolerate } from './db-errors';
import { aurelleScores, readCrown } from './aurelle-rising';
import { boundedName, coupConfig, coupSucceeds, formationOdds, plotForms, plotRuler, plotState, pressureSeconds, roll } from './aurelle-coup-rules';
import { coupStage, type CoupStage } from './palace-coup-copy';
import { leaderPersonas } from './leader-personas';
export * from './aurelle-coup-rules';

/** #281: one row per AI palace-coup plot. The plot's secret recruitment is derived from its seed and age (aurelle-coup-rules),
 *  so only the opening of the public Crisis Window and the outcome are ever stored or shown. Names are capped at 24 characters
 *  (ARC on #281) here and by CHECK constraints. */
export const aurelleCoupSchema = `CREATE TABLE IF NOT EXISTS aurelle_coups (
  id TEXT PRIMARY KEY,
  formed_at INTEGER NOT NULL,
  ruler_id TEXT NOT NULL CHECK(ruler_id IN ('ashgrove','thornwick','dunmere','stormhaven','redwren','oakhollow')),
  ruler_name TEXT NOT NULL CHECK(length(ruler_name) BETWEEN 1 AND 24),
  house TEXT NOT NULL CHECK(length(house) BETWEEN 1 AND 24),
  window_opened_at INTEGER,
  window_closes_at INTEGER,
  guard_pct_at_open INTEGER,
  great_lords_at_open INTEGER,
  resolved_at INTEGER,
  outcome TEXT CHECK(outcome IS NULL OR outcome IN ('succeeded','failed')),
  stability_at_close INTEGER,
  CHECK((window_opened_at IS NULL) = (window_closes_at IS NULL)),
  CHECK((resolved_at IS NULL) = (outcome IS NULL)),
  CHECK(outcome IS NULL OR outcome = 'failed' OR window_opened_at IS NOT NULL)
)`;
export const aurelleCoupIndexes = ['CREATE INDEX IF NOT EXISTS idx_aurelle_coups_formed ON aurelle_coups(formed_at)'];
export const aurelleCoupSchemas = [aurelleCoupSchema, ...aurelleCoupIndexes];

/** What a client may see: nothing until the Crisis Window opens (plot members, Guard share and weight stay server-side);
 *  the ruler's name and house only after the coup has succeeded. */
export type CoupView = { status: 'open' | 'succeeded' | 'failed'; openedAt: number; closesAt: number; resolvedAt: number | null; newLeader: { name: string; house: string } | null };
type Row = { id: string; formed_at: number; ruler_id: string; ruler_name: string; house: string; window_opened_at: number | null; window_closes_at: number | null;
  guard_pct_at_open: number | null; great_lords_at_open: number | null; resolved_at: number | null; outcome: 'succeeded' | 'failed' | null };

/** Read-only (GETs). Null while a plot is still forming in secret. */
export async function readCoupView(db: GameDatabase): Promise<CoupView | null> {
  const row = await db.prepare('SELECT id, ruler_name, house, window_opened_at, window_closes_at, resolved_at, outcome FROM aurelle_coups WHERE window_opened_at IS NOT NULL ORDER BY window_opened_at DESC, id DESC LIMIT 1')
    .first<Row>().catch(tolerate(isMissingRelation, null));
  if (!row || row.window_opened_at === null || row.window_closes_at === null) return null;
  return { status: row.outcome ?? 'open', openedAt: Number(row.window_opened_at), closesAt: Number(row.window_closes_at),
    resolvedAt: row.resolved_at === null ? null : Number(row.resolved_at), newLeader: row.outcome === 'succeeded' ? { name: row.ruler_name, house: row.house } : null };
}

const fill = (text: string, v: { leader: string; newLeader: string; house: string }) => text.replaceAll('{leader}', v.leader).replaceAll('{newLeader}', v.newLeader).replaceAll('{house}', v.house);
const iso = (seconds: number) => new Date(seconds * 1000).toISOString();
const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;
/** A Court Gazette row that exists only if `guard` is true and the same headline was not already written at this instant. */
function gazette(stage: CoupStage, seed: string, names: { leader: string; newLeader: string; house: string }, now: number, guard: string, guardBinds: (string | number)[]) {
  const items = coupStage(stage)!.gazette, item = items[roll(`gazette:${seed}:${stage}`, items.length)];
  const headline = fill(item.headline, names), detail = fill(item.body, names);
  return { headline, statement: `INSERT INTO world_events (kind, headline, detail, location, occurred_at, sort_order)
    SELECT 'court-gazette', ${lit(headline)}, ${lit(detail)}, 'Aurelle', ?, ?
    WHERE ${guard} AND NOT EXISTS (SELECT 1 FROM world_events WHERE kind = 'court-gazette' AND occurred_at = ? AND headline = ${lit(headline)})`, binds: [iso(now), -now, ...guardBinds, iso(now)] };
}

const royalFavorSql = `SELECT AVG(CASE WHEN f > 100 THEN 100 ELSE f END) AS favor FROM (SELECT SUM(favor) AS f FROM aurelle_settlements GROUP BY clerk_user_id) t`;
const unresolvedRisingSql = '(SELECT 1 FROM aurelle_risings WHERE resolved_at IS NULL)';

/**
 * World tick (write path, flag on). One plot at a time: (1) a plot forms in secret from sustained Unrest, low Stability and low
 * Royal Favor, on a seeded daily roll; (2) it recruits (derived, never stored); (3) at 50% of the Guard + 3 great lords a public
 * Crisis Window opens, but never while a Rising window is open; if exposure reaches its limit first the plot is purged without
 * a window; (4) the window resolves once, deterministically from Power Weight, Stability and a seeded roll.
 * Every step is one batch whose row change and Court Gazette entry share a guard, so a retry or racing request adds nothing.
 */
export async function runAurelleCoup(db: GameDatabase, now: number) {
  const active = await db.prepare('SELECT id, formed_at, ruler_id, ruler_name, house, window_opened_at, window_closes_at, guard_pct_at_open, great_lords_at_open FROM aurelle_coups WHERE resolved_at IS NULL ORDER BY formed_at LIMIT 1').first<Row>();
  const reigning = async () => (await readCrown(db))?.name ?? leaderPersonas.aurelle.name;
  if (active) {
    const names = { leader: await reigning(), newLeader: boundedName(active.ruler_name), house: boundedName(active.house) };
    if (active.window_opened_at !== null) {
      if (now < Number(active.window_closes_at)) return;
      const stability = (await aurelleScores(db))[0]?.stability ?? 100;
      const outcome = coupSucceeds({ guardPct: Number(active.guard_pct_at_open), greatLords: Number(active.great_lords_at_open), stability, seed: active.id }) ? 'succeeded' : 'failed';
      const g = gazette(outcome === 'succeeded' ? 'coup-succeeded' : 'coup-failed', active.id, names, now, 'EXISTS (SELECT 1 FROM aurelle_coups WHERE id = ? AND resolved_at = ? AND outcome = ?)', [active.id, now, outcome]);
      await db.batch([
        db.prepare('UPDATE aurelle_coups SET resolved_at = ?, outcome = ?, stability_at_close = ? WHERE id = ? AND resolved_at IS NULL').bind(now, outcome, stability, active.id),
        db.prepare(g.statement).bind(...g.binds),
      ]);
      return;
    }
    const state = plotState(active.id, Math.floor((now - Number(active.formed_at)) / 86400));
    if (state.exposed) { // purged before it could move: no window, a failed plot
      const g = gazette('coup-failed', active.id, names, now, 'EXISTS (SELECT 1 FROM aurelle_coups WHERE id = ? AND resolved_at = ? AND outcome = ?)', [active.id, now, 'failed']);
      await db.batch([
        db.prepare("UPDATE aurelle_coups SET resolved_at = ?, outcome = 'failed' WHERE id = ? AND resolved_at IS NULL AND window_opened_at IS NULL").bind(now, active.id),
        db.prepare(g.statement).bind(...g.binds),
      ]);
      return;
    }
    if (!state.ready) return;
    const g = gazette('crisis-window-open', active.id, names, now, 'EXISTS (SELECT 1 FROM aurelle_coups WHERE id = ? AND window_opened_at = ?)', [active.id, now]);
    await db.batch([
      db.prepare(`UPDATE aurelle_coups SET window_opened_at = ?, window_closes_at = ?, guard_pct_at_open = ?, great_lords_at_open = ?
        WHERE id = ? AND resolved_at IS NULL AND window_opened_at IS NULL AND NOT EXISTS ${unresolvedRisingSql}`)
        .bind(now, now + coupConfig.windowSeconds, state.guardPct, state.greatLords, active.id),
      db.prepare(g.statement).bind(...g.binds),
    ]);
    return;
  }
  const last = await db.prepare('SELECT MAX(resolved_at) AS t FROM aurelle_coups').first<{ t: number | null }>();
  if (last?.t != null && now < Number(last.t) + coupConfig.cooldownSeconds) return;
  const scores = await aurelleScores(db);
  if (!scores.length) return;
  const favor = Number((await db.prepare(royalFavorSql).first<{ favor: number | string | null }>())?.favor ?? 0);
  const odds = formationOdds({ unrest: scores[0].unrest, stability: scores[0].stability, favor, sustainedSeconds: pressureSeconds(scores, now) });
  const id = `coup:${Math.floor(now / 86400)}`;
  if (odds <= 0 || !plotForms(id, odds)) return;
  const ruler = plotRuler(id);
  const g = gazette('plot-rumours', id, { leader: await reigning(), newLeader: '', house: '' }, now, 'EXISTS (SELECT 1 FROM aurelle_coups WHERE id = ? AND formed_at = ?)', [id, now]);
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO aurelle_coups (id, formed_at, ruler_id, ruler_name, house) SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM aurelle_coups WHERE resolved_at IS NULL)')
      .bind(id, now, ruler.id, boundedName(ruler.name), boundedName(ruler.house)),
    db.prepare(g.statement).bind(...g.binds),
  ]);
}

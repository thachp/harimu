/** #1081: Varkand's Alert Level (Green / Amber / Red) set by the Directorate (docs Varkand, Freedoms; Cities, Home city).
 *  One append-only table; the current level is the newest row. Flag HARIMU_VARKAND_ALERT_ENABLED off: no read, no write, always Green. */
import type { GameDatabase } from './database-contract';
import { flagOn } from './flag-pack.mjs';
import type { VarkandAlert } from './home-move';

export const varkandAlertSchemas = [
  `CREATE TABLE IF NOT EXISTS varkand_alert_levels (
  seq INTEGER PRIMARY KEY,
  level TEXT NOT NULL CHECK(level IN ('green','amber','red')),
  set_at INTEGER NOT NULL)`,
] as const;

export const varkandAlertLevels: readonly VarkandAlert[] = ['green', 'amber', 'red'];
export const isVarkandAlert = (v: unknown): v is VarkandAlert => typeof v === 'string' && (varkandAlertLevels as readonly string[]).includes(v);
export const varkandAlertEnabled = (env: unknown) => flagOn(env, 'HARIMU_VARKAND_ALERT_ENABLED');
const names: Record<VarkandAlert, string> = { green: 'Green', amber: 'Amber', red: 'Red' };
const rank: Record<VarkandAlert, number> = { green: 0, amber: 1, red: 2 };

/** The stored level and when it was set. Missing table, empty table or an unknown value: Green, setAt null. */
export async function readVarkandAlert(db: GameDatabase): Promise<{ level: VarkandAlert; setAt: number | null }> {
  const row = await db.prepare('SELECT level, set_at FROM varkand_alert_levels ORDER BY seq DESC LIMIT 1').first<{ level: string; set_at: number }>().catch(() => null);
  return row && isVarkandAlert(row.level) ? { level: row.level, setAt: Number(row.set_at) } : { level: 'green', setAt: null };
}

/** News line for a change, e.g. "The Directorate raises the Alert Level to Amber." */
export function varkandAlertHeadline(from: VarkandAlert, to: VarkandAlert) {
  return `The Directorate ${rank[to] > rank[from] ? 'raises' : 'lowers'} the Alert Level to ${names[to]}.`;
}

/** Sets the level and records a world news item in the same batch. Setting the current level again is a no-op (no row, no news). */
export async function setVarkandAlert(db: GameDatabase, level: VarkandAlert, now: number) {
  const current = await readVarkandAlert(db);
  if (current.level === level) return { changed: false as const, level, setAt: current.setAt };
  const headline = varkandAlertHeadline(current.level, level);
  await db.batch([
    db.prepare('INSERT INTO varkand_alert_levels (seq, level, set_at) SELECT COALESCE(MAX(seq), 0) + 1, ?, ? FROM varkand_alert_levels').bind(level, now),
    db.prepare(`INSERT INTO world_events (kind, headline, detail, location, occurred_at, sort_order) VALUES ('directorate-alert', ?, ?, 'Varkand', ?, ?)`)
      .bind(headline, `Alert Level ${names[level]} is in force across Varkand.`, new Date(now * 1000).toISOString(), -now),
  ]);
  return { changed: true as const, level, setAt: now, headline };
}

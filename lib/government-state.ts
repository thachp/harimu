import { simulateGovernment } from './government';
export const petitionSchema = `CREATE TABLE IF NOT EXISTS government_petitions (
  request_id TEXT PRIMARY KEY, clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id),
  nation_id TEXT NOT NULL, topic TEXT NOT NULL CHECK(topic IN ('food','infrastructure','work')),
  period_start INTEGER NOT NULL, occurred_at INTEGER NOT NULL,
  UNIQUE(clerk_user_id, period_start)
)`;
export const petitionSql = `INSERT INTO government_petitions
  (request_id, clerk_user_id, nation_id, topic, period_start, occurred_at)
  SELECT ?, clerk_user_id, nation_id, ?, ?, ? FROM citizens
  WHERE clerk_user_id = ? AND nation_id IN ('kindle','korund','aurelle')
    AND NOT EXISTS (SELECT 1 FROM government_petitions WHERE request_id = ?)
    AND NOT EXISTS (SELECT 1 FROM government_petitions WHERE clerk_user_id = ? AND period_start = ?)`;
export async function readGovernment(db: D1Database, nationId: string, now: number) {
  const [budget, needs, petitions] = await Promise.all([
    db.prepare("SELECT initial_minor - COALESCE((SELECT SUM(wage_minor) FROM shift_settlements),0) AS balance FROM economy_funds WHERE id='kindle-employer'").first<{ balance: number }>(),
    db.prepare(`SELECT COUNT(*) AS households, SUM(CASE WHEN COALESCE(i.quantity,0) >= 2 THEN 1 ELSE 0 END) AS supplied
      FROM citizens c LEFT JOIN citizen_inventory_balances i ON i.clerk_user_id=c.clerk_user_id AND i.item='food'
      WHERE c.nation_id=?`).bind(nationId).first<{ households: number; supplied: number }>(),
    db.prepare('SELECT topic, COUNT(*) AS count FROM government_petitions WHERE nation_id=? AND occurred_at >= ? GROUP BY topic')
      .bind(nationId, now-86400).all<{ topic: string; count: number }>(),
  ]);
  return simulateGovernment({ nationId, availableBudgetMinor: nationId === 'kindle' ? Math.max(0,budget?.balance ?? 0) : 0,
    foodSecurity: needs?.households ? Math.floor(100*(needs.supplied ?? 0)/needs.households) : 100,
    petitionCounts: Object.fromEntries(petitions.results.map((r) => [r.topic,r.count])) });
}

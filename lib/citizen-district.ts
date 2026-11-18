import type { GameDatabase } from './database-contract';
import { assemblyDistricts, capitalDistrict, districtName, isDistrict } from './assembly-rules';

/** The citizen's district is the home city when it is one of the Assembly districts, else the capital.
 *  Shared by the Assembly receipt and the presidential receipt (#1416). */
export async function citizenDistrict(db: GameDatabase, userId: string): Promise<string> {
  const row = await db.prepare("SELECT home_city_id FROM citizen_city_locations WHERE user_id=? AND nation_id='kindle'").bind(userId).first<{ home_city_id: string }>();
  return row && isDistrict(row.home_city_id) ? row.home_city_id : capitalDistrict;
}

export type DistrictBallotCount = { districtId: string; name: string; ballots: number };

/** Every district that has at least one ballot, in assembly order, then any other id. No floor and no merging. */
export function districtBallotCounts(rows: readonly { district_id: string; count: number }[]): DistrictBallotCount[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const count = Number(row.count);
    if (typeof row.district_id !== 'string' || row.district_id.length === 0 || !Number.isSafeInteger(count) || count < 1) throw Error('Election count could not be confirmed. No result published.');
    counts.set(row.district_id, count);
  }
  const known = assemblyDistricts.filter(d => counts.has(d.id)).map(d => ({ districtId: d.id, name: d.name, ballots: counts.get(d.id)! }));
  const extra = [...counts.keys()].filter(id => !isDistrict(id)).sort().map(id => ({ districtId: id, name: districtName(id), ballots: counts.get(id)! }));
  return [...known, ...extra];
}

import { citiesForNation } from './cities';
import { kindleParties } from './kindle-parties';
import { assemblyStage, ASSEMBLY_NAME_MAX } from './assembly-copy';

/** #283: Kindle mid-term Assembly rules. Pure and deterministic: no clock, no database.
 *  Canon: harimu-docs politics/elections §9.1 (half the seats up, secret ballots, results hidden until close), §9.3 (party-list
 *  proportional representation within the district; human votes and the AI bloc shown separately), §9.5 (per-district counts public).
 *  Assumptions are marked [ASSUMPTION] and listed in the PR: the D'Hondt method, six seats per district, the fixed AI bloc shares
 *  and the incumbent seat tables are placeholders until Design rules otherwise. */
export const assemblySeatsPerDistrict = 6; // [ASSUMPTION]
export const assemblySeatsUp = 3; // half
export const assemblyWindowSeconds = 72 * 3600; // same 72 real hours as the presidential PoC
/** Human ballots weigh this many units each; the AI bloc gets the same total as the humans (a 1:1 split), spread by fixed shares. */
export const assemblyHumanUnit = 100;

export const assemblyDistricts = citiesForNation('kindle').map(city => ({ id: city.id, name: city.name }));
export const assemblyPartyIds = kindleParties.map(party => party.id);
export type PartySeats = Record<string, number>;
export const isDistrict = (id: unknown): id is string => typeof id === 'string' && assemblyDistricts.some(d => d.id === id);
export const isParty = (id: unknown): id is string => typeof id === 'string' && assemblyPartyIds.includes(id);
export const districtName = (id: string) => assemblyDistricts.find(d => d.id === id)?.name ?? id;
export const capitalDistrict = assemblyDistricts[0].id; // Forgehaven: a citizen with no home city row votes here, like congregations

/** [ASSUMPTION] Incumbents: `up` seats are contested now; `held` seats are the other half and never change this election. Each sums to 3. */
export const assemblyIncumbents: Readonly<Record<string, { up: PartySeats; held: PartySeats }>> = {
  forgehaven: { up: { 'steady-hand': 2, 'open-ledger': 1, 'dockside-builders': 0 }, held: { 'steady-hand': 1, 'open-ledger': 1, 'dockside-builders': 1 } },
  'tarrek-foundry': { up: { 'steady-hand': 1, 'open-ledger': 0, 'dockside-builders': 2 }, held: { 'steady-hand': 1, 'open-ledger': 1, 'dockside-builders': 1 } },
  'kolt-savanna': { up: { 'steady-hand': 1, 'open-ledger': 2, 'dockside-builders': 0 }, held: { 'steady-hand': 1, 'open-ledger': 1, 'dockside-builders': 1 } },
};
/** [ASSUMPTION] Fixed AI bloc shares per district, whole percents summing to 100. Not a simulation; shown separately from human votes. */
export const assemblyBlocShares: Readonly<Record<string, PartySeats>> = {
  forgehaven: { 'steady-hand': 40, 'open-ledger': 35, 'dockside-builders': 25 },
  'tarrek-foundry': { 'steady-hand': 25, 'open-ledger': 20, 'dockside-builders': 55 },
  'kolt-savanna': { 'steady-hand': 30, 'open-ledger': 50, 'dockside-builders': 20 },
};

const zero = (): PartySeats => Object.fromEntries(assemblyPartyIds.map(id => [id, 0]));
const sum = (v: PartySeats) => Object.values(v).reduce((a, b) => a + b, 0);

/** D'Hondt: each seat goes to the party with the highest weight / (seats won + 1). Compared by cross-multiplication (integers only).
 *  Ties go to the larger weight, then to the declared party order. With no weight at all nothing is awarded. */
export function dHondt(weights: PartySeats, seats: number, order: readonly string[] = assemblyPartyIds): PartySeats {
  const won = Object.fromEntries(order.map(id => [id, 0])) as PartySeats;
  if (!order.some(id => (weights[id] ?? 0) > 0)) return won;
  for (let i = 0; i < seats; i++) {
    let best = order[0];
    for (const id of order.slice(1)) {
      const lhs = (weights[id] ?? 0) * (won[best] + 1), rhs = (weights[best] ?? 0) * (won[id] + 1);
      if (lhs > rhs || (lhs === rhs && (weights[id] ?? 0) > (weights[best] ?? 0))) best = id;
    }
    won[best]++;
  }
  return won;
}

export type DistrictResult = {
  districtId: string; name: string; humanBallots: number; contested: boolean;
  human: PartySeats; bloc: PartySeats; weighted: PartySeats;
  seatsUp: PartySeats; seatsHeld: PartySeats; seatsWon: PartySeats; seatsAfter: PartySeats;
};
export type AssemblyResult = { humanBallots: number; districts: DistrictResult[]; totals: { before: PartySeats; after: PartySeats } };

/** One district. Without a human ballot the AI bloc is zero too, nothing is contested, and the seats up stay with their incumbents. */
export function districtResult(districtId: string, humanVotes: PartySeats): DistrictResult {
  const incumbents = assemblyIncumbents[districtId], shares = assemblyBlocShares[districtId];
  if (!incumbents || !shares) throw new RangeError('Unknown Assembly district.');
  const human = zero(); for (const id of assemblyPartyIds) { const n = humanVotes[id] ?? 0; if (!Number.isSafeInteger(n) || n < 0) throw new RangeError('Invalid ballot count.'); human[id] = n; }
  const humanBallots = sum(human);
  const bloc = zero(), weighted = zero();
  for (const id of assemblyPartyIds) { bloc[id] = humanBallots * shares[id]; weighted[id] = human[id] * assemblyHumanUnit + bloc[id]; }
  const contested = humanBallots > 0;
  const seatsWon = contested ? dHondt(weighted, assemblySeatsUp) : { ...incumbents.up };
  const seatsAfter = zero(); for (const id of assemblyPartyIds) seatsAfter[id] = incumbents.held[id] + seatsWon[id];
  return { districtId, name: districtName(districtId), humanBallots, contested, human, bloc, weighted, seatsUp: { ...incumbents.up }, seatsHeld: { ...incumbents.held }, seatsWon, seatsAfter };
}

export function assemblyResult(byDistrict: Readonly<Record<string, PartySeats>>): AssemblyResult {
  const districts = assemblyDistricts.map(d => districtResult(d.id, byDistrict[d.id] ?? {}));
  const before = zero(), after = zero();
  for (const d of districts) for (const id of assemblyPartyIds) { before[id] += d.seatsHeld[id] + d.seatsUp[id]; after[id] += d.seatsAfter[id]; }
  return { humanBallots: districts.reduce((a, d) => a + d.humanBallots, 0), districts, totals: { before, after } };
}

const hash = (text: string) => { let h = 2166136261; for (const ch of text) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
/** Republic Wire Service items (Content #299) for a count: one per party per district that had seats up or won some, picked by
 *  seat change. Names are filled at runtime and refused if over the shared cap. */
export function assemblyHeadlines(result: AssemblyResult): { districtId: string; partyId: string; stage: 'results-gain' | 'results-hold' | 'results-loss'; headline: string; body: string }[] {
  const out: { districtId: string; partyId: string; stage: 'results-gain' | 'results-hold' | 'results-loss'; headline: string; body: string }[] = [];
  for (const d of result.districts) for (const party of kindleParties) {
    const up = d.seatsUp[party.id], won = d.seatsWon[party.id];
    if (up === 0 && won === 0) continue;
    if (party.name.length > ASSEMBLY_NAME_MAX || d.name.length > ASSEMBLY_NAME_MAX) throw new RangeError('Assembly name over the shared cap.');
    const stage = won > up ? 'results-gain' : won < up ? 'results-loss' : 'results-hold';
    const items = assemblyStage(stage)!.items, item = items[hash(`${d.districtId}:${party.id}:${stage}`) % items.length];
    const fill = (text: string) => text.replaceAll('{party}', party.name).replaceAll('{district}', d.name).replaceAll('{seats}', String(d.seatsAfter[party.id]));
    out.push({ districtId: d.districtId, partyId: party.id, stage, headline: fill(item.headline), body: fill(item.body) });
  }
  return out;
}

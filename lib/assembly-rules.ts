import { KINDLE_CALENDAR } from './election-calendars';
import { citiesForNation } from './cities';
import { kindleParties } from './kindle-parties';
import { assemblyStage, ASSEMBLY_NAME_MAX } from './assembly-copy';

/** #283: Kindle mid-term Assembly rules. Pure and deterministic: no clock, no database.
 *  Canon: harimu-docs politics/elections §9.1 (half the seats up, secret ballots, results hidden until close), §9.3 (party-list
 *  proportional representation within the district; #449: human ballots only, Decision 65), §9.5 (per-district counts public).
 *  Assumptions are marked [ASSUMPTION] and listed in the PR: the D'Hondt method, six seats per district and the incumbent seat tables
 *  are placeholders until Design rules otherwise. */
export const assemblySeatsPerDistrict = 6; // [ASSUMPTION]
export const assemblySeatsUp = 3; // half
export const assemblyWindowSeconds = KINDLE_CALENDAR.voteHours * 3600; // same 72 real hours as the presidential PoC
/** #351: the real calendar (docs politics/elections §9.1). A cycle is 120 real days (4 game years at 12x) and the mid-term Assembly election opens
 *  at day 60 of each cycle for the same 72-hour window. Real seconds on the world clock, not game time. */
export const assemblyCycleSeconds = KINDLE_CALENDAR.cycleDays * 86400; // #878: named calendar constant
export const assemblyMidtermOffsetSeconds = KINDLE_CALENDAR.assemblyMidtermDay * 86400;
/** #351 (ARC, #356 item 2): a party needs at least this share of the district's human ballots to take part in the D'Hondt award. No separate turnout floor. */
export const assemblyMinSharePercent = 5;
/** #463 (ARC ruling): a district counts only with at least this many human ballots. An absolute count floor, not a turnout share, applied before the
 *  5% party share. Under it the district takes the zero-ballot path: the seats up stay with their incumbents and the rotation does not advance. [ASSUMPTION]
 *  The number lives here only; ARC may change it. */
export const assemblyMinBallotsPerDistrict = 5;

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
export type AssemblyTiming = { openAt: number | null; cycleStartAt: number | null };
export type AssemblyPlan = { id: string; cycle: number | null; opensAt: number; closesAt: number };
/** The election the clock points at, or null when nothing is configured (never opens). `cycleStartAt` (the start of day 0 of cycle 0, epoch seconds) drives
 *  the real schedule: the latest cycle whose day-60 open has come, or cycle 0 while it is still ahead. Without it, `openAt` is the manual trigger
 *  for one election (the #283 behaviour, id unchanged). With both set the schedule wins. */
export function planAssembly(baseId: string, timing: AssemblyTiming, now: number): AssemblyPlan | null {
  if (timing.cycleStartAt !== null) {
    const opensAtOf = (cycle: number) => timing.cycleStartAt! + cycle * assemblyCycleSeconds + assemblyMidtermOffsetSeconds;
    let cycle = Math.max(0, Math.floor((now - timing.cycleStartAt) / assemblyCycleSeconds));
    if (cycle > 0 && now < opensAtOf(cycle)) cycle--;
    const opensAt = opensAtOf(cycle);
    return { id: `${baseId}-cycle-${cycle}`, cycle, opensAt, closesAt: opensAt + assemblyWindowSeconds };
  }
  return timing.openAt === null ? null : { id: baseId, cycle: null, opensAt: timing.openAt, closesAt: timing.openAt + assemblyWindowSeconds };
}
/** The next open strictly after `now`, or null. */
export function nextAssemblyOpen(timing: AssemblyTiming, now: number): number | null {
  if (timing.cycleStartAt === null) return timing.openAt !== null && timing.openAt > now ? timing.openAt : null;
  const first = timing.cycleStartAt + assemblyMidtermOffsetSeconds;
  return now < first ? first : first + (Math.floor((now - first) / assemblyCycleSeconds) + 1) * assemblyCycleSeconds;
}

export type Incumbents = Readonly<Record<string, { up: PartySeats; held: PartySeats }>>;
/** Seats carry over with staggered terms (ARC final on #351): after a count, the seats just won are the ones held for the next election and the seats
 *  held through this one are the ones that go up next. Each district keeps its six seats (three up, three held). A district nobody voted in was not
 *  counted, so the rotation does not advance there: the same half goes up again. */
export function carryIncumbents(previous: AssemblyResult): Incumbents {
  return Object.fromEntries(previous.districts.map(d => [d.districtId, d.contested ? { up: { ...d.seatsHeld }, held: { ...d.seatsWon } } : { up: { ...d.seatsUp }, held: { ...d.seatsHeld } }]));
}

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
  districtId: string; name: string; humanBallots: number; contested: boolean; belowMinimum: boolean; belowThreshold: string[];
  human: PartySeats;
  seatsUp: PartySeats; seatsHeld: PartySeats; seatsWon: PartySeats; seatsAfter: PartySeats;
};
export type AssemblyResult = { humanBallots: number; districts: DistrictResult[]; totals: { before: PartySeats; after: PartySeats } };

/** One district, counted from human ballots only (#449, Decision 65: no AI ballots, no simulated bloc). Under `assemblyMinBallotsPerDistrict` human ballots (none included) nothing is contested and the seats up stay with their incumbents (#463). */
export function districtResult(districtId: string, humanVotes: PartySeats, carried: Incumbents = assemblyIncumbents): DistrictResult {
  const incumbents = carried[districtId];
  if (!incumbents) throw new RangeError('Unknown Assembly district.');
  const human = zero(); for (const id of assemblyPartyIds) { const n = humanVotes[id] ?? 0; if (!Number.isSafeInteger(n) || n < 0) throw new RangeError('Invalid ballot count.'); human[id] = n; }
  const humanBallots = sum(human);
  const weighted = zero(); // the D'Hondt weights: each party's human ballots
  // #351: a party under the minimum share of the human ballots takes no part in the award. Integers only.
  const contested = humanBallots >= assemblyMinBallotsPerDistrict;
  const belowMinimum = humanBallots > 0 && !contested; // some ballots, too few to count: published, but they award nothing
  const belowThreshold = contested ? assemblyPartyIds.filter(id => human[id] * 100 < assemblyMinSharePercent * humanBallots) : [];
  for (const id of assemblyPartyIds) weighted[id] = belowThreshold.includes(id) ? 0 : human[id];
  const seatsWon = contested ? dHondt(weighted, assemblySeatsUp) : { ...incumbents.up };
  const seatsAfter = zero(); for (const id of assemblyPartyIds) seatsAfter[id] = incumbents.held[id] + seatsWon[id];
  return { districtId, name: districtName(districtId), humanBallots, contested, belowMinimum, belowThreshold, human, seatsUp: { ...incumbents.up }, seatsHeld: { ...incumbents.held }, seatsWon, seatsAfter };
}

export function assemblyResult(byDistrict: Readonly<Record<string, PartySeats>>, carried: Incumbents = assemblyIncumbents): AssemblyResult {
  const districts = assemblyDistricts.map(d => districtResult(d.id, byDistrict[d.id] ?? {}, carried));
  const before = zero(), after = zero();
  for (const d of districts) for (const id of assemblyPartyIds) { before[id] += d.seatsHeld[id] + d.seatsUp[id]; after[id] += d.seatsAfter[id]; }
  return { humanBallots: districts.reduce((a, d) => a + d.humanBallots, 0), districts, totals: { before, after } };
}

const hash = (text: string) => { let h = 2166136261; for (const ch of text) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
/** Kindle Press items (Content #299) for a count: one per party per district that had seats up or won some, picked by
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

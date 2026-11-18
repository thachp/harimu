/** #308: pure treaty rules (no imports, so tests can load this file directly). Canon: harimu-docs 13.1 (who conducts foreign policy:
 *  Kindle's Assembly ratifies treaties by two-thirds and trade deals by simple majority, Korund's Chairman alone, Aurelle by royal
 *  decree; every negotiator and ratifying body is AI) and 13.2 (treaty types: non-aggression pact, trade agreement). Times are epoch seconds.
 *  Assumptions are marked [ASSUMPTION] and listed in the PR: the one-game-year trade term, the 365-day game year, the fixed Kindle party
 *  stances and that the Chairman and the Crown always ratify. */
export const treatyNations = ['kindle', 'korund', 'aurelle'] as const;
export type TreatyNationId = typeof treatyNations[number];
export const treatyKinds = ['non-aggression', 'trade'] as const;
export type TreatyKind = typeof treatyKinds[number];
export type TreatyDbStatus = 'proposed' | 'in_force' | 'rejected' | 'expired' | 'broken';
export type TreatyStatus = 'proposed' | 'in-force' | 'expired' | 'broken';
export const treatyNationNames: Readonly<Record<TreatyNationId, string>> = { kindle: 'Kindle', korund: 'Korund', aurelle: 'Aurelle' };
export const treatyKindNames: Readonly<Record<TreatyKind, string>> = { 'non-aggression': 'non-aggression pact', trade: 'trade agreement' };

export const isTreatyNation = (value: unknown): value is TreatyNationId => typeof value === 'string' && (treatyNations as readonly string[]).includes(value);
export const isTreatyKind = (value: unknown): value is TreatyKind => typeof value === 'string' && (treatyKinds as readonly string[]).includes(value);
export const treatyPairKey = (a: string, b: string) => [a, b].sort().join(':');
export const treatyRequestIdOk = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(value);
export const treatyActorMax = 60;
/** Plain-text label: control characters and markup are dropped, whitespace collapsed, length capped. */
export const cleanTreatyLabel = (value: unknown, max: number) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim() : '';

/** [ASSUMPTION] A game year is 365 game days. Terms are fixed in game time and converted at the shared clock compression (12x): a game
 *  year is 365 * 86400 / 12 = 2,628,000 real seconds. NAP: 2 game years (the issue). Trade agreement: 1 game year (the issue gives none). */
export const gameDaysPerYear = 365;
export const treatyTermGameYears: Readonly<Record<TreatyKind, number>> = { 'non-aggression': 2, trade: 1 };
export const treatyTermSeconds = (kind: TreatyKind, compression: number) => Math.round(treatyTermGameYears[kind] * gameDaysPerYear * 86400 / compression);

/** Derived on read, so a read never writes: an in-force treaty is expired from the second its term ends. */
export function treatyStatus(row: { status: TreatyDbStatus; endsAt: number | null }, now: number): TreatyStatus | 'rejected' {
  if (row.status === 'in_force') return row.endsAt !== null && now >= row.endsAt ? 'expired' : 'in-force';
  return row.status === 'proposed' ? 'proposed' : row.status === 'expired' ? 'expired' : row.status === 'broken' ? 'broken' : 'rejected';
}

/** #400 [ASSUMPTION, awaiting a Design ruling]: what breaking an in-force treaty costs the BREAKING nation. Docs 13.2 says a non-aggression pact
 *  costs Legitimacy and global Reputation and gives no figure; a trade agreement has no stated cost, so it carries none here beyond the news line.
 *  These are placeholders, recorded with the break and returned to the caller. Nothing debits them yet: Legitimacy and Reputation have no store
 *  (lib/aurelle-coup-rules.ts: "neutral until #69 grows one"). Negative numbers are losses. */
export const treatyBreakPenalty: Readonly<Record<TreatyKind, { legitimacy: number; reputation: number }>> = {
  'non-aggression': { legitimacy: -5, reputation: -10 },
  trade: { legitimacy: 0, reputation: 0 },
};
export type TreatyBreakPenalty = { nation: TreatyNationId; legitimacy: number; reputation: number; applied: false };
export const treatyBreakPenaltyFor = (kind: TreatyKind, breaker: TreatyNationId): TreatyBreakPenalty => ({ nation: breaker, ...treatyBreakPenalty[kind], applied: false });

/** #1474 / #1477: derived World Reputation per MVP nation from broken treaties. Starts at 0 and adds
 *  treatyBreakPenalty[kind].reputation for each treaty with status === 'broken' and brokenBy === nation.
 *  brokenPacts counts only breaks whose reputation penalty is non-zero. Nothing is stored.
 *  #1477: score and brokenPacts are computed from an uncapped per-nation count (worldReputationFromBreaks), never from a LIMITed list.
 *  #1480: withWorldReputationRecord attaches the visible broken-treaty record; the SQL is the same uncapped #1477 source, with one row per break. */
export type WorldReputationScore = { score: number; brokenPacts: number };
export type WorldReputationBreak = { other: TreatyNationId; kind: TreatyKind; brokenAt: number; brokenGameDay: number; penalty: number };
export type WorldReputation = WorldReputationScore & { record: WorldReputationBreak[]; earlierBreaks: number };
export type WorldReputationScoreMap = Record<TreatyNationId, WorldReputationScore>;
export type WorldReputationMap = Record<TreatyNationId, WorldReputation>;
export const worldReputationRecordLimit = 10;
/** Same game-day formula as the world clock: day 1 at epoch, 12× compression. */
export const worldReputationGameDay = (epochSeconds: number, atSeconds: number) => Math.floor(Math.max(0, atSeconds - epochSeconds) * 12 / 86400) + 1;
export const worldReputationBreaksSql = "SELECT id, broken_by, kind, proposer_nation, other_nation, ended_at, COUNT(*) AS n FROM treaties WHERE status='broken' AND broken_by IS NOT NULL GROUP BY broken_by, kind, id, proposer_nation, other_nation, ended_at";
export type WorldReputationBreakRow = { brokenBy: string | null; kind: string; n: number };
export function worldReputationFromBreaks(rows: readonly WorldReputationBreakRow[]): WorldReputationScoreMap {
  const result = Object.fromEntries(treatyNations.map(nation => [nation, { score: 0, brokenPacts: 0 }])) as WorldReputationScoreMap;
  for (const row of rows) {
    if (!isTreatyNation(row.brokenBy) || !isTreatyKind(row.kind)) continue;
    const n = Math.max(0, Math.floor(Number(row.n) || 0));
    const penalty = treatyBreakPenalty[row.kind].reputation;
    result[row.brokenBy].score += penalty * n;
    if (penalty !== 0) result[row.brokenBy].brokenPacts += n;
  }
  return result;
}
export function worldReputation(treaties: readonly { kind: TreatyKind; status: string; brokenBy: TreatyNationId | null }[]): WorldReputationScoreMap {
  return worldReputationFromBreaks(treaties.flatMap(treaty =>
    treaty.status === 'broken' ? [{ brokenBy: treaty.brokenBy, kind: treaty.kind, n: 1 }] : []));
}

/** #1480: attach the broken-treaty record behind each nation's score. Only kinds with a non-zero
 *  treatyBreakPenalty[kind].reputation. Newest first (brokenAt, then id). The visible record is capped
 *  at worldReputationRecordLimit; earlierBreaks is how many older counting breaks the cap omits. The
 *  score still counts all of them. Consumes the uncapped break rows from #1477's query. Nothing is stored. */
export function withWorldReputationRecord(
  scores: WorldReputationScoreMap,
  treaties: readonly { id?: string; kind: string; status?: string; brokenBy: string | null; proposer: string; other: string; brokenAt: number | null }[],
  epochSeconds: number,
): WorldReputationMap {
  const collected = Object.fromEntries(treatyNations.map(nation => [nation, [] as (WorldReputationBreak & { id: string })[]])) as Record<TreatyNationId, (WorldReputationBreak & { id: string })[]>;
  for (const treaty of treaties) {
    if ((treaty.status != null && treaty.status !== 'broken') || !isTreatyNation(treaty.brokenBy) || !isTreatyKind(treaty.kind)) continue;
    const penalty = treatyBreakPenalty[treaty.kind].reputation;
    if (penalty === 0 || !isTreatyNation(treaty.proposer) || !isTreatyNation(treaty.other)) continue;
    const other = treaty.brokenBy === treaty.proposer ? treaty.other : treaty.brokenBy === treaty.other ? treaty.proposer : null;
    if (!isTreatyNation(other)) continue;
    const brokenAt = treaty.brokenAt ?? 0;
    collected[treaty.brokenBy].push({ other, kind: treaty.kind, brokenAt, brokenGameDay: worldReputationGameDay(epochSeconds, brokenAt), penalty, id: treaty.id ?? '' });
  }
  const result = {} as WorldReputationMap;
  for (const nation of treatyNations) {
    const all = collected[nation].sort((a, b) => b.brokenAt - a.brokenAt || b.id.localeCompare(a.id));
    const record = all.slice(0, worldReputationRecordLimit).map(item => ({ other: item.other, kind: item.kind, brokenAt: item.brokenAt, brokenGameDay: item.brokenGameDay, penalty: item.penalty }));
    result[nation] = { ...(scores[nation] ?? { score: 0, brokenPacts: 0 }), record, earlierBreaks: Math.max(0, all.length - worldReputationRecordLimit) };
  }
  return result;
}


/** #400 [ASSUMPTION]: scheduled AI-leader proposals. A deterministic stand-in for the utility model (not a simulation): at most one proposal per
 *  real-time slot (one day, 12 game days at the 12x clock), rotating through the six pair-and-kind candidates, the proposer alternating each full
 *  rotation. A refused proposal of the same pair and kind is not repeated for `treatyProposalCooldownSlots` slots. */
export const treatyProposalSlotSeconds = 86400;
export const treatyProposalCooldownSlots = 3;
export const treatyAiLeaders: Readonly<Record<TreatyNationId, string>> = { kindle: "Kindle's AI Cabinet", korund: "Korund's AI Chairman", aurelle: "Aurelle's AI Crown" };
export const treatySlot = (now: number) => Math.floor(now / treatyProposalSlotSeconds);
export const treatyProposalRequestId = (slot: number) => `ai-slot-${slot}`;

/** #1490 [ASSUMPTION]: a trade agreement that expired by term is eligible for renewal for 24 real hours. Older ones never renew. */
export const renewalWindowSeconds = 86400;
/** A gapless renewed term: ratified at the old end, then one trade term at the shared clock compression. */
export function renewedTerm(oldEndsAt: number, compression: number): { ratifiedAt: number; endsAt: number } {
  return { ratifiedAt: oldEndsAt, endsAt: oldEndsAt + treatyTermSeconds('trade', compression) };
}
/** request_id for a renewal of `oldId`. Must pass treatyRequestIdOk; long ids are hashed to fit the 64-character cap. */
export function treatyRenewalRequestId(oldId: string): string {
  const raw = `renew-${oldId}`;
  if (treatyRequestIdOk(raw)) return raw;
  let hash = 2166136261;
  for (let i = 0; i < oldId.length; i++) hash = Math.imul(hash ^ oldId.charCodeAt(i), 16777619);
  return `renew-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
const treatyPairs: ReadonlyArray<readonly [TreatyNationId, TreatyNationId]> = [['kindle', 'korund'], ['kindle', 'aurelle'], ['korund', 'aurelle']];
export function treatyCandidates(slot: number): Array<{ proposer: TreatyNationId; other: TreatyNationId; kind: TreatyKind }> {
  const all = treatyPairs.flatMap(pair => treatyKinds.map(kind => ({ pair, kind })));
  const start = ((slot % all.length) + all.length) % all.length, flip = Math.floor(slot / all.length) % 2 === 1;
  return all.map((_, i) => all[(start + i) % all.length]).map(({ pair, kind }) => ({ proposer: flip ? pair[1] : pair[0], other: flip ? pair[0] : pair[1], kind }));
}

export type PartySeats = Record<string, number>;
const partyIds = ['steady-hand', 'open-ledger', 'dockside-builders'] as const;
/** [ASSUMPTION] Fixed stand-in for the AI Assembly: each Kindle party votes yes or no by the kind of treaty and the other signatory.
 *  Not a simulation. The seats come from the Assembly (lib/assembly.ts, #283): the last counted result, else the incumbent tables. */
export const kindleStances: Readonly<Record<TreatyKind, Readonly<Record<'korund' | 'aurelle', Readonly<Record<typeof partyIds[number], boolean>>>>>> = {
  'non-aggression': { korund: { 'steady-hand': true, 'open-ledger': true, 'dockside-builders': false }, aurelle: { 'steady-hand': true, 'open-ledger': false, 'dockside-builders': false } },
  trade: { korund: { 'steady-hand': true, 'open-ledger': false, 'dockside-builders': true }, aurelle: { 'steady-hand': false, 'open-ledger': true, 'dockside-builders': false } },
};
export type Ratification = { nation: TreatyNationId; body: 'Assembly' | 'Chairman' | 'Crown'; passed: boolean; rule: 'two-thirds' | 'simple-majority' | 'sole'; yes?: number; total?: number };

/** Docs 13.1: a treaty needs two-thirds of the Assembly, a trade deal a simple majority (more than half). Integers only. */
export function kindleRatification(kind: TreatyKind, other: TreatyNationId, seats: PartySeats): Ratification {
  const stance = other === 'korund' || other === 'aurelle' ? kindleStances[kind][other] : null;
  const total = partyIds.reduce((a, id) => a + Math.max(0, Math.trunc(seats[id] ?? 0)), 0);
  const yes = stance ? partyIds.reduce((a, id) => a + (stance[id] ? Math.max(0, Math.trunc(seats[id] ?? 0)) : 0), 0) : 0;
  const rule = kind === 'non-aggression' ? 'two-thirds' as const : 'simple-majority' as const;
  const passed = total > 0 && (rule === 'two-thirds' ? yes * 3 >= total * 2 : yes * 2 > total);
  return { nation: 'kindle', body: 'Assembly', passed, rule, yes, total };
}
/** Korund: the Chairman alone ratifies; Aurelle: the Crown by decree. One AI actor each [ASSUMPTION: always yes]. */
export const soleRatification = (nation: 'korund' | 'aurelle'): Ratification => ({ nation, body: nation === 'korund' ? 'Chairman' : 'Crown', passed: true, rule: 'sole' });

/** Both signatories' ratifying bodies must approve (docs 13.1: each nation's own body ratifies). */
export function decideTreaty(kind: TreatyKind, a: TreatyNationId, b: TreatyNationId, kindleSeats: PartySeats): { approved: boolean; ratifications: Ratification[] } {
  const side = (nation: TreatyNationId, other: TreatyNationId) => nation === 'kindle' ? kindleRatification(kind, other, kindleSeats) : soleRatification(nation);
  const ratifications = [side(a, b), side(b, a)];
  return { approved: ratifications.every(r => r.passed), ratifications };
}

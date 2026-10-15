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

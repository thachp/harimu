import type { PartySeats, Ratification, TreatyNationId } from './diplomacy-rules';

/** #363: pure embargo rules (type-only import, so tests can load this file directly). Canon: harimu-docs 13.3 (a bilateral embargo forbids all
 *  trade with the target, and it also costs the sanctioner), 13.1 (an embargo is treated as a trade measure for ratification: Kindle's Assembly
 *  by simple majority, Korund's Chairman alone, Aurelle by royal decree; every negotiator and ratifying body is AI). Times are epoch seconds.
 *  Only the imposing nation's ratifying body votes: a nation does not ratify an embargo against itself. [ASSUMPTION] Lifting needs no vote
 *  (the imposing nation lifts it) and an embargo has no fixed term (the issue gives none). The Kindle party stances are placeholders [ASSUMPTION]. */
export type EmbargoDbStatus = 'proposed' | 'in_force' | 'rejected' | 'lifted';
export type EmbargoStatus = 'proposed' | 'in-force' | 'lifted';
export const embargoNationIds = ['kindle', 'korund', 'aurelle'] as const;
export const isEmbargoNation = (value: unknown): value is TreatyNationId => typeof value === 'string' && (embargoNationIds as readonly string[]).includes(value);
export const embargoRequestIdOk = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(value);
export const embargoPairKey = (a: string, b: string) => [a, b].sort().join(':');
export const embargoNationNames: Readonly<Record<TreatyNationId, string>> = { kindle: 'Kindle', korund: 'Korund', aurelle: 'Aurelle' };

export function embargoStatus(status: EmbargoDbStatus): EmbargoStatus | 'rejected' {
  return status === 'in_force' ? 'in-force' : status;
}

const partyIds = ['steady-hand', 'open-ledger', 'dockside-builders'] as const;
/** [ASSUMPTION] Fixed stand-in for the AI Assembly: which Kindle parties vote yes to an embargo on each target. Seats come from the Assembly (#283). */
export const kindleEmbargoStances: Readonly<Record<'korund' | 'aurelle', Readonly<Record<typeof partyIds[number], boolean>>>> = {
  korund: { 'steady-hand': false, 'open-ledger': false, 'dockside-builders': true },
  aurelle: { 'steady-hand': true, 'open-ledger': false, 'dockside-builders': true },
};

/** Docs 13.1 trade rule: more than half of the seats. Integers only; an empty Assembly ratifies nothing. */
export function embargoRatification(actor: TreatyNationId, target: TreatyNationId, seats: PartySeats): Ratification {
  if (actor !== 'kindle') return { nation: actor, body: actor === 'korund' ? 'Chairman' : 'Crown', passed: true, rule: 'sole' };
  const stance = target === 'korund' || target === 'aurelle' ? kindleEmbargoStances[target] : null;
  const count = (id: string) => Math.max(0, Math.trunc(seats[id] ?? 0));
  const total = partyIds.reduce((a, id) => a + count(id), 0);
  const yes = stance ? partyIds.reduce((a, id) => a + (stance[id] ? count(id) : 0), 0) : 0;
  return { nation: 'kindle', body: 'Assembly', passed: total > 0 && yes * 2 > total, rule: 'simple-majority', yes, total };
}

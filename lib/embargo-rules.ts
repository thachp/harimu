import { grievanceConfig } from './war-rules.ts';
import { isTreatyKind, isTreatyNation, treatyProposalCooldownSlots, treatyProposalSlotSeconds, type PartySeats, type Ratification, type TreatyNationId } from './diplomacy-rules.ts';

/** #363: pure embargo rules (no database import, so tests can load this file directly). Canon: harimu-docs 13.3 (a bilateral embargo forbids all
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

/** #1505 [ASSUMPTION]: the embargo trigger window is the border-incident window, measured from treaties.ended_at. War grievances stay ageless. */
export const AI_TREATY_EMBARGO_FLAG = 'HARIMU_AI_TREATY_EMBARGO_ENABLED';
export const aiEmbargoGrievanceWindowSeconds = grievanceConfig.borderIncidentWindowSeconds;
export const aiEmbargoRefusalCooldownSeconds = treatyProposalCooldownSlots * treatyProposalSlotSeconds;
export const aiEmbargoRequestId = (slot: number, actor: string, target: string) => `ai-embargo-${slot}-${actor}-${target}`;
export type AiEmbargoBreak = { kind: string; status: string; proposer: string; other: string; brokenBy: string | null; endedAt: number | null };
export type AiEmbargoRow = { id?: string; actor: string; target: string; status: string; decidedAt?: number | null };
export type AiEmbargoTreaty = { kind: string; status: string; proposer: string; other: string; endsAt?: number | null };
export type AiEmbargoCandidate = { actor: TreatyNationId; target: TreatyNationId; endedAt: number };
const cmp = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const inWindow = (now: number, endedAt: number) => endedAt <= now && now - endedAt <= aiEmbargoGrievanceWindowSeconds;
const treatyLive = (row: AiEmbargoTreaty, now: number) => row.status === 'in_force' && isTreatyKind(row.kind) && typeof row.endsAt === 'number' && row.endsAt > now;
const sidesOf = (row: AiEmbargoBreak) => {
  if (row.status !== 'broken' || !isTreatyKind(row.kind) || !isTreatyNation(row.brokenBy)) return null;
  const actor = row.brokenBy === row.proposer ? row.other : row.brokenBy === row.other ? row.proposer : null;
  return isTreatyNation(actor) && actor !== row.brokenBy ? { actor, target: row.brokenBy } : null;
};
const blocked = (embargoes: readonly AiEmbargoRow[], actor: string, target: string, now: number) => embargoes.some(row => row.actor === actor && row.target === target && (row.status === 'proposed' || row.status === 'in_force' || (row.status === 'rejected' && typeof row.decidedAt === 'number' && row.decidedAt > now - aiEmbargoRefusalCooldownSeconds)));
const settled = (treaties: readonly AiEmbargoTreaty[], actor: string, target: string, now: number) => treaties.some(row => treatyLive(row, now) && ((row.proposer === actor && row.other === target) || (row.proposer === target && row.other === actor)));

/** One candidate per direction: the target broke a treaty with the actor inside the window. Oldest endedAt, then actor, then target. */
export function aiEmbargoCandidates(now: number, breaks: readonly AiEmbargoBreak[], embargoes: readonly AiEmbargoRow[], treaties: readonly AiEmbargoTreaty[]): AiEmbargoCandidate[] {
  const best = new Map<string, AiEmbargoCandidate>();
  for (const row of breaks) {
    if (row.endedAt == null || !inWindow(now, row.endedAt)) continue;
    const sides = sidesOf(row);
    if (!sides || blocked(embargoes, sides.actor, sides.target, now) || settled(treaties, sides.actor, sides.target, now)) continue;
    const prev = best.get(`${sides.actor}:${sides.target}`);
    if (!prev || row.endedAt < prev.endedAt) best.set(`${sides.actor}:${sides.target}`, { ...sides, endedAt: row.endedAt });
  }
  return [...best.values()].sort((a, b) => a.endedAt - b.endedAt || cmp(a.actor, b.actor) || cmp(a.target, b.target));
}

/** Lift an in-force embargo when the target has no in-window break left, or the pair has a new in-force treaty. */
export function aiEmbargoLifts(now: number, embargoes: readonly AiEmbargoRow[], breaks: readonly AiEmbargoBreak[], treaties: readonly AiEmbargoTreaty[]) {
  const out: Array<{ id: string; actor: TreatyNationId; target: TreatyNationId }> = [];
  for (const row of embargoes) {
    if (row.status !== 'in_force' || !row.id || !isTreatyNation(row.actor) || !isTreatyNation(row.target)) continue;
    const fresh = breaks.some(item => item.endedAt != null && inWindow(now, item.endedAt) && sidesOf(item)?.actor === row.actor && sidesOf(item)?.target === row.target);
    if (!fresh || settled(treaties, row.actor, row.target, now)) out.push({ id: row.id, actor: row.actor, target: row.target });
  }
  return out.sort((a, b) => cmp(a.actor, b.actor) || cmp(a.target, b.target) || cmp(a.id, b.id));
}

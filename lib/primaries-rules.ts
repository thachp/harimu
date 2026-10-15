import { instantRunoffCounts, validRanking, type RunoffResult } from './instant-runoff';
import { kindleParties, kindleCandidatePlatforms } from './kindle-parties';
import { electionCandidates } from './elections';
import { CAMPAIGN_NAME_MAX, primariesCopy } from './campaign-copy';

/** #307: Kindle party primaries. Pure and deterministic. Canon: harimu-docs politics/elections §9.1 (human party members vote among the
 *  AI hopefuls, instant-runoff; AI citizens do not vote in primaries) and §9.4 (human citizens join AI parties as members).
 *  Hopefuls are AI. Each party has three: the existing presidential candidate (the incumbent hopeful) plus two forged from a template,
 *  so every primary has at least three eligible personas (§10.5, Candidate Forge). Names are placeholders [ASSUMPTION]. */
export const primaryWindowSeconds = 72 * 3600; // same 72 real hours as the presidential PoC
export type Hopeful = { id: string; partyId: string; name: string; platform: string; pledges: readonly string[]; incumbent: boolean; ai: true };

// Forged hopefuls: invented names (<= the shared 24 character cap) and 3-5 pledge keys from the existing catalog.
const forged: readonly { id: string; partyId: string; name: string; platform: string; pledges: readonly string[] }[] = [
  { id: 'corin-halloway', partyId: 'steady-hand', name: 'Corin Halloway', platform: 'Hire first, trade second: public works before any new deal.', pledges: ['jobs-public-works', 'jobs-mines', 'trade-careful-deals'] },
  { id: 'yelena-brask', partyId: 'steady-hand', name: 'Yelena Brask', platform: 'Steady wages and a land tax review before any new levy.', pledges: ['jobs-full-employment', 'tax-fair-land', 'civic-open-ballots'] },
  { id: 'dessa-ironwood', partyId: 'open-ledger', name: 'Dessa Ironwood', platform: 'Cut sales tax and red tape for new companies.', pledges: ['tax-lower-sales', 'civic-fewer-rules', 'trade-open-markets'] },
  { id: 'marek-voss', partyId: 'open-ledger', name: 'Marek Voss', platform: 'Open every market and sign the Meridian deal.', pledges: ['trade-open-markets', 'trade-meridian-deal', 'tax-lower-income'] },
  { id: 'anselm-pike', partyId: 'dockside-builders', name: 'Anselm Pike', platform: 'New docks and new frontier cities, built in public.', pledges: ['frontier-docks', 'frontier-new-cities', 'jobs-public-works'] },
  { id: 'odile-brandt', partyId: 'dockside-builders', name: 'Odile Brandt', platform: 'Public housing first, with every ballot counted in view.', pledges: ['housing-public', 'civic-open-ballots', 'tax-fair-land'] },
];
const incumbents: Hopeful[] = electionCandidates.map(c => ({ id: c.id, partyId: kindleCandidatePlatforms[c.id].partyId, name: c.name, platform: c.platform, pledges: kindleCandidatePlatforms[c.id].pledges, incumbent: true, ai: true }));
/** Every hopeful, incumbents first within their party; the declared order is the instant-runoff tie order. */
export const hopefuls: readonly Hopeful[] = kindleParties.flatMap(p => [...incumbents.filter(h => h.partyId === p.id), ...forged.filter(h => h.partyId === p.id).map(h => ({ ...h, incumbent: false, ai: true as const }))]);
export const partyIds = kindleParties.map(p => p.id);
export const isPartyId = (id: unknown): id is string => typeof id === 'string' && partyIds.includes(id);
export const hopefulsOf = (partyId: string) => hopefuls.filter(h => h.partyId === partyId);
export const hopefulIdsOf = (partyId: string) => hopefulsOf(partyId).map(h => h.id);
export const nameCapOk = (text: string) => text.length > 0 && text.length <= CAMPAIGN_NAME_MAX;

export type PartyCount = { partyId: string; hopefuls: { id: string; name: string }[]; ballots: number; members: number; nominee: string; decided: boolean; runoff: RunoffResult };
/** One party's primary: members only (the AI bloc is empty: no simulated units, AI citizens never vote). No ballots, or a result
 *  with no winner, leaves the incumbent hopeful as the nominee so the general ballot always has exactly one nominee per party. */
export function countPrimary(partyId: string, groups: readonly { ranking: readonly string[]; count: number }[], members: number): PartyCount {
  const list = hopefulsOf(partyId), ids = list.map(h => h.id);
  for (const g of groups) if (!validRanking(g.ranking, ids)) throw new RangeError('A primary ballot ranks only its own party\'s hopefuls.');
  const runoff = instantRunoffCounts(ids, groups, []);
  const incumbent = list.find(h => h.incumbent)!;
  return { partyId, hopefuls: list.map(h => ({ id: h.id, name: h.name })), ballots: runoff.humanBallots, members, nominee: runoff.winner ?? incumbent.id, decided: runoff.winner !== null, runoff };
}
export type PrimaryResult = { parties: PartyCount[]; nominees: Record<string, string> };
export function primaryResult(byParty: Readonly<Record<string, { groups: readonly { ranking: readonly string[]; count: number }[]; members: number }>>): PrimaryResult {
  const parties = partyIds.map(id => countPrimary(id, byParty[id]?.groups ?? [], byParty[id]?.members ?? 0));
  return { parties, nominees: Object.fromEntries(parties.map(p => [p.partyId, p.nominee])) };
}

/** The general-election slate for one result: the same three party slots (ids unchanged, so the presidential flow and its tests do
 *  not move), each filled by that party's nominee. Without a result, today's three candidates. */
export function generalSlate(nominees: Readonly<Record<string, string>> | null): readonly { id: string; name: string; platform: string }[] {
  return electionCandidates.map(slot => {
    const partyId = kindleCandidatePlatforms[slot.id].partyId, pick = nominees ? hopefuls.find(h => h.id === nominees[partyId]) : undefined;
    return pick && pick.partyId === partyId ? { id: slot.id, name: pick.name, platform: pick.platform } : { id: slot.id, name: slot.name, platform: slot.platform };
  });
}

const fill = (text: string, v: { hopeful: string; party: string }) => text.replaceAll('{hopeful}', v.hopeful).replaceAll('{party}', v.party);
const hash = (text: string) => { let h = 2166136261; for (const ch of text) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; };
/** Content #300 nominee announcements, one per party. Names come from the roster and are refused if over the shared cap. */
export function nomineeAnnouncements(result: PrimaryResult): { partyId: string; nominee: string; text: string }[] {
  return result.parties.map(p => {
    const hopeful = hopefuls.find(h => h.id === p.nominee)!, party = kindleParties.find(x => x.id === p.partyId)!;
    if (!nameCapOk(hopeful.name) || party.name.length > CAMPAIGN_NAME_MAX) throw new RangeError('Primary name over the shared cap.');
    const lines = primariesCopy.nomineeAnnounced;
    return { partyId: p.partyId, nominee: hopeful.id, text: fill(lines[hash(`${p.partyId}:${p.nominee}`) % lines.length].text, { hopeful: hopeful.name, party: party.name }) };
  });
}

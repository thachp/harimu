/** #613 Aurelle hereditary succession PoC: pure rules (no imports, so plain-Node tests load this file directly).
 *  Canon: docs coups-transitions §10.4 (Aurelle "death/abdication to the designated heir"; no eligible successor, the AI Great Council of lords elects a new house) and §10.5 (illness is announced
 *  first; no persona change during an election, Crisis Window or war), and the Aurelle sheet ("the AI Monarch names an heir from the House's AI members; failing that, seniority").
 *  All House AI member names, their seniority and the templated gazette lines are [ASSUMPTION] proposal data for Content (companion issue); no LLM, no mortality clock.
 *  The state is DERIVED from the recorded events and the current crown, never stored: a palace coup or a Rising crown that is newer than the last event resets the line. */
export type SuccessionStatus = 'reigning' | 'ailing' | 'vacant' | 'acceded' | 'abdicated';
export type SuccessionEventKind = 'illness' | 'vacancy' | 'abdication' | 'accession' | 'great_council';
export type Member = { id: string; name: string };
export type HouseLine = { named: string | null; members: readonly Member[] }; // members in seniority order, most senior first
export type SuccessionEvent = { seq: number; kind: SuccessionEventKind; memberId: string | null; name: string | null; house: string | null; occurredAt: number };
export type Ruler = { name: string; house: string };
export type Heir = { memberId: string; name: string; house: string; named: boolean };
export type SuccessionState = { status: SuccessionStatus; ruler: Ruler; heir: Heir | null; ruledHouses: string[]; events: number };

/** The ruler before any crown or succession: lib/leader-personas.ts (pinned by a test). */
export const baseRuler: Ruler = { name: 'Maera Solenne', house: 'House Solenne' };
const M = (id: string, name: string): Member => ({ id, name });
/** Each house that can hold the Aurelle crown (the reigning House, the three Rising claimants, the six great lords) has a small authored line. Names are at most 24 characters (tested). */
export const houseLines: Readonly<Record<string, HouseLine>> = {
  'House Solenne': { named: 'elowen', members: [M('aldric', 'Prince Aldric Solenne'), M('elowen', 'Princess Elowen Solenne'), M('tamsin', 'Lord Tamsin Solenne')] },
  'House Vaelcourt': { named: null, members: [M('peren', 'Lord Peren Vaelcourt'), M('ines', 'Lady Ines Vaelcourt')] },
  'House Brightvane': { named: null, members: [M('maud', 'Lady Maud Brightvane'), M('hale', 'Lord Hale Brightvane')] },
  'House Larkspire': { named: null, members: [M('wren', 'Lady Wren Larkspire'), M('odo', 'Lord Odo Larkspire')] },
  'House Ashgrove': { named: null, members: [M('tess', 'Lady Tess Ashgrove'), M('bram', 'Lord Bram Ashgrove')] },
  'House Thornwick': { named: null, members: [M('carew', 'Lord Carew Thornwick'), M('una', 'Lady Una Thornwick')] },
  'House Dunmere': { named: null, members: [M('isla', 'Lady Isla Dunmere'), M('rhys', 'Lord Rhys Dunmere')] },
  'House Stormhaven': { named: null, members: [M('petra', 'Lady Petra Stormhaven'), M('dane', 'Lord Dane Stormhaven')] },
  'House Redwren': { named: null, members: [M('wynn', 'Lord Wynn Redwren'), M('sela', 'Lady Sela Redwren')] },
  'House Oakhollow': { named: null, members: [M('nell', 'Lady Nell Oakhollow'), M('garrick', 'Lord Garrick Oakhollow')] },
};
/** The Great Council elects the next of these (the great lords of lib/aurelle-coup-rules.ts, pinned by a test) that has not yet ruled since the last crown. */
export const councilHouses: readonly (Ruler)[] = [
  { name: 'Lord Maren Ashgrove', house: 'House Ashgrove' }, { name: 'Lady Isolde Thornwick', house: 'House Thornwick' }, { name: 'Lord Edric Dunmere', house: 'House Dunmere' },
  { name: 'Lord Cassian Stormhaven', house: 'House Stormhaven' }, { name: 'Lady Brenna Redwren', house: 'House Redwren' }, { name: 'Lord Tobias Oakhollow', house: 'House Oakhollow' },
];

/** The named heir while still available, else the most senior member who has not yet reigned in this chain. Null when the House has none left. */
export function nextHeir(house: string, reigned: ReadonlySet<string>): Heir | null {
  const line = houseLines[house]; if (!line) return null;
  const available = line.members.filter(m => !reigned.has(m.id)), named = line.named === null ? undefined : available.find(m => m.id === line.named), pick = named ?? available[0];
  return pick ? { memberId: pick.id, name: pick.name, house, named: pick === named } : null;
}

/** Derive the state from the base ruler (the crown in force, or Maera Solenne) and the events recorded AFTER that crown, in seq order. */
export function deriveSuccession(base: Ruler, events: readonly SuccessionEvent[]): SuccessionState {
  let ruler = base, status: SuccessionStatus = 'reigning', reigned = new Set<string>(); const ruledHouses = [base.house];
  for (const e of [...events].sort((a, b) => a.seq - b.seq)) {
    if (e.kind === 'illness') status = 'ailing';
    else if (e.kind === 'vacancy') status = 'vacant';
    else if (e.kind === 'abdication') status = 'abdicated';
    else if (e.name && e.house) {
      ruler = { name: e.name, house: e.house }; status = 'acceded';
      if (e.kind === 'great_council') { reigned = new Set(); ruledHouses.push(e.house); } else if (e.memberId) reigned.add(e.memberId);
    }
  }
  return { status, ruler, heir: nextHeir(ruler.house, reigned), ruledHouses, events: events.length };
}
/** The house the Great Council would elect now, or null when every council house has ruled since the last crown. */
export const councilChoice = (ruledHouses: readonly string[]): Ruler | null => councilHouses.find(h => !ruledHouses.includes(h.house)) ?? null;

export type SuccessionAction = 'illness' | 'vacate' | 'abdicate' | 'accede';
export const successionActions: readonly SuccessionAction[] = ['illness', 'vacate', 'abdicate', 'accede'];
const allowedFrom: Record<SuccessionAction, readonly SuccessionStatus[]> = { illness: ['reigning', 'acceded'], vacate: ['ailing'], abdicate: ['reigning', 'acceded', 'ailing'], accede: ['vacant', 'abdicated'] };
export const actionAllowed = (action: SuccessionAction, status: SuccessionStatus) => allowedFrom[action].includes(status);
export const isSuccessionAction = (value: unknown): value is SuccessionAction => typeof value === 'string' && (successionActions as readonly string[]).includes(value);
export const successionRequestId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(value);

/** Refusal codes (stable): the gate order is flag, credential, body, replay of a stored request, then these. */
export type SuccessionRefusal = 'crisis_window_open' | 'at_war' | 'wrong_state' | 'no_house_left';
export const refusalText: Readonly<Record<SuccessionRefusal, string>> = {
  crisis_window_open: 'A palace coup or Rising Crisis Window is open; the succession cannot move now.', at_war: 'Aurelle is at war; the succession cannot move now.',
  wrong_state: 'The succession is not in a state that allows that.', no_house_left: 'The Great Council has no house left to elect.',
};

/** [ASSUMPTION] Templated Court Gazette lines, placeholders until the content companion lands. One per transition. */
export const successionGazette: Readonly<Record<SuccessionEventKind, { headline: string; body: string }>> = {
  illness: { headline: 'The Monarch is ailing', body: 'The Court Gazette reports that {ruler} of {house} is ill.' },
  vacancy: { headline: 'The throne stands vacant', body: 'The Court Gazette reports that the throne of {house} stands vacant.' },
  abdication: { headline: '{ruler} abdicates', body: 'The Court Gazette reports that {ruler} of {house} has abdicated.' },
  accession: { headline: '{heir} accedes', body: 'The Court Gazette reports that {heir} accedes to the throne of {house}.' },
  great_council: { headline: 'The Great Council elects {heir}', body: 'The Court Gazette reports that the Great Council has elected {heir} of {house} to the throne.' },
};
export const fillGazette = (text: string, v: { ruler: string; heir: string; house: string }) => text.replaceAll('{ruler}', v.ruler).replaceAll('{heir}', v.heir).replaceAll('{house}', v.house);

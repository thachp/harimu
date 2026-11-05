import { varkandChairAt, varkandCommands, type VarkandCommand } from './varkand-directorate.ts';
import { VARKAND_PLEBISCITE_CYCLE_DAYS, varkandNextPlebisciteAt } from './varkand-plebiscite.ts';
import { FULMARA_COUNCIL_TERM_DAYS, FULMARA_LODESTAR_TERM_DAYS, fulmaraNextCouncilOfTenElectionAt, fulmaraNextLodestarElectionAt, fulmaraTribuneSessionEndsAt } from './fulmara-council.ts';
import { VELDWOOD_COUNCIL_TERM_DAYS, VELDWOOD_SPEAKER_ROTATION_DAYS, veldwoodCouncilSpeakerSeat, veldwoodNextCouncilElectionAt } from './veldwood-council.ts';

export type PetitionTopic = 'food' | 'infrastructure' | 'work';
export type GovernmentSnapshot = {
  nationId: string;
  mode: 'rule-bound simulation';
  /** #71: set when a Rising has crowned a claimant; the leader panel shows the new AI royal house. */
  crown?: { claimantId: string; name: string; house: string; motto: string; color: string; crownedAt: number; how?: 'rising' | 'coup' | 'succession' };
  /** #70/#74 Korund: current Chairman, Presidium seats and the latest emergency session (State Media rumor view). */
  presidium?: { chairman: { name: string }; seats: { id: string; name: string; role: string; status: 'serving' | 'purged' }[];
    session: { status: 'open' | 'survived' | 'purged'; openedAt: number; resolvesAt: number; resolvedAt: number | null } | null };
  /** #1085 Varkand: Chair, the five Commands, and the next Rotation Day. Present only while HARIMU_VARKAND_DIRECTORATE_ENABLED is on. */
  directorate?: { chair: VarkandCommand; commands: readonly VarkandCommand[]; nextRotationAt: number };
  /** #1094 Varkand: next Mandate Plebiscite on a 150-real-day cycle. Present only while HARIMU_VARKAND_PLEBISCITE_ENABLED is on. */
  mandatePlebiscite?: { nextAt: number; cycleDays: 150 };
  /** #1098 Veldwood: next Federal Council election and the ceremonial Speaker seat. Present only while HARIMU_VELDWOOD_COUNCIL_ENABLED is on. */
  federalCouncil?: { nextElectionAt: number; termDays: 120; speakerSeat: number; speakerRotationDays: 30 };
  /** #1102 Fulmara: Council of Ten, Lodestar and the Tribune session. Present only while HARIMU_FULMARA_COUNCIL_ENABLED is on. */
  grandCouncil?: {
    councilOfTenNextElectionAt: number; councilOfTenTermDays: 30;
    lodestarNextElectionAt: number; lodestarTermDays: 90; lodestarConsecutiveReelection: false;
    tribuneSessionEndsAt: number; tribuneVetoesPerSession: 1;
  };
  roles: { name: string; controller: string }[];
  decision: { title: string; reason: string; proposedSpendMinor: number; topic: PetitionTopic };
  review?: { periodStart: number; reviewedAt: number; petitionCount: number; active: boolean; expiresAt: number };
  petitions?: { requestId: string; topic: PetitionTopic; submittedAt: number; status: 'pending' | 'accepted' | 'deferred'; reason: string; reviewedAt: number | null }[];
  /** #985: Kindle Policy Ledger. Present only while HARIMU_KINDLE_POLICY_LEDGER_ENABLED is on. */
  policyLedger?: { id: string; publishedAt: number; office: string; title: string; brief: string }[];
  availableBudgetMinor: number;
  influenceSummary: string;
  /** #1089: Hoarvale Moot bills. Present only when the caller passes hoarvaleAssent (the server flag). Assent sits on the bill. */
  bills?: HoarvaleBill[];
  /** #612: the Founding Period state, only present while HARIMU_FOUNDING_PERIOD_ENABLED is on (kindle, korund, aurelle). */
  /** #613: Aurelle succession state and the named heir (flag HARIMU_AURELLE_SUCCESSION_ENABLED; absent otherwise). */
  succession?: { status: 'reigning' | 'ailing' | 'vacant' | 'acceded' | 'abdicated'; heir: { name: string; named: boolean } | null };
  founding?: { active: boolean; endsAt: number | null; dayOfPeriod: number | null };
};

/** Docs §7.7: Royal Assent is automatic 48 real hours after the Moot passes a bill. The Sovereign has no ordinary veto.
 *  [ASSUMPTION] #1089 also stores `withheld`, which the docs do not name. A bill dissolved before that 48th hour
 *  (the reserve power) is withheld, and the assent date is the dissolve time. Later dissolve does not un-assent a bill. */
export const ASSENT_SECONDS = 48 * 3600;
const HOUR = 3600;
/** Jan 15 2026 12:00 UTC (the fixture clock). The Mint band is due, Frostcore is an hour old, tenure was already dissolved. */
export const HOARVALE_ASSENT_SAMPLE_AT = 1_768_478_400;
export type AssentStatus = 'pending' | 'assented' | 'withheld';
export type HoarvaleBill = { id: string; title: string; passedAt: number; assentStatus: AssentStatus; assentAt: number | null };
export const HOARVALE_BILLS: readonly { id: string; title: string; passedAt: number; dissolvedAt: number | null }[] = [
  { id: 'hoarvale-frostcore-export', title: 'Frostcore export guidance', passedAt: HOARVALE_ASSENT_SAMPLE_AT - HOUR, dissolvedAt: null },
  { id: 'hoarvale-inflation-band', title: 'Mint inflation band', passedAt: HOARVALE_ASSENT_SAMPLE_AT - ASSENT_SECONDS, dissolvedAt: null },
  { id: 'hoarvale-tenure-steps', title: 'Tenure pay steps', passedAt: HOARVALE_ASSENT_SAMPLE_AT - 30 * HOUR, dissolvedAt: HOARVALE_ASSENT_SAMPLE_AT - 29 * HOUR },
];
export function billAssent(passedAt: number, dissolvedAt: number | null, now: number): { assentStatus: AssentStatus; assentAt: number | null } {
  if (!Number.isSafeInteger(passedAt) || passedAt < 0 || !Number.isSafeInteger(now) || now < 0) return { assentStatus: 'pending', assentAt: null };
  const due = passedAt + ASSENT_SECONDS;
  if (dissolvedAt != null && Number.isSafeInteger(dissolvedAt) && now >= dissolvedAt && dissolvedAt >= passedAt && dissolvedAt < due) return { assentStatus: 'withheld', assentAt: dissolvedAt };
  if (now < due) return { assentStatus: 'pending', assentAt: null };
  return { assentStatus: 'assented', assentAt: due };
}
export const hoarvaleBills = (now: number): HoarvaleBill[] => HOARVALE_BILLS.map(bill => ({ id: bill.id, title: bill.title, passedAt: bill.passedAt, ...billAssent(bill.passedAt, bill.dissolvedAt, now) }));

const institutions = {
  kindle: {
    roles: ['President', 'Ministers', 'Assembly members'],
    response: 'The Assembly reviews citizen petitions and the President proposes a lawful appropriation.',
    influence: 'Petitions affect this proposal. Nation-specific voting and public opinion are planned influence channels; officeholding is reserved for government agents.',
  },
  korund: {
    roles: ['Party leader', 'Planning ministers', 'Party council'],
    response: 'The planning council reviews requests against ration and production priorities.',
    influence: 'Citizen requests affect planning priorities. Korund has a one-party government; this panel does not create a general election.',
  },
  aurelle: {
    roles: ['Sovereign', 'Royal ministers', 'Royal council'],
    response: 'The royal council presents citizen petitions to the sovereign for a bounded royal allocation.',
    influence: 'Petitions affect royal priorities. Aurelle retains hereditary succession; petitions do not elect the sovereign.',
  },
  hoarvale: {
    roles: ['Sovereign', 'Prime Minister', 'Moot members'],
    response: 'The Moot passes bills. The Sovereign records Royal Assent on each bill.',
    influence: 'Petitions affect Moot priorities. The Sovereign is ceremonial and does not hold an ordinary veto; petitions do not elect the Sovereign.',
  },
} as const;

function safeCount(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? Math.min(value, 1_000_000) : 0;
}

/** A pure proposal, never an appropriation or a ledger write. Inputs must come from authoritative state. */
export function simulateGovernment(input: {
  nationId: string; availableBudgetMinor: number; foodSecurity: number;
  petitionCounts: Record<string, number>; hoarvaleAssent?: boolean; now?: number;
}): GovernmentSnapshot | null {
  if (input.nationId === 'hoarvale' && input.hoarvaleAssent !== true) return null;
  if (!Object.hasOwn(institutions, input.nationId)) return null;
  const institution = institutions[input.nationId as keyof typeof institutions];
  const budget = typeof input.availableBudgetMinor === 'number'
    && Number.isSafeInteger(input.availableBudgetMinor) && input.availableBudgetMinor >= 0
    ? input.availableBudgetMinor : 0;
  const foodSecurity = Number.isFinite(input.foodSecurity)
    ? Math.max(0, Math.min(100, input.foodSecurity)) : 0;
  const counts = {
    food: safeCount(input.petitionCounts?.food),
    infrastructure: safeCount(input.petitionCounts?.infrastructure),
    work: safeCount(input.petitionCounts?.work),
  };
  // Food shortages have a documented priority; ties favor food, then infrastructure, then work.
  const emergency = foodSecurity < 40;
  const topic: PetitionTopic = emergency ? 'food'
    : counts.infrastructure > counts.food && counts.infrastructure >= counts.work ? 'infrastructure'
      : counts.work > counts.food && counts.work > counts.infrastructure ? 'work' : 'food';
  const titles = { food: 'Food security reserve', infrastructure: 'Infrastructure maintenance', work: 'Workplace support' };
  const count = counts[topic];
  // Integer arithmetic remains safe even for the largest valid input budget.
  const proposedSpendMinor = Math.floor(budget / (emergency ? 5 : 10));
  return {
    nationId: input.nationId, mode: 'rule-bound simulation',
    roles: institution.roles.map((name) => ({ name, controller: 'AI/SI role · deterministic rules' })),
    availableBudgetMinor: budget,
    decision: {
      title: titles[topic], proposedSpendMinor, topic,
      reason: `${institution.response} ${emergency ? `Food security is ${foodSecurity}/100, below the 40-point safety threshold; food takes priority.` : `${count} ${topic} petition${count === 1 ? '' : 's'} set this priority (food ${counts.food}, infrastructure ${counts.infrastructure}, work ${counts.work}; ties favor food, then infrastructure).`} ${budget === 0 ? 'No verified budget is available, so no spending is proposed.' : `The proposal is capped at ${emergency ? '20' : '10'}% of the verified available budget.`}`,
    },
    influenceSummary: institution.influence,
    ...(input.nationId === 'hoarvale' ? { bills: hoarvaleBills(typeof input.now === 'number' ? input.now : 0) } : {}),
  };
}

/** #1085. Flag off, or any nation but Varkand: the same snapshot, and no directorate key. */
export function withVarkandDirectorate(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'varkand') return snapshot;
  const { chair, nextRotationAt } = varkandChairAt(nowMs);
  return { ...snapshot, directorate: { chair, commands: varkandCommands, nextRotationAt } };
}

/** #1094. Flag off, or any nation but Varkand: the same snapshot, and no mandatePlebiscite key. */
export function withVarkandPlebiscite(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'varkand') return snapshot;
  return { ...snapshot, mandatePlebiscite: { nextAt: varkandNextPlebisciteAt(nowMs), cycleDays: VARKAND_PLEBISCITE_CYCLE_DAYS } };
}

/** #1098. Flag off, or any nation but Veldwood: the same snapshot, and no federalCouncil key. */
export function withVeldwoodCouncil(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'veldwood') return snapshot;
  return { ...snapshot, federalCouncil: {
    nextElectionAt: veldwoodNextCouncilElectionAt(nowMs), termDays: VELDWOOD_COUNCIL_TERM_DAYS,
    speakerSeat: veldwoodCouncilSpeakerSeat(nowMs), speakerRotationDays: VELDWOOD_SPEAKER_ROTATION_DAYS,
  } };
}

/** #1102. Flag off, or any nation but Fulmara: the same snapshot, and no grandCouncil key. */
export function withFulmaraCouncil(snapshot: GovernmentSnapshot, nowMs: number, enabled: boolean): GovernmentSnapshot {
  if (!enabled || snapshot.nationId !== 'fulmara') return snapshot;
  return { ...snapshot, grandCouncil: {
    councilOfTenNextElectionAt: fulmaraNextCouncilOfTenElectionAt(nowMs), councilOfTenTermDays: FULMARA_COUNCIL_TERM_DAYS,
    lodestarNextElectionAt: fulmaraNextLodestarElectionAt(nowMs), lodestarTermDays: FULMARA_LODESTAR_TERM_DAYS, lodestarConsecutiveReelection: false,
    tribuneSessionEndsAt: fulmaraTribuneSessionEndsAt(nowMs), tribuneVetoesPerSession: 1,
  } };
}

/** Varkand read while only the plebiscite flag is on. No directorate key. Flag off returns null, which is today's read. */
export function varkandPlebisciteSnapshot(nowMs: number, enabled: boolean): GovernmentSnapshot | null {
  if (!enabled) return null;
  return withVarkandPlebiscite({
    nationId: 'varkand', mode: 'rule-bound simulation',
    roles: [{ name: 'Directorate', controller: 'AI/SI role · deterministic rules' }],
    decision: {
      title: 'Mandate Plebiscite', topic: 'infrastructure', proposedSpendMinor: 0,
      reason: 'The Mandate Plebiscite falls every 150 real days. This read names the next date. It opens no ballot and proposes no spending.',
    },
    availableBudgetMinor: 0,
    influenceSummary: 'Citizens are asked to approve the Directorate\'s Order every 150 real days. This read does not collect votes.',
  }, nowMs, true);
}

/** Varkand government read while the flag is on. Flag off returns null, which is today's read. */
export function varkandGovernmentSnapshot(nowMs: number, enabled: boolean): GovernmentSnapshot | null {
  if (!enabled) return null;
  return withVarkandDirectorate({
    nationId: 'varkand', mode: 'rule-bound simulation',
    roles: varkandCommands.map(command => ({ name: `${command.command} Marshal`, controller: 'AI/SI role · deterministic rules' })),
    decision: {
      title: 'Directorate order', topic: 'infrastructure', proposedSpendMinor: 0,
      reason: 'The Directorate of the Five Commands holds the line. This read names the Chair and the next Rotation Day. It proposes no spending.',
    },
    availableBudgetMinor: 0,
    influenceSummary: 'The Chair rotates among the five Marshals every 60 real days. Citizens do not elect the Directorate.',
  }, nowMs, true);
}

/** Veldwood read while the flag is on. Veldwood has no other government snapshot, so this is the smallest one that carries the Council block. Flag off returns null, which is today's read. */
export function veldwoodCouncilSnapshot(nowMs: number, enabled: boolean): GovernmentSnapshot | null {
  if (!enabled) return null;
  return withVeldwoodCouncil({
    nationId: 'veldwood', mode: 'rule-bound simulation',
    roles: [{ name: 'Federal Council', controller: 'AI/SI role · deterministic rules' }],
    decision: {
      title: 'Federal Council', topic: 'infrastructure', proposedSpendMinor: 0,
      reason: 'The Federal Assembly elects a Federal Council of 7 for 120 real days. This read names the next election and the Council Speaker seat. It opens no ballot and proposes no spending.',
    },
    availableBudgetMinor: 0,
    influenceSummary: 'The Council decides collegially. The ceremonial Council Speaker rotates by seniority every 30 real days. This read does not collect votes.',
  }, nowMs, true);
}

/** Fulmara read while the flag is on. Fulmara has no other government snapshot, so this is the smallest one that carries the Grand Council block. Flag off returns null, which is today's read. */
export function fulmaraGovernmentSnapshot(nowMs: number, enabled: boolean): GovernmentSnapshot | null {
  if (!enabled) return null;
  return withFulmaraCouncil({
    nationId: 'fulmara', mode: 'rule-bound simulation',
    roles: [{ name: 'Grand Council', controller: 'AI/SI role · deterministic rules' }],
    decision: {
      title: 'Grand Council', topic: 'work', proposedSpendMinor: 0,
      reason: 'The Grand Council elects the Council of Ten each game year and the Lodestar for 90 real days. This read names those dates and when the Tribune session ends. It opens no ballot and proposes no spending.',
    },
    availableBudgetMinor: 0,
    influenceSummary: 'The Lodestar cannot stand for the next term. The Tribune of the Docks holds one veto per 30-real-day session. This read does not cast it.',
  }, nowMs, true);
}

/** Preserve the recorded priority, while rebasing a live proposal onto today's verified funds. */
export function rebaseGovernmentBudget(snapshot: GovernmentSnapshot, availableBudgetMinor: number, emergency: boolean): GovernmentSnapshot {
  const budget = Number.isSafeInteger(availableBudgetMinor) && availableBudgetMinor >= 0 ? availableBudgetMinor : 0;
  return { ...snapshot, availableBudgetMinor: budget, decision: { ...snapshot.decision,
    proposedSpendMinor: Math.floor(budget / (emergency ? 5 : 10)),
    reason: `${snapshot.decision.reason} Recorded review inputs above are historical. Today's verified programme funds are ${budget} minor units; today's proposal is recalculated with the ${emergency ? 20 : 10}% limit.` } };
}

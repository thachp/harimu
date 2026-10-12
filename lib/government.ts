export type PetitionTopic = 'food' | 'infrastructure' | 'work';
export type GovernmentSnapshot = {
  nationId: string;
  mode: 'rule-bound simulation';
  roles: { name: string; controller: string }[];
  decision: { title: string; reason: string; proposedSpendMinor: number };
  availableBudgetMinor: number;
  influenceSummary: string;
};

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
} as const;

function safeCount(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? Math.min(value, 1_000_000) : 0;
}

/** A pure proposal, never an appropriation or a ledger write. Inputs must come from authoritative state. */
export function simulateGovernment(input: {
  nationId: string; availableBudgetMinor: number; foodSecurity: number;
  petitionCounts: Record<string, number>;
}): GovernmentSnapshot | null {
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
      title: titles[topic], proposedSpendMinor,
      reason: `${institution.response} ${emergency ? `Food security is ${foodSecurity}/100, below the 40-point safety threshold; food takes priority.` : `${count} ${topic} petition${count === 1 ? '' : 's'} set this priority (food ${counts.food}, infrastructure ${counts.infrastructure}, work ${counts.work}; ties favor food, then infrastructure).`} ${budget === 0 ? 'No verified budget is available, so no spending is proposed.' : `The proposal is capped at ${emergency ? '20' : '10'}% of the verified available budget.`}`,
    },
    influenceSummary: institution.influence,
  };
}

/** #831: pure, import-free plank up-vote rules. */
/** A member holds at most 3 up-votes in their current party (ARC-confirmed). Each vote occupies one slot 1..3, unique per member and party. */
export const plankVotesPerMember = 3;
export const plankVotesFlagOn = (env: unknown) => (env as { HARIMU_PLANK_VOTES_ENABLED?: string } | null)?.HARIMU_PLANK_VOTES_ENABLED === 'true';

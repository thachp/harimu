/** #831: pure, import-free plank up-vote rules. */
/** [ASSUMPTION] A member holds at most 3 up-votes in their current party. */
export const plankVotesPerMember = 3;
export const plankVotesFlagOn = (env: unknown) => (env as { HARIMU_PLANK_VOTES_ENABLED?: string } | null)?.HARIMU_PLANK_VOTES_ENABLED === 'true';

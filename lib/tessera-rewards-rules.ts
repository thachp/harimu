/** #465 (ARC ruled Option A, shift source only): the earned-Tessera reward rules. Every number is an [ASSUMPTION] chosen conservatively for Patrick to raise; they live here only, so changing one is one line.
 *  TSR minor units: 100 minor = 1.00 TSR (a square costs 2500 minor). A reward comes only from a settled, server-completed Kindle paid shift of a verified human citizen (shift_settlements);
 *  nothing else is a source: no NPC, owner, NFT, trade, exchange, starter grant or faucet row can create a reward entry. */
export const rewardEpochSeconds = 86400; // [ASSUMPTION] one UTC day
export const rewardPoolMinor = 10000; // [ASSUMPTION] 100.00 TSR funds one epoch; the hard ceiling on what an epoch can ever pay
export const rewardPerShiftMinor = 25; // [ASSUMPTION] 0.25 TSR per verified settled shift, paid pro-rata (lower) when the day's shifts would overrun the pool
export const rewardCitizenEpochCapMinor = 100; // [ASSUMPTION] 1.00 TSR per citizen per epoch (4 shifts)
export const rewardCitizenLifetimeCapMinor = 5000; // [ASSUMPTION] 50.00 TSR per citizen over the pilot; keyed to the citizen id until World ID (#469) gives a human key
export const rewardPoolSharePercent = 5; // [ASSUMPTION] no citizen takes more than 5% of one epoch's pool
export const rewardMaxShiftsPerEpoch = 2000; // [ASSUMPTION] safety bound on one close; later shifts of an oversized day are simply not rewarded
export const rewardLookbackEpochs = 2; // [ASSUMPTION] the cron closes at most yesterday and the day before; a long-off flag never backfills old shifts
export const rewardProvenance = 'shift'; // the only provenance an entry can have; starter grants and faucets are never earned rewards

export type RewardCandidate = { shiftId: string; userId: string };
export type RewardEntry = RewardCandidate & { amountMinor: number };
/** Pure split of one epoch. `candidates` are verified settled shifts in a stable order; `lifetimePaidMinor` is what each citizen was already allocated in earlier epochs. Total never exceeds the pool. */
export function allocateRewards(candidates: readonly RewardCandidate[], lifetimePaidMinor: Readonly<Record<string, number>> = {}): RewardEntry[] {
  if (!candidates.length) return [];
  const unit = Math.min(rewardPerShiftMinor, Math.floor(rewardPoolMinor / candidates.length)); // pro-rata: no speed advantage, the pool is a ceiling
  const epochCap = Math.min(rewardCitizenEpochCapMinor, Math.floor(rewardPoolMinor * rewardPoolSharePercent / 100)), paid = new Map<string, number>(), entries: RewardEntry[] = [];
  for (const candidate of candidates) {
    const used = paid.get(candidate.userId) ?? 0, amount = Math.min(unit, epochCap - used, rewardCitizenLifetimeCapMinor - (lifetimePaidMinor[candidate.userId] ?? 0) - used);
    if (amount <= 0) continue;
    paid.set(candidate.userId, used + amount); entries.push({ ...candidate, amountMinor: amount });
  }
  return entries;
}

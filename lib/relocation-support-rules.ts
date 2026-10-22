/** #470 slice 2 (Decision 109): relocation support rules. Import-free. Every number is an [ASSUMPTION], the conservative value from the #470 slice plan, for Patrick to change; each is one line.
 *  TSR minor units: 100 minor = 1.00 TSR. Tessera only: no Spark, no cash-out, no Kindle exchange. */
export const reliefPerCaptureCapMinor = 10000; // [ASSUMPTION] 100.00 TSR protocol pot per captured city
export const reliefWeeklyCapMinor = 30000; // [ASSUMPTION] 300.00 TSR of protocol pots across all captures in any rolling 7 days
export const reliefPerCitizenMaxMinor = 500; // [ASSUMPTION] 5.00 TSR per citizen at most
export const reliefTreasuryTopupCapMinor = 0; // [ASSUMPTION] defender-treasury top-up off: nothing leaves a treasury until Patrick sets a cap
export const reliefLapseSeconds = 30 * 86400; // [ASSUMPTION] claims close 30 days after the capture; the unclaimed rest stays in the protocol budget
export const reliefWeekSeconds = 7 * 86400;
export const reliefNations: readonly string[] = ['kindle']; // [ASSUMPTION] Kindle defenders only: the home-city source (citizen_city_locations) is only trusted for Kindle today

/** The protocol share of a new pot: the per-capture cap, never more than what the rolling weekly cap has left. */
export const protocolPotMinor = (weeklyUsedMinor: number) => Math.max(0, Math.min(reliefPerCaptureCapMinor, reliefWeeklyCapMinor - weeklyUsedMinor));
/** Flat per-citizen payout: an even floor split of the pot, capped per citizen. No eligible citizen or an empty pot pays 0. */
export function perCitizenMinor(potMinor: number, eligible: number): number {
  if (!(eligible > 0) || !(potMinor > 0)) return 0;
  return Math.min(reliefPerCitizenMaxMinor, Math.floor(potMinor / eligible));
}

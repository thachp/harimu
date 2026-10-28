/** #863: pure, import-free Kindle campaign donation rules (docs §9.4 "Campaign finance": donations buy ads and rallies, never votes; all publicly disclosed). */
/** Per-citizen cap per party per real week, in Spark minor units (500.00 SPK). */
export const donationWeeklyCapMinor = 50000;
export const donationWeekSeconds = 7 * 24 * 60 * 60;
/** Real week number (UTC, from the Unix epoch). The cap resets when this changes. */
export const donationWeek = (nowSeconds: number) => Math.floor(nowSeconds / donationWeekSeconds);
export const donationDisclosureLimit = 20;
export const partyDonationsFlagOn = (env: unknown) => (env as { HARIMU_PARTY_DONATIONS_ENABLED?: string } | null)?.HARIMU_PARTY_DONATIONS_ENABLED === 'true';
export const donationRequestIdOk = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(id);
export const donationAmountOk = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n > 0;

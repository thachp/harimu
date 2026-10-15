/** #531: every number of the Aurelle guild charter PoC, in one import-free file. All of them are [ASSUMPTION]s for ARC to rule (the docs give no cost, term or window). */
export const charterKind = 'market-stall'; // [ASSUMPTION] one charter type: a market-stall trade right in Highspire
export const charterGrantFavorCost = 20; // [ASSUMPTION] Royal Favor spent to be granted (10 shifts of service; leaving the Kinward Rite costs 10)
export const charterRenewFavorCost = 10; // [ASSUMPTION] Royal Favor spent to renew
export const charterTermSeconds = 7 * 86400; // [ASSUMPTION] one term is 7 real days
export const charterRenewWindowSeconds = 2 * 86400; // [ASSUMPTION] a charter may be renewed only in its last 2 days, so terms cannot be stockpiled
export const charterSpendReasons = ['charter-grant', 'charter-renew'] as const;
export const charterMealCooldownSeconds = 3600; // [ASSUMPTION] the one trade right: a charter holder may take a household meal every hour instead of every 2 hours (aurelleMealSeconds)

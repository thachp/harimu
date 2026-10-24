/** #936: the ballot accepts the base Tier-1/account ids and any window's '-cycle-N' id (client-safe, no server imports). */
export const isKindleElectionId=(id:unknown):id is string=>typeof id==='string'&&/^kindle-presidential-(account-)?poc-1(-cycle-[1-9]\d*)?$/.test(id);

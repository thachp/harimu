/** Zone vocabulary of the world map (#66, docs 6.1/6.2), split out of lib/map-zones.ts (#491). Import-free on purpose: lib/map-zones.ts now imports the nation registry, which plain-Node component tests cannot resolve (extensionless imports), and app/world-zones.tsx only needs these labels. */
export type Zone = 'heartland' | 'frontier' | 'wildlands' | 'commons';
export const zoneOrder: readonly Zone[] = ['heartland', 'frontier', 'wildlands', 'commons'];
export const zoneLabels: Record<Zone, string> = { heartland: 'Heartland', frontier: 'Frontier', wildlands: 'Wildlands', commons: 'The Commons' };
export const acquisitionRules: Record<Zone, string> = {
  heartland: 'Never capturable',
  frontier: 'Purchasable when unclaimed; transferable by treaty; capturable in war',
  wildlands: 'Purchasable when unclaimed from the World Registry, or claimed by founding a city',
  commons: 'Cannot be bought. Claimed only by war or treaty (or a joint-development agreement)',
};

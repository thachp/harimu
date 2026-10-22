export type CityDestination = { id: 'household' | 'workplace' | 'market' | 'government'; label: string; detail: string };
/**
 * #378: the destination cards under the city scene. They follow the nation whose city is on screen (a visitor's previewed nation or a citizen's own), the
 * same nation the dock tabs and the 3D buildings already use, so Korund says "Assignment" and "State store" everywhere instead of "Workplace" and "Market".
 * `showMarket` is the #344 rule, computed by the caller with marketVisible(nation, flag): hidden while the market flag is off, except for Korund's State store and
 * Aurelle's royal store. Kindle wording is unchanged; Aurelle's market card is "Chartered food" (#583). Import-free so plain Node tests can load it.
 */
export function cityDestinations(nationId: string | null | undefined, showMarket: boolean): CityDestination[] {
  const korund = nationId === 'korund';
  const aurelle = nationId === 'aurelle'; // #583: Aurelle's market scene is the chartered food counter, so the card says so
  return [
    { id: 'household', label: 'Household', detail: 'Belongings and recovery' },
    { id: 'workplace', label: korund ? 'Assignment' : 'Workplace', detail: korund ? 'Brigade shift and Labor Notes' : 'Contributions and earnings' },
    ...(showMarket ? [{ id: 'market' as const, label: korund ? 'State store' : aurelle ? 'Chartered food' : 'Market', detail: korund ? 'Ration coupons and state food' : aurelle ? 'Buy food at the chartered counter' : 'Goods and citizen listings' }] : []),
    { id: 'government', label: 'Government', detail: 'Policy and petitions' },
  ];
}

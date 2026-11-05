import { cityLocations, locationLabel, locationSelection, type LocationId } from './game-viewport.ts';

/** #392: the City map's five places, in pill order. Buildings and the side-panel rows both follow this list. */
export const cityPlaceIds = ['square', 'home', 'workplace', 'market', 'government'] as const;
export type CityPlaceId = typeof cityPlaceIds[number];
export type CityPlaceView = 'square' | 'household' | 'workplace' | 'market' | 'government';

/** Institution names the government building already uses (lib/game-art.ts capital profiles). */
export const cityInstitutions = {
  kindle: 'Assembly hall',
  confluence: 'Party congress',
  meridian: 'Party-state offices',
  korund: 'Planning bureau',
  aurelle: 'Royal court',
  ilmar: 'Canon hall',
  hoarvale: 'Moot hall',
  varkand: 'Command directorate',
  veldwood: 'Grove council',
  fulmara: 'Grand Council',
} as const;

export function cityInstitution(nationId?: string | null): string {
  const key = (nationId ?? '').toLowerCase();
  return Object.prototype.hasOwnProperty.call(cityInstitutions, key) ? cityInstitutions[key as keyof typeof cityInstitutions] : cityInstitutions.kindle;
}

/** The label the map pill already shows for this place. A visitor's household stays "Household". */
export function cityPlaceLabel(id: CityPlaceId, city: string, nationId?: string | null, visitor = false): string {
  const nation = (nationId ?? '').toLowerCase();
  const built = id === 'square' ? `${city} square`
    : id === 'home' ? 'Your household'
    : id === 'workplace' ? (nation === 'korund' ? 'Assignment board' : `${city} work yard`)
    : id === 'market' ? (nation === 'korund' ? 'State ration store' : `${city} market`)
    : cityInstitution(nation);
  return locationLabel(id, built, visitor);
}

export function cityPlaceDetail(id: LocationId, nationId?: string | null): string {
  return locationSelection(id, nationId ?? undefined).detail;
}

/** Places the map draws, market omitted when the building is omitted, in cityPlaceIds order. */
export function cityPlaces(nationId: string | null | undefined, city: string, marketOpen: boolean, visitor = false) {
  return cityPlaceIds.filter(id => marketOpen || id !== 'market').map(id => ({
    id,
    label: cityPlaceLabel(id, city, nationId, visitor),
    detail: cityPlaceDetail(id, nationId),
    view: (id === 'home' ? 'household' : id) as CityPlaceView,
  }));
}

/** NEXT_PUBLIC_HARIMU_CITY_PLACE_ROWS is a HARIMU_UI_PACK key. A missing process (layout bundles) is off. */
export const CITY_PLACE_ROWS_FLAG = 'NEXT_PUBLIC_HARIMU_CITY_PLACE_ROWS';
export function cityPlaceRowsFlag(): string | undefined {
  try { return process.env.NEXT_PUBLIC_HARIMU_CITY_PLACE_ROWS; }
  catch { return undefined; }
}
export function cityPlaceRowsEnabled(value: string | undefined = cityPlaceRowsFlag()): boolean {
  return value === 'true';
}

/** Confirms the catalog order is the shared list, so a reordered cityLocations cannot drift. */
export function cityLocationOrder(): LocationId[] {
  return cityLocations.map(place => place.id);
}

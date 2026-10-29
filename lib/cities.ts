/** #123 (ARC ruling on #264): a city's role from the docs Cities table on each nation page; the capital's role is 'capital'. */
export type CityRole = 'capital' | 'frontier' | string;
export type City = { id: string; nationId: string; name: string; capital: boolean; role: CityRole; description: string };
// Role column of the Cities table on each nation page (docs.harimu.com/world/nations/*, read 2026-10-14).
const roles: Record<string, string> = {"Tarrek Foundry": "Industry", "Kolt Savanna": "Farming", "Lanu Terraces": "Farming", "Oalin Harbor": "Port / fisheries", "Tsenga SEZ": "Trade zone", "Holv Gorge": "Energy / industry", "Strova Mines": "Mining", "Gren Plateau": "Farming", "Windrest": "Silk / crafts", "Highmere": "Farming / fief", "Lume Mesa": "Pilgrimage", "Glassen": "Industry (Sunglass)", "Fjeldmark": "Frostcore / logistics", "Isling Springs": "Spa / tourism", "Voren Light": "Port / signals", "Moorhald": "Farming / peat", "Ashglade": "Timber / crafts", "Fernhollow": "Farming", "Vendezzo": "Shipyard", "Malvara Rods": "Energy (Stormcells)"};
// Canonical city names and visual lore, GDD nation pages /world/nations/ (read 2026-10-13).
// This bounded catalog is capital + two cities per nation; no live city simulation is implied.
const roster: Record<string, readonly [string, string][]> = {
  kindle: [['Forgehaven','The volcanic plateau capital, with Assembly architecture and financial towers.'],['Tarrek Foundry','An industrial city of brick foundries near the eastern lava fields.'],['Kolt Savanna','A farming town with granaries and awnings in the southern savanna.']],
  confluence: [['Meetwater','The delta capital, with Congress colonnades overlooking canals.'],['Lanu Terraces','A farming city among terraced hills and cooperative waterwheels.'],['Oalin Harbor','A coastal fishing city with stilt homes and lantern fleets.']],
  meridian: [['Steamgate','A geothermal coastal capital with stone halls and copper vents.'],['Tsenga SEZ','A southern trade zone of harbor towers and exchange boards.'],['Holv Gorge','An inland industrial city around turbine dams and pipework.']],
  korund: [['Stonehearth','The mountain capital, with a granite Presidium and public plazas.'],['Strova Mines','A northern mining city of terraces and rail lines.'],['Gren Plateau','A farming town of collective farms and ration depots.']],
  aurelle: [['Highspire','The royal cliff capital, connected by gilded bridges above a gorge.'],['Windrest','A northern craft city of silk looms and wind vanes.'],['Highmere','A highland farming town with gardens and windmills.']],
  ilmar: [['Mirrorhall','The salt-flat capital, with a prism dome above sandstone cloisters.'],['Lume Mesa','A pilgrimage city with colored-light temples on western mesas.'],['Glassen','A southern desert city of glass workshops and mirror arrays.']],
  hoarvale: [['Rimehall','The fjord capital, with a timber Moot Hall beneath the aurora.'],['Fjeldmark','A northern glacier city of ice vaults and cranes.'],['Isling Springs','A hot-spring town of steaming bathhouse terraces.']],
  varkand: [['Watchfast','The moorland capital, with concrete bastions and a parade boulevard.'],['Voren Light','A coastal lighthouse city for signals and maritime craft.'],['Moorhald','A farming town among marsh highlands and peat fields.']],
  veldwood: [['Ringhall','The forest capital, with an open federal gathering ring beneath the canopy.'],['Ashglade','A northern craft city of timber halls and wood workshops.'],['Fernhollow','A farming town of riverside glades and canopy paths.']],
  fulmara: [['Arcport','An archipelago capital of canals, finance towers and a public share register.'],['Vendezzo','A shipyard city with copper slipways on a northern headland.'],['Malvara Rods','An eastern energy town of lightning rods on a storm cape.']],
};
const catalog: readonly City[] = Object.entries(roster).flatMap(([nationId, entries]) => entries.map(([name, description], index) => ({
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), nationId, name, capital: index === 0, role: index === 0 ? 'capital' : roles[name] ?? 'unknown', description,
})));
export function citiesForNation(nationId: string): readonly City[] { return catalog.filter(city => city.nationId === nationId); }
export function cityForNation(nationId: string, cityId: string): City | undefined { return catalog.find(city => city.nationId === nationId && city.id === cityId); }
export function capitalCityForNation(nationId: string): City | undefined { return catalog.find(city => city.nationId === nationId && city.capital); }

/** #123: each MVP nation's frontier outpost (the T1 border city on Frontier squares, docs 'Cities of Harimu' > War) by its
 *  docs role. Not part of the capital + two cities catalog above, so city lists and vignettes are unchanged. */
const outposts: Record<string, { name: string; role: CityRole; description: string }> = {
  kindle: { name: 'Ashby Crossing', role: 'frontier', description: 'Frontier / mining border village in the western badlands.' },
  korund: { name: 'Krel Arsenal', role: 'frontier', description: 'Military / industry frontier fortress in the eastern border passes.' },
  aurelle: { name: 'Vale Bridge', role: 'frontier', description: 'Frontier / trade fortified bridge town on the southern border gorge.' },
};
export function outpostCityForNation(nationId: string): City | undefined {
  const o = outposts[nationId]; if (!o) return undefined;
  return { id: o.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), nationId, name: o.name, capital: false, role: o.role, description: o.description };
}

/** #996: read-only specialty note from the Cities catalog / nation Cities tables (docs What a city does > Jobs).
 *  Capitals show as "Capital"; Port / Trade zone roles also mention imports. [ASSUMPTION] Founded or unknown
 *  cities (not in this catalog or the #123 outpost list) omit specialty fields until catalogued. */
export type CitySpecialtyFields = { specialtyRole: string; specialtyNote: string };
export function citySpecialtyFields(nationId: string, cityId: string): CitySpecialtyFields | null {
  const outpost = outpostCityForNation(nationId);
  const city = cityForNation(nationId, cityId) ?? (outpost && outpost.id === cityId ? outpost : undefined);
  if (!city) return null;
  const specialtyRole = city.role === 'capital' ? 'Capital' : city.role === 'frontier' ? 'Frontier' : String(city.role);
  const portOrTrade = /port|trade zone/i.test(specialtyRole);
  const specialtyNote = city.role === 'capital'
    ? 'Jobs and national institutions are based here.'
    : portOrTrade
      ? "Jobs here match this city's specialty. A port or trade zone adds imports."
      : "Jobs here match this city's specialty.";
  return { specialtyRole, specialtyNote };
}

/** #1001: Local market (docs Cities of Harimu > What a city does). True when the role contains Port or Trade zone.
 *  A shipyard, frontier, or capital does not qualify unless that role text matches. */
export function cityHasImports(city: { role: string }): boolean {
  return /port|trade zone/i.test(city.role);
}
/** Port markets and trade zones use different one-line notes. Null when the role does not qualify. */
export function cityImportsNote(city: { role: string }): string | null {
  if (!cityHasImports(city)) return null;
  return /port/i.test(city.role) ? 'Port market: foreign imports arrive here.' : 'Trade zone: foreign imports arrive here.';
}
export type CityImportsFields = { importsNote: string };
/** [ASSUMPTION] Founded or unknown cities omit the note until catalogued. Frontiers stay on the frontier role. */
export function cityImportsFields(nationId: string, cityId: string): CityImportsFields | null {
  const outpost = outpostCityForNation(nationId);
  const city = cityForNation(nationId, cityId) ?? (outpost && outpost.id === cityId ? outpost : undefined);
  if (!city) return null;
  const importsNote = cityImportsNote(city);
  return importsNote ? { importsNote } : null;
}
/** #1002: read-only capture-status note for the city panel (docs Cities of Harimu > War: capture and loss).
 *  Heartland = catalog cities (capitals and the other Heartland cities); war refuses these via capital/heartland
 *  (`capturableCity` in lib/siege.ts, #912/#934). Frontier = `outpostCityForNation` (border outposts war can besiege).
 *  [ASSUMPTION] Founded or unknown cities (not in this catalog or the #123 outpost list) omit the note until a
 *  square-zone lookup is wired; founded cities on Frontier would show the frontier line. */
export const HEARTLAND_CAPTURE_NOTE = 'Heartland city: can never be captured.';
export const FRONTIER_CAPTURE_NOTE = 'Frontier city: can be besieged and captured in war (two assaults on different days).';
export function cityCaptureNote(nationId: string, cityId: string): string | null {
  const outpost = outpostCityForNation(nationId);
  if (outpost && outpost.id === cityId) return FRONTIER_CAPTURE_NOTE;
  if (cityForNation(nationId, cityId)) return HEARTLAND_CAPTURE_NOTE;
  return null;
}

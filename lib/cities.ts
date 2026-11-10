/** #123 (ARC ruling on #264): a city's role from the docs Cities table on each nation page; the capital's role is 'capital'. */
import { flagOn } from './flag-pack.mjs';
export type CityRole = 'capital' | 'frontier' | string;
export type City = { id: string; nationId: string; name: string; capital: boolean; role: CityRole; description: string; spa?: true };
/** #1241 Kindle port, #1261 Hoarvale port. Preview "true" / production "false" inside HARIMU_GRAY_PACK. A direct string still wins. */
export const BRASSWELL_PORT_FLAG = 'HARIMU_KINDLE_BRASSWELL_PORT_ENABLED';
export const VAKK_HARBOR_FLAG = 'HARIMU_HOARVALE_VAKK_HARBOR_ENABLED';
/** #1279: Meridian resident city. Preview "true" / production "false" inside HARIMU_GRAY_PACK. A direct string still wins. */
export const DAO_WORKS_FLAG = 'HARIMU_MERIDIAN_DAO_WORKS_ENABLED';
/** #1259: Fulmara resident port. Preview "true" / production "false" inside HARIMU_GRAY_PACK. A direct string still wins. */
export const CORVEL_ISLES_FLAG = 'HARIMU_FULMARA_CORVEL_ISLES_ENABLED';
/** #1259: the one city-panel line. The next date is the #1178 clock, shown only when that flag is also on. */
export const CORVEL_ISLES_REGATTA_NOTE = 'Hosts the Grand Regatta';
/** #1242: Aurelle resident religious center. Preview "true" / production "false" inside HARIMU_GRAY_PACK. A direct string still wins. */
export const DUNMORROW_FLAG = 'HARIMU_AURELLE_DUNMORROW_ENABLED';
/** #1270: Confluence resident industry city. Preview "true" / production "false" inside HARIMU_GRAY_PACK. A direct string still wins. */
export const RUEL_WORKS_FLAG = 'HARIMU_CONFLUENCE_RUEL_WORKS_ENABLED';
/** #1271: Ilmar resident oasis town. Preview "true" / production "false" inside HARIMU_GRAY_PACK. A direct string still wins. */
export const THESSALY_WELLS_FLAG = 'HARIMU_ILMAR_THESSALY_WELLS_ENABLED';
/** #1275: Veldwood resident industry / boats city. Preview "true" / production "false" inside HARIMU_GRAY_PACK. A direct string still wins. */
export const MARROW_MILLS_FLAG = 'HARIMU_VELDWOOD_MARROW_MILLS_ENABLED';
/** #1282: Varkand resident military base. Preview "true" / production "false" inside HARIMU_GRAY_PACK. A direct string still wins. */
export const DUNKAR_PASS_FLAG = 'HARIMU_VARKAND_DUNKAR_PASS_ENABLED';
/** #1242: the one city-panel line. The next date is the #1146 clock, shown only when that flag is also on. */
export const DUNMORROW_HEARTH_NOTE = 'Hosts Hearth Night';
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
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const spaNames = new Set(['Isling Springs', 'Emberwell', 'Shen Springs']);
const catalog: readonly City[] = Object.entries(roster).flatMap(([nationId, entries]) => entries.map(([name, description], index) => ({
  id: slug(name), nationId, name, capital: index === 0, role: index === 0 ? 'capital' : roles[name] ?? 'unknown', description,
  ...(spaNames.has(name) ? { spa: true as const } : {}),
})));
/** #798: Emberwell (Kindle) and Shen Springs (Meridian) are resident cities beyond the capital-plus-two map.
 *  They are not Assembly districts and have no country-map pin (that map is three fixed pins). Home, enroll and travel-by-id use them. */
const spaAdditions: readonly City[] = [
  { id: 'emberwell', nationId: 'kindle', name: 'Emberwell', capital: false, role: 'Health / tourism', description: 'Lava-warmed basalt bathhouses on the northern rim of the volcanic plateau.', spa: true },
  { id: 'shen-springs', nationId: 'meridian', name: 'Shen Springs', capital: false, role: 'Health / tourism', description: 'Hot-spring terraces and white bathhouses in the northern foothills.', spa: true },
];
/** #1241: same resident path as the #798 spa additions (home, enroll, travel-by-id). Not an Assembly district (citiesForNation stays capital + two) and no country-map pin.
 *  [ASSUMPTION] one-line description joins the docs Look and Region columns; the Lighthouse of the Spark landmark stays off this line, as Emberwell's description omits The Ember Pools. */
const brasswellPort: City = { id: 'brasswell-port', nationId: 'kindle', name: 'Brasswell Port', capital: false, role: 'Port / trade', description: 'Brass cranes and shade-awning docks on black sand along the eastern coast.' };
/** #1259: same resident path as the #798 spa additions (home, enroll, travel-by-id). Not a country-map pin (that map is three fixed pins) and citiesForNation stays capital + two.
 *  [ASSUMPTION] one-line description joins the docs Look and Region columns; the Votive Chapel landmark stays off this line, as Brasswell's description omitted the Lighthouse of the Spark. */
const corvelIsles: City = { id: 'corvel-isles', nationId: 'fulmara', name: 'Corvel Isles', capital: false, role: 'Port / fisheries', description: 'Fair-Wind chapels with votive ship models on the outer islands.' };
/** #1242: same resident path as the #798 spa additions (home, enroll, travel-by-id). Not on the country map (that map is three fixed pins) and citiesForNation stays capital + two.
 *  [ASSUMPTION] one-line description joins the docs Look and Region columns; the Hearth of the Houses landmark stays off this line, as Emberwell's description omits The Ember Pools. */
const dunmorrow: City = { id: 'dunmorrow', nationId: 'aurelle', name: 'Dunmorrow', capital: false, role: 'Religious center', description: 'Kinward name-stone halls in white stone along the eastern gorge.' };
/** #1261: same resident path as the #798 spa additions and #1241 (home, enroll, travel-by-id). No country-map pin.
 *  [ASSUMPTION] one-line description joins the docs Look and Region columns; the Old Lighthouse stays off this line, as Brasswell omitted the Lighthouse of the Spark. */
const vakkHarbor: City = { id: 'vakk-harbor', nationId: 'hoarvale', name: 'Vakk Harbor', capital: false, role: 'Port / fisheries', description: 'Timber wharves and fish-drying racks on the western fjord coast.' };
/** #1270: same resident path as the #798 spa additions (home, enroll, travel-by-id). Not on the country map (that map is three fixed pins) and citiesForNation stays capital plus two.
 *  [ASSUMPTION] one-line description joins the docs Look and Region columns; the Great Waterwheel landmark stays off this line, as Emberwell's description omits The Ember Pools. */
const ruelWorks: City = { id: 'ruel-works', nationId: 'confluence', name: 'Ruel Works', capital: false, role: 'Industry', description: 'Timber-and-tile workshops along mill canals on the eastern river fork.' };
/** #1271: same resident path as the #798 spa additions (home, enroll, travel-by-id). Not a country-map pin (that map is three fixed pins) and citiesForNation stays capital plus two.
 *  [ASSUMPTION] one-line description joins the docs Look and Region columns; the Seven Wells landmark stays off this line, as Brasswell's description omitted the Lighthouse of the Spark.
 *  [ASSUMPTION] the capture line is the existing heartland sentence. Farming / oasis is not a port or trade zone, so cityHasImports stays false. */
const thessalyWells: City = { id: 'thessaly-wells', nationId: 'ilmar', name: 'Thessaly Wells', capital: false, role: 'Farming / oasis', description: 'Date palms around shaded courtyards in the eastern oasis belt.' };
/** #1275: same resident path as the #798 spa additions (home, enroll, travel-by-id). Not on the country map (that map is three fixed pins) and citiesForNation stays capital plus two.
 *  [ASSUMPTION] one-line description joins the docs Look and Region columns; the Boat Hall landmark stays off this line, as Brasswell's description omitted the Lighthouse of the Spark. */
const marrowMills: City = { id: 'marrow-mills', nationId: 'veldwood', name: 'Marrow Mills', capital: false, role: 'Industry / boats', description: 'Heartwood boat halls on the river in the eastern river valley.' };
/** #1279: same resident path as the #798 spa additions (home, enroll, travel-by-id). No country-map pin. citiesForNation stays capital plus two.
 *  [ASSUMPTION] one-line description joins the docs Look and Region columns; the Red Foundry stays off this line, as Brasswell omitted the Lighthouse of the Spark. */
const daoWorks: City = { id: 'dao-works', nationId: 'meridian', name: 'Dao Works', capital: false, role: 'Heavy industry', description: 'Slate factory blocks with slogan banners on the western plain.' };
/** #1282: same resident path as the #798 spa additions (home, enroll, travel-by-id). Not on the country map (that map is three fixed pins) and citiesForNation stays capital plus two.
 *  [ASSUMPTION] one-line description joins the docs Look and Region columns; the Fog Gate landmark stays off this line, as Emberwell's description omits The Ember Pools.
 *  Garrison duty, key defense, and war value stay out: this is a resident city only. */
const dunkarPass: City = { id: 'dunkar-pass', nationId: 'varkand', name: 'Dunkar Pass', capital: false, role: 'Military base', description: 'Fortified pass with searchlights on the eastern mountain pass.' };
let boundEnv: unknown;
let corvelBound: unknown;
let dunmorrowBound: unknown;
let vakkEnv: unknown;
let ruelWorksBound: unknown;
let thessalyBound: unknown;
let marrowMillsBound: unknown;
let daoEnv: unknown;
let dunkarPassBound: unknown;
/** Routes pass the Worker env. Unset: node tests use process.env. A bound env wins, including "false". */
export function bindBrasswellPortEnv(env: unknown) { boundEnv = env; }
export function bindCorvelIslesEnv(env: unknown) { corvelBound = env; }
export function bindDunmorrowEnv(env: unknown) { dunmorrowBound = env; }
export function bindVakkHarborEnv(env: unknown) { vakkEnv = env; }
export function bindRuelWorksEnv(env: unknown) { ruelWorksBound = env; }
export function bindThessalyWellsEnv(env: unknown) { thessalyBound = env; }
export function bindMarrowMillsEnv(env: unknown) { marrowMillsBound = env; }
export function bindDaoWorksEnv(env: unknown) { daoEnv = env; }
export function bindDunkarPassEnv(env: unknown) { dunkarPassBound = env; }
function brasswellPortEnabled(): boolean {
  if (boundEnv !== undefined) return flagOn(boundEnv, BRASSWELL_PORT_FLAG);
  try { return typeof process !== 'undefined' && flagOn(process.env, BRASSWELL_PORT_FLAG); } catch { return false; }
}
function corvelIslesEnabled(): boolean {
  if (corvelBound !== undefined) return flagOn(corvelBound, CORVEL_ISLES_FLAG);
  try { return typeof process !== 'undefined' && flagOn(process.env, CORVEL_ISLES_FLAG); } catch { return false; }
}
function dunmorrowEnabled(): boolean {
  if (dunmorrowBound !== undefined) return flagOn(dunmorrowBound, DUNMORROW_FLAG);
  try { return typeof process !== 'undefined' && flagOn(process.env, DUNMORROW_FLAG); } catch { return false; }
}
function vakkHarborEnabled(): boolean {
  if (vakkEnv !== undefined) return flagOn(vakkEnv, VAKK_HARBOR_FLAG);
  try { return typeof process !== 'undefined' && flagOn(process.env, VAKK_HARBOR_FLAG); } catch { return false; }
}
function ruelWorksEnabled(): boolean {
  if (ruelWorksBound !== undefined) return flagOn(ruelWorksBound, RUEL_WORKS_FLAG);
  try { return typeof process !== 'undefined' && flagOn(process.env, RUEL_WORKS_FLAG); } catch { return false; }
}
function thessalyWellsEnabled(): boolean {
  if (thessalyBound !== undefined) return flagOn(thessalyBound, THESSALY_WELLS_FLAG);
  try { return typeof process !== 'undefined' && flagOn(process.env, THESSALY_WELLS_FLAG); } catch { return false; }
}
function marrowMillsEnabled(): boolean {
  if (marrowMillsBound !== undefined) return flagOn(marrowMillsBound, MARROW_MILLS_FLAG);
  try { return typeof process !== 'undefined' && flagOn(process.env, MARROW_MILLS_FLAG); } catch { return false; }
}
function daoWorksEnabled(): boolean {
  if (daoEnv !== undefined) return flagOn(daoEnv, DAO_WORKS_FLAG);
  try { return typeof process !== 'undefined' && flagOn(process.env, DAO_WORKS_FLAG); } catch { return false; }
}
function dunkarPassEnabled(): boolean {
  if (dunkarPassBound !== undefined) return flagOn(dunkarPassBound, DUNKAR_PASS_FLAG);
  try { return typeof process !== 'undefined' && flagOn(process.env, DUNKAR_PASS_FLAG); } catch { return false; }
}
const portResidents = (): readonly City[] => brasswellPortEnabled() ? [brasswellPort] : [];
const corvelResidents = (): readonly City[] => corvelIslesEnabled() ? [corvelIsles] : [];
const dunmorrowResidents = (): readonly City[] => dunmorrowEnabled() ? [dunmorrow] : [];
const vakkResidents = (): readonly City[] => vakkHarborEnabled() ? [vakkHarbor] : [];
const ruelWorksResidents = (): readonly City[] => ruelWorksEnabled() ? [ruelWorks] : [];
const thessalyResidents = (): readonly City[] => thessalyWellsEnabled() ? [thessalyWells] : [];
const marrowMillsResidents = (): readonly City[] => marrowMillsEnabled() ? [marrowMills] : [];
const daoResidents = (): readonly City[] => daoWorksEnabled() ? [daoWorks] : [];
const dunkarPassResidents = (): readonly City[] => dunkarPassEnabled() ? [dunkarPass] : [];
const byId = (nationId: string, cityId: string) => (city: City) => city.nationId === nationId && city.id === cityId;
export function citiesForNation(nationId: string): readonly City[] { return catalog.filter(city => city.nationId === nationId); }
/** Catalog cities plus spa additions (#798), plus Brasswell (#1241), Dunmorrow (#1242), Corvel Isles (#1259), Vakk Harbor (#1261), Ruel Works (#1270), Thessaly Wells (#1271), Marrow Mills (#1275), Dao Works (#1279), and Dunkar Pass (#1282) when each flag is on. */
export function residentCitiesForNation(nationId: string): readonly City[] { return [...citiesForNation(nationId), ...spaAdditions.filter(city => city.nationId === nationId), ...portResidents().filter(city => city.nationId === nationId), ...dunmorrowResidents().filter(city => city.nationId === nationId), ...corvelResidents().filter(city => city.nationId === nationId), ...vakkResidents().filter(city => city.nationId === nationId), ...ruelWorksResidents().filter(city => city.nationId === nationId), ...thessalyResidents().filter(city => city.nationId === nationId), ...marrowMillsResidents().filter(city => city.nationId === nationId), ...daoResidents().filter(city => city.nationId === nationId), ...dunkarPassResidents().filter(city => city.nationId === nationId)]; }
export function cityForNation(nationId: string, cityId: string): City | undefined { return catalog.find(byId(nationId, cityId)) ?? spaAdditions.find(byId(nationId, cityId)) ?? portResidents().find(byId(nationId, cityId)) ?? dunmorrowResidents().find(byId(nationId, cityId)) ?? corvelResidents().find(byId(nationId, cityId)) ?? vakkResidents().find(byId(nationId, cityId)) ?? ruelWorksResidents().find(byId(nationId, cityId)) ?? thessalyResidents().find(byId(nationId, cityId)) ?? marrowMillsResidents().find(byId(nationId, cityId)) ?? daoResidents().find(byId(nationId, cityId)) ?? dunkarPassResidents().find(byId(nationId, cityId)); }
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
/** The nation whose frontier outpost has this catalog id (Ashby Crossing → kindle). Independent of who is looking. */
export function outpostNationForCity(cityId: string): string | undefined {
  return Object.keys(outposts).find(nationId => outpostCityForNation(nationId)?.id === cityId);
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

/** #1006: read-only civic-unit note for the city panel (docs Territory, Cities & Warfare §15.2).
 *  Each city is also a voting district (Kindle, Ilmar, Confluence, Hoarvale), a Grove (Veldwood),
 *  a garrison district (Varkand), a port ward (Fulmara) or a plan unit (Korund).
 *  [ASSUMPTION] Aurelle and Meridian: no civic unit named in existing lore — omit the note. */
export const CITY_CIVIC_UNIT_BY_NATION: Readonly<Record<string, string>> = {
  kindle: 'voting district',
  ilmar: 'voting district',
  confluence: 'voting district',
  hoarvale: 'voting district',
  veldwood: 'Grove',
  varkand: 'garrison district',
  fulmara: 'port ward',
  korund: 'plan unit',
};
export function cityCivicUnitNote(nationId: string): string | null {
  return CITY_CIVIC_UNIT_BY_NATION[nationId] ?? null;
}

/** #1007: read-only governor line for the city panel (docs Territory, Cities & Warfare §15.2: "an AI governor (an AI Mayor
 *  elected by human citizens in Kindle; appointed elsewhere)"; Cities tier table: T2 Town unlocks "a local governor").
 *  [ASSUMPTION] No Kindle mayor exists in data yet and no nation's appointing office is named in lore, so the generic labels show. */
export const KINDLE_GOVERNOR_NOTE = 'AI Mayor, elected by citizens';
export const APPOINTED_GOVERNOR_NOTE = 'AI governor, appointed';
export const NO_GOVERNOR_NOTE = 'No local governor yet (unlocks at Town tier)';
export function cityGovernorFields(nationId: string, tier: number): { governorNote: string; governorAi: boolean } {
  if (tier < 2) return { governorNote: NO_GOVERNOR_NOTE, governorAi: false };
  return { governorNote: nationId === 'kindle' ? KINDLE_GOVERNOR_NOTE : APPOINTED_GOVERNOR_NOTE, governorAi: true };
}

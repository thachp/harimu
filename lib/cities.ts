export type City = { id: string; nationId: string; name: string; capital: boolean; description: string };
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
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), nationId, name, capital: index === 0, description,
})));
export function citiesForNation(nationId: string): readonly City[] { return catalog.filter(city => city.nationId === nationId); }
export function cityForNation(nationId: string, cityId: string): City | undefined { return catalog.find(city => city.nationId === nationId && city.id === cityId); }
export function capitalCityForNation(nationId: string): City | undefined { return catalog.find(city => city.nationId === nationId && city.capital); }

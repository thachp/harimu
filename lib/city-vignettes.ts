/** Vignettes for the 20 non-capital cities in lib/cities.ts (issue #115). Content only: not yet read by any city screen;
 * wiring is a follow-up. Signature buildings are the canon landmarks from each harimu-docs nation page (Cities table);
 * region, role and look restate that table and the nation's Land & climate / Aesthetic rows. Vignette sentences are new
 * wording and carry `proposal: true` until accepted into the docs (culture bible thachp/harimu-docs#3 convention).
 * No people, no Notables, no real-world places. */

export type CityVignette={cityId:string;nationId:string;signatureBuilding:string;vignette:string;proposal:boolean};

export const CITY_VIGNETTE_MAX=360;
export const CITY_VIGNETTE_MIN_SENTENCES=2;
export const CITY_VIGNETTE_MAX_SENTENCES=3;

const v=(cityId:string,nationId:string,signatureBuilding:string,vignette:string):CityVignette=>({cityId,nationId,signatureBuilding,vignette,proposal:true});

export const cityVignettes:readonly CityVignette[]=[
 v('tarrek-foundry','kindle','The Great Crucible','Soot-dark brick foundries glow orange at the edge of the eastern lava fields. Freight rolls out day and night, and the Great Crucible pours the ore that keeps the Republic building. Pay is good and the air is not.'),
 v('kolt-savanna','kindle','Harvest Bell tower','Sun-baked granaries line the southern savanna under canvas awnings. The Harvest Bell tower rings in each shift and the yearly harvest fair. Newcomers often start here, because the fields always need hands.'),
 v('lanu-terraces','confluence','The Thousand-Step Terrace','Jade rice terraces climb the upper delta hills, turned by cooperative waterwheels. The Thousand-Step Terrace feeds much of the nation, and the Canal Festival starts here each year.'),
 v('oalin-harbor','confluence','Riverpearl Market','Stilt houses stand over the southern coast, and lantern-lit fleets leave before dawn. At Riverpearl Market, catch and pearls are weighed on cooperative scales and priced on banded boards.'),
 v('tsenga-sez','meridian','SEZ Exchange Tower','Neon harbor towers light the southern coast, and exchange boards never stop ticking. The SEZ Exchange Tower is where convertible money meets the state. Most immigrants arrive here first, residence permit in hand.'),
 v('holv-gorge','meridian','Great Turbine Dam','Copper pipework runs down an inland mountain gorge to the Great Turbine Dam. Geotherm and turbine shifts keep the nation\'s power flowing. A city this valuable is never far from the war planners\' maps.'),
 v('strova-mines','korund','Ironroot Deep','Ochre terraces of mine heads step down the northern peaks, tied together by rust-red rail. Assigned brigades work the Ironroot Deep to meet the plan. The shifts are long, and the quota board is always in view.'),
 v('gren-plateau','korund','Granary of the People','Slate collective farms stretch across the high plateau. Harvests go to the Granary of the People and out through the ration depots. Every coupon book in the region traces back here.'),
 v('windrest','aurelle','Great Loom Hall','Skysilk loom towers stand on the northern cliffs, their wind-vanes always turning. In the Great Loom Hall, weavers spin cliff-moth silk into the luxuries the court exports.'),
 v('highmere','aurelle','Duke\'s Windmill Ring','Terraced gardens and windmills spread across the highland steppes. The town is a ducal fief, and the Duke\'s Windmill Ring grinds its grain. Immigrants who choose Aurelle take their oath here.'),
 v('lume-mesa','ilmar','Pilgrim\'s Stair','Sandstone temples on the western mesas throw colored light across the desert. Pilgrims climb the Pilgrim\'s Stair at the end of the Great Pilgrimage. The city lives on welcoming them.'),
 v('glassen','ilmar','The Great Kiln','Glazier workshops and mirror arrays crowd the southern desert. The Great Kiln fires Sunglass, the nation\'s key export. Work here is hot, careful and well regarded.'),
 v('fjeldmark','hoarvale','Frostcore Vaults','Ice vaults are cut deep into the northern glacier, and silver cranes lift Frostcore to the sledges. The Frostcore Vaults keep the nation\'s food exports cold on the long road out.'),
 v('isling-springs','hoarvale','The Great Bath','Steaming bathhouse terraces fill a hot-spring valley. Tired workers come to rest at the Great Bath, and on Aurora Night the whole town looks up.'),
 v('voren-light','varkand','Great Lens Lighthouse','A Hazequartz lighthouse town clings to the northern sea cliffs. The Great Lens Lighthouse cuts the fog for every ship offshore. Lens-crafters and sailors work here, and the town hosts Lantern Watch.'),
 v('moorhald','varkand','Peat Commons','Slate-green peat farms spread across the marsh highlands, with mess halls at every crossroads. The Peat Commons feeds the hearths of the moors. When requisition comes, it comes here first.'),
 v('ashglade','veldwood','Heartwood Hall','Moss-roofed timber halls stand among the northern old growth. Instrument-makers shape Heartwood in Heartwood Hall, and every tree felled is felled by vote.'),
 v('fernhollow','veldwood','The Long Glade','Riverside glade farms are linked by canopy walkways. Neighbors farm and forage the Long Glade together, and the Ring Moot ends in a shared potluck.'),
 v('vendezzo','fulmara','Grand Slipway','Copper slipways line the northern headland under storm-violet trading-house liveries. On the Grand Slipway, crews build the fast Stormcell ships that carry Fulmara\'s trade. Shareholders watch every launch.'),
 v('malvara-rods','fulmara','The Rod Forest','A forest of lightning rods covers the eastern storm cape. Crews harvest storm energy into Stormcells at the Rod Forest. The pay is high because the work is risky.'),
];

export function cityVignette(cityId:string){return cityVignettes.find(c=>c.cityId===cityId);}

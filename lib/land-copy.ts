/** Land copy: zone tooltips, World Registry purchase and city founding news for Kindle, Korund and Aurelle (issue #338). Content
 * only: lib/map-zones.ts (#66), lib/world-registry.ts (#122) and lib/city-founding.ts (#124) own zones, purchases and founding, and
 * the only UI import is app/world-zones.tsx (#1017 zone legend, zoneTooltips). Canon: harimu-docs world/map-design §6.1 (Heartland never capturable; Frontier; Wildlands; the Commons cannot
 * be bought, claimed only by war, treaty or joint development), territory-cities-warfare §15.1 (unclaimed Wildlands squares next to
 * owned land can be bought from the World Registry; an Expedition travels to a Wildlands site and on arrival claims a radius-2
 * block; minimum distance between cities is 6 squares; since v0.7 the nation's AI leadership decides: Kindle the AI government,
 * Korund the AI Chairman's order, Aurelle a royal charter, often a new fief) and economy-currency §12.5 (the World Registry is a
 * system-run institution). Bylines match lib/press-templates.ts (Kindle Press, Korund State Media, Court Gazette).
 *
 * Refusals: one neutral line per reason code that lib/world-registry.ts and lib/city-founding.ts return (the test reads both
 * sources, so a new code fails until it has a line). The founding "too close" and "not Wildlands" refusals also have a line in each
 * nation's voice for that nation's notice feed. Aurelle lines that speak for the Crown ("Be it known") are AI-badged.
 *
 * Rules: the only rule numbers are the docs' own: radius-2 and 6 squares. Prices, balances, owners, sites and city names come only
 * through placeholders ({price}, {balance}, {owner}, {nation}, {site}, {city}, {authority}), which are pre-formatted strings. Limits:
 * labels 40, lines 80 (ARC's number for this batch), tested with every placeholder filled to the shared 24-character name cap, which
 * this module re-exports (COUP_NAME_MAX from lib/palace-coup-copy.ts). No real-world references. All wording is new: `proposal: true`. */

export { COUP_NAME_MAX as LAND_NAME_MAX } from './palace-coup-copy';

export const LAND_PLACEHOLDERS=['{price}','{balance}','{owner}','{nation}','{site}','{city}','{authority}'] as const;
export const LAND_LABEL_MAX=40;
export const LAND_LINE_MAX=80;

export type Line={text:string;proposal:true};
export type Zone='heartland'|'frontier'|'wildlands'|'commons';
export type LandNation='kindle'|'korund'|'aurelle';
export type PurchaseReason='out_of_bounds'|'map_unavailable'|'heartland'|'commons'|'frontier'|'owned'|'not_adjacent'|'disabled'|'no_nation'|'request_reused'|'insufficient_tessera'|'square_taken';
export type FoundingReason='disabled'|'no_authority'|'wrong_authority'|'out_of_bounds'|'map_unavailable'|'centre_heartland'|'centre_commons'|'centre_frontier'|'centre_owned'|'too_close'|'block_off_map'|'block_commons'|'block_claimed'|'request_reused'|'site_taken';
/** A line in a nation's voice; `aiBadge` is true only where the Crown speaks in its own voice ("Be it known"). */
export type VoicedLine={text:string;aiBadge:boolean;proposal:true};
export type LandNationCopy={nationId:LandNation;byline:{name:string;proposal:boolean};authority:Line;
 expeditionDeparts:VoicedLine;expeditionArrives:VoicedLine;founded:{headline:string;body:VoicedLine};refusals:{too_close:VoicedLine;not_wildlands:VoicedLine};proposal:true};
const L=(text:string):Line=>({text,proposal:true});
const V=(text:string):VoicedLine=>({text,aiBadge:/^Be it known/.test(text),proposal:true});

export const ZONES:readonly Zone[]=['heartland','frontier','wildlands','commons'];
export const LAND_NATIONS:readonly LandNation[]=['kindle','korund','aurelle'];
export const PURCHASE_REASONS:readonly PurchaseReason[]=['out_of_bounds','map_unavailable','heartland','commons','frontier','owned','not_adjacent','disabled','no_nation','request_reused','insufficient_tessera','square_taken'];
export const FOUNDING_REASONS:readonly FoundingReason[]=['disabled','no_authority','wrong_authority','out_of_bounds','map_unavailable','centre_heartland','centre_commons','centre_frontier','centre_owned','too_close','block_off_map','block_commons','block_claimed','request_reused','site_taken'];

/** One-line tooltip per zone (§6.1). */
export const zoneTooltips:Readonly<Record<Zone,Line>>={
 heartland:L('Heartland: a nation\'s core. It can never be captured.'),
 frontier:L('Frontier: claimed land. It can be traded by treaty or won in war.'),
 wildlands:L('Wildlands: unclaimed. The World Registry sells squares next to your land.'),
 commons:L('The Commons: shared, not for sale. Only war, treaty or joint development.'),
};

/** World Registry purchase (a system-run institution, so the voice is a plain system notice). */
export const registryPurchase={
 header:'World Registry',
 buyButton:'Buy square',
 confirmPrompt:L('Buy this square from the World Registry for {price}?'),
 success:L('Bought for {price}. It now belongs to {nation}.'),
 proposal:true,
} as const;

/** One neutral line per reason lib/world-registry.ts returns. */
export const purchaseRefusals:Readonly<Record<PurchaseReason,Line>>={
 out_of_bounds:L('That square is off the map. Pick a square on the map.'),
 map_unavailable:L('The map is not available right now. Try again soon.'),
 heartland:L('Heartland squares are never sold. Pick Wildlands next to your land.'),
 commons:L('The Commons cannot be bought. Only war, treaty or joint development.'),
 frontier:L('Only Wildlands squares are sold. This land is already Frontier.'),
 owned:L('That square already belongs to {owner}.'),
 not_adjacent:L('The Registry sells only squares next to land your nation owns.'),
 disabled:L('The World Registry is not open yet. Check back later.'),
 no_nation:L('Only citizens of Kindle, Korund and Aurelle can buy squares here.'),
 request_reused:L('That request was used for another purchase. Start again.'),
 insufficient_tessera:L('A square costs {price}. You hold {balance}.'),
 square_taken:L('The square was sold first. Nothing was charged.'),
};

/** Neutral founding panel lines: the radius-2 claim and 6-square spacing (§15.1) and one line per reason lib/city-founding.ts returns. */
export const foundingRules={
 claim:L('Founding claims a radius-2 block of squares.'),
 spacing:L('Cities must stand at least 6 squares apart.'),
 proposal:true,
} as const;
export const foundingRefusals:Readonly<Record<FoundingReason,Line>>={
 disabled:L('City founding is not open yet. Check back later.'),
 no_authority:L('Only citizens of Kindle, Korund and Aurelle can found cities here.'),
 wrong_authority:L('Your nation founds cities by {authority}.'),
 out_of_bounds:L('That site is off the map. Pick a site on the map.'),
 map_unavailable:L('The map is not available right now. Try again soon.'),
 centre_heartland:L('Cities cannot be founded in the Heartland. Pick Wildlands.'),
 centre_commons:L('Cities cannot be founded in the Commons. Pick Wildlands.'),
 centre_frontier:L('That land is already Frontier. Cities are founded on Wildlands.'),
 centre_owned:L('That square is already claimed. Pick unclaimed Wildlands.'),
 too_close:L('Too close to another city. Cities stand at least 6 squares apart.'),
 block_off_map:L('The radius-2 claim would run off the map. Pick a site inland.'),
 block_commons:L('The radius-2 claim would reach the Commons. Pick a farther site.'),
 block_claimed:L('The radius-2 claim would take claimed land. Pick a clearer site.'),
 request_reused:L('That request was used for another founding. Start again.'),
 site_taken:L('Another founding claimed the land first. Nothing was claimed.'),
};

/** Founding in each nation's own voice, reflecting who decides (§15.1, v0.7: the nation's AI leadership). {site} is where the
 * expedition goes, {city} the new city's name. */
export const landNations:readonly LandNationCopy[]=[
 {nationId:'kindle',byline:{name:'Kindle Press',proposal:false},proposal:true,
  authority:L('The AI government decides where Kindle founds cities.'),
  expeditionDeparts:V('The AI government sends an expedition to {site}.'),
  expeditionArrives:V('The expedition reached {site}. The land is claimed.'),
  founded:{headline:'A new city: {city}',body:V('The Republic founds {city} on the frontier.')},
  refusals:{too_close:V('Charter refused: too close to another city. Keep 6 squares apart.'),
   not_wildlands:V('Charter refused: cities can only be founded on Wildlands.')}},
 {nationId:'korund',byline:{name:'Korund State Media',proposal:false},proposal:true,
  authority:L('The AI Chairman\'s order decides where Korund founds cities.'),
  expeditionDeparts:V('State Media: the Chairman sends an expedition to {site}.'),
  expeditionArrives:V('State Media: the expedition reached {site}. Land claimed.'),
  founded:{headline:'A new city for the plan',body:V('State Media: {city} is founded by order of the Chairman.')},
  refusals:{too_close:V('State Media: order refused. Cities stand 6 squares apart at least.'),
   not_wildlands:V('State Media: order refused. Only Wildlands are settled.')}},
 {nationId:'aurelle',byline:{name:'Court Gazette',proposal:false},proposal:true,
  authority:L('A royal charter founds cities in Aurelle, often as a new fief.'),
  expeditionDeparts:V('Be it known: the Crown sends an expedition to {site}.'),
  expeditionArrives:V('Court Gazette: the expedition has reached {site}.'),
  founded:{headline:'A new fief is chartered',body:V('Be it known: the Crown charters {city}, a new fief.')},
  refusals:{too_close:V('Be it known: charter refused. Cities stand 6 squares apart at least.'),
   not_wildlands:V('Be it known: charter refused. Only Wildlands may be chartered.')}},
];
export function landFor(nationId:LandNation){return landNations.find(x=>x.nationId===nationId);}

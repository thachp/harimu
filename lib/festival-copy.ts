/** Festival event copy for the six faiths and each nation's canon holidays (issue #209, refile of #113). Content only:
 * not read by any screen yet. Festival names restate harimu-docs religion-faiths §14.1 and each nation page's
 * Culture > "Holidays & festivals" row without change. Every title-line and description is new wording, so each
 * entry carries `proposal: true` until accepted into the docs. Limits: name ≤ 40, text ≤ 140 characters.
 * Korund faith days stay off this list (§14.6: underground worship is low-key, never surfaced as an event). */
import type {FaithId} from './faith-copy';

export type FestivalNationId='kindle'|'korund'|'aurelle'|'confluence'|'meridian'|'ilmar'|'hoarvale'|'varkand'|'veldwood'|'fulmara';
export type FestivalCopy={id:string;name:string;text:string;proposal:boolean};
export const FESTIVAL_NAME_MAX=40;
export const FESTIVAL_TEXT_MAX=140;

const f=(id:string,name:string,text:string):FestivalCopy=>({id,name,text,proposal:true});

export const faithFestivalCopy:Readonly<Record<FaithId,readonly FestivalCopy[]>>={
 'lumen-canon':[f('long-light','Long Light','The midsummer vigil. Lamps stay lit through the shortest night, and the faithful keep watch together.'),
  f('clearing','Clearing','The new year begins with a renewal of vows: honesty, duty and clarity spoken again.')],
 'kinward-rite':[f('night-of-names','Night of Names','A night of remembrance. Households read the names on their name-stones aloud.'),
  f('oath-day','Oath Day','Oaths are spoken again before the hearth, and new oaths are taken.')],
 'the-round':[f('turning-days','Turning Days','The circle gathers in the open air as the season turns, four times a year, every 7.5 real days.')],
 'fair-wind-vow':[f('launching','Launching','The sailing season opens. Crews take their vows before the first voyage.'),
  f('safe-return','Safe Return','Thanks are given for every ship and trader that came home.')],
 'quiet-path':[f('still-week','Still Week','A week of retreat. Teachers lead longer stillness sessions for anyone who joins.'),
  f('lantern-of-attention','Lantern of Attention','A lantern is kept in view, and attention returns to it each time it wanders.')],
 'open-hand':[f('bread-day','Bread Day','Bread halls feed everyone who comes, and Almoners gather gifts for those in need.'),
  f('day-of-the-open-door','Day of the Open Door','Halls and homes open their doors to neighbors and strangers alike.')],
};

export const nationFestivalCopy:Readonly<Record<FestivalNationId,readonly FestivalCopy[]>>={
 kindle:[f('ballot-night','Ballot Night','Results light up the Assembly dome while the street grills run late.'),
  f('founders-forge-day','Founders\' Forge Day','The Republic\'s anniversary, celebrated with an open-market fair.'),
  f('market-bell','Market Bell','The anniversary of the stock exchange\'s opening. Traders ring in the day.')],
 korund:[f('plan-day','Plan Day','A new Five-Year Plan begins. Brigades receive their targets.'),
  f('quota-rally','Quota Rally','The quarterly production drive. Every brigade pushes for its quota.'),
  f('chairmans-birthday','Chairman\'s Birthday','A national holiday in honor of the Chairman.'),
  f('peoples-congress','People\'s Congress','The Congress meets and gives its approval.')],
 aurelle:[f('coronation-day','Coronation Day','The realm marks the crowning of its Monarch.'),
  f('hearth-night','Hearth Night','The Kinward Rite blesses the houses of the realm.'),
  f('charter-fair','Charter Fair','Royal charters are granted before the court.'),
  f('heirs-naming','Heir\'s Naming','An heir is named before the court.')],
 confluence:[f('congress-lanterns','Congress Lanterns','At every Party Congress a lantern is floated on the canals for each delegate.'),
  f('canal-festival','Canal Festival','After the harvest, the canals fill with boats and shared food.'),
  f('quota-day','Quota Day','Cooperatives put their output on display.')],
 meridian:[f('congress-week','Congress Week','Held every 5 game years, as the Congress convenes.'),
  f('exam-day','Exam Day','Ranks are announced, and results go up in the plazas.'),
  f('turbine-day','Turbine Day','The anniversary of the national grid.')],
 ilmar:[f('stilldays','Stilldays','The weekly rest. Currency trading pauses until it ends.'),
  f('feast-of-first-light','Feast of First Light','Held when a new Oracle is chosen or a solstice falls.'),
  f('assembly-election','Assembly Election','Election day for the Assembly.'),
  f('great-pilgrimage','Great Pilgrimage','Once per game year the faithful are called to Mirrorhall.')],
 hoarvale:[f('opening-of-the-moot','Opening of the Moot','The Moot opens with a blessing from the Kinward Rite.'),
  f('honors-list-day','Honors List Day','The Honors List is published. Bragging about it is not done.'),
  f('aurora-night','Aurora Night','Midwinter, under the northern lights.'),
  f('election-night','Election Night','The count comes in, and the bathhouses hold count parties.')],
 varkand:[f('muster-day','Muster Day','Units muster across Varkand. Canceled at Red Alert.'),
  f('rotation-day','Rotation Day','The Chair passes on to the next holder. Celebrations canceled at Red Alert.'),
  f('mandate-plebiscite','Mandate Plebiscite','Citizens vote on the mandate. Celebrations canceled at Red Alert.'),
  f('lantern-watch','Lantern Watch','Varkand honors its lighthouses. Canceled at Red Alert.')],
 veldwood:[f('vote-days','Vote Days','Referendum days, with picnic tables set out at the Moot.'),
  f('dividend-day','Dividend Day','The Citizen Dividend is paid out.'),
  f('glade-festival','Glade Festival','A local festival, adopted by Grove vote.'),
  f('initiative-night','Initiative Night','Petitions that reach their threshold are celebrated.')],
 fulmara:[f('exchange-bell','Exchange Bell','The bell opens the year\'s trading.'),
  f('grand-regatta','Grand Regatta','The great sailing race of the year.'),
  f('charter-day','Charter Day','Shares are voted, and the charter is settled for the year.'),
  f('fair-wind-blessing','Fair-Wind Blessing','The Fair-Wind Vow blesses the convoys before they sail.'),
  f('dock-strike','Dock Strike','A day of remembrance for the dock strike.')],
};

export function festivalsFor(nation:FestivalNationId){return nationFestivalCopy[nation];}

/** Festival event and stance copy for the three MVP faiths (issue #270, narrowed refile of #113). Content only: #68 owns
 * endorse / tolerate / ban mechanics, and no UI imports this. Scope ruling: only the canon festivals Night of Names
 * (Kinward Rite), Launching (Fair-Wind Vow) and Bread Day (Open Hand). Names restate harimu-docs §14.1 and match
 * lib/festival-copy.ts (#209). Stances follow §14.2 / §14.4: a nation can endorse (public holiday, one fewer shift that
 * game day), tolerate, or ban where its stance allows. Kindle: secular pluralism, no ban. Aurelle: Kinward Rite is the
 * state church, other faiths private-only, no ban. Korund: all faiths banned, so its notice shows no public banner text
 * and names no faith (§14.6). Faith rulings (#259/#265): no Devotion tiers, gating or thresholds, no posture verbs,
 * location-neutral Fair-Wind wording, no figures beyond the docs' "one fewer shift". All wording new: `proposal: true`. */

export type MvpFestivalId='night-of-names'|'launching'|'bread-day';
export type MvpFaithId='kinward-rite'|'fair-wind-vow'|'open-hand';
export type MvpNationId='kindle'|'korund'|'aurelle';
export type FestivalEventCopy={id:MvpFestivalId;faithId:MvpFaithId;name:string;description:string;upcoming:string;active:string;
 joinButton:string;joinToast:string;proposal:true};
export type Line={text:string;proposal:true};
export type StanceCopy={endorsed?:Line;tolerated?:Line;banned?:Line};

export const FESTIVAL_LABEL_MAX=40;
export const FESTIVAL_LINE_MAX=140;
export const MVP_FESTIVAL_IDS:readonly MvpFestivalId[]=['night-of-names','launching','bread-day'];

const e=(id:MvpFestivalId,faithId:MvpFaithId,name:string,description:string,upcoming:string,active:string,joinToast:string):FestivalEventCopy=>
 ({id,faithId,name,description,upcoming,active,joinButton:'Join the festival',joinToast,proposal:true});
const L=(text:string):Line=>({text,proposal:true});

export const mvpFestivalCopy:readonly FestivalEventCopy[]=[
 e('night-of-names','kinward-rite','Night of Names','A night of remembrance. Households read the names on their name-stones aloud.',
  'The Night of Names is coming. Households ready their name-stones.','The Night of Names has begun. Names are read aloud at every hearth.',
  'You joined the Night of Names. The names are remembered.'),
 e('launching','fair-wind-vow','Launching','The sailing season opens. Travelers and traders take their vows before the first voyage.',
  'The Launching is coming. The sailing season will soon open.','The Launching has begun. Vows are made for the season ahead.',
  'You joined the Launching. May you trade fairly and travel safe.'),
 e('bread-day','open-hand','Bread Day','Bread halls feed everyone who comes, and gifts are gathered for those in need.',
  'Bread Day is coming. The bread halls are getting ready.','Bread Day has begun. The bread halls are open to all.',
  'You joined Bread Day. Thank you for sharing.'),
];

export const festivalStanceCopy:Readonly<Record<MvpNationId,StanceCopy>>={
 kindle:{
  endorsed:L('Public holiday: the Assembly has endorsed this festival. One fewer shift today.'),
  tolerated:L('This festival is not a public holiday. Celebrate freely.'),
 },
 aurelle:{
  endorsed:L('Public holiday by royal decree. One fewer shift today.'),
  tolerated:L('This festival is kept in private worship in Aurelle. It is not a public holiday.'),
 },
 korund:{
  banned:L('Faith festivals are not held publicly in Korund.'),
 },
};

export function mvpFestival(id:string){return mvpFestivalCopy.find(f=>f.id===id);}

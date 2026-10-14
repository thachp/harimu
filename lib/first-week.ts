/** First-week starter arc, days 2–7 (issue #104). Guidance only: goals point at existing screens and
 * read existing records as completion signals; they never grant rewards or change state.
 * Day 1 is the first loop (lib/first-loop.ts). Voice follows the culture bible, thachp/harimu-docs#3.
 * `needsCode` marks a goal whose screen or signal does not exist yet (with the tracking issue). */
export type WeekScreen='workplace'|'market'|'household'|'square'|'government'|'nation'|'world';
export type GoalRequirement='petitions'|'rank-ladder'|'merit-badges'|'notables'|'claimant-pledges'|'royal-favor'|'screen-view-tracking';
export type WeekGoal={id:string;screen:WeekScreen;text:string;signal:string;needsCode?:string;requires?:readonly GoalRequirement[]};
export type WeekDay={day:2|3|4|5|6|7;theme:string;goals:readonly WeekGoal[]};
export type FirstWeekArc={nationId:'kindle'|'korund'|'aurelle';days:readonly WeekDay[]};

const g=(id:string,screen:WeekScreen,text:string,signal:string,needsCode?:string,...requires:GoalRequirement[]):WeekGoal=>needsCode&&requires.length?{id,screen,text,signal,needsCode,requires}:{id,screen,text,signal};

export const firstWeekArcs:readonly FirstWeekArc[]=[
 {nationId:'kindle',days:[
  {day:2,theme:'Show your number',goals:[g('kindle-2-shift','workplace','Work a second shift. Steady wages beat a lucky break.','A second settled shift in Work'),g('kindle-2-sell','market','Sell something at the posted price. In Kindle, the price is never hidden.','A sell order recorded in Market')]},
  {day:3,theme:'Many voices on one plaza',goals:[g('kindle-3-square','square','Say your piece in the city square. Plain talk is welcome here.','A message posted in your City square'),g('kindle-3-news','nation','Read Kindle Press and check where each story comes from.','Kindle Press opened in Nation','Screen-view tracking not built','screen-view-tracking')]},
  {day:4,theme:'Know your President',goals:[g('kindle-4-programme','government','Read President Ines Varro\'s programme. Which promises are funded?','Government programme opened','Screen-view tracking not built','screen-view-tracking'),g('kindle-4-meal','household','Keep your household fed. Cook a meal from your own stock.','A meal prepared in Household')]},
  {day:5,theme:'A fair count',goals:[g('kindle-5-ballot','government','Compare the AI candidates and rank them on the preview ballot.','A preview ballot recorded'),g('kindle-5-petition','government','Back a petition you believe in. Enough voices force an answer.','A petition signature recorded','#20 petitions (verified Tier 1 required)','petitions')]},
  {day:6,theme:'Strike your own spark',goals:[g('kindle-6-trade','market','Make a trade with another citizen on the player market.','A player-market trade recorded'),g('kindle-6-shift','workplace','Take a shift that pays in something other than food.','A settled freight or archive shift')]},
  {day:7,theme:'Toward Emberwarden',goals:[g('kindle-7-shift','workplace','Close the week with one more shift. Steady work builds a name.','A settled shift in Work'),g('kindle-7-review','household','Look over your week: wages, meals and trades. That is your record toward Emberwarden.','Household records opened','Screen-view tracking not built','screen-view-tracking'),g('kindle-7-rank','nation','See how far you are from Emberwarden.','Civic rank progress shown','Civic rank ladder not built (rank rename tracked in #121)','rank-ladder')]},
 ]},
 {nationId:'korund',days:[
  {day:2,theme:'The brigade counts on you',goals:[g('korund-2-quota','workplace','Meet your quota again. The plan is built shift by shift.','A second settled Korund shift'),g('korund-2-coupons','market','Redeem your coupons before they expire.','A ration redemption recorded')]},
  {day:3,theme:'Queue and comrades',goals:[g('korund-3-queue','market','Take your place in the ration queue. Order is fairness.','A Korund queue entry recorded'),g('korund-3-square','square','Greet your comrades in the city square.','A message posted in your City square')]},
  {day:4,theme:'Words from the Chairman',goals:[g('korund-4-shift','workplace','Work your quota shift. The Chairman\'s words are kept by the brigades.','A settled Korund shift'),g('korund-4-media','nation','Read today\'s report from Korund State Media.','Korund State Media opened in Nation','Screen-view tracking not built','screen-view-tracking'),g('korund-4-programme','government','Read Chairman Neral Voss\'s published statement.','Government programme opened','Screen-view tracking not built','screen-view-tracking')]},
  {day:5,theme:'Strength for the plan',goals:[g('korund-5-meal','household','Cook a meal for your household. A fed worker is a strong worker.','A meal prepared in Household'),g('korund-5-shift','workplace','Work another quota shift for the common store.','A settled Korund shift')]},
  {day:6,theme:'One hammer, one heart',goals:[g('korund-6-shift','workplace','Work a quota shift alongside your brigade.','A settled Korund shift'),g('korund-6-brigade','workplace','See how your brigade\'s output adds up to the plan.','Plan output viewed in Work','Screen-view tracking not built','screen-view-tracking'),g('korund-6-medal','household','Steady work may be honored with a merit badge.','Merit badge awarded','Merit badges not built','merit-badges')]},
  {day:7,theme:'A week for the plan',goals:[g('korund-7-coupons','market','Redeem this week\'s last coupons before they expire.','A ration redemption recorded'),g('korund-7-review','household','Look over your coupon book and your shifts for the week.','Household records opened','Screen-view tracking not built','screen-view-tracking'),g('korund-7-chronicle','nation','Ask the plan chronicler Ilya Renn what the week\'s records show.','Notable conversation started','Notables runtime switch is OFF','notables')]},
 ]},
 {nationId:'aurelle',days:[
  {day:2,theme:'Service to the Crown',goals:[g('aurelle-2-service','workplace','Return to royal estate service. Faithful service is noticed.','A second settled Aurelle shift'),g('aurelle-2-store','market','Buy provisions from the royal store.','A royal store purchase recorded')]},
  {day:3,theme:'Every thread in its place',goals:[g('aurelle-3-gazette','nation','Read the Court Gazette: today\'s decrees and honors.','Court Gazette opened in Nation','Screen-view tracking not built','screen-view-tracking'),g('aurelle-3-square','square','Pay your respects in the city square. Mind your rank.','A message posted in your City square')]},
  {day:4,theme:'The Monarch\'s word',goals:[g('aurelle-4-decree','government','Read Monarch Maera Solenne\'s published decree.','Government programme opened','Screen-view tracking not built','screen-view-tracking'),g('aurelle-4-meal','household','Keep your hearth warm. Cook a meal at home.','A meal prepared in Household')]},
  {day:5,theme:'A petition to the court',goals:[g('aurelle-5-audience','government','Bring a household concern before the royal council.','A petition to the council recorded','#20 petitions (verified Tier 1 required)','petitions'),g('aurelle-5-service','workplace','Serve again. The court remembers steady service.','A settled Aurelle shift')]},
  {day:6,theme:'Rival houses',goals:[g('aurelle-6-store','market','Supply your household from the royal store for the week ahead.','A royal store purchase recorded'),g('aurelle-6-claimants','government','Learn about the claimant houses and what each one promises.','Claimant list opened','#71 claimant pledges; screen-view tracking not built','claimant-pledges','screen-view-tracking'),g('aurelle-6-chronicler','nation','Ask the court chronicler Celine Orrel about published court records.','Notable conversation started','Notables runtime switch is OFF','notables')]},
  {day:7,theme:'Your thread, held',goals:[g('aurelle-7-review','household','Look over your week of service and stores.','Household records opened','Screen-view tracking not built','screen-view-tracking'),g('aurelle-7-favor','workplace','Check your Royal Favor in the Aurelle panel on Work. Each collected service adds to it.','Royal Favor above 0 in the Aurelle plan panel (favorReward on collection)')]},
 ]},
];

const dayMs=86400000;
/** Day 1–3 overlap: firstLoopStep (lib/first-loop.ts) guides for up to 72h from enrollment. The first loop wins:
 * while it returns a step, the arc stays hidden; the arc picks up from day 2 once the first loop is finished.
 * Returns the arc day (2–7) for a citizen, or null outside the first week or for nations without an arc. */
export function firstWeekDay(input:{nationId:string;enrolledAt?:string;now:number;firstLoopActive?:boolean}):WeekDay|null{
 if(input.firstLoopActive)return null;
 const arc=firstWeekArcs.find(entry=>entry.nationId===input.nationId);
 const enrolled=Date.parse(input.enrolledAt??'');
 if(!arc||!Number.isFinite(input.now)||!Number.isFinite(enrolled)||input.now<enrolled)return null;
 const day=Math.floor((input.now-enrolled)/dayMs)+1;
 return arc.days.find(entry=>entry.day===day)??null;
}

/** Goals shown to citizens: goals that require an unbuilt feature stay hidden unless that feature is listed as available. */
export function visibleGoals(day:WeekDay,available:readonly GoalRequirement[]=[]):readonly WeekGoal[]{return day.goals.filter(goal=>!goal.requires||goal.requires.every(need=>available.includes(need)));}

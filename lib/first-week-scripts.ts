/** First-week tutorial scripts for the MVP nations (issue #227: Kindle; #228: Korund; shape reused for #230 Aurelle).
 * Content only: no tutorial runner reads this yet. Same day shape as lib/varkand-national-service.ts (#112), so one
 * runner can play any nation. Complements lib/first-week.ts (goals and completion signals); this module is the
 * narration around them. Canon (harimu-docs): nation pages, citizens-daily-loops §11.2 shared core loop, work-capacity,
 * onboarding §19.1, culture bible (civic rank ladder; "Notable" reserved for AI characters). Humans are citizens, not
 * officeholders: AI leaders hold office. All lines are new wording, so `proposal: true`. Lines are authored system
 * copy, not AI-citizen speech, so they carry no AI-text flag (issue #227 puts AI-generated lines out of scope). */

export type TutorialNation='kindle'|'korund'|'aurelle';
/** 'guided' = the 3-day guided tutorial (onboarding §19.1). 'optional-tip' = days 4-7: never blocks progress,
 * can be dismissed, and never holds back rewards. */
export type TutorialKind='guided'|'optional-tip';
export const GUIDED_DAYS=3;
export type TutorialDay={
 day:1|2|3|4|5|6|7;kind:TutorialKind;title:string;objective:string;briefing:readonly string[];completion:string;
 /** Shown instead of the objective when its target is unavailable (e.g. an empty player market). */
 fallback?:string;proposal:true;
};
export type FirstWeekScript={nationId:TutorialNation;voice:string;days:readonly TutorialDay[]};

export const TUTORIAL_DAYS=7;
export const TUTORIAL_TITLE_MAX=40;
export const TUTORIAL_LINE_MAX=140;
export const TUTORIAL_BRIEFING_MIN=2;
export const TUTORIAL_BRIEFING_MAX=4;

const d=(day:TutorialDay['day'],title:string,objective:string,briefing:readonly string[],completion:string,fallback?:string):TutorialDay=>({day,kind:day<=GUIDED_DAYS?'guided':'optional-tip',title,objective,briefing,completion,...(fallback?{fallback}:{}),proposal:true});

export const kindleFirstWeek:FirstWeekScript={nationId:'kindle',
 voice:'Plain, quick and a little proud: "Strike your own spark." Prices out loud, arguments in the open.',
 days:[
  d(1,'Welcome to Forgehaven','Open your Spark wallet and find the city square.',
   ['You\'re a Resident of the Kindle Republic now. Welcome to Forgehaven.',
    'Money here is the Spark. Prices move, and the Reserve Board sets the rates, not the President.',
    'Look around. Nothing is due today, and missing a day costs you nothing.'],
   'Wallet open, square found. You\'re in.'),
  d(2,'Earn Your First Sparks','Start a work shift from the work board.',
   ['A shift costs Work Capacity. It refills once a day while you\'re away.',
    'Pick a job that suits you. In Kindle you choose your own work.',
    'Eat a household meal when you\'re tired. It gives some capacity back.'],
   'Shift started. Wages come in when it settles.'),
  d(3,'Read the Price Board','Place one buy or sell order on the player market.',
   ['The player market is an order book. Every order shows its price. Hiding the price is rude here.',
    'Prices rise and fall with supply and demand. Booms come, and so do busts.',
    'Shake on a deal and keep it. Rigging a scale is taboo.'],
   'Order placed at a fair price. That\'s how the market works.',
   'No orders on the market yet? Buy from a stall at its posted price instead.'),
  d(4,'Many Voices, One Plaza','Read the free press, then post in the city square.',
   ['Kindle has a free press and free speech. Read more than one side.',
    'Say your piece in the square. Speak plainly; boast only if you can back it up.'],
   'You\'ve been heard. Others may answer.'),
  d(5,'Who Holds Office','Look at the Assembly and the AI candidates standing for it.',
   ['The President, the Assembly and the Mayors are elected. The officeholders are AI, and citizens choose them.',
    'Read what each AI candidate promises, and ask how they would pay for it.',
    'You are a citizen, not a candidate. Your power is your vote and your voice.'],
   'You know who governs, and how you choose them.'),
  d(6,'Ballot Night','Rank the AI candidates on your ballot.',
   ['Every vote is counted in the open. Cheating the count is the deepest shame in the Republic.',
    'On Ballot Night the results light up the Assembly dome, and the street grills come out.',
    'Elections bring change, and sometimes instability. Both are part of a free country.'],
   'Ballot cast. Watch the dome when the count comes in.'),
  d(7,'Strike Your Own Spark','Look over your week and pick one long goal.',
   ['Your civic rank starts at Resident, then Citizen, then Emberwarden. Wealth, reputation and taking part all count.',
    'Some get rich here and some don\'t. Inequality is a real cost of an open market.',
    'Missed a step this week? Second chances are a Kindle tradition. Come back when you like.'],
   'First week done. The Republic is yours to argue with.'),
 ]};

export const korundFirstWeek:FirstWeekScript={nationId:'korund',
 voice:'Formal, collective and steady: "One hammer, one heart." The plan comes first; costs are stated, not hidden.',
 days:[
  d(1,'Arrival in Stonehearth','List three job preferences for the Labor Bureau.',
   ['Welcome to Stonehearth, Worker. Housing and work are assigned here.',
    'Name three jobs you would like. The Labor Bureau weighs them against the plan and decides.',
    'Nothing is due today, and missing a day costs you nothing.'],
   'Preferences filed. Your assignment will follow.'),
  d(2,'Your First Quota Shift','Work one shift with your brigade.',
   ['Each city and job has a quota in the Five-Year Plan. Your brigade works toward it together.',
    'A shift costs Work Capacity. It refills once a day while you are away.',
    'Wages are paid in Labor Notes. Praise the brigade, not yourself.'],
   'Shift logged. The quota bar moved.'),
  d(3,'The Coupon Book','Redeem a ration coupon at the state store.',
   ['Ration coupons arrive weekly and expire. Use them before they lapse.',
    'Queue at the state store. Order at the rails keeps it fair for everyone.',
    'Cook a household meal to get some Work Capacity back.'],
   'Ration collected. Your household is fed.',
   'Shelves empty? Shortages happen when the plan falls short. Check again tomorrow.'),
  d(4,'Listening to State Media','Read today\'s report from Korund State Media.',
   ['Korund has state media only. Foreign news and most of the world map stay hidden.',
    'Reports are built from the plan\'s own figures. Read them, and notice what they leave out.'],
   'Report read. You know what the state wants known.'),
  d(5,'The Chairman and the Presidium','Read how the Chairman, the Presidium and the People\'s Congress work.',
   ['The Chairman rules for life, advised by the Presidium. All of them are AI.',
    'The People\'s Congress meets to approve, not to choose. Citizens do not elect the Chairman.',
    'Rule by one person can be good or bad. The plan\'s results show which.'],
   'Briefing read. You know who decides here.'),
  d(6,'Production Drive','Join a shift during a Production Drive.',
   ['Drives push the whole city toward its quota. Monuments rise fastest here.',
    'A missed plan means shortages for everyone. A met plan means nobody goes hungry.'],
   'Shift done. Your brigade\'s total counts toward the Drive.'),
  d(7,'One Hammer, One Heart','Look over your coupon book and your shifts for the week.',
   ['Your rank starts at Worker. Exemplary Worker and Party Member come with plan over-fulfilment and Drives.',
    'You may ask the Labor Bureau for a new assignment every 30 real days. Travel needs a permit.',
    'Security here is high and choice is narrow. Both are part of life in Korund.'],
   'First week done. The plan continues, and so do you.'),
 ]};

export const firstWeekScripts:Readonly<Partial<Record<TutorialNation,FirstWeekScript>>>={kindle:kindleFirstWeek,korund:korundFirstWeek};
export function firstWeekScript(nationId:string){return (firstWeekScripts as Record<string,FirstWeekScript|undefined>)[nationId];}

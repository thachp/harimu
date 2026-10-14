/** First-week tutorial scripts for the MVP nations (issue #227: Kindle; #230: Aurelle; shape reused for #228 Korund).
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

export const aurelleFirstWeek:FirstWeekScript={nationId:'aurelle',
 voice:'Courtly and ordered: "Every thread in its place." Rank is spoken of openly, and so is its price.',
 days:[
  d(1,'An Oath at Highspire','Take the oath to the Crown and become a Commoner of Aurelle.',
   ['Welcome to Highspire, beneath the Sky Throne. Aurelle asks an oath of those who join it.',
    'The Monarch rules by royal decree, advised by the Privy Council. The Monarch and the lords are AI.',
    'Nothing is due today, and missing a day costs you nothing.'],
   'Oath taken. You are a Commoner of the realm.'),
  d(2,'Service to Your Lord','Work one shift in service to your AI lord.',
   ['Commoners serve a lord or tend an estate. Faithful service is noticed.',
    'A shift costs Work Capacity. It refills once a day while you are away.'],
   'Service done. Your lord has seen it.'),
  d(3,'The Chartered Market','Buy or sell one good in a chartered market.',
   ['Commoners trade in chartered markets. Guild charters grant the right to trade.',
    'Coin is the Crown, gold-backed and stamped with the reigning Monarch.',
    'The Monarch may debase the coin by decree. Then old full-weight Crowns trade at a premium.'],
   'Trade done in Crowns. Mind the weight of your coin.',
   'Nothing on offer in the market today? Return after your next shift.'),
  d(4,'Reading the Gazette','Read the court gazette, then a tolerated broadsheet.',
   ['The court gazette speaks for the Crown. Some broadsheets are tolerated beside it.',
    'Criticizing the Monarch is lèse-majesté. Choose your words with care.'],
   'Gazette read. You know what the court wishes known.'),
  d(5,'Royal Favor','Learn how Royal Favor is earned and spent.',
   ['Royal Favor is earned by service, gifts, victories, audiences and verse.',
    'It is spent on petitions, ranks, estates and pardons. It fades if left untended.'],
   'You know the coin of the court.'),
  d(6,'The Kinward Rite','Visit a hall and see the Kinward name-stones.',
   ['The Kinward Rite is the state church. The Monarch is Keeper of the Hearth.',
    'Other faiths may worship privately. Commoner dissenters pay a levy set by decree.',
    'On Hearth Night, the Rite blesses the houses of the realm.'],
   'Hall visited. You have seen the stones of the great houses.'),
  d(7,'Every Thread in Its Place','Look over your week and your standing.',
   ['Your rank starts at Commoner. Freeholder, Knight and Baron are open to citizens, with estates but no jurisdiction.',
    'Counts, Dukes, the Privy Council and the Monarch are AI. Birth and favor set much of who rises.',
    'Rank brings honor and limits alike. Wear no higher than your rank.'],
   'First week done. Your thread is in its place, for now.'),
 ]};

export const firstWeekScripts:Readonly<Partial<Record<TutorialNation,FirstWeekScript>>>={kindle:kindleFirstWeek,aurelle:aurelleFirstWeek};
export function firstWeekScript(nationId:string){return (firstWeekScripts as Record<string,FirstWeekScript|undefined>)[nationId];}

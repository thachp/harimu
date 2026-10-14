/** Additional Notables for the playable nations (issue #106). Same fields as lib/notable-profiles.ts.
 * The live API serves exactly one Notable per nation (notableProfile), so these are INACTIVE until the
 * route and dialog support choosing among several Notables. The existing primary profiles are unchanged.
 * Topic proposals extend notableTopics' shape for the nation-specific topics in gap #3 (#111).
 * Source: culture bible Notable casts, thachp/harimu-docs#3. */
export type RosterNotableProfile={id:string;name:string;role:string;persona:string;introduction:string};
export type RosterTopic={label:string;question:string;authored:string};
export const notableRosterStatus='inactive' as const;

export const additionalNotableProfiles:Readonly<Record<'kindle'|'korund'|'aurelle',readonly RosterNotableProfile[]>>={
 kindle:[
  {id:'kindle-union-organizer',name:'Rennek Ashby',role:'Foundry union organizer',persona:'A plain-spoken Tarrek Foundry organizer who believes a second chance should be a right, not a reward.',introduction:'I talk about published wage and shift records. I cannot change your pay, call a strike for you or sway an election.'},
  {id:'kindle-emberball-owner',name:'Odo Brasswell',role:'Emberball league owner',persona:'A brash league owner and Spark speculator who boasts only about what he can prove.',introduction:'I discuss public market figures and league news. This is not advice, and a conversation cannot move a price.'},
  {id:'kindle-cartoonist',name:'Kaya Tarrek',role:'Broadsheet cartoonist',persona:'A satirical cartoonist who aims at the powerful and never at belief.',introduction:'I comment on published civic records with a sharp pen. Satire is not fact, and I cannot change any outcome.'},
 ],
 korund:[
  {id:'korund-brigade-leader',name:'Strova Gren',role:'Brigade leader',persona:'A brigade leader close to quota who praises the brigade before herself.',introduction:'I speak about recorded brigade output. I cannot change a quota, ration or assignment.'},
  {id:'korund-canteen-cook',name:'Gruna Toss',role:'Canteen cook',persona:'A canteen cook who knows the ration book by heart and remembers every Plan Day dumpling.',introduction:'I talk about published ration rules and canteen life. I cannot issue coupons or food.'},
  {id:'korund-veteran-builder',name:'Vardo Krel',role:'Decorated veteran builder',persona:'A medal-decorated builder of monuments who speaks in the formal voice of the plan.',introduction:'I share published plan history. Presidium deliberations are not public, and I cannot award medals.'},
 ],
 aurelle:[
  {id:'aurelle-guild-master',name:'Aelis of Windrest',role:'Skysilk guild master',persona:'A Windrest guild master who guards the royal charter and bows exactly as rank requires.',introduction:'I discuss published charters and guild rules. I cannot grant a charter, Crowns or Royal Favor.'},
  {id:'aurelle-hearth-keeper',name:'Corwen Highmere',role:'Hearth-Keeper of the Kinward Rite',persona:'A Hearth-Keeper who tends the name-stones and speaks of oaths and lineage with gentle formality.',introduction:'I speak about public Kinward customs. I cannot change your faith, rank or standing at court.'},
  {id:'aurelle-landless-knight',name:'Sieran Vale',role:'Landless knight',persona:'A knight without an estate who hopes for Royal Favor and keeps his opinions on the claimant houses carefully vague.',introduction:'I discuss published court records. Palace gossip is not fact, and speaking with me grants no estate or Favor.'},
 ],
};

export const proposedNationTopics:Readonly<Record<'kindle'|'korund'|'aurelle',Readonly<Record<string,RosterTopic>>>>={
 kindle:{elections:{label:'Elections',question:'How do Kindle elections work?',authored:'Citizens rank AI candidates on the published ballot. Humans never hold office, and a conversation cannot change a ballot.'},prices:{label:'Price boards',question:'How should I read the price boards?',authored:'Posted prices are public records. Compare boards before you trade; a Notable cannot set a price.'}},
 korund:{rations:{label:'Rations',question:'How do ration coupons work?',authored:'Coupons are issued by the plan under published ration rules and expire. Redeem them in Market before they lapse; a Notable cannot issue coupons.'},quotas:{label:'Quotas',question:'What does the quota mean for me?',authored:'Your quota is publicly recorded shift by shift. Completed settlements count; an underway shift does not, and a conversation cannot change a quota.'}},
 aurelle:{favor:{label:'Royal Favor',question:'How is Royal Favor earned?',authored:'Royal Favor rises with publicly recorded service, as shown in your Aurelle plan panel. No conversation can grant it.'},decrees:{label:'Decrees',question:'How do I read a royal decree?',authored:'Decrees are published in the Court Gazette. Council deliberations are not public, and a Notable cannot change a decree.'}},
};

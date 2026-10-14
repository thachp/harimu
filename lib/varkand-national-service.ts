/** Varkand National Service recruit term, scripted as the 7-day tutorial (issue #112). Content only: not yet read by
 * any onboarding screen; wiring is a follow-up. Canon (harimu-docs content/world/nations/varkand.mdx, culture bible §8,
 * citizens-daily-loops, §15.4): a new citizen's first 7 real days are a recruit term that doubles as the tutorial; then
 * reservist; never combat-deployable in the first 14 real days or while dormant. The copy must not glorify military rule:
 * it is civic and matter-of-fact, and names the costs (levy, requisition, Alert Level limits, exit permits).
 * Places, institutions, festivals and Alert Levels are canon. Day titles, objectives and lines are new wording and carry
 * `proposal: true` until accepted into the docs (culture bible thachp/harimu-docs#3 convention). No personal names. */

export type NationalServiceDay={
 day:1|2|3|4|5|6|7;title:string;objective:string;briefing:readonly string[];completion:string;proposal:boolean;
};

export const NATIONAL_SERVICE_TERM_DAYS=7;
export const NEWCOMER_SHIELD_DAYS=14;
export const SERVICE_TITLE_MAX=40;
export const SERVICE_LINE_MAX=140;
export const SERVICE_BRIEFING_MIN=2;
export const SERVICE_BRIEFING_MAX=4;

/** Canon names this script may use. Tests check every capitalized place/institution term against this list. */
export const VARKAND_CANON_TERMS=['Varkand','Watchfast','Voren Light','Moorhald','Dunkar Pass','Vett Crossing','Directorate',
 'Directorate Bastion','Chaplaincy Corps','Arsenal','Arsenal Combines','Cabinet of Technocrats','Mandate Plebiscite','Muster Day',
 'Rotation Day','Lantern Watch','Ward','Field Scrip','Green','Amber','Red','Hazequartz','National Service','Peat Commons'] as const;

export const nationalServiceDays:readonly NationalServiceDay[]=[
 {day:1,title:'Intake at Watchfast',proposal:true,
  objective:'Register at the intake desk and receive your service card.',
  briefing:['Recruit. Your term is seven days. It is also your introduction to Varkand.',
   'Today you register, draw kit and learn where things are. No drills yet.',
   'You will not be sent into combat during your first 14 days. That is the law, not a favor.'],
  completion:'Registered. Service card issued. Get some sleep.'},
 {day:2,title:'Reading the Alert Level',proposal:true,
  objective:'Check today\'s Alert Level and read what it changes for you.',
  briefing:['Every badge, note and bulletin shows the Alert Level: Green, Amber or Red.',
   'Green means licensed press and few checks. Amber brings checkpoints and curfew on public squares.',
   'Red means martial law and movement by order only. Know which day you are living in.'],
  completion:'Alert Level read. You know what today allows and what it does not.'},
 {day:3,title:'First Shift',proposal:true,
  objective:'Work one shift at Moorhald\'s Peat Commons or a Voren Light lens shop.',
  briefing:['Service pays in Field Scrip. It is redeemable for Wards later, not at once.',
   'Civilian shops pay a security levy and can be requisitioned at fixed prices. Their owners will tell you what that costs them.',
   'Do the work, then ask the shopkeeper how the month went.'],
  completion:'Shift logged. Scrip paid. You have seen both sides of the ledger.'},
 {day:4,title:'Fog Orienteering',proposal:true,
  objective:'Find three signal posts on the moor using map and foghorn schedule.',
  briefing:['Fog orienteering is training and sport. It teaches you the ground and the foghorn hours.',
   'Go with a partner. Nobody here is scored for bravery.',
   'Your unit will give you a call sign today. Most people keep it for life.'],
  completion:'Three posts found. Call sign recorded on your card.'},
 {day:5,title:'Chapel and Choice',proposal:true,
  objective:'Visit a garrison chapel and learn how the Chaplaincy Corps registers faiths.',
  briefing:['Varkand has no state faith. Every congregation registers with the Chaplaincy Corps.',
   'You may hold any faith or none. At Red, public gatherings shrink to private worship.',
   'Registration is a record the state keeps about you. Decide what you share.'],
  completion:'Chapel visited. Your faith entry is yours to make or leave blank.'},
 {day:6,title:'Who Governs',proposal:true,
  objective:'Read how the Directorate rules and how the Mandate Plebiscite can reject it.',
  briefing:['The Directorate of the Five Commands governs. The Chair rotates every 60 real days unless four Marshals vote to extend.',
   'Every 150 real days the Mandate Plebiscite asks you to approve or reject the Directorate\'s Order. Your vote counts.',
   'Coups happen here. Statues get recast. Order has a price, and citizens pay part of it.'],
  completion:'Briefing read. You know who rules, and how citizens can say no.'},
 {day:7,title:'End of Term',proposal:true,
  objective:'Attend the term-end muster and choose your next step as a reservist.',
  briefing:['Your recruit term ends today. You become a reservist.',
   'Reservists are not deployed in their first 14 days, nor while away from the game.',
   'From here you can apply for the ranks, take civilian work, or apply for an exit permit. Each choice has costs.'],
  completion:'Term complete. You are a reservist and a citizen of Varkand. The choice of what comes next is yours.'},
];

export function nationalServiceDay(day:number){return nationalServiceDays.find(d=>d.day===day);}

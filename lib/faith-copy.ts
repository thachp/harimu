/** Player-facing copy for the six world faiths (issue #114). Content only: not yet read by any faith screen; wiring is a
 * follow-up with the faith attribute work (#67). Names, teachings, clergy, festivals and holy sites restate
 * harimu-docs content/religion/religion-faiths.mdx §14.1 without change. Practice lines and one-line festival blurbs are new
 * wording and carry `proposal: true` until accepted into the docs (culture bible thachp/harimu-docs#3 convention).
 * §14.9: every faith is invented, presented with respect, and the codex note says so. Korund copy stays low-key (§14.6). */

export type FaithId='lumen-canon'|'kinward-rite'|'the-round'|'fair-wind-vow'|'quiet-path'|'open-hand';
export type FaithPractice={text:string;proposal:boolean};
export type FaithFestival={name:string;blurb:string;proposal:boolean};
export type FaithCopy={
 id:FaithId;name:string;archetype:string;tagline:string;description:string;practices:readonly FaithPractice[];
 clergy:readonly string[];festivals:readonly FaithFestival[];holySite:string;proposal:boolean;
};

export const FAITH_INVENTED_NOTE='An invented faith of the world of Harimu. It is not based on any real religion.';
export const FAITH_DESCRIPTION_MAX=200;
export const FAITH_LINE_MAX=120;

export const faithCopy:Readonly<Record<FaithId,FaithCopy>>={
 'lumen-canon':{id:'lumen-canon',name:'Lumen Canon',archetype:'Hierarchical, scriptural faith',proposal:false,
  tagline:'Be a clear vessel.',
  description:'Truth is light passing through a clear vessel. A life of honesty, duty and clarity lets the light through. Headed worldwide by Ilmar\'s Supreme Oracle.',
  practices:[{text:'Keep the Daily Vigil.',proposal:true},{text:'Rest and reflect on the weekly Stilldays.',proposal:true},{text:'Make the pilgrimage to the Prism Spire.',proposal:true}],
  clergy:['Lamplighters','Glaziers','Wardens','Lumen-Masters'],
  festivals:[{name:'Long Light',blurb:'A midsummer vigil kept from dusk until the light returns.',proposal:true},
   {name:'Clearing',blurb:'The new year opens with a renewal of vows.',proposal:true}],
  holySite:'Prism Spire, Mirrorhall (Ilmar)'},
 'kinward-rite':{id:'kinward-rite',name:'Kinward Rite',archetype:'Ancestor and lineage veneration',proposal:false,
  tagline:'Keep your oaths and your name.',
  description:'The living are stewards between those who came before and those who come after. Each household keeps a hearth with carved name-stones.',
  practices:[{text:'Tend the household hearth and its name-stones.',proposal:true},{text:'Mark births, marriages, deaths and oath-takings with the rites.',proposal:true}],
  clergy:['Hearth-Keepers','Name-Readers'],
  festivals:[{name:'Night of Names',blurb:'Households read the names on their stones aloud in remembrance.',proposal:true},
   {name:'Oath Day',blurb:'Oaths are spoken again before the hearth.',proposal:true}],
  holySite:'Hearth of First Names, Highspire (Aurelle)'},
 'the-round':{id:'the-round',name:'The Round',archetype:'Seasonal folk faith',proposal:false,
  tagline:'All things turn and return.',
  description:'Live in step with the seasons and the community. Circle-Elders are chosen by lot, and the Round has no central head.',
  practices:[{text:'Gather in the open-air circle at each season\'s turn.',proposal:true},{text:'Raise painted season-posts.',proposal:true}],
  clergy:['Circle-Elders'],
  festivals:[{name:'Turning Days',blurb:'At each of the four seasons, every 7.5 real days, the circle gathers to mark the turn.',proposal:true}],
  holySite:'The Old Ring, Veldwood'},
 'fair-wind-vow':{id:'fair-wind-vow',name:'Fair-Wind Vow',archetype:'Patron devotion of travelers and traders',proposal:false,
  tagline:'Honest Measure, Safe Return, Good Fortune.',
  description:'A company of patron virtues watches over those who travel and trade fairly. Chapels stand in the ports.',
  practices:[{text:'Take a vow before a voyage or a deal.',proposal:true},{text:'Offer votive ship models in the chapels in ports.',proposal:true}],
  clergy:['Harbor Chaplains','Pilots'],
  festivals:[{name:'Launching',blurb:'The sailing season opens with vows at the waterline.',proposal:true},
   {name:'Safe Return',blurb:'Crews and traders give thanks for every voyage that came home.',proposal:true}],
  holySite:'Harbor of Vows, Arcport (Fulmara)'},
 'quiet-path':{id:'quiet-path',name:'The Quiet Path',archetype:'Contemplative, non-theistic practice',proposal:false,
  tagline:'Attention can be trained.',
  description:'Attention, restraint and compassion can be trained, and no god is required. It may be held alongside one other faith.',
  practices:[{text:'Keep a daily stillness practice.',proposal:true},{text:'Go on retreat.',proposal:true}],
  clergy:['Teachers'],
  festivals:[{name:'Still Week',blurb:'A week given to retreat and quiet.',proposal:true},
   {name:'Lantern of Attention',blurb:'A single lantern is kept in view, and the mind returns to it.',proposal:true}],
  holySite:'High Retreat, Korund\'s mountains (closed unless Korund grants access)'},
 'open-hand':{id:'open-hand',name:'The Open Hand',archetype:'Universalist charity movement',proposal:false,
  tagline:'What you hold is held in trust.',
  description:'All are equal before the Giver, and what you hold is held in trust for those in need. A strong voice for the poor, sometimes for strikes and reform.',
  practices:[{text:'Serve in the bread halls.',proposal:true},{text:'Give alms.',proposal:true}],
  clergy:['Almoners','Stewards'],
  festivals:[{name:'Bread Day',blurb:'Bread halls feed everyone who comes.',proposal:true},
   {name:'Day of the Open Door',blurb:'Halls and homes open their doors to neighbors and strangers.',proposal:true}],
  holySite:'Bread Hall, Meetwater (Confluence)'},
};

export const unaffiliatedCopy={name:'Unaffiliated',description:'No faith. A valid choice everywhere. Civic holidays only.'} as const;

/** Korund (§14.6): the only public option is Unaffiliated. Kept abstract and optional; never tutorial, store or marketing copy. */
export const korundFaithCopy={
 publicChoice:'Unaffiliated is the only public option in Korund.',
 hiddenFaithHint:'A faith may be held privately. It is optional and stays in the background.',
 inspectionNotice:'An inspection found a shrine.',
} as const;

export function faithFestivals(id:FaithId){return faithCopy[id].festivals.map(f=>f.name);}

/* ---- Issue #251: clergy roles, congregation actions and Devotion tiers for the 3 MVP faiths, plus Korund underground
 * copy. Content only: mechanics are #224. Role names come from §14.1; services restate §14.4 (clergy lead services,
 * festivals, weddings and funerals, run charity and counsel members). Devotion copy names only social rewards
 * (festival roles, morale, standing in the congregation) and never a production or combat benefit (§14.4 design rule).
 * Korund copy follows §14.6 low-key rules: quiet, abstract discovery, no arrest, violence or desecration, no believer
 * named, never tutorial, store or marketing copy. All wording below is new, so `proposal: true`. */

export type MvpFaithId='kinward-rite'|'fair-wind-vow'|'open-hand';
export const MVP_FAITHS:readonly MvpFaithId[]=['kinward-rite','fair-wind-vow','open-hand'];
export type ClergyRoleCopy={title:string;description:string;proposal:true};
export type CongregationActionKind='service'|'rite'|'charity'|'festival';
export type CongregationActionCopy={kind:CongregationActionKind;name:string;line:string;proposal:true};
export type DevotionTierCopy={min:number;max:number;label:string;line:string;proposal:true};

export const CLERGY_TITLE_MAX=32;
export const CLERGY_DESCRIPTION_MAX=200;
export const ACTION_NAME_MAX=32;

const role=(title:string,description:string):ClergyRoleCopy=>({title,description,proposal:true});
const act=(kind:CongregationActionKind,name:string,line:string):CongregationActionCopy=>({kind,name,line,proposal:true});
const tier=(min:number,max:number,label:string,line:string):DevotionTierCopy=>({min,max,label,line,proposal:true});

export const clergyRoleCopy:Readonly<Record<MvpFaithId,readonly ClergyRoleCopy[]>>={
 'kinward-rite':[
  role('Hearth-Keeper','Keeps the congregation\'s hearth and leads its rites of birth, marriage, death and oath-taking. Counsels members.'),
  role('Name-Reader','Reads the names on the name-stones at rites and remembrance, so that no name is forgotten.')],
 'fair-wind-vow':[
  role('Harbor Chaplain','Leads services in the port chapel and hears vows before voyages and deals. Counsels members.'),
  role('Pilot','Guides travelers and traders through their vows of Honest Measure, Safe Return and Good Fortune.')],
 'open-hand':[
  role('Almoner','Runs the bread hall and gives alms to those in need. Leads services and counsels members.'),
  role('Steward','Keeps what the congregation holds in trust for those in need, and speaks for the poor.')],
};

export const congregationActionCopy:Readonly<Record<MvpFaithId,readonly CongregationActionCopy[]>>={
 'kinward-rite':[
  act('service','Hearth Gathering','Gather at the household hearth and its name-stones.'),
  act('rite','Oath-Taking','Speak an oath before the hearth and keep it.'),
  act('charity','Tend the Name-Stones','Help a household keep its hearth and name-stones.'),
  act('festival','Night of Names Reader','Read names aloud on the Night of Names.')],
 'fair-wind-vow':[
  act('service','Chapel Service','Attend a service in the port chapel.'),
  act('rite','Vow Before a Voyage','Make a vow before a voyage or a deal.'),
  act('charity','Votive Ship Model','Leave a votive ship model in the chapel.'),
  act('festival','Launching Crew','Take a part in the Launching at the start of sailing season.')],
 'open-hand':[
  act('service','Open Hand Service','Attend a service with the congregation.'),
  act('rite','Give Alms','Give alms to someone in need.'),
  act('charity','Bread Hall Shift','Serve a shift in the bread hall.'),
  act('festival','Bread Day Server','Serve bread to all comers on Bread Day.')],
};

/** Four tiers over Devotion 0-100. Shared across the three faiths; social rewards only. */
export const devotionTierCopy:readonly DevotionTierCopy[]=[
 tier(0,24,'Newcomer','You are welcome at services. Devotion grows with worship, festivals, charity and service.'),
 tier(25,49,'Member','The congregation knows your face. You can take small festival roles.'),
 tier(50,74,'Devoted','Your standing in the congregation is high. You may be asked to serve.'),
 tier(75,100,'Pillar','The congregation looks to you. Devotion slowly fades if you step away.'),
];
export function devotionTier(devotion:number){const d=Math.min(100,Math.max(0,Math.round(devotion)));return devotionTierCopy.find(t=>d>=t.min&&d<=t.max)!;}

/** Korund underground copy (§14.6). Quiet and abstract; no believer is ever named. */
export const korundUndergroundCopy={
 hiddenShrine:{name:'Hidden Shrine',description:'A small home shrine, kept out of sight. It lets you practice privately and meet with others in secret.',proposal:true},
 congregationLines:[
  {text:'A few people meet quietly. Nothing is written down.',proposal:true},
  {text:'The meeting ends early. Everyone leaves one at a time.',proposal:true},
  {text:'A quiet word is shared, then the room is empty again.',proposal:true},
  {text:'No one speaks of it at work the next day.',proposal:true},
 ],
 discovery:{
  first:{text:'An inspection found a shrine. Suspicion was recorded.',proposal:true},
  repeat:{text:'An inspection found a shrine again. Correction Duty may follow, for up to 7 days.',proposal:true},
 },
 /* ---- Issue #322 (companion to #295): the private underground worship action, the citizen's raid warning, the
  * quiet-week line and State Media rumor lines. The raid RESULT for the citizen reuses `discovery.first` / `discovery.repeat`
  * above; `raidResult.devotionNote` is the one added line, because those notices say nothing about Devotion and #295 gives a
  * raid a small Devotion hit. Everything is private to the citizen except `stateMediaRumors`, which names no faith, shrine,
  * person or figure, only {city}. No raid cap, Devotion amount or other number appears (those stay in #295). Player-facing
  * lines say "inspection", not "raid", to match the §14.6 abstract-discovery rule. */
 worshipAction:{
  label:'Worship quietly',
  confirmation:{text:'You worshipped in private. Nothing is posted.',proposal:true},
  alreadyToday:{text:'You have already worshipped today. Try again tomorrow.',proposal:true},
  proposal:true,
 },
 raidWarning:[
  {text:'Word is that an inspection may come to {city}. Keep your practice quiet.',proposal:true},
  {text:'An inspection may be near. Stay quiet and out of sight.',proposal:true},
 ],
 raidResult:{
  devotionNote:{text:'Your Devotion fell a little.',proposal:true},
  proposal:true,
 },
 quietWeek:[
  {text:'Your city was quiet this week.',proposal:true},
  {text:'It was a quiet week in {city}. No inspection came.',proposal:true},
 ],
 stateMediaRumors:[
  {text:'Korund State Media: an inspection in {city} has concluded. Order is kept.',proposal:true},
  {text:'A routine inspection passed through {city}. The plan advances.',proposal:true},
  {text:'Korund State Media reports a calm inspection in {city}. All is orderly.',proposal:true},
 ],
} as const;

/** #322: length limits, the one placeholder, and the State Media byline (canon, lib/press-templates.ts korundStateMedia.byline).
 * {city} is a pre-formatted city name, capped at 24 characters (COUP_NAME_MAX in lib/palace-coup-copy.ts; the test fills to it). */
export const UNDERGROUND_PLACEHOLDERS=['{city}'] as const;
export const UNDERGROUND_LABEL_MAX=40;
export const UNDERGROUND_LINE_MAX=140;
export const UNDERGROUND_BYLINE={name:'Korund State Media',proposal:false} as const;

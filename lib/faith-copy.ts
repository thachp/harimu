/** Player-facing copy for the six world faiths (issue #114). Content only: not yet read by any faith screen; wiring is a
 * follow-up with the faith attribute work (#67). Names, teachings, clergy, festivals and holy sites restate
 * harimu-docs content/religion/religion-faiths.mdx §14.1 without change. One-line festival and practice blurbs are new
 * wording and carry `proposal: true` until accepted into the docs (culture bible thachp/harimu-docs#3 convention).
 * §14.9: every faith is invented, presented with respect, and the codex note says so. Korund copy stays low-key (§14.6). */

export type FaithId='lumen-canon'|'kinward-rite'|'the-round'|'fair-wind-vow'|'quiet-path'|'open-hand';
export type FaithFestival={name:string;blurb:string;proposal:boolean};
export type FaithCopy={
 id:FaithId;name:string;archetype:string;tagline:string;description:string;practices:readonly string[];
 clergy:readonly string[];festivals:readonly FaithFestival[];holySite:string;proposal:boolean;
};

export const FAITH_INVENTED_NOTE='An invented faith of the world of Harimu. It is not based on any real religion.';
export const FAITH_DESCRIPTION_MAX=200;
export const FAITH_LINE_MAX=120;

export const faithCopy:Readonly<Record<FaithId,FaithCopy>>={
 'lumen-canon':{id:'lumen-canon',name:'Lumen Canon',archetype:'Hierarchical, scriptural faith',proposal:false,
  tagline:'Be a clear vessel.',
  description:'Truth is light passing through a clear vessel. A life of honesty, duty and clarity lets the light through. Headed worldwide by Ilmar\'s Supreme Oracle.',
  practices:['Keep the Daily Vigil.','Rest and reflect on the weekly Stilldays.','Make the pilgrimage to the Prism Spire.'],
  clergy:['Lamplighters','Glaziers','Wardens','Lumen-Masters'],
  festivals:[{name:'Long Light',blurb:'A midsummer vigil kept from dusk until the light returns.',proposal:true},
   {name:'Clearing',blurb:'The new year opens with a renewal of vows.',proposal:true}],
  holySite:'Prism Spire, Mirrorhall (Ilmar)'},
 'kinward-rite':{id:'kinward-rite',name:'Kinward Rite',archetype:'Ancestor and lineage veneration',proposal:false,
  tagline:'Keep your oaths and your name.',
  description:'The living are stewards between those who came before and those who come after. Each household keeps a hearth with carved name-stones.',
  practices:['Tend the household hearth and its name-stones.','Mark births, marriages, deaths and oath-takings with the rites.'],
  clergy:['Hearth-Keepers','Name-Readers'],
  festivals:[{name:'Night of Names',blurb:'Households read the names on their stones aloud in remembrance.',proposal:true},
   {name:'Oath Day',blurb:'Oaths are spoken again before the hearth.',proposal:true}],
  holySite:'Hearth of First Names, Highspire (Aurelle)'},
 'the-round':{id:'the-round',name:'The Round',archetype:'Seasonal folk faith',proposal:false,
  tagline:'All things turn and return.',
  description:'Live in step with the seasons and the community. Circle-Elders are chosen by lot, and the Round has no central head.',
  practices:['Gather in the open-air circle at each season\'s turn.','Paint the season-posts.'],
  clergy:['Circle-Elders'],
  festivals:[{name:'Turning Days',blurb:'At each of the four seasons, every 7.5 real days, the circle gathers to mark the turn.',proposal:true}],
  holySite:'The Old Ring, Veldwood'},
 'fair-wind-vow':{id:'fair-wind-vow',name:'Fair-Wind Vow',archetype:'Patron devotion of travelers and traders',proposal:false,
  tagline:'Honest Measure, Safe Return, Good Fortune.',
  description:'A company of patron virtues watches over those who travel and trade fairly. Chapels stand in the ports.',
  practices:['Take a vow before a voyage or a deal.','Leave a votive ship model at a harbor chapel.'],
  clergy:['Harbor Chaplains','Pilots'],
  festivals:[{name:'Launching',blurb:'The sailing season opens with vows at the waterline.',proposal:true},
   {name:'Safe Return',blurb:'Crews and traders give thanks for every voyage that came home.',proposal:true}],
  holySite:'Harbor of Vows, Arcport (Fulmara)'},
 'quiet-path':{id:'quiet-path',name:'The Quiet Path',archetype:'Contemplative, non-theistic practice',proposal:false,
  tagline:'Attention can be trained.',
  description:'Attention, restraint and compassion can be trained, and no god is required. It may be held alongside one other faith.',
  practices:['Keep a daily stillness practice.','Go on retreat.'],
  clergy:['Teachers'],
  festivals:[{name:'Still Week',blurb:'A week given to retreat and quiet.',proposal:true},
   {name:'Lantern of Attention',blurb:'A single lantern is kept in view, and the mind returns to it.',proposal:true}],
  holySite:'High Retreat, Korund\'s mountains (closed unless Korund grants access)'},
 'open-hand':{id:'open-hand',name:'The Open Hand',archetype:'Universalist charity movement',proposal:false,
  tagline:'What you hold is held in trust.',
  description:'All are equal before the Giver, and what you hold is held in trust for those in need. A strong voice for the poor.',
  practices:['Serve in the bread halls.','Give alms.'],
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

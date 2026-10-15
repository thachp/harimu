/** Ambient AI-citizen chatter lines for the Wave 2 Early Access nations, Confluence and Hoarvale (issue #373, in the shape of
 * #117's lib/ambient-chatter.ts, whose header says the other nations get chatter when their Early Access wave opens). Content
 * only: not read by any city or square screen, and nothing in app/ or components/ imports it. Voice follows each nation page
 * (Culture: food, holidays, etiquette) and culture bible §2 and §7 (Everyday life, Voice), thachp/harimu-docs#3. Every line is
 * spoken by an AI citizen, so it is flagged `aiText: true` with provenance 'deterministic' to match AiTextTag
 * (app/ai-disclosure.tsx): these lines are authored, not model output. All lines are new wording, so `proposal: true`.
 * Opt-out: players can hide ambient AI chatter (citizens-daily-loops "Opt-out of AI chatter"); wave2Chatter() returns nothing when
 * hidden. Confluence lines never mock the Four Pillars (soft, collective "we", indirect disagreement). Hoarvale lines never insult
 * the Sovereign (understatement and dry wit; the government may be teased, the Crown is not). Festival contexts use the canon
 * festival names only. No real people, no real-world references, no named speakers. */

export type Wave2ChatterNation='confluence'|'hoarvale';
/** Optional context a line depends on. Untagged lines are generic. Data only: no matching logic yet. Same tags as lib/ambient-chatter.ts. */
export type Wave2ChatterContext='day'|'night'|`festival:${string}`;
export type Wave2ChatterLine={id:string;nation:Wave2ChatterNation;text:string;context?:Wave2ChatterContext;aiText:true;provenance:'deterministic';proposal:true};

export const WAVE2_CHATTER_NATIONS:readonly Wave2ChatterNation[]=['confluence','hoarvale'];
export const WAVE2_CHATTER_MIN_PER_NATION=20;
export const WAVE2_CHATTER_LINE_MAX=80;
/** Canon festival names from each nation page (Culture > Holidays & festivals). Registered-faith days are not listed. */
export const WAVE2_FESTIVALS:Readonly<Record<Wave2ChatterNation,readonly string[]>>={
 confluence:['Congress Lanterns','Canal Festival','Quota Day'],
 hoarvale:['Opening of the Moot','Honors List Day','Aurora Night','Election Night'],
};

type Raw={id:string;nation:Wave2ChatterNation;text:string};
const c=(n:string,text:string):Raw=>({id:`confluence-${n}`,nation:'confluence',text});
const h=(n:string,text:string):Raw=>({id:`hoarvale-${n}`,nation:'hoarvale',text});
const raw:readonly Raw[]=[
 c('01','The common bowl is warm. We eat when everyone has a seat.'),
 c('02','Perhaps the canal could flow a little better. Just a question.'),
 c('03','We read the profit shares aloud tonight. Bring your spoon.'),
 c('04','Delta fish and jade rice again. We are not complaining.'),
 c('05','A question for the current: who keeps the sluice gate?'),
 c('06','Do not waste the water. The terraces below are listening.'),
 c('07','Our cooperative votes on its manager this season.'),
 c('08','The rain hats are out. The canals will be full by noon.'),
 c('09','Quota Day is near. Polish the ledgers and the bowls.'),
 c('10','The lanterns are being strung for the Canal Festival.'),
 c('11','Every stream finds the sea, if we dig together.'),
 c('12','River-pearl soup for the whole table. Pass it round.'),
 c('13','The price board stayed inside its band today. Good.'),
 c('14','Speak of the group first, and of yourself last.'),
 c('15','The waterwheel hums. The cooperative is awake.'),
 c('16','The bread hall fed the delta workers again at dawn.'),
 c('17','Our meeting house hung its registration plaque with pride.'),
 c('18','Congress Lanterns float one per delegate. Ours burned longest.'),
 c('19','The terraces glow green after the rain. We did that together.'),
 c('20','Leftover rice goes in the shared pot. Nothing is wasted.'),
 c('21','Moonlight on the canal. The ledgers can wait until morning.'),
 c('22','Some say the Assembly ballot is only a ripple. We vote anyway.'),
 h('01','Take a number and take your time. Everyone gets a turn.'),
 h('02','A fine morning for a queue. Mind the wool coats.'),
 h('03','The coalition holds. Mostly. Possibly until lunch.'),
 h('04','Coalitions are built in the steam, they say. Bring a towel.'),
 h('05','Cured fish and rye bread. The only sound policy.'),
 h('06','The Moot sits again today. Tea for the lobbies.'),
 h('07','Not bad, as the saying goes. Which means rather good.'),
 h('08','My Trading House pays well and promotes slowly. So be it.'),
 h('09','Frostcore berries in the pantry. Winter can come.'),
 h('10','Honors sashes are for state days. Bragging about them is poor form.'),
 h('11','Aurora Night is coming. Keep the bathhouse stove lit.'),
 h('12','Question Time ran long again. The queue held, as it should.'),
 h('13','The young ask when their turn comes. We say: soon, take a number.'),
 h('14','Bathhouse broth after the count party. Quite enough excitement.'),
 h('15','A fjord wind and a warm coat. No need to complain.'),
 h('16','The Crown House waves from the balcony. Very nicely done.'),
 h('17','Election Night, then the count party. We queue for the broth.'),
 h('18','Silver clasp polished. The Moot opens soon.'),
 h('19','The Rime is steady. We shall not mention it again.'),
 h('20','Tenure has its rewards. Mine arrive in a decade or two.'),
 h('21','One does not shout in a queue. One sighs, politely.'),
 h('22','The Opening of the Moot was fine. The tea was better.'),
];

const CONTEXT:Readonly<Record<string,Wave2ChatterContext>>={
 'confluence-08':'day','confluence-09':'festival:Quota Day','confluence-10':'festival:Canal Festival','confluence-18':'festival:Congress Lanterns','confluence-21':'night',
 'hoarvale-02':'day','hoarvale-11':'festival:Aurora Night','hoarvale-14':'night','hoarvale-17':'festival:Election Night','hoarvale-22':'festival:Opening of the Moot',
};

export const wave2ChatterLines:readonly Wave2ChatterLine[]=raw.map(l=>({...l,...(CONTEXT[l.id]?{context:CONTEXT[l.id]}:{}),aiText:true,provenance:'deterministic',proposal:true}));

/** Lines for a nation, or none when the player has hidden AI chatter (future display-preferences setting). */
export function wave2Chatter(nation:string,opts:{hideAiChatter?:boolean}={}):readonly Wave2ChatterLine[]{
 if(opts.hideAiChatter)return [];
 return wave2ChatterLines.filter(l=>l.nation===nation);
}

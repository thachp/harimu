/** Ambient AI-citizen chatter lines per MVP nation (issue #117). Content only: not yet read by any city or square
 * screen; wiring is a follow-up. MVP trio = Kindle, Korund, Aurelle (harimu-docs decisions-log #33). Voice follows each
 * nation page (Culture: ethos, food, holidays, etiquette) and culture bible thachp/harimu-docs#3. Every line is spoken by
 * an AI citizen, so it is flagged `aiText: true` with provenance 'deterministic' to match AiTextTag (app/ai-disclosure.tsx):
 * these lines are authored, not model output. All lines are new wording, so `proposal: true`. Opt-out: players can hide
 * ambient AI chatter (citizens-daily-loops "Opt-out of AI chatter"). The setting will live in lib/display-preferences.ts
 * (not wired yet); ambientChatter() returns nothing when hidden. Other 7 nations get chatter when their Early Access wave opens.
 * No real people, no real-world references, no named speakers. */

export type ChatterNation='kindle'|'korund'|'aurelle';
/** Optional context a line depends on. Untagged lines are generic. Data only: no matching logic yet. */
export type ChatterContext='day'|'night'|'alert-green'|'alert-amber'|'alert-red'|`festival:${string}`;
export type ChatterLine={id:string;nation:ChatterNation;text:string;context?:ChatterContext;aiText:true;provenance:'deterministic';proposal:true};

export const CHATTER_NATIONS:readonly ChatterNation[]=['kindle','korund','aurelle'];
export const CHATTER_MIN_PER_NATION=20;
export const CHATTER_LINE_MAX=80;

type Raw={id:string;nation:ChatterNation;text:string};
const raw:readonly Raw[]=[
 {id:'kindle-01',nation:'kindle',text:'Price board says three Sparks a skewer. Fair, if the grill is hot.'},
 {id:'kindle-02',nation:'kindle',text:'Ballot Night is coming. Bring a chair to the plaza.'},
 {id:'kindle-03',nation:'kindle',text:'Saw two candidates argue for an hour. Nobody won, everybody learned.'},
 {id:'kindle-04',nation:'kindle',text:'Foundry shift paid well today. My lungs disagree.'},
 {id:'kindle-05',nation:'kindle',text:"Shake on it, then write it down. That's Kindle."},
 {id:'kindle-06',nation:'kindle',text:'The Reserve Board moved rates again. My loan felt it.'},
 {id:'kindle-07',nation:'kindle',text:'New billboard on every corner. Read the small print first.'},
 {id:'kindle-08',nation:'kindle',text:'Started a stall last week. Failed. Starting another.'},
 {id:'kindle-09',nation:'kindle',text:"Juries sat all morning. The verdict holds, and that's the point."},
 {id:'kindle-10',nation:'kindle',text:'Chili-ember sauce on everything. Even breakfast.'},
 {id:'kindle-11',nation:'kindle',text:'Who rigs a scale in this market? Nobody twice.'},
 {id:'kindle-12',nation:'kindle',text:'Emberstone carts rolled in at dawn. Smoke for days.'},
 {id:'kindle-13',nation:'kindle',text:"Founders' Forge Day fair is the best market of the year."},
 {id:'kindle-14',nation:'kindle',text:'Boast if you like. Just be ready to prove it.'},
 {id:'kindle-15',nation:'kindle',text:'My temple, your temple, same plaza. Works fine.'},
 {id:'kindle-16',nation:'kindle',text:"The stock board is up. Don't ask me why."},
 {id:'kindle-17',nation:'kindle',text:'Granaries at Kolt Savanna are full. Bread should stay cheap.'},
 {id:'kindle-18',nation:'kindle',text:"Hid the price? Then I'm not buying."},
 {id:'kindle-19',nation:'kindle',text:'Second chances are cheap here. Use them.'},
 {id:'kindle-20',nation:'kindle',text:'Market Bell rings at noon. Traders, get set.'},
 {id:'korund-01',nation:'korund',text:'The queue at the state store moved quickly today.'},
 {id:'korund-02',nation:'korund',text:'Coupons expire on the seventh day. Use them.'},
 {id:'korund-03',nation:'korund',text:'Our brigade met the quota. Tea in the canteen.'},
 {id:'korund-04',nation:'korund',text:'Black bread again. It fills you up.'},
 {id:'korund-05',nation:'korund',text:'Plan Day is close. The halls are being swept.'},
 {id:'korund-06',nation:'korund',text:'The loudspeaker read the production figures twice.'},
 {id:'korund-07',nation:'korund',text:'Travel permit approved. Three days to visit family.'},
 {id:'korund-08',nation:'korund',text:'Praise the brigade, not yourself. Then sleep.'},
 {id:'korund-09',nation:'korund',text:'Ironroot carts came down from the mines at dawn.'},
 {id:'korund-10',nation:'korund',text:'The granite holds the cold. Wear the second coat.'},
 {id:'korund-11',nation:'korund',text:'Quota Rally next week. Expect long shifts.'},
 {id:'korund-12',nation:'korund',text:'The canteen has dumplings. Someone must have met the plan.'},
 {id:'korund-13',nation:'korund',text:'Request for a new job was noted. We will see.'},
 {id:'korund-14',nation:'korund',text:'The plaza mosaic has been cleaned again.'},
 {id:'korund-15',nation:'korund',text:'Do not keep foreign cash. It is not worth the trouble.'},
 {id:'korund-16',nation:'korund',text:'Ration tea, hot water, a quiet bench. Enough.'},
 {id:'korund-17',nation:'korund',text:'The state store ran out of boots. Next week, they say.'},
 {id:'korund-18',nation:'korund',text:'Address the clerk by title. It goes faster.'},
 {id:'korund-19',nation:'korund',text:'One hammer, one heart. The shift whistle agrees.'},
 {id:'korund-20',nation:'korund',text:'Snow on the passes. The trains will be late.'},
 {id:'aurelle-01',nation:'aurelle',text:'The wind turned east. The looms will sing tonight.'},
 {id:'aurelle-02',nation:'aurelle',text:'Bow first, speak after. The steward is watching.'},
 {id:'aurelle-03',nation:'aurelle',text:'They say the Royal Mint struck light coins again.'},
 {id:'aurelle-04',nation:'aurelle',text:'Full-weight Crowns fetch a premium in the market now.'},
 {id:'aurelle-05',nation:'aurelle',text:'Hearth Night is near. Polish the name-stones.'},
 {id:'aurelle-06',nation:'aurelle',text:'A commoner in silk? Sumptuary rules, friend.'},
 {id:'aurelle-07',nation:'aurelle',text:'The bridges sway in this wind. Walk the middle.'},
 {id:'aurelle-08',nation:'aurelle',text:'Skysilk from Windrest, finest in the realm.'},
 {id:'aurelle-09',nation:'aurelle',text:'Charter Fair opens at the palace terrace this season.'},
 {id:'aurelle-10',nation:'aurelle',text:'Leave from my lord to cross the fief, at last.'},
 {id:'aurelle-11',nation:'aurelle',text:'Banquet seats are set by rank. Mine is near the door.'},
 {id:'aurelle-12',nation:'aurelle',text:'Honey from the cliff hives. Worth the climb.'},
 {id:'aurelle-13',nation:'aurelle',text:"A pretender's banner flew in the lower town today."},
 {id:'aurelle-14',nation:'aurelle',text:'Never refuse a royal gift, even a heavy one.'},
 {id:'aurelle-15',nation:'aurelle',text:'The gazette praised the crown. The broadsheets were quieter.'},
 {id:'aurelle-16',nation:'aurelle',text:'Every thread in its place, as my mother says.'},
 {id:'aurelle-17',nation:'aurelle',text:'Windmill bread and highland lamb. A good supper.'},
 {id:'aurelle-18',nation:'aurelle',text:"Heir's Naming will fill the gorge with lanterns."},
 {id:'aurelle-19',nation:'aurelle',text:'Wear no higher than your rank. The guards notice.'},
 {id:'aurelle-20',nation:'aurelle',text:'New Crowns are stamped with the reigning Monarch. Check yours.'},
];

const CONTEXT:Readonly<Record<string,ChatterContext>>={
 'kindle-02':'festival:Ballot Night','kindle-12':'day','kindle-20':'day',
 'korund-05':'festival:Plan Day','korund-09':'day','korund-11':'festival:Quota Rally','korund-16':'night','korund-19':'day',
 'aurelle-01':'night','aurelle-05':'festival:Hearth Night','aurelle-09':'festival:Charter Fair','aurelle-17':'night','aurelle-18':'festival:Heir\'s Naming',
};

export const ambientChatterLines:readonly ChatterLine[]=raw.map(l=>({...l,...(CONTEXT[l.id]?{context:CONTEXT[l.id]}:{}),aiText:true,provenance:'deterministic',proposal:true}));

/** Lines for a nation, or none when the player has hidden AI chatter (future display-preferences setting). */
export function ambientChatter(nation:string,opts:{hideAiChatter?:boolean}={}):readonly ChatterLine[]{
 if(opts.hideAiChatter)return [];
 return ambientChatterLines.filter(l=>l.nation===nation);
}

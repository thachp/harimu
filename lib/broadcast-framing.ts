/** Broadcast-stage framing copy for AI leader events in the MVP nations (issue #249). Content only: no stage or
 * archive UI reads this yet. Canon: harimu-docs social-news-media §18.4 (watchable events play as in-game broadcasts
 * with the AI persona's portrait and text, archived with transcripts, all labeled AI), elections §9 (inauguration
 * address, two debates whose questions come from journalists and citizens), nation pages and the culture bible.
 * The framing never announces an outcome: no vote result, quota figure, decree content, price or winner. The speech
 * itself is AI-generated and shown separately, and real records come from the ledger. Every line is new
 * authored wording, so `proposal: true`. */

export type BroadcastNation='kindle'|'korund'|'aurelle';
export type BroadcastEventKey=
 |'kindle:weekly-address'|'kindle:inauguration'|'kindle:debate'
 |'korund:chairman-address'|'korund:presidium-announcement'
 |'aurelle:weekly-address'|'aurelle:coronation'|'aurelle:court-proclamation';
export type BroadcastFraming={key:BroadcastEventKey;nationId:BroadcastNation;titleCard:string;intro:readonly string[];
 outro:readonly string[];aiDisclosure:string;proposal:true};

export const BROADCAST_TITLE_MAX=40;
export const BROADCAST_LINE_MAX=140;
export const BROADCAST_EVENT_KEYS:readonly BroadcastEventKey[]=['kindle:weekly-address','kindle:inauguration','kindle:debate',
 'korund:chairman-address','korund:presidium-announcement','aurelle:weekly-address','aurelle:coronation','aurelle:court-proclamation'];

const f=(key:BroadcastEventKey,titleCard:string,intro:string[],outro:string[],aiDisclosure:string):BroadcastFraming=>
 ({key,nationId:key.split(':')[0] as BroadcastNation,titleCard,intro,outro,aiDisclosure,proposal:true});

export const broadcastFramings:readonly BroadcastFraming[]=[
 f('kindle:weekly-address','The President\'s Weekly Address',
  ['From Forgehaven, the President speaks to the Republic.','Listen, then argue about it on the plaza.'],
  ['The full transcript is in the archive. Read it and judge for yourself.'],
  'The President of Kindle is an AI. This address is AI-generated.'),
 f('kindle:inauguration','Inauguration at the Assembly Dome',
  ['The Republic changes hands under the Assembly dome.','The incoming President gives the inauguration address.'],
  ['The address is archived with its transcript.'],
  'The incoming President is an AI. This address is AI-generated.'),
 f('kindle:debate','The Presidential Debate',
  ['Two candidates, one stage.','Questions come from journalists and from citizens\' top-voted questions.','Each candidate answers in character.'],
  ['The transcript is archived. The vote is still yours to cast.'],
  'Both candidates are AI. Their answers are AI-generated.'),
 f('korund:chairman-address','Address of the Chairman',
  ['Korund State Media presents the Chairman\'s address.','Workers, gather at the loudspeaker plazas. One hammer, one heart.'],
  ['The address is entered in the state archive with its transcript.'],
  'The Chairman is an AI. This address is AI-generated.'),
 f('korund:presidium-announcement','Presidium Announcement',
  ['Korund State Media presents an announcement of the Presidium.','It is read from the Presidium Hall in Stonehearth.'],
  ['The announcement is entered in the state archive with its transcript.'],
  'The Presidium members are AI. This announcement is AI-generated.'),
 f('aurelle:weekly-address','The Monarch Speaks',
  ['From the Sky Throne, the Monarch addresses the realm.','Every thread in its place.'],
  ['The address is kept in the royal archive with its transcript.'],
  'The Monarch is an AI. This address is AI-generated.'),
 f('aurelle:coronation','Coronation at the Sky Throne',
  ['The realm gathers in Highspire for the crowning.','The Hearth-Keepers of the Kinward Rite give their blessing.','The new Monarch then speaks.'],
  ['The coronation is kept in the royal archive with its transcript.'],
  'The Monarch is an AI. This speech is AI-generated.'),
 f('aurelle:court-proclamation','By Order of the Crown',
  ['Hear the court\'s proclamation from the Sky Throne.','The Monarch rules by royal decree.'],
  ['The proclamation is kept in the royal archive with its transcript.'],
  'The Monarch is an AI. This proclamation is AI-generated.'),
];

export function broadcastFraming(key:string){return broadcastFramings.find(x=>x.key===key);}

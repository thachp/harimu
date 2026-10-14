export const notableDailyLimit=20;
export const notableProfiles={
 kindle:{id:'kindle-journalist',name:'Mara Vale',role:'Civic journalist',persona:'A persistent reporter who separates public records from speculation.',introduction:'I follow public ledgers and civic records. A rumor is not evidence, and a conversation cannot change a ballot or your resources.'},
 korund:{id:'korund-chronicler',name:'Ilya Renn',role:'Plan chronicler',persona:'A meticulous chronicler of published output and official statements.',introduction:'I read recorded plan output and official statements. Private leadership reasoning and household records are outside my remit.'},
 aurelle:{id:'aurelle-courtier',name:'Celine Orrel',role:'Court chronicler',persona:'A formal observer who distinguishes published court records from palace gossip.',introduction:'I discuss published court records. Private royal deliberations are not public facts; speaking with me cannot grant Crowns or Favor.'},
} as const;
export type NotableProfile=typeof notableProfiles[keyof typeof notableProfiles];
export const notableTopics={work:{label:'Recorded work',question:'What can the public work ledger tell us?',authored:'Completed settlements are recorded events. An underway shift is not completed output. Check your own Work screen for its server deadline.'},news:{label:'News and rumors',question:'How should I read national news?',authored:'Read the provenance label: system record, authored prototype statement, or AI-generated. These authored examples contain no live rumor or generated response.'},institutions:{label:'Conversation limits',question:'Can this conversation change the game?',authored:'A Notable cannot grant resources, influence a vote or policy through a conversation, disclose secrets, or contact you unsolicited.'}} as const;
export type NotableTopic=keyof typeof notableTopics;
export function notableProfile(nation:string|null){return nation&&Object.hasOwn(notableProfiles,nation)?notableProfiles[nation as keyof typeof notableProfiles]:null;}
/** #151: deterministic pick per citizen and UTC day (FNV-1a over "userId:day"). A one-Notable roster always
 * returns that Notable. Kept import-free; lib/notable-choice.ts combines it with the content roster. */
export function pickNotable<T>(roster:readonly T[],userId:string,nowSeconds:number):T|null{
 if(roster.length<=1)return roster[0]??null;
 let hash=0x811c9dc5;for(const byte of new TextEncoder().encode(`${userId}:${Math.floor(nowSeconds/86400)}`)){hash^=byte;hash=Math.imul(hash,0x01000193)>>>0;}
 return roster[hash%roster.length];
}
export function validNotableQuestion(value:unknown):value is string{return typeof value==='string'&&value===value.trim()&&value.length>=5&&value.length<=600&&new TextEncoder().encode(value).length<=1800&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);}
export type NotableCommand={requestId:string;notableId:string;topic:NotableTopic;question?:string};
export function validNotableCommand(value:Record<string,unknown>):value is Record<string,unknown>&NotableCommand{return Object.keys(value).every(key=>['requestId','notableId','topic','question'].includes(key))&&typeof value.requestId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.requestId)&&typeof value.notableId==='string'&&typeof value.topic==='string'&&Object.hasOwn(notableTopics,value.topic)&&(!Object.hasOwn(value,'question')||validNotableQuestion(value.question));}

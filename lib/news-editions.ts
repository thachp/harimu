/** News editions for the seven non-MVP nations (issue #108). Content only: not yet read by readNationalNews in
 * lib/national-news.ts, which still serves Kindle, Korund and Aurelle. Wiring these in is a follow-up once each nation opens.
 * Outlet names follow the culture bible (thachp/harimu-docs#3); `canon` marks names fixed there, the rest are proposals.
 * Press freedom restates each nation's Freedoms row (harimu-docs content/world/nations/*.mdx).
 * Like lib/news-templates.ts, the voice lives only in the words: every number is copied from the ledger row passed in. */
import type {LedgerRow,TemplateHeadline} from './news-templates';
import type {NewsItemKind} from './national-news';

export type EditionNationId='confluence'|'meridian'|'ilmar'|'hoarvale'|'varkand'|'veldwood'|'fulmara';
export type AlertLevel='green'|'amber'|'red';
export type PressFreedom='minimal'|'low'|'low-moderate'|'moderate'|'medium-high'|'high'|'highest';
export type RecordTitles={work:string;register:string;market:string};
type Template={id:string;when:(row:LedgerRow)=>boolean;render:(row:LedgerRow)=>TemplateHeadline};
export type NewsEditionContent={
 nationId:EditionNationId;outlet:string;canon:boolean;masthead:string;style:'press'|'state'|'court'|'broadcast'|'bulletin';
 secondaryOutlet?:string;pressFreedom:PressFreedom;freedomsRow:string;templateKind:Extract<NewsItemKind,'template'|'decree'>;
 label:string;recordTitles:RecordTitles;templates:readonly Template[];
};

const s=(n:number,one:string,many:string)=>`${n} ${n===1?one:many}`;
const label=(outlet:string,source='the system ledger')=>`(${outlet} template · figures copied from ${source} and cannot be edited.)`;

export const newsEditions:Readonly<Record<EditionNationId,NewsEditionContent>>={
 confluence:{nationId:'confluence',outlet:'The Current Daily',canon:false,masthead:'Many streams, one current.',style:'state',secondaryOutlet:'licensed local sheets',
  pressFreedom:'moderate',freedomsRow:'One official newspaper plus licensed local outlets; speech free on daily life, restricted on the Party leadership.',
  templateKind:'template',label:label('Current Daily'),recordTitles:{work:'Guidance Plan work recorded',register:'Household registration recorded',market:'Bread Hall exchanges recorded'},
  templates:[
   {id:'confluence-shifts-busy',when:r=>r.shifts>=10,render:r=>({title:'Guidance Plan on course in the terraces',text:`We report ${s(r.shifts,'completed shift','completed shifts')}. Many streams, one current.`})},
   {id:'confluence-shifts-some',when:r=>r.shifts>0&&r.shifts<10,render:r=>({title:'The current keeps moving',text:`${s(r.shifts,'shift','shifts')} completed along the canals this period.`})},
   {id:'confluence-shifts-none',when:r=>r.shifts===0,render:()=>({title:'The canals wait for the next stream',text:'No shifts are recorded this period. The plan remains open to every hand.'})},
   {id:'confluence-food',when:r=>r.food>0,render:r=>({title:'Many streams report a full basket',text:`${r.food} food shared to the Bread Halls. Not a grain wasted.`})},
   {id:'confluence-register',when:r=>r.citizens>0,render:r=>({title:'New households join the current',text:`${s(r.citizens,'citizen','citizens')} registered with a household this period.`})},
  ]},
 meridian:{nationId:'meridian',outlet:'Steamgate Measure',canon:false,masthead:'Rise by measure.',style:'state',secondaryOutlet:'Tsenga SEZ business wire (Great Filter applied)',
  pressFreedom:'low-moderate',freedomsRow:'Tightly managed press and politics; the Great Filter limits foreign news.',
  templateKind:'template',label:label('Steamgate Measure'),recordTitles:{work:'Output recorded',register:'Residence registration recorded',market:'Exchange board activity recorded'},
  templates:[
   {id:'meridian-shifts-busy',when:r=>r.shifts>=10,render:r=>({title:'Output rises by measure',text:`${s(r.shifts,'shift','shifts')} completed. The measure is met.`})},
   {id:'meridian-shifts-some',when:r=>r.shifts>0&&r.shifts<10,render:r=>({title:'Steady output reported',text:`${s(r.shifts,'shift','shifts')} completed this period, by official count.`})},
   {id:'meridian-shifts-none',when:r=>r.shifts===0,render:()=>({title:'Workshops prepare the next measure',text:'No shifts are recorded this period.'})},
   {id:'meridian-trades',when:r=>r.trades>0,render:r=>({title:'SEZ exchange boards report activity',text:`${s(r.trades,'trade','trades')} cleared, ${r.quantity} goods moved through the zone.`})},
   {id:'meridian-register',when:r=>r.citizens>0,render:r=>({title:'New residents enter the register',text:`${s(r.citizens,'citizen','citizens')} received residence permits.`})},
  ]},
 ilmar:{nationId:'ilmar',outlet:'The Clear Record',canon:false,masthead:'Be a clear vessel.',style:'court',
  pressFreedom:'low-moderate',freedomsRow:'Sanctum-approved press; no reporting on Stilldays.',
  templateKind:'decree',label:label('Clear Record','the sanctum ledger'),recordTitles:{work:'Endowment service recorded',register:'Entry to the Vigil rolls recorded',market:'Endowment exchanges recorded'},
  templates:[
   {id:'ilmar-shifts-some',when:r=>r.shifts>0,render:r=>({title:'Endowment service entered in the record',text:`${s(r.shifts,'shift','shifts')} of service completed, stated plainly.`})},
   {id:'ilmar-shifts-none',when:r=>r.shifts===0,render:()=>({title:'The record is clear and still',text:'No service is entered this period. A quiet record is still a true one.'})},
   {id:'ilmar-food',when:r=>r.food>0,render:r=>({title:'Endowment shares posted for the season',text:`${r.food} food entered to the common endowment.`})},
   {id:'ilmar-register',when:r=>r.citizens>0,render:r=>({title:'The Vigil is kept in Mirrorhall',text:`${s(r.citizens,'new citizen joins','new citizens join')} the rolls of the Sanctum.`})},
  ]},
 hoarvale:{nationId:'hoarvale',outlet:'The Rimehall Ledger',canon:false,masthead:'Keep the hearth, share the warmth.',style:'press',secondaryOutlet:'a satirical weekly',
  pressFreedom:'high',freedomsRow:'Free press; criticizing the government is completely free; insulting the Sovereign is a fine-level offense (Crown Etiquette).',
  templateKind:'template',label:label('Rimehall Ledger'),recordTitles:{work:'Shifts recorded',register:'Citizenship recorded',market:'Trading House transactions recorded'},
  templates:[
   {id:'hoarvale-shifts-busy',when:r=>r.shifts>=10,render:r=>({title:'Hearths busy, steam rising',text:`${s(r.shifts,'shift','shifts')} completed. Even the Moot noticed.`})},
   {id:'hoarvale-shifts-some',when:r=>r.shifts>0&&r.shifts<10,render:r=>({title:'Work done, eventually',text:`${s(r.shifts,'shift','shifts')} completed this period, which is more than the Moot can say.`})},
   {id:'hoarvale-shifts-none',when:r=>r.shifts===0,render:()=>({title:'A quiet week by the hearth',text:'No shifts recorded this period. The kettle is on.'})},
   {id:'hoarvale-trades',when:r=>r.trades>0,render:r=>({title:'Trading Houses keep the books warm',text:`${s(r.trades,'trade','trades')} recorded · ${r.quantity} goods transferred.`})},
   {id:'hoarvale-register',when:r=>r.citizens>0,render:r=>({title:'New faces at the hearth',text:`${s(r.citizens,'citizen','citizens')} joined the register. Share the warmth.`})},
  ]},
 varkand:{nationId:'varkand',outlet:'Watchfast Signal',canon:false,masthead:'Hold the line in the fog.',style:'bulletin',
  pressFreedom:'low',freedomsRow:'Variable by Alert Level: licensed press at Green; censorship at Amber; martial law and foreign-news fog at Red.',
  templateKind:'template',label:label('Watchfast Signal','the Directorate ledger'),recordTitles:{work:'National Service shifts logged',register:'Muster roll entries logged',market:'Arsenal issue logged'},
  templates:[
   {id:'varkand-shifts-some',when:r=>r.shifts>0,render:r=>({title:'Shifts logged',text:`${s(r.shifts,'shift','shifts')} complete. Line held.`})},
   {id:'varkand-shifts-none',when:r=>r.shifts===0,render:()=>({title:'No shifts logged',text:'Zero shifts this period. Stand by.'})},
   {id:'varkand-food',when:r=>r.food>0,render:r=>({title:'Stores logged',text:`${r.food} food to the depots.`})},
   {id:'varkand-register',when:r=>r.citizens>0,render:r=>({title:'Muster roll grows',text:`${s(r.citizens,'recruit','recruits')} entered National Service.`})},
  ]},
 veldwood:{nationId:'veldwood',outlet:'The Canopy',canon:true,masthead:'Every voice in the ring.',style:'broadcast',
  pressFreedom:'highest',freedomsRow:'Free press plus the public broadcaster The Canopy, with balanced-airtime rules on Vote Days.',
  templateKind:'template',label:label('Canopy'),recordTitles:{work:'Grove work recorded',register:'Grove residency recorded',market:'Market activity recorded'},
  templates:[
   {id:'veldwood-shifts-some',when:r=>r.shifts>0,render:r=>({title:'Groves report a working week',text:`${s(r.shifts,'shift','shifts')} completed across the groves.`})},
   {id:'veldwood-shifts-none',when:r=>r.shifts===0,render:()=>({title:'A resting week in the groves',text:'No shifts recorded this period.'})},
   {id:'veldwood-food',when:r=>r.food>0,render:r=>({title:'The common table is set',text:`${r.food} food brought to the public supply.`})},
   {id:'veldwood-trades',when:r=>r.trades>0,render:r=>({title:'Ringhall market report',text:`${s(r.trades,'trade','trades')} recorded · ${r.quantity} goods transferred.`})},
   {id:'veldwood-register',when:r=>r.citizens>0,render:r=>({title:'New voices in the ring',text:`${s(r.citizens,'citizen','citizens')} joined. Every voice counts the same.`})},
  ]},
 fulmara:{nationId:'fulmara',outlet:'Arcport Exchange Bulletin',canon:false,masthead:'Ride the storm, own the wind. · Owned by a chartered trading house',style:'press',secondaryOutlet:"a dockworkers' sheet",
  pressFreedom:'medium-high',freedomsRow:'Free press mostly owned by trading houses; ownership disclosed on every masthead.',
  templateKind:'template',label:label('Exchange Bulletin'),recordTitles:{work:'Dock and yard shifts recorded',register:'Charter registrations recorded',market:'Exchange trades recorded'},
  templates:[
   {id:'fulmara-shifts-busy',when:r=>r.shifts>=10,render:r=>({title:'Docks run full tilt',text:`${s(r.shifts,'shift','shifts')} completed on the quays.`})},
   {id:'fulmara-shifts-some',when:r=>r.shifts>0&&r.shifts<10,render:r=>({title:'Fair winds on the quays',text:`${s(r.shifts,'shift','shifts')} completed this period.`})},
   {id:'fulmara-shifts-none',when:r=>r.shifts===0,render:()=>({title:'Becalmed at the docks',text:'No shifts recorded this period.'})},
   {id:'fulmara-trades',when:r=>r.trades>0,render:r=>({title:'Volume moves at the Exchange Bell',text:`${s(r.trades,'trade','trades')} cleared, ${r.quantity} goods changed hands.`})},
   {id:'fulmara-register',when:r=>r.citizens>0,render:r=>({title:'New hands sign on in Arcport',text:`${s(r.citizens,'citizen','citizens')} joined the register.`})},
  ]},
};

/** Varkand masthead prefix. Every Watchfast Signal edition is headed by the current Alert Level. */
export const alertMasthead:Readonly<Record<AlertLevel,string>>={green:'ALERT GREEN · Licensed press',amber:'ALERT AMBER · Censored bulletin',red:'ALERT RED · Martial law bulletin'};

export function editionMasthead(nationId:EditionNationId,alert:AlertLevel='green'):string{
 const e=newsEditions[nationId];return nationId==='varkand'?`${alertMasthead[alert]} · ${e.masthead}`:e.masthead;
}

/** All templates that apply to a row, labeled. Nothing publishes for invalid rows or when the nation's press is silent
 * (Ilmar on a Stillday). Varkand drops non-essential stories at Amber and Red: only the shift log is kept. */
export function editionHeadlines(nationId:EditionNationId,row:LedgerRow,opts:{alert?:AlertLevel;stillday?:boolean}={}):TemplateHeadline[]{
 const e=newsEditions[nationId];
 if(![row.shifts,row.food,row.trades,row.quantity,row.citizens].every(n=>Number.isSafeInteger(n)&&n>=0))return [];
 if(nationId==='ilmar'&&opts.stillday)return [];
 const alert=opts.alert??'green';
 return e.templates.filter(t=>t.when(row)&&(nationId!=='varkand'||alert==='green'||t.id.startsWith('varkand-shifts'))).map(t=>{const h=t.render(row);return {title:h.title,text:`${h.text} ${e.label}`};});
}

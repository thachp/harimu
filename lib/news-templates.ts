/** Deterministic headline templates for Kindle Press and the Aurelle Court Gazette (issue #109).
 * Like korundTemplateHeadline in lib/national-news.ts, the voice lives only in the words: every number is copied
 * from a ledger row passed in, and every text ends with a template label. Voice follows the culture bible
 * (thachp/harimu-docs#3): Kindle is competitive, plain and price-proud; Aurelle is ornate, deferential and ranked.
 * Not yet wired into readNationalNews; that is a follow-up that will change feed item counts. */
export type LedgerRow={shifts:number;food:number;trades:number;quantity:number;citizens:number};
export type TemplateHeadline={title:string;text:string};
type Template={id:string;when:(row:LedgerRow)=>boolean;render:(row:LedgerRow)=>TemplateHeadline};

const s=(n:number,one:string,many:string)=>`${n} ${n===1?one:many}`;
export const kindleTemplateLabel='(Kindle Press template · figures copied from the system ledger and cannot be edited.)';
export const aurelleTemplateLabel='(Court Gazette template · figures copied from the royal register and cannot be edited.)';

export const kindleTemplates:readonly Template[]=[
 {id:'kindle-shifts-busy',when:r=>r.shifts>=10,render:r=>({title:'Forgehaven works overtime',text:`${s(r.shifts,'shift','shifts')} settled on the ledger. The foundries are paying.`})},
 {id:'kindle-shifts-some',when:r=>r.shifts>0&&r.shifts<10,render:r=>({title:'Shifts settled, wages posted',text:`${s(r.shifts,'shift','shifts')} settled. Every wage was posted at the promised price.`})},
 {id:'kindle-shifts-none',when:r=>r.shifts===0,render:()=>({title:'Quiet day at the foundries',text:'No shifts settled on the ledger this period. The work is still there for anyone who wants it.'})},
 {id:'kindle-food',when:r=>r.food>0,render:r=>({title:'Harvest hits the market',text:`${r.food} food earned by citizens this period, by the ledger's count.`})},
 {id:'kindle-trades-busy',when:r=>r.trades>=10,render:r=>({title:'Price boards hum',text:`${s(r.trades,'trade','trades')} cleared, ${r.quantity} goods changed hands. Show your number.`})},
 {id:'kindle-trades-some',when:r=>r.trades>0&&r.trades<10,render:r=>({title:'Merchants make their deals',text:`${s(r.trades,'trade','trades')} recorded · ${r.quantity} goods transferred.`})},
 {id:'kindle-trades-none',when:r=>r.trades===0,render:()=>({title:'Stalls wait for buyers',text:'No trades recorded this period. The boards are open.'})},
 {id:'kindle-register',when:r=>r.citizens>0,render:r=>({title:'New sparks in the Republic',text:`${s(r.citizens,'citizen','citizens')} joined the national register. Welcome to the count.`})},
];

export const aurelleTemplates:readonly Template[]=[
 {id:'aurelle-service-busy',when:r=>r.shifts>=10,render:r=>({title:'The Crown is well served',text:`Be it known that ${s(r.shifts,'turn of royal estate service has','turns of royal estate service have')} been faithfully completed.`})},
 {id:'aurelle-service-some',when:r=>r.shifts>0&&r.shifts<10,render:r=>({title:'Royal estate service recorded',text:`The Herald records ${s(r.shifts,'completed turn','completed turns')} of service upon the royal estates.`})},
 {id:'aurelle-service-none',when:r=>r.shifts===0,render:()=>({title:'The estates await their servants',text:'No service is entered in the register this period. The bells of the estates still ring.'})},
 {id:'aurelle-food',when:r=>r.food>0,render:r=>({title:'Provisions laid up for the realm',text:`${r.food} food has been rendered to the public stores, as entered in the register.`})},
 {id:'aurelle-store-busy',when:r=>r.trades>=10,render:r=>({title:'The royal store does brisk trade',text:`${s(r.trades,'purchase','purchases')} at the chartered counters, ${r.quantity} goods in all.`})},
 {id:'aurelle-store-some',when:r=>r.trades>0&&r.trades<10,render:r=>({title:'Purchases at the chartered counter',text:`The register notes ${s(r.trades,'purchase','purchases')} and ${r.quantity} goods supplied by royal charter.`})},
 {id:'aurelle-store-none',when:r=>r.trades===0,render:()=>({title:'The chartered counters stand ready',text:'No purchases are entered this period. The royal store keeps its doors open by leave of the Crown.'})},
 {id:'aurelle-oath',when:r=>r.citizens>0,render:r=>({title:'By order of the Crown: subjects received',text:`Hear ye. ${s(r.citizens,'new subject has','new subjects have')} sworn the oath. Every thread in its place.`})},
];

/** All templates that apply to a row, each with its label appended. Order is fixed, so output is deterministic. */
export function templateHeadlines(nationId:'kindle'|'aurelle',row:LedgerRow):TemplateHeadline[]{
 const list=nationId==='kindle'?kindleTemplates:aurelleTemplates,label=nationId==='kindle'?kindleTemplateLabel:aurelleTemplateLabel;
 if(![row.shifts,row.food,row.trades,row.quantity,row.citizens].every(n=>Number.isSafeInteger(n)&&n>=0))return [];
 return list.filter(t=>t.when(row)).map(t=>{const h=t.render(row);return {title:h.title,text:`${h.text} ${label}`};});
}

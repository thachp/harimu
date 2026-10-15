import {foundingNewsItems,readFoundingEvents} from './founding-period'; // #612
import type {GameDatabase} from './database-contract';
import type { GovernmentSnapshot } from './government';
import { publicGovernmentSnapshot, governmentDisclosure } from './government-disclosure';
import { presidiumRumors, readPresidium } from './korund-presidium';
import { readWars, warNewsItems } from './war'; // #309
import { readTreaties, treatyNewsItems } from './diplomacy'; // #308
import { embargoNewsItems, readEmbargoes } from './embargo'; // #363
import { undergroundNewsItems } from './korund-underground'; // #295

export type NewsItem = {id:string;title:string;text:string;occurredAt:number;source:'system'|'deterministic'|'model';kind?:NewsItemKind};
/** record: system ledger fact; template: Korund State Media template built only from ledger figures; decree: Aurelle court gazette entry; article: model-written article. */
export type NewsItemKind='record'|'template'|'decree'|'article';
export type NationalNews = {nationId:string;title:string;style:'press'|'state'|'court';fetchedAt:number;statistics:{citizens:number;completedShifts:number;food:number};items:NewsItem[]};
const editions={kindle:{title:'Kindle Press',style:'press'},korund:{title:'Korund State Media',style:'state'},aurelle:{title:'Aurelle Court Gazette',style:'court'}} as const;

/** Derived from durable records; this reader never publishes or changes a game event. */
export async function readNationalNews(db:GameDatabase,nationId:string,now:number,options:{korundPresidium?:boolean;war?:boolean;faith?:boolean;diplomacy?:boolean;embargo?:boolean;foundingPeriod?:boolean}={}):Promise<NationalNews|null> {
 if(!Object.hasOwn(editions,nationId))return null;
 const edition=editions[nationId as keyof typeof editions];
 if(!edition)return null;
 const ledger=nationId==='kindle'?`SELECT CAST(strftime('%s',s.settled_at) AS INTEGER) AS occurred_at,s.quantity AS food FROM shift_settlements s JOIN work_shifts w ON w.id=s.shift_id WHERE w.work_order_id='harvest'`
  :nationId==='korund'?'SELECT settled_at AS occurred_at,food_output AS food FROM korund_settlements':'SELECT settled_at AS occurred_at,food_output AS food FROM aurelle_settlements';
 const allLedger=nationId==='kindle'?`SELECT CAST(strftime('%s',s.settled_at) AS INTEGER) AS occurred_at,CASE WHEN s.item='food' THEN s.quantity ELSE 0 END AS food FROM shift_settlements s JOIN work_shifts w ON w.id=s.shift_id WHERE w.work_order_id IN ('harvest','freight','archive')`:ledger;
 const [register,totals,receipts,tick,accessions,trades]=await Promise.all([
  db.prepare('SELECT COUNT(*) AS citizens FROM citizens WHERE nation_id=?').bind(nationId).first<{citizens:number}>(),
  db.prepare(`SELECT COUNT(*) AS shifts,COALESCE(SUM(food),0) AS food FROM (${allLedger})`).first<{shifts:number;food:number}>(),
  db.prepare(`SELECT occurred_at,COUNT(*) AS shifts,SUM(food) AS food FROM (${allLedger}) GROUP BY occurred_at ORDER BY occurred_at DESC LIMIT 12`).all<{occurred_at:number;shifts:number;food:number}>(),
  db.prepare('SELECT tick,processed_at,proposals_json FROM world_ticks ORDER BY tick DESC LIMIT 1').first<{tick:number;processed_at:number;proposals_json:string}>(),
  db.prepare("SELECT CAST(strftime('%s',created_at) AS INTEGER) AS occurred_at,COUNT(*) AS citizens FROM citizens WHERE nation_id=? AND nation_changes=0 GROUP BY occurred_at ORDER BY occurred_at DESC LIMIT 6").bind(nationId).all<{occurred_at:number;citizens:number}>(),
  nationId==='kindle'?db.prepare("SELECT occurred_at,COUNT(*) AS trades,SUM(ABS(quantity_delta)) AS quantity FROM citizen_economy_events WHERE kind IN ('buy','sell') GROUP BY occurred_at ORDER BY occurred_at DESC LIMIT 6").all<{occurred_at:number;trades:number;quantity:number}>():nationId==='aurelle'?db.prepare("SELECT r.occurred_at,COUNT(*) AS trades,SUM(p.quantity) AS quantity FROM aurelle_purchases p JOIN aurelle_receipts r ON r.id=p.id GROUP BY r.occurred_at ORDER BY r.occurred_at DESC LIMIT 6").all<{occurred_at:number;trades:number;quantity:number}>():db.prepare("SELECT occurred_at,COUNT(*) AS trades,SUM(quantity) AS quantity FROM korund_rations GROUP BY occurred_at ORDER BY occurred_at DESC LIMIT 6").all<{occurred_at:number;trades:number;quantity:number}>(),
 ]);
 const items:NewsItem[]=receipts.results.map(row=>({id:`${nationId}:work:${row.occurred_at}`,title:nationId==='korund'?'Production brigade report':nationId==='aurelle'?'Royal estate service recorded':'Workplace settlement recorded',text:`${row.shifts} completed shift${row.shifts===1?'':'s'} recorded. ${row.food} food ${nationId==='kindle'?'earned by citizens':'contributed to the public food supply'}.`,occurredAt:row.occurred_at*1000,source:'system'}));
 for(const row of accessions.results)items.push({id:`${nationId}:register:${row.occurred_at}`,title:'Citizenship recorded',text:`${row.citizens} citizen${row.citizens===1?'':'s'} joined the national register. Names and account identities are not published in this feed.`,occurredAt:row.occurred_at*1000,source:'system'});
 for(const row of trades.results)items.push({id:`${nationId}:market:${row.occurred_at}`,title:nationId==='korund'?'Ration distribution recorded':nationId==='aurelle'?'Royal store transactions recorded':'Merchant trades recorded',text:`${row.trades} ${nationId==='korund'?'ration issuance':'transaction'}${row.trades===1?'':'s'} recorded · ${row.quantity} goods transferred. No private wallets or household balances are published.`,occurredAt:row.occurred_at*1000,source:'system'});
 for(const item of items)item.kind='record';
 if(nationId==='korund')for(const row of receipts.results)items.push({id:`korund:template:${row.occurred_at}`,title:korundTemplateHeadline(row.food),text:`The brigades of Korund report ${row.shifts} completed shift${row.shifts===1?'':'s'} and ${row.food} food delivered to the common store. Every worker strengthens the plan. (State Media template · the figures are copied from the system ledger and cannot be edited.)`,occurredAt:row.occurred_at*1000,source:'deterministic',kind:'template'});
 if(nationId==='aurelle')for(const row of accessions.results)items.push({id:`aurelle:decree:register:${row.occurred_at}`,title:'By order of the Crown: new subjects received',text:`Hear ye. The Herald proclaims that ${row.citizens} new subject${row.citizens===1?' has':'s have'} sworn the oath and been entered in the royal register. This gazette entry records a fact; it grants no charter, fief or title.`,occurredAt:row.occurred_at*1000,source:'deterministic',kind:'decree'});
 if(nationId==='korund'&&options.korundPresidium)for(const r of presidiumRumors(await readPresidium(db)))items.push({...r,source:'deterministic',kind:'template'}); // #70 State Media rumors
 if(nationId==='korund'&&options.faith)items.push(...await undergroundNewsItems(db,Math.floor(now/1000))); // #295 State Media inspection rumors, derived on read (no faith, shrine or person named)
 if(options.war)items.push(...warNewsItems((await readWars(db,Math.floor(now/1000))).wars,nationId)); // #309 declaration, mobilization end and war end lines, derived on read
 if(options.diplomacy)items.push(...treatyNewsItems((await readTreaties(db,Math.floor(now/1000))).treaties,nationId)); // #308 ratification and broken-pact lines, derived on read
 if(options.foundingPeriod)items.push(...foundingNewsItems(await readFoundingEvents(db),nationId)); // #612 day-30 event line, derived on read
 if(options.embargo)items.push(...embargoNewsItems((await readEmbargoes(db)).embargoes,nationId)); // #363 impose and lift lines, derived on read
 if(tick){
  const proposals=JSON.parse(tick.proposals_json) as (GovernmentSnapshot|null)[];
  const snapshot=publicGovernmentSnapshot(proposals.find(proposal=>proposal?.nationId===nationId)??null);
  if(snapshot){const disclosure=governmentDisclosure(snapshot);items.push({id:`${nationId}:policy:${tick.tick}`,title:nationId==='aurelle'?`By order of the Crown: ${disclosure.title}`:disclosure.title,text:nationId==='aurelle'?`The Herald proclaims: ${disclosure.text}`:disclosure.text,occurredAt:tick.processed_at*1000,source:'deterministic',kind:nationId==='aurelle'?'decree':'record'});}
 }
 return {nationId,...edition,fetchedAt:now,statistics:{citizens:register?.citizens??0,completedShifts:totals?.shifts??0,food:totals?.food??0},items:items.sort((a,b)=>b.occurredAt-a.occurredAt).slice(0,12)};
}

/** State Media spin lives only in the words; numbers always come from the ledger row. */
export function korundTemplateHeadline(food:number):string{
 return food>0?'Brigades deliver for the common store!':'Brigades stand ready for the next plan period!';
}

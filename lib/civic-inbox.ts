import type {KorundPlan} from './korund';
import type {ElectionSnapshot} from './elections';
import type {CollectivePetitions} from './collective-petitions';
import type { WorkShift } from './work-shifts';
import type { GovernmentSnapshot } from './government';
export type InboxItem={id:string;title:string;text:string;at:number;atLabel?:string;view:'workplace'|'government'|'market'};
/** Read-only guidance. Reaching a displayed deadline never claims or grants a reward. */
export function civicInbox(shifts:readonly WorkShift[],government:GovernmentSnapshot|null,nationId:string|null,now:number,collective?:CollectivePetitions|null,election?:ElectionSnapshot|null,korund?:KorundPlan|null):InboxItem[]{
 if(!nationId||!Number.isFinite(now)||now<=0)return[];
 const entries=new Map<string,InboxItem>();
 for(const shift of shifts){const at=Date.parse(shift.completesAt);if(shift.claimedAt!==null||!Number.isFinite(at)||at>now)continue;
  const id=`work:${shift.id}`;entries.set(id,{id,title:`Check collection · ${shift.orderName}`,text:'The recorded shift deadline has passed. Open Work and refresh to confirm collection with the server. This notification does not claim rewards.',at,view:'workplace'});
 }
 if(government?.nationId===nationId)for(const petition of government.petitions??[]){const at=(petition.reviewedAt??petition.submittedAt)*1000;if(!Number.isFinite(at))continue;
  const id=`petition:${petition.requestId}:${petition.status}`;entries.set(id,{id,title:`Your ${petition.topic} priority request · ${petition.status}`,text:petition.reason,at,view:'government'});
 }
 if(nationId==='kindle'&&collective?.nationId===nationId)for(const petition of collective.petitions){
  const near=petition.status==='collecting'&&petition.expiresAt*1000>now&&petition.signatures>0&&(petition.signatures===petition.threshold-1||petition.signatures/petition.threshold>=.8);
  const followed=petition.mine||petition.signed;
  if(!near&&!(followed&&['awaiting-response','responded'].includes(petition.status)))continue;
  const id=`collective:${petition.id}:${petition.status}:${near?petition.signatures:''}`;
  const at=(petition.response?.at??petition.reachedAt??petition.createdAt)*1000;if(!Number.isFinite(at)||at>now)continue;
  entries.set(id,{id,title:near?'Petition nearing its response threshold':petition.status==='responded'?'Cabinet response recorded':'Petition awaiting Cabinet response',text:`${petition.title} · ${petition.signatures} / ${petition.threshold} verified human signatures. Open Civic to read the authoritative record.`,at,view:'government'});
 }
 if(nationId==='kindle'&&election?.nationId===nationId&&election.privacyReady&&election.status==='open'&&!election.voted&&election.closesAt!==null&&election.closesAt*1000>now&&election.opensAt!==null&&election.opensAt*1000<=now){
  const id=`ballot:${election.id}`;entries.set(id,{id,title:'Kindle ranked ballot is open',text:'Open Civic to check your verified voting eligibility and the recorded closing deadline. Voting is optional; this alert submits nothing.',at:election.opensAt*1000,view:'government'});
 }
 const rationExpiry=korund?Date.parse(korund.couponExpiresAt):NaN;
 if(nationId==='korund'&&korund?.available&&Number.isFinite(rationExpiry)&&rationExpiry>now&&korund.couponFoodRemaining>0&&korund.publicFoodRemaining>=korund.couponFoodRemaining&&korund.queue?.requestId&&korund.queue.position===1&&korund.queue.waiting>0){
  const id=`ration:${korund.gameWeek}:${korund.queue.requestId}`;
  entries.set(id,{id,title:'Check the state ration counter',text:'Your recorded request is at the front and state food covers your ration. Open Market and refresh to confirm with the server. This notice does not reserve stock or redeem coupons.',at:Math.min(now,rationExpiry-50400000),atLabel:'Coupon week began',view:'market'});
 }
 return [...entries.values()].sort((a,b)=>b.at-a.at);
}
export function unreadInbox(items:readonly InboxItem[],readIds:readonly string[]){const seen=new Set(readIds);return items.filter(item=>!seen.has(item.id)).length;}
export function markInboxRead(items:readonly InboxItem[],readIds:readonly string[]){return [...new Set([...readIds,...items.map(item=>item.id)])].slice(-128);}

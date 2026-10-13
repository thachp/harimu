import type {CollectivePetitions} from './collective-petitions';
import type { WorkShift } from './work-shifts';
import type { GovernmentSnapshot } from './government';
export type InboxItem={id:string;title:string;text:string;at:number;view:'workplace'|'government'};
/** Read-only guidance. Reaching a displayed deadline never claims or grants a reward. */
export function civicInbox(shifts:readonly WorkShift[],government:GovernmentSnapshot|null,nationId:string|null,now:number,collective?:CollectivePetitions|null):InboxItem[]{
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
 return [...entries.values()].sort((a,b)=>b.at-a.at);
}
export function unreadInbox(items:readonly InboxItem[],readIds:readonly string[]){const seen=new Set(readIds);return items.filter(item=>!seen.has(item.id)).length;}
export function markInboxRead(items:readonly InboxItem[],readIds:readonly string[]){return [...new Set([...readIds,...items.map(item=>item.id)])].slice(-128);}

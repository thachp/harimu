import type { WorkShift } from './work-shifts';
import type { GovernmentSnapshot } from './government';
export type InboxItem={id:string;title:string;text:string;at:number;view:'workplace'|'government'};
/** Read-only guidance. Reaching a displayed deadline never claims or grants a reward. */
export function civicInbox(shifts:readonly WorkShift[],government:GovernmentSnapshot|null,nationId:string|null,now:number):InboxItem[]{
 if(!nationId||!Number.isFinite(now)||now<=0)return[];
 const entries=new Map<string,InboxItem>();
 for(const shift of shifts){const at=Date.parse(shift.completesAt);if(shift.claimedAt!==null||!Number.isFinite(at)||at>now)continue;
  const id=`work:${shift.id}`;entries.set(id,{id,title:`Check collection · ${shift.orderName}`,text:'The recorded shift deadline has passed. Open Work and refresh to confirm collection with the server. This notification does not claim rewards.',at,view:'workplace'});
 }
 if(government?.nationId===nationId)for(const petition of government.petitions??[]){const at=(petition.reviewedAt??petition.submittedAt)*1000;if(!Number.isFinite(at))continue;
  const id=`petition:${petition.requestId}:${petition.status}`;entries.set(id,{id,title:`Your ${petition.topic} petition · ${petition.status}`,text:petition.reason,at,view:'government'});
 }
 return [...entries.values()].sort((a,b)=>b.at-a.at);
}
export function unreadInbox(items:readonly InboxItem[],readIds:readonly string[]){const seen=new Set(readIds);return items.filter(item=>!seen.has(item.id)).length;}
export function markInboxRead(items:readonly InboxItem[],readIds:readonly string[]){return [...new Set([...readIds,...items.map(item=>item.id)])].slice(-128);}

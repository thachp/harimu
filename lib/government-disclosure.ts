import type {GovernmentSnapshot} from './government';
export function governmentDisclosure(snapshot:GovernmentSnapshot){
 const kind=snapshot.nationId==='kindle'?'brief':'official';
 return {kind,title:kind==='brief'?'Reasoning Brief':snapshot.nationId==='korund'?"Chairman's official statement":'Royal decree',text:kind==='brief'?snapshot.decision.reason:`${snapshot.decision.title}. Programme proposal: ${snapshot.decision.proposedSpendMinor} minor units. This is a rule-bound proposal, not an executed allocation.`,provenance:'deterministic' as const};
}
/** Public API projection: never serialize private deliberation or arbitrary record fields. */
export function publicGovernmentSnapshot(snapshot:GovernmentSnapshot|null):GovernmentSnapshot|null{
 if(!snapshot)return null;
 const open=snapshot.nationId==='kindle';
 return {nationId:snapshot.nationId,mode:snapshot.mode,roles:snapshot.roles.map(role=>({name:role.name,controller:role.controller})),
  decision:{title:snapshot.decision.title,topic:snapshot.decision.topic,proposedSpendMinor:snapshot.decision.proposedSpendMinor,reason:open?snapshot.decision.reason:governmentDisclosure(snapshot).text},
  availableBudgetMinor:snapshot.availableBudgetMinor,influenceSummary:snapshot.influenceSummary,
  ...(snapshot.crown?{crown:{claimantId:snapshot.crown.claimantId,name:snapshot.crown.name,house:snapshot.crown.house,motto:snapshot.crown.motto,color:snapshot.crown.color,crownedAt:snapshot.crown.crownedAt,...(snapshot.crown.how?{how:snapshot.crown.how}:{})}}:{}), // #306: the Aurelle crown (set only after a Rising, so the flag still gates it)
  ...(snapshot.presidium?{presidium:snapshot.presidium}:{}), // #70/#74: public roster only (readGovernment adds it solely while the flag is on)
  ...(snapshot.review?{review:{periodStart:snapshot.review.periodStart,reviewedAt:snapshot.review.reviewedAt,petitionCount:snapshot.review.petitionCount,active:snapshot.review.active,expiresAt:snapshot.review.expiresAt}}:{}),
  ...(snapshot.petitions?{petitions:snapshot.petitions.map(petition=>({requestId:petition.requestId,topic:petition.topic,submittedAt:petition.submittedAt,status:petition.status,reviewedAt:petition.reviewedAt,reason:open?petition.reason:petition.reason.startsWith('Legacy prototype petition')?'Legacy prototype petition has no eligibility receipt and is not counted in new reviews.':petition.status==='pending'?'Awaiting the next recorded review.':petition.status==='accepted'?'Accepted as the reviewed policy priority.':'Deferred because another priority took precedence.'}))}:{})};
}

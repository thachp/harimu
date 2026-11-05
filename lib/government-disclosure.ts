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
  ...(snapshot.directorate?{directorate:snapshot.directorate}:{}), // #1085: Chair, Commands, next Rotation Day (readGovernment adds it only while the flag is on)
  ...(snapshot.mandatePlebiscite?{mandatePlebiscite:snapshot.mandatePlebiscite}:{}), // #1094: next Mandate Plebiscite (readGovernment adds it only while the flag is on)
  ...(snapshot.moot?{moot:{electedAt:snapshot.moot.electedAt,dissolvesBy:snapshot.moot.dissolvesBy,primeMinisterInvestedAt:snapshot.moot.primeMinisterInvestedAt,investitureDeadline:snapshot.moot.investitureDeadline,reservePowersAvailable:snapshot.moot.reservePowersAvailable}}:{}), // #1096: Moot term (readGovernment adds it only while the flag is on)
  ...(snapshot.federalCouncil?{federalCouncil:snapshot.federalCouncil}:{}), // #1098: next Council election and Speaker seat (readGovernment adds it only while the flag is on)
  ...(snapshot.voteDayCalendar?{voteDayCalendar:snapshot.voteDayCalendar}:{}), // #1122: next Vote Day (readGovernment adds it only while the flag is on)
  ...(snapshot.grandCouncil?{grandCouncil:snapshot.grandCouncil}:{}), // #1102: Council of Ten, Lodestar and Tribune session (readGovernment adds it only while the flag is on)
  ...(snapshot.sanctum?{sanctum:snapshot.sanctum}:{}), // #1107: Oracle term, Elders, Stillday, Great Pilgrimage (readGovernment adds it only while the flag is on)
  ...(snapshot.feastOfFirstLight?{feastOfFirstLight:snapshot.feastOfFirstLight}:{}), // #1137: next Feast of First Light (readGovernment adds it only while the flag is on)
  ...(snapshot.party?{party:snapshot.party}:{}), // #1113: Four Pillars and the next Party Congress (readGovernment adds it only while the flag is on)
  ...(snapshot.partyState?{partyState:snapshot.partyState}:{}), // #1114: Meridian Party Congress schedule (readGovernment adds it only while the flag is on)
  ...(snapshot.examDay?{examDay:snapshot.examDay}:{}), // #1133: next Exam Day (readGovernment adds it only while the flag is on)
  ...(snapshot.assemblyElection?{assemblyElection:snapshot.assemblyElection}:{}), // #1123: Confluence People's Assembly window (readGovernment adds it only while the flag is on)
  ...(snapshot.planCalendar?{planCalendar:snapshot.planCalendar}:{}), // #1116: Korund Plan Day and Quota Rally (readGovernment adds it only while the flag is on)
  ...(snapshot.crownCalendar?{crownCalendar:snapshot.crownCalendar}:{}), // #1118: Aurelle reign start and next Great Council window (readGovernment adds it only while the flag is on)
  ...(snapshot.electionClock?{electionClock:{termEndsAt:snapshot.electionClock.termEndsAt,nextBallotNightAt:snapshot.electionClock.nextBallotNightAt,termDays:snapshot.electionClock.termDays,maxConsecutiveTerms:snapshot.electionClock.maxConsecutiveTerms}}:{}), // #1117: term end and next Ballot Night (readGovernment adds it only while the flag is on)
  ...(snapshot.review?{review:{periodStart:snapshot.review.periodStart,reviewedAt:snapshot.review.reviewedAt,petitionCount:snapshot.review.petitionCount,active:snapshot.review.active,expiresAt:snapshot.review.expiresAt}}:{}),
  ...(snapshot.petitions?{petitions:snapshot.petitions.map(petition=>({requestId:petition.requestId,topic:petition.topic,submittedAt:petition.submittedAt,status:petition.status,reviewedAt:petition.reviewedAt,reason:open?petition.reason:petition.reason.startsWith('Legacy prototype petition')?'Legacy prototype petition has no eligibility receipt and is not counted in new reviews.':petition.status==='pending'?'Awaiting the next recorded review.':petition.status==='accepted'?'Accepted as the reviewed policy priority.':'Deferred because another priority took precedence.'}))}:{})};
}

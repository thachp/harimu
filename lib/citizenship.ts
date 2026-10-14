export const citizenshipGraceMs=48*60*60*1000;
type CitizenshipRecord={nation_id:string|null;created_at:string;nation_changes:number};
export function validEnrollmentExpectation(body:Record<string,unknown>):boolean {
 return Object.hasOwn(body,'expectedNationId') && (body.expectedNationId===null || (typeof body.expectedNationId==='string' && body.expectedNationId.length>0));
}
export function citizenshipStatus(profile:CitizenshipRecord,politicalActionTaken:boolean,nowMs=Date.now()) {
 const enrolled=Date.parse(profile.created_at);
 const validTime=Number.isFinite(enrolled)&&Number.isFinite(nowMs)&&enrolled<=nowMs;
 const graceEndsAt=validTime?new Date(enrolled+citizenshipGraceMs).toISOString():null;
 const validCounter=Number.isInteger(profile.nation_changes)&&profile.nation_changes>=0;
 const changeUsed=!validCounter||profile.nation_changes>=1;
 const lockedReason=politicalActionTaken?'political-action':changeUsed?'change-used':!validTime||nowMs>=enrolled+citizenshipGraceMs?'grace-expired':null;
 return {enrolledAt:profile.created_at,graceEndsAt,changesRemaining:changeUsed?0:1,politicalActionTaken,
 canChange:Boolean(profile.nation_id)&&lockedReason===null,lockedReason};
}
// A first enrollment cannot overwrite another command's winning choice.
export const enrollmentInitialSql=`INSERT OR IGNORE INTO citizens
 (clerk_user_id,nation_id,nation_changes,capacity,influence,standing,created_at,updated_at)
 VALUES (?,?,0,18,1240,'Good standing',?,?)`;
export const enrollmentFirstSql=`UPDATE citizens SET nation_id=?,created_at=?,updated_at=?
 WHERE clerk_user_id=? AND nation_id IS NULL`;
// All eligibility and the nation the citizen reviewed are checked in the write.
export const enrollmentChangeSql=`UPDATE citizens SET nation_id=?,nation_changes=nation_changes+1,updated_at=?
 WHERE clerk_user_id=? AND nation_id=? AND nation_id!=? AND nation_changes=0
 AND julianday(created_at)<=julianday(?)
 AND julianday(created_at,'+48 hours')>julianday(?)
 AND NOT EXISTS(SELECT 1 FROM citizen_decisions WHERE clerk_user_id=? LIMIT 1)
 AND NOT EXISTS(SELECT 1 FROM government_petitions WHERE clerk_user_id=? LIMIT 1)
 AND NOT EXISTS(SELECT 1 FROM civic_petition_signatures WHERE clerk_user_id=? LIMIT 1)
 AND NOT EXISTS(SELECT 1 FROM civic_voter_receipts WHERE clerk_user_id=? AND ballot_written=1 LIMIT 1)
 AND NOT EXISTS(SELECT 1 FROM poc_voter_receipts WHERE clerk_user_id=? AND ballot_written=1 LIMIT 1)`;

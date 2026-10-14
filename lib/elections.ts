import type {GameDatabase} from './database-contract';
import {instantRunoffCounts,type RunoffResult} from './instant-runoff';
import {trustedBallotPrivacyReady,ballotPrivacyReason} from './ballot-privacy';
export const electionId='kindle-presidential-poc-1';
export const ballotWindowSeconds=72*3600;
export const electionCandidates=[
 {id:'ines-varro',name:'Ines Varro',platform:'Full employment and cautious trade.'},
 {id:'tobin-achterberg',name:'Tobin Achterberg',platform:'Lower levies and open markets.'},
 {id:'mara-quell',name:'Mara Quell',platform:'Public housing and dock building.'},
] as const;
export const candidateIds=electionCandidates.map(candidate=>candidate.id);
export const electionSchemas=[
 `CREATE TABLE IF NOT EXISTS civic_elections (id TEXT PRIMARY KEY,nation_id TEXT NOT NULL CHECK(nation_id='kindle'),candidates_json TEXT NOT NULL CHECK(json_valid(candidates_json) AND json_array_length(candidates_json)=3),opens_at INTEGER NOT NULL,closes_at INTEGER NOT NULL,closed_at INTEGER,result_json TEXT,CHECK(closes_at=opens_at+259200),CHECK(closed_at IS NULL OR closed_at>=closes_at),CHECK(result_json IS NULL OR (closed_at IS NOT NULL AND json_valid(result_json))))`,
 `CREATE TABLE IF NOT EXISTS civic_voter_receipts (election_id TEXT NOT NULL REFERENCES civic_elections(id),clerk_user_id TEXT NOT NULL REFERENCES citizens(clerk_user_id),request_id TEXT NOT NULL UNIQUE,checked_at INTEGER NOT NULL,ballot_written INTEGER NOT NULL DEFAULT 0 CHECK(ballot_written IN (0,1)),policy TEXT NOT NULL CHECK(policy='tier1-human-v1'),PRIMARY KEY(election_id,clerk_user_id)) WITHOUT ROWID`,
 // No citizen, receipt identifier, timestamp or rowid can directly link a ranking to a voter.
 `CREATE TABLE IF NOT EXISTS civic_anonymous_ballots (id TEXT PRIMARY KEY,election_id TEXT NOT NULL REFERENCES civic_elections(id),ranking_json TEXT NOT NULL CHECK(json_valid(ranking_json) AND json_array_length(ranking_json)=3),policy TEXT NOT NULL CHECK(policy='tier1-human-v1')) WITHOUT ROWID`,
 `CREATE INDEX IF NOT EXISTS idx_anonymous_ballots_election ON civic_anonymous_ballots(election_id)`,
];
export type ElectionSnapshot={nationId:'kindle';id:string;candidates:readonly {id:string;name:string;platform:string}[];status:'waiting'|'open'|'closed';opensAt:number|null;closesAt:number|null;voted:boolean;result:RunoffResult|null;privacyReady:boolean;privacyReason:string};
export async function openPreviewElection(db:GameDatabase,userId:string,now:number,privacyReady=trustedBallotPrivacyReady()){
 if(!privacyReady)return;
 // The caller must validate the applicable trusted policy: certified Tier1 or
 // the separately namespaced, approved account-level preview exception.
 await db.prepare(`INSERT INTO civic_elections (id,nation_id,candidates_json,opens_at,closes_at) SELECT ?,'kindle',?,?,?+259200 FROM citizens WHERE clerk_user_id=? AND nation_id='kindle' ON CONFLICT(id) DO NOTHING`).bind(electionId,JSON.stringify(electionCandidates),now,now,userId).run();
}
export const voteReceiptSql=`INSERT INTO civic_voter_receipts (election_id,clerk_user_id,request_id,checked_at,policy)
 SELECT e.id,c.clerk_user_id,?,?,'tier1-human-v1' FROM civic_elections e JOIN citizens c ON c.clerk_user_id=?
 WHERE e.id=? AND c.nation_id='kindle' AND e.nation_id='kindle' AND e.closed_at IS NULL AND e.opens_at<=? AND e.closes_at>?
 ON CONFLICT DO NOTHING`;
export const anonymousBallotSql=`INSERT INTO civic_anonymous_ballots (id,election_id,ranking_json,policy)
 SELECT ?,r.election_id,?,'tier1-human-v1' FROM civic_voter_receipts r WHERE r.request_id=? AND r.clerk_user_id=? AND r.election_id=? AND r.ballot_written=0`;
export const markBallotWrittenSql=`UPDATE civic_voter_receipts SET ballot_written=1 WHERE request_id=? AND clerk_user_id=? AND election_id=? AND ballot_written=0`;
async function countedResult(db:GameDatabase){
 const rows=await db.prepare("SELECT ranking_json,COUNT(*) AS count FROM civic_anonymous_ballots WHERE election_id=? AND policy='tier1-human-v1' GROUP BY ranking_json").bind(electionId).all<{ranking_json:string;count:number}>();
  const groups=rows.results.map(row=>({ranking:JSON.parse(row.ranking_json) as string[],count:row.count}));const result=instantRunoffCounts(candidateIds,groups,candidateIds);
  const receipts=await db.prepare("SELECT COUNT(*) AS count FROM civic_voter_receipts WHERE election_id=? AND ballot_written=1 AND policy='tier1-human-v1'").bind(electionId).first<{count:number}>();
  if(receipts?.count!==result.humanBallots)throw Error('Election count could not be confirmed. No result published.');
 return result;
}
async function finalizedResult(db:GameDatabase,now:number){
 await db.prepare('UPDATE civic_elections SET closed_at=? WHERE id=? AND closed_at IS NULL AND closes_at<=?').bind(now,electionId,now).run();
 const election=await db.prepare('SELECT result_json FROM civic_elections WHERE id=? AND closed_at IS NOT NULL').bind(electionId).first<{result_json:string|null}>();
 if(!election)return null;
 if(!election.result_json){
  const result=await countedResult(db);
  await db.prepare('UPDATE civic_elections SET result_json=? WHERE id=? AND closed_at IS NOT NULL AND result_json IS NULL').bind(JSON.stringify(result),electionId).run();
 }
 const saved=await db.prepare('SELECT result_json FROM civic_elections WHERE id=? AND closed_at IS NOT NULL').bind(electionId).first<{result_json:string}>();
 if(!saved?.result_json)return null;
 const result=JSON.parse(saved.result_json) as RunoffResult;
 if(result.weightScale!==4||!Number.isSafeInteger(result.humanBallots)||result.humanBallots<0||result.simulatedPublicUnits!==result.humanBallots||!Array.isArray(result.rounds)||result.rounds.length>candidateIds.length||result.winner!==null&&!candidateIds.some(id=>id===result.winner))throw Error('Saved election count could not be verified.');
 // An explicit aggregate projection, never raw stored JSON or anonymous ballot rows.
 const counts=(value:Record<string,number>)=>Object.fromEntries(candidateIds.filter(id=>Object.hasOwn(value,id)).map(id=>{if(!Number.isSafeInteger(value[id])||value[id]<0)throw Error('Saved election count could not be verified.');return[id,value[id]];}));
 if(result.rounds.some(round=>round.eliminated!==null&&!candidateIds.some(id=>id===round.eliminated)))throw Error('Saved election count could not be verified.');
 const projected={winner:result.winner,humanBallots:result.humanBallots,simulatedPublicUnits:result.simulatedPublicUnits,weightScale:4 as const,rounds:result.rounds.map(round=>({human:counts(round.human),simulatedUnits:counts(round.simulatedUnits),weightedUnits:counts(round.weightedUnits),eliminated:round.eliminated}))};
 // Closing freezes writes; these grouped rankings are bounded to the six
 // permutations. Verify the stored aggregate against that authoritative count.
 const expected=await countedResult(db);
 if(JSON.stringify(projected)!==JSON.stringify(expected))throw Error('Saved election aggregate does not match the confirmed count.');
 return projected;
}

export async function readElection(db:GameDatabase,userId:string,now:number,privacyReady=trustedBallotPrivacyReady()):Promise<ElectionSnapshot>{
 const election=await db.prepare('SELECT candidates_json,opens_at,closes_at,closed_at FROM civic_elections WHERE id=?').bind(electionId).first<{candidates_json:string;opens_at:number;closes_at:number;closed_at:number|null}>();
 const base={nationId:'kindle' as const,id:electionId,candidates:electionCandidates,voted:false,result:null,privacyReady,privacyReason:privacyReady?'Account-level preview privacy: operators may correlate submissions.':ballotPrivacyReason};
 if(!election)return {...base,status:'waiting',opensAt:null,closesAt:null};
 const slate=JSON.parse(election.candidates_json) as {id:string;name:string;platform:string}[];
 if(!Array.isArray(slate)||slate.length!==candidateIds.length||slate.some((candidate,index)=>candidate.id!==candidateIds[index]||typeof candidate.name!=='string'||typeof candidate.platform!=='string'))throw Error('Saved candidate slate could not be confirmed.');
 const candidates=slate.map(({id,name,platform})=>({id,name,platform}));
 const own=await db.prepare('SELECT ballot_written FROM civic_voter_receipts WHERE election_id=? AND clerk_user_id=?').bind(electionId,userId).first<{ballot_written:number}>();
 const closed=election.closed_at!==null||now>=election.closes_at;
 return {...base,candidates,status:closed?'closed':'open',opensAt:election.opens_at,closesAt:election.closes_at,voted:own?.ballot_written===1,result:closed?await finalizedResult(db,now):null};
}

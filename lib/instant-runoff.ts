export type RunoffRound={human:Record<string,number>;simulatedUnits:Record<string,number>;weightedUnits:Record<string,number>;eliminated:string|null};
export type RunoffResult={winner:string|null;humanBallots:number;simulatedPublicUnits:number;weightScale:4;rounds:RunoffRound[]};
export function validRanking(value:unknown,candidates:readonly string[]):value is string[]{return Array.isArray(value)&&value.length===candidates.length&&value.every(id=>typeof id==='string'&&candidates.includes(id))&&new Set(value).size===candidates.length;}
/** Complete ranked ballots; fixed, publicly declared tie order is candidate order.
 * Humans have four units each. One simulated bloc gets N units for N humans:
 * N / (4N + N) = 20%, without fractional arithmetic or individual AI ballots.
 */
export function instantRunoff(candidates:readonly string[],humanBallots:readonly (readonly string[])[],blocRanking:readonly string[]):RunoffResult{
 return instantRunoffCounts(candidates,humanBallots.map(ranking=>({ranking,count:1})),blocRanking);
}
/** SQL groups at most six complete permutations for the three-candidate PoC. */
export function instantRunoffCounts(candidates:readonly string[],groups:readonly {ranking:readonly string[];count:number}[],blocRanking:readonly string[]):RunoffResult{
 if(candidates.length<2||new Set(candidates).size!==candidates.length||candidates.some(id=>!id||id==='__proto__'||id==='constructor'||id==='prototype')||!validRanking(blocRanking,candidates)||groups.some(group=>!validRanking(group.ranking,candidates)||!Number.isSafeInteger(group.count)||group.count<0))throw Error('Invalid complete ranked ballot.');
 const count=groups.reduce((sum,group)=>sum+group.count,0);if(!Number.isSafeInteger(count*5))throw Error('Invalid ballot count.');
 const result:RunoffResult={winner:null,humanBallots:count,simulatedPublicUnits:count,weightScale:4,rounds:[]};if(!count)return result;
 const remaining=new Set(candidates),total=count*5;
 while(remaining.size){
  const human=Object.fromEntries([...remaining].map(id=>[id,0])),simulatedUnits={...human},weightedUnits={...human};
  for(const group of groups){const first=group.ranking.find(id=>remaining.has(id));if(first)human[first]+=group.count;}
  const blocFirst=blocRanking.find(id=>remaining.has(id));if(blocFirst)simulatedUnits[blocFirst]=count;
  for(const id of remaining)weightedUnits[id]=human[id]*4+simulatedUnits[id];
  const winner=[...remaining].find(id=>weightedUnits[id]>total/2);
  if(winner||remaining.size===1){result.winner=winner??[...remaining][0];result.rounds.push({human,simulatedUnits,weightedUnits,eliminated:null});return result;}
  const lowest=Math.min(...Object.values(weightedUnits));const eliminated=candidates.find(id=>remaining.has(id)&&weightedUnits[id]===lowest)!;
  result.rounds.push({human,simulatedUnits,weightedUnits,eliminated});remaining.delete(eliminated);
 }
 return result;
}

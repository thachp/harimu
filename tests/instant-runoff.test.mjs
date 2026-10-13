import assert from 'node:assert/strict';
import {test} from 'node:test';
import {instantRunoff,instantRunoffCounts,validRanking} from '../lib/instant-runoff.ts';
const candidates=['ines','tobin','mara'];
test('only complete unique candidate rankings are accepted',()=>{
 assert.equal(validRanking(candidates,candidates),true);for(const bad of [null,['ines'],['ines','ines','mara'],['ines','tobin','foreign']])assert.equal(validRanking(bad,candidates),false);
 assert.throws(()=>instantRunoff(candidates,[['ines','ines','mara']],candidates));assert.throws(()=>instantRunoff(['__proto__','ines'],[],['__proto__','ines']));
});
test('grouped rankings preserve exact counts without expanding every anonymous ballot',()=>{
 const result=instantRunoffCounts(candidates,[{ranking:['mara','ines','tobin'],count:1000000}],candidates);assert.equal(result.winner,'mara');assert.equal(result.humanBallots,1000000);assert.equal(result.rounds[0].weightedUnits.mara,4000000);
 for(const count of [NaN,Infinity,-1,.5,Number.MAX_SAFE_INTEGER])assert.throws(()=>instantRunoffCounts(candidates,[{ranking:candidates,count}],candidates));
});
test('no human votes means no simulated weight and no fabricated winner',()=>{
 assert.deepEqual(instantRunoff(candidates,[],candidates),{winner:null,humanBallots:0,simulatedPublicUnits:0,weightScale:4,rounds:[]});
});
test('a first-preference human majority wins despite a different capped simulated bloc',()=>{
 const result=instantRunoff(candidates,[['mara','tobin','ines'],['mara','ines','tobin'],['tobin','mara','ines']],candidates);
 assert.equal(result.winner,'mara');assert.equal(result.rounds.length,1);assert.deepEqual(result.rounds[0].human,{ines:0,tobin:1,mara:2});assert.deepEqual(result.rounds[0].simulatedUnits,{ines:3,tobin:0,mara:0});
});
test('eliminated candidates transfer complete ballots and each round preserves all human votes',()=>{
 const ballots=[...Array.from({length:4},()=>['ines','mara','tobin']),...Array.from({length:3},()=>['tobin','mara','ines']),...Array.from({length:3},()=>['mara','tobin','ines'])];
 const result=instantRunoff(candidates,ballots,['tobin','mara','ines']);assert.equal(result.rounds[0].eliminated,'mara');assert.equal(result.winner,'tobin');assert.equal(result.rounds[1].human.tobin,6);
 for(const round of result.rounds){assert.equal(Object.values(round.human).reduce((a,b)=>a+b,0),10);assert.equal(Object.values(round.simulatedUnits).reduce((a,b)=>a+b,0),10);assert.equal(Object.values(round.weightedUnits).reduce((a,b)=>a+b,0),50);}
});
test('equal lowest scores use the declared tie order and the simulated bloc remains at its cap',()=>{
 const result=instantRunoff(candidates,[['ines','tobin','mara'],['tobin','ines','mara'],['mara','tobin','ines']],['mara','tobin','ines']);
 assert.equal(result.rounds[0].eliminated,'ines');assert.equal(result.simulatedPublicUnits/(result.humanBallots*result.weightScale+result.simulatedPublicUnits),.2);
});

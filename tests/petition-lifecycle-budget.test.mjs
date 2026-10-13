import assert from 'node:assert/strict';
import {simulateGovernment,rebaseGovernmentBudget} from '../lib/government.ts';
const original=simulateGovernment({nationId:'kindle',availableBudgetMinor:10000,foodSecurity:100,petitionCounts:{work:3}});
for (const emergency of [false,true]) for (const budget of [0,1,999,20000,Number.MAX_SAFE_INTEGER,-1,NaN,Infinity,1.5]) {
 const live=rebaseGovernmentBudget(original,budget,emergency);
 const valid=Number.isSafeInteger(budget)&&budget>=0?budget:0;
 assert.equal(live.availableBudgetMinor,valid);
 assert.equal(live.decision.proposedSpendMinor,Math.floor(valid/(emergency?5:10)));
 assert.equal(live.decision.topic,'work');
 assert.match(live.decision.reason,/historical/);
}
assert.equal(original.availableBudgetMinor,10000);
assert.equal(original.decision.proposedSpendMinor,1000);
console.log('Petition live budget rebasing: current bounds, malformed funds and immutable historical snapshot passed.');

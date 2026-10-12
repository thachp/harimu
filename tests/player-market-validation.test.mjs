import assert from 'node:assert/strict';
import { validPlayerCommand, parseSparkPrice } from '../lib/player-market.ts';
const requestId='12345678-1234-4123-8123-123456789abc';
const base={action:'create-listing',requestId,item:'food',quantity:1,unitMinor:1};
assert.equal(validPlayerCommand(base),true);
for(const field of ['quantity','unitMinor'])for(const value of [0,-1,1.1,NaN,Infinity,'1'])assert.equal(validPlayerCommand({...base,[field]:value}),false);
for(const changes of [{quantity:11},{unitMinor:1001},{item:'weapons'},{requestId:'bad'},{action:'unknown'}])assert.equal(validPlayerCommand({...base,...changes}),false);
for(const action of ['buy-listing','cancel-listing']){
 assert.equal(validPlayerCommand({action,requestId,listingId:requestId}),true);
 assert.equal(validPlayerCommand({action,requestId,listingId:'bad'}),false);
}
for(const [input,expected] of [['0.01',1],['0.1',10],['1',100],['1.23',123],['10.00',1000],['0',null],['10.01',null],['1.001',null],['1e1',null],[' 1',null],['-1',null],['Infinity',null]])assert.equal(parseSparkPrice(input),expected,input);
console.log('Player-market validation and exact decimal prices passed');

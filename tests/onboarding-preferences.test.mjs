import assert from 'node:assert/strict';
import {test} from 'node:test';
import {suggestNations} from '../lib/onboarding-preferences.ts';
const ids=['kindle','confluence','meridian','korund','aurelle','ilmar','hoarvale','varkand','veldwood','fulmara'];
test('neutral preferences return three stable distinct valid choices',()=>{
 const result=suggestNations({});assert.equal(result.length,3);assert.equal(new Set(result).size,3);assert.deepEqual(result,suggestNations({}));assert.deepEqual(result,['kindle','korund','aurelle']);assert.ok(result.every(id=>ids.includes(id)));
});
test('power, money and faith preferences favor matching documented nations',()=>{
 assert.ok(suggestNations({power:'democracy',money:'markets',faith:'free'}).every(id=>['kindle','hoarvale','veldwood'].includes(id)));
 assert.ok(suggestNations({power:'crown',money:'backed',faith:'state'}).includes('ilmar'));
 assert.equal(suggestNations({power:'party',money:'ration',faith:'none'})[0],'korund');
});
test('unknown input never creates unknown nation IDs',()=>{
 assert.deepEqual(suggestNations({power:'unknown',money:'unknown',faith:'unknown'}),suggestNations({}));
});

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {scopeNotice} from '../lib/notice-scope.ts';
const visible=(scope,dismissed)=>!!scope.notice&&scope.notice!==dismissed;
function run(steps){let scope={view:steps[0].view,notice:steps[0].notice,kind:steps[0].kind},dismissed;for(const step of steps){const next=scopeNotice(scope,step);if(next!==scope){scope=next;if(next.dismiss!==undefined)dismissed=next.dismiss;}}return visible(scope,dismissed);}
test('success notice hides after a view change and stays hidden on return',()=>{const s={notice:'Shift started',kind:'success'};assert.equal(run([{view:'workplace',...s}]),true);assert.equal(run([{view:'workplace',...s},{view:'market',...s}]),false);assert.equal(run([{view:'workplace',...s},{view:'market',...s},{view:'workplace',...s}]),false);});
test('error notice persists across views',()=>{const e={notice:'Connection interrupted',kind:'error'};assert.equal(run([{view:'workplace',...e},{view:'market',...e}]),true);});
test('old success does not resurface when an error clears in another view',()=>{const s={notice:'Shift started',kind:'success'};assert.equal(run([{view:'workplace',...s},{view:'market',...s},{view:'market',notice:'Failed',kind:'error'},{view:'market',...s}]),false);});
test('a new success in the current view is shown',()=>{assert.equal(run([{view:'workplace',notice:'A',kind:'success'},{view:'market',notice:'A',kind:'success'},{view:'market',notice:'B',kind:'success'}]),true);});

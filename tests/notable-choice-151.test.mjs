import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {notableProfiles,pickNotable} from '../lib/notable-profiles.ts';
import {additionalNotableProfiles} from '../lib/notable-roster.ts';
import {localRuntime} from './helpers/local-runtime.mjs';

// Mirrors lib/notable-choice.ts, which can't be imported here directly (it has runtime imports).
const nationNotables=n=>Object.hasOwn(notableProfiles,n)?[notableProfiles[n],...additionalNotableProfiles[n]]:[];
const notableFor=(n,u,t)=>pickNotable(nationNotables(n),u,t);
const day=Date.UTC(2026,9,14)/1000;
test('#151 a nation\'s Notables come from its content list, primary first',()=>{
 for(const nation of ['kindle','korund','aurelle'])assert.deepEqual(nationNotables(nation).map(p=>p.id),[notableProfiles[nation].id,...additionalNotableProfiles[nation].map(p=>p.id)]);
});
test('#151 the choice is deterministic per citizen and day, and varies across citizens and days',()=>{
 const roster=nationNotables('kindle');
 for(const user of ['alice','bob','carol'])assert.equal(notableFor('kindle',user,day).id,notableFor('kindle',user,day+86399).id);
 const seen=new Set();for(let i=0;i<60;i++){const p=notableFor('kindle',`user-${i}`,day);assert.ok(roster.includes(p));seen.add(p.id);}
 assert.equal(seen.size,roster.length,'every Kindle Notable appears across 60 citizens');
 const days=new Set();for(let d=0;d<30;d++)days.add(notableFor('korund','alice',day+d*86400).id);assert.ok(days.size>1,'rotates across days');
});
test('#151 nothing changes for a nation with a single Notable',()=>{
 const only={id:'solo'};for(const user of ['a','b','c'])assert.equal(pickNotable([only],user,day),only);assert.equal(pickNotable([],'a',day),null);
});
test('#151 the API serves the citizen\'s Notable for the day; own-nation Notables are accepted, foreign ones rejected',async t=>{
 const r=await localRuntime();t.after(()=>r.close());r.setNow(day*1000+60_000);
 await r.call('citizen','alice');const nation=(await r.db.prepare("SELECT nation_id FROM citizens WHERE clerk_user_id='alice'").first()).nation_id;
 const expected=notableFor(nation,'alice',day+60);const got=await r.call('notables','alice');
 assert.equal(got.status,200);assert.equal(got.data.profile.id,expected.id);
 for(const own of nationNotables(nation))assert.equal((await r.call('notables','alice',{requestId:randomUUID(),notableId:own.id,topic:'news'})).status,503,'own-nation Notable passes authorization (AI off by default)');
 const foreign=nationNotables(nation==='kindle'?'korund':'kindle')[0];
 assert.equal((await r.call('notables','alice',{requestId:randomUUID(),notableId:foreign.id,topic:'news'})).status,403);
});

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {localRuntime} from './helpers/local-runtime.mjs';
import {citiesForNation,capitalCityForNation} from '../lib/cities.ts';
const fixture=async t=>{const r=await localRuntime();t.after(()=>r.close());return r;};
const allowed=['key','name','nationId','kind','status','you'];
test('#75 co-residents: player listed, city-scoped, refreshed on travel, public fields only',async t=>{
 const r=await fixture(t),capital=capitalCityForNation('kindle'),other=citiesForNation('kindle').find(c=>!c.capital);
 await r.call('city','bob');
 const first=(await r.call('city','alice')).data;
 const humans=first.coResidents.filter(x=>x.kind==='human');
 assert.ok(humans.some(x=>x.you),'the player is listed');assert.equal(humans[0].you,true,'player first');
 assert.equal(humans.length,2);assert.ok(first.coResidents.some(x=>x.kind==='ai'),'includes an AI sample');
 assert.ok(first.coResidents.filter(x=>x.kind==='ai').length<=3);
 for(const x of first.coResidents){assert.deepEqual(Object.keys(x).sort(),[...allowed].sort());assert.ok(['working','idle'].includes(x.status));assert.equal(x.nationId,'kindle');}
 for(const x of first.coResidents)assert.ok(!/alice|bob/.test(x.key),'opaque keys, never user ids');
 const payload=JSON.stringify(first.coResidents);for(const leak of ['wallet','balance','"x"','"y"','lat','clerk','user'])assert.ok(!payload.includes(leak),leak);
 // Working status from an active shift.
 assert.equal((await r.call('citizen','alice',{action:'commit-work',workOrderId:'harvest'})).status,200);
 assert.equal((await r.call('city','alice')).data.coResidents.find(x=>x.you).status,'working');
 // Ended but uncollected shift is idle, not working.
 const shift=(await r.call('citizen','alice')).data.shifts[0];r.setNow(Date.parse(shift.completesAt)+1000);
 assert.equal((await r.call('city','alice')).data.coResidents.find(x=>x.you).status,'idle');
 // AI sample: only the live Notable, never #148's inactive roster.
 const {notableProfiles}=await import('../lib/notable-profiles.ts');
 assert.deepEqual((await r.call('city','alice')).data.coResidents.filter(x=>x.kind==='ai').map(x=>x.name),[notableProfiles.kindle.name]);
 // Travel refreshes the list for the new city.
 const moved=(await r.call('city','alice',{action:'travel',cityId:other.id})).data;
 assert.deepEqual(moved.coResidents.filter(x=>x.kind==='human').map(x=>x.you),[true]);
 const bob=(await r.call('city','bob')).data;assert.equal(bob.currentCityId,capital.id);assert.deepEqual(bob.coResidents.filter(x=>x.kind==='human').map(x=>x.you),[true]);
});
test('#75 empty state component and roster rendering',async()=>{
 const ts=(await import('typescript')).default,{readFile}=await import('node:fs/promises');
 const out=ts.transpileModule(await readFile('app/city-coresidents.tsx','utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText;
 const jsx=(type,props)=>({type,props});const exports={};new Function('exports','require',out)(exports,()=>({jsx,jsxs:jsx}));
 const text=n=>n==null||n===false?'':typeof n!=='object'?String(n):Array.isArray(n)?n.map(text).join(''):text(n.props?.children);
 assert.equal(exports.CityCoResidents({residents:null,cityName:'X'}),null);
 assert.match(text(exports.CityCoResidents({residents:[],cityName:'Forgehaven'})),/Living in Forgehaven.*No one else is here yet/);
 assert.match(text(exports.CityCoResidents({residents:[{key:'h:0',name:'Ada',nationId:'kindle',kind:'human',status:'idle',you:true}],cityName:'F'})),/No one else is here yet.*Ada \(you\)/);
 assert.match(text(exports.CityCoResidents({residents:[{key:'h:0',name:'Ada',nationId:'kindle',kind:'human',status:'idle',you:true},{key:'ai:x',name:'Mara Vale',nationId:'kindle',kind:'ai',status:'working',you:false}],cityName:'F'})),/Ada \(you\) · Citizen · idle.*Mara Vale · AI citizen · working/);
});

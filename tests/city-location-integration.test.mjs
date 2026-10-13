import assert from 'node:assert/strict';
import {test} from 'node:test';
import {localRuntime} from './helpers/local-runtime.mjs';
import {citiesForNation,capitalCityForNation} from '../lib/cities.ts';
const fixture=async t=>{const r=await localRuntime();t.after(()=>r.close());return r;};
test('additive locations default to capital; repeat travel preserves home, citizenship, resources and active shifts',async t=>{
 const r=await fixture(t),capital=capitalCityForNation('kindle'),destination=citiesForNation('kindle').find(city=>!city.capital);
 assert.ok(destination);
 const started=await r.call('citizen','alice',{action:'commit-work',workOrderId:'harvest'});assert.equal(started.status,200);
 const before=(await r.call('citizen','alice')).data;
 const initial=await r.call('city','alice');assert.equal(initial.data.currentCityId,capital.id);assert.equal(initial.data.homeCityId,capital.id);
 for(let n=0;n<2;n++){const traveled=await r.call('city','alice',{action:'travel',cityId:destination.id});assert.equal(traveled.status,200);assert.equal(traveled.data.currentCityId,destination.id);assert.equal(traveled.data.homeCityId,capital.id);}
 r.reopen();assert.equal((await r.call('city','alice')).data.currentCityId,destination.id);
 const after=(await r.call('citizen','alice')).data;assert.deepEqual(after.profile,before.profile);assert.deepEqual(after.economy,before.economy);assert.deepEqual(after.shifts,before.shifts);
 assert.equal((await r.call('city','bob')).data.currentCityId,capital.id);
 assert.equal((await r.call('city',null)).status,401);
 assert.equal((await r.call('city','alice',{action:'travel',cityId:capitalCityForNation('korund').id})).status,400);
 assert.equal((await r.call('city','alice',{action:'travel',cityId:destination.id},'https://foreign.invalid')).status,403);
});
test('opt-in presence is city-scoped, expires, and late old-city pings cannot revive a traveler',async t=>{
 const r=await fixture(t),capital=capitalCityForNation('kindle'),destination=citiesForNation('kindle').find(city=>!city.capital);
 // Legacy presence without location is a capital resident, never a foreign city.
 await r.db.prepare('INSERT INTO square_presence VALUES (?,?,?)').bind('bob','kindle',Math.floor(r.now/1000)+90).run();
 assert.equal((await r.call('square','alice')).data.present,1);
 await r.call('square','alice',{action:'presence',active:true,expectedCityId:capital.id});
 assert.equal((await r.call('square','alice')).data.present,2);
 await r.call('city','alice',{action:'travel',cityId:destination.id});
 const stale=await r.call('square','alice',{action:'presence',active:true,expectedCityId:capital.id});assert.equal(stale.status,409);
 assert.equal((await r.call('square','alice')).data.present,0);
 await r.call('square','alice',{action:'presence',active:true,expectedCityId:destination.id});
 const square=await r.call('square','alice');assert.equal(square.data.cityId,destination.id);assert.equal(square.data.present,1);
 assert.equal((await r.call('square','bob')).data.present,1);
 const cities=(await r.call('city','alice')).data.presence;assert.equal(cities.find(city=>city.cityId===capital.id).present,1);assert.equal(cities.find(city=>city.cityId===destination.id).present,1);
 r.setNow(r.now+90000);assert.equal((await r.call('square','alice')).data.present,0);assert.equal((await r.call('square','bob')).data.present,0);
});
test('nation changes normalize location and exclude foreign-nation presence',async t=>{
 const r=await fixture(t);await r.call('city','alice');await r.call('square','alice',{action:'presence',active:true});
 const changed=await r.call('citizen','alice',{action:'enroll',nationId:'korund',expectedNationId:'kindle'});assert.equal(changed.status,200);
 const location=await r.call('city','alice');assert.equal(location.data.currentCityId,capitalCityForNation('korund').id);assert.equal(location.data.homeCityId,capitalCityForNation('korund').id);
 assert.equal((await r.call('square','alice')).data.present,0);assert.equal((await r.call('square','bob')).data.present,0);
});

test('recorded additive city migration is idempotent and preserves an existing active citizen ledger',async t=>{
 const {readFile}=await import('node:fs/promises');const r=await fixture(t);
 await r.call('citizen','alice',{action:'commit-work',workOrderId:'harvest'});
 const before=(await r.call('citizen','alice')).data;
 // Existing deployments start without this new table. Reapply exactly the deploy SQL twice.
 r.db.sqlite.exec('DROP TABLE citizen_city_locations');
 const migration=await readFile(new URL('../drizzle/0007_city_locations.sql',import.meta.url),'utf8');
 r.db.sqlite.exec(migration);r.db.sqlite.exec(migration);
 const after=(await r.call('citizen','alice')).data;
 assert.deepEqual(after.profile,before.profile);assert.deepEqual(after.economy,before.economy);assert.deepEqual(after.shifts,before.shifts);
 assert.equal((await r.call('city','alice')).data.currentCityId,capitalCityForNation('kindle').id);
});

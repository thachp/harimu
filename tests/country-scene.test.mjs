import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const source=await readFile(new URL('../app/country-scene.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
function harness(){let selected=null;const travel=[],exports={};new Function('exports','require',compiled)(exports,name=>name==='react'?{useState:()=>[selected,value=>selected=value]}:name==='../lib/cities'?require('../lib/cities.ts'):name.endsWith('.css')?{country:'country'}:require(name));const props={nationId:'kindle',currentCityId:'forgehaven',homeCityId:'forgehaven',onTravel:id=>travel.push(id)};const render=()=>exports.CountryScene(props);const all=n=>[n,...[n?.props?.children].flat(Infinity).filter(Boolean).flatMap(c=>typeof c==='object'?all(c):[c])];const button=label=>all(render()).find(n=>n?.type==='button'&&n.props.children===label);const pin=name=>all(render()).find(n=>n?.type==='button'&&all(n).includes(name));return{props,render,all,button,pin,travel};}
test('pins inspect a destination, explicit free instant confirmation alone travels and Cancel clears',()=>{const h=harness();h.pin('Tarrek Foundry').props.onClick();assert.deepEqual(h.travel,[]);assert.ok(h.all(h.render()).includes('Travel confirmation: 0 cost · instant arrival · home city unchanged.'));h.button('Travel to Tarrek Foundry').props.onClick();assert.deepEqual(h.travel,['tarrek-foundry']);h.button('Cancel').props.onClick();assert.equal(h.button('Travel to Tarrek Foundry'),undefined);assert.equal(h.props.homeCityId,'forgehaven');});
test('current city cannot retravel and pending requests disable all travel controls',()=>{const h=harness();h.pin('Forgehaven').props.onClick();assert.ok(h.all(h.render()).includes('You are already in this city.'));assert.equal(h.button('Travel to Forgehaven'),undefined);h.pin('Kolt Savanna').props.onClick();h.props.pending=true;for(const node of h.all(h.render()).filter(n=>n?.type==='button'))assert.equal(node.props.disabled,true);});
test('only passed valid online counts render, unknown count is honest and foreign destinations stay hidden',()=>{const h=harness();assert.ok(h.all(h.render()).includes('Online count unavailable'));h.props.presence=[{cityId:'forgehaven',present:2},{cityId:'kolt-savanna',present:-1}];assert.ok(h.all(h.render()).includes('2 sharing presence'));h.pin('Tarrek Foundry').props.onClick();h.props.nationId='fulmara';assert.equal(h.button('Travel to Tarrek Foundry'),undefined);assert.ok(h.pin('Arcport'));});

test('foreign inspection never marks a false current city or home and cannot confirm travel',()=>{const h=harness();h.props.nationId='fulmara';h.props.currentCityId=null;h.props.homeCityId=null;h.props.travelEnabled=false;h.props.preview=true;assert.ok(h.all(h.render()).includes('Not visiting'));assert.ok(h.all(h.render()).includes('None in this nation'));h.pin('Vendezzo').props.onClick();assert.equal(h.button('Travel to Vendezzo').props.disabled,true);assert.deepEqual(h.travel,[]);});

test('travel constraints have linked visible explanations and direct callbacks cannot bypass them',()=>{
 const h=harness();h.pin('Tarrek Foundry').props.onClick();h.props.pending=true;
 const blocked=h.button('Travelling…');assert.equal(blocked.props['aria-describedby'],'city-travel-pending-reason');
 blocked.props.onClick();h.button('Cancel').props.onClick();assert.deepEqual(h.travel,[]);
 assert.ok(h.all(h.render()).some(n=>n?.props?.id==='city-travel-pending-reason'));
 h.props.pending=false;h.props.travelEnabled=false;
 const unavailable=h.button('Travel to Tarrek Foundry');assert.equal(unavailable.props['aria-describedby'],'city-travel-access-reason');unavailable.props.onClick();assert.deepEqual(h.travel,[]);
});

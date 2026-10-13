import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import ts from 'typescript';
import {cityForNation} from '../lib/cities.ts';
import {sceneHistoryState,sceneUrl} from '../lib/scene-navigation.ts';
import {localRuntime} from './helpers/local-runtime.mjs';
const source=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let declaration;function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='travelCity')declaration=node;ts.forEachChild(node,visit);}visit(ast);
assert.ok(declaration,'Exercise the actual client travel handler');
const compiled=ts.transpileModule(declaration.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function client(fetch,overrides={}){
 const state={account:null,error:'',pending:false},navigation=[];
 const window={location:{href:'https://preview.harimu.com/?view=country&nation=kindle',pathname:'/'},history:{state:{},pushState(_state,_title,url){window.location.href=url;navigation.push(url);}},dispatchEvent(){}};
 const bindings={cityTravelLock:{current:false},cityForNation,selected:{id:'kindle'},clerkConfigured:true,citizenNation:{id:'kindle'},citizenSessionStatus:'ready',currentCityAccount:{nationId:'kindle',homeCityId:'forgehaven',currentCityId:'forgehaven'},citizenEpoch:{current:0},citizenSessionKey:7,setCityTravelPending:v=>state.pending=v,setCityError:v=>state.error=v,setCityAccount:v=>state.account=v,window,sceneHistoryState,sceneUrl,Event,fetch,...overrides};
 const travel=new Function(...Object.keys(bindings),`${compiled};return travelCity;`)(...Object.values(bindings));
 return {state,navigation,bindings,travel};
}
test('actual client confirmed travel persists through API/reopen and preserves an active shift and rewards',async t=>{
 const r=await localRuntime();t.after(()=>r.close());await r.call('citizen','alice',{action:'commit-work',workOrderId:'harvest'});
 const before=(await r.call('citizen','alice')).data;
 const c=client(async(_url,options)=>{const response=await r.call('city','alice',JSON.parse(options.body));return Response.json(response.data,{status:response.status});});
 await c.travel('tarrek-foundry');assert.equal(c.state.account.value.currentCityId,'tarrek-foundry');assert.equal(c.state.account.value.homeCityId,'forgehaven');assert.equal(c.state.pending,false);assert.equal(c.navigation.length,1);assert.equal(new URL(c.navigation[0]).searchParams.get('city'),'tarrek-foundry');
 r.reopen();assert.equal((await r.call('city','alice')).data.currentCityId,'tarrek-foundry');const after=(await r.call('citizen','alice')).data;assert.deepEqual(after.economy,before.economy);assert.deepEqual(after.shifts,before.shifts);assert.deepEqual(after.profile,before.profile);
});
test('actual guest city visits navigate without sending a request; foreign citizen travel fails closed',async()=>{
 let calls=0;const fetch=async()=>{calls++;throw Error('No request expected');};
 const guest=client(fetch,{citizenNation:null,citizenSessionStatus:'anonymous'});await guest.travel('kolt-savanna');assert.equal(guest.navigation.length,1);assert.equal(new URL(guest.navigation[0]).searchParams.get('nation'),'kindle');assert.equal(calls,0);
 const foreign=client(fetch,{citizenNation:{id:'korund'}});await foreign.travel('tarrek-foundry');assert.equal(foreign.navigation.length,0);assert.equal(calls,0);
});
test('late travel response never hydrates or navigates a different account generation',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve);const c=client(async()=>{await gate;return Response.json({nationId:'kindle',currentCityId:'tarrek-foundry',homeCityId:'forgehaven',presence:[]});});
 const pending=c.travel('tarrek-foundry');c.bindings.citizenEpoch.current++;release();await pending;assert.equal(c.state.account,null);assert.equal(c.navigation.length,0);
});

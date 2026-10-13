import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {firstActionReason,pendingActionReason} from '../lib/action-reasons.ts';
const root=fileURLToPath(new URL('../',import.meta.url));
async function load(path){
 let output=ts.transpileModule((await readFile(path,'utf8')).replace(/import\s+['"][^'"]+\.css['"];?/g,''),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 for(const match of [...output.matchAll(/from (['"])([^'"]+)\1/g)]){
  const specifier=match[2];let url;
  if(specifier.endsWith('.css'))url='data:text/javascript,export default {}';
  else if(specifier.startsWith('@/')||specifier.startsWith('.')){
   const base=specifier.startsWith('@/')?resolve(root,specifier.slice(2)):resolve(dirname(path),specifier);
   for(const ext of ['.ts','.tsx']){try{await readFile(base+ext);url=await load(base+ext);break;}catch{/* Try source extension. */}}
   assert.ok(url,`Resolve ${specifier}`);
  }else url=import.meta.resolve(specifier);
  output=output.replace(match[0],`from ${JSON.stringify(url)}`);
 }
 return `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
}
const {ActionButton}=await import(await load(resolve(root,'app/action-button.tsx')));
const {AurellePlanPanel}=await import(await load(resolve(root,'app/aurelle-plan-panel.tsx')));
const {KorundPlanPanel}=await import(await load(resolve(root,'app/korund-plan-panel.tsx')));
const {GuestDemo}=await import(await load(resolve(root,'app/guest-demo.tsx')));
const {NationInstitutions}=await import(await load(resolve(root,'app/nation-institutions.tsx')));
const {PlayerMarket}=await import(await load(resolve(root,'app/player-market.tsx')));
const render=(Component,props)=>renderToStaticMarkup(React.createElement(Component,props));
const common={capacity:18,pending:false,uncertain:false,localDemo:false,error:null,onCommand(){},onRetry(){},onRefresh(){},onNavigate(){}};
const aurelle={available:true,charter:{name:'Charter',active:true},walletMinor:800,foodQuantity:2,favor:2,publicFoodRemaining:40,publicFundMinor:10000,mealReadyAt:null,shifts:[]};
const korund={available:true,assignment:{name:'Assignment',capacityCost:4,hours:2,wageMinor:800,foodOutput:4},walletMinor:0,foodQuantity:2,gameWeek:1,couponFoodRemaining:2,couponExpiresAt:'2099-01-01T00:00:00Z',publicFoodRemaining:40,mealReadyAt:null,shifts:[]};
test('pending confirmation reasons have priority and available actions have no reason',()=>{
 assert.equal(pendingActionReason(true,true),'An action is being saved. Please wait.');
 assert.equal(pendingActionReason(false,true),'Confirm your previous action first.');
 assert.equal(pendingActionReason(false,false),null);
 assert.equal(firstActionReason([false,'capacity'],[true,'stock']),'stock');
});
test('disabled action exposes its visible reason as an accessible description',()=>{
 const html=render(ActionButton,{type:'button',reason:'Wait for capacity.',children:'Begin'});
 const id=html.match(/aria-describedby="([^"]+)"/)[1];
 assert.match(html,/<button[^>]*disabled/);assert.ok(html.includes(`id="${id}"`));assert.match(html,/Wait for capacity/);
 assert.doesNotMatch(render(ActionButton,{reason:null,children:'Available'}),/disabled|aria-describedby/);
});
test('Aurelle unavailable service and counter actions explain resources and charter',()=>{
 for(const [props,reason] of [
  [{scene:'workplace',capacity:3},/You need 4 WC/],
  [{scene:'workplace',plan:{...aurelle,publicFundMinor:0}},/service fund cannot cover/],
  [{scene:'market',plan:{...aurelle,charter:{active:false}}},/active charter is required/],
  [{scene:'market',plan:{...aurelle,walletMinor:0}},/enough Crowns/],
  [{scene:'market',plan:{...aurelle,publicFoodRemaining:0}},/counter does not have enough food/],
  [{scene:'household',capacity:24},/Capacity is full/],
  [{scene:'household',uncertain:true},/Confirm your previous action first/],
 ])assert.match(render(AurellePlanPanel,{...common,plan:aurelle,...props}),reason);
});
test('Korund explains capacity, meal resources and pending actions',()=>{
 for(const [props,reason] of [
  [{scene:'workplace',capacity:3},/You need 4 WC/],
  [{scene:'household',capacity:24},/Capacity is full/],
  [{scene:'household',plan:{...korund,foodQuantity:0}},/You need 2 food/],
  [{scene:'market',pending:true},/An action is being saved/],
 ])assert.match(render(KorundPlanPanel,{...common,plan:korund,...props}),reason);
});
test('player market explains unavailable goods, affordability and confirmation',()=>{
 const props={state:{available:true,listings:[]},economy:{inventory:[],walletMinor:0},demo:false,busy:false,uncertain:false,onCommand(){},onRetry(){}};
 assert.match(render(PlayerMarket,props),/not have enough available goods/);
 assert.match(render(PlayerMarket,{...props,uncertain:true}),/Confirm your previous action first/);
 assert.match(render(PlayerMarket,{...props,state:{available:true,listings:[{id:'example',mine:false,status:'open',item:'food',quantity:2,unitMinor:100}]}}),/not have enough Sparks/);
});

test('guest examples explain completed work and blocked food or meal without real progress',()=>{
 const props={onView(){},onExit(){},onAction(){},state:{capacity:24,coins:0,food:0,worked:true,meals:0}};
 assert.match(render(GuestDemo,{...props,view:'workplace'}),/example shift is already complete/);
 assert.match(render(GuestDemo,{...props,view:'market'}),/id="guest-buy-reason"/);
 assert.match(render(GuestDemo,{...props,view:'household'}),/Sample capacity is full/);
});
test('institution work explains pending and capacity constraints',()=>{
 const nation={id:'kindle',name:'Kindle',shortName:'Kindle',currency:'SPK',government:'Republic',economy:'Market'};
 const props={nation,citizenNation:nation,capacity:0,workOrders:[{id:'harvest',name:'Harvest',cost:4}],workPending:false,onWorldView(){},onHousehold(){},onWorkplace(){},onCommitWork(){}};
 assert.match(render(NationInstitutions,props),/You need 4 WC/);
 assert.match(render(NationInstitutions,{...props,workPending:true}),/An action is being saved/);
});
test('player listing fields describe why editing is frozen',()=>{
 const html=render(PlayerMarket,{state:{available:true,listings:[]},economy:{inventory:[],walletMinor:0},demo:false,busy:false,uncertain:true,onCommand(){},onRetry(){}});
 assert.equal((html.match(/aria-describedby="listing-edit-reason"/g)||[]).length,3);
 assert.match(html,/id="listing-edit-reason"/);
});

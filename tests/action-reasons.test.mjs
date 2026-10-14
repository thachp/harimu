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
async function load(path,clock){
 let output=ts.transpileModule((await readFile(path,'utf8')).replace('useState(0)',clock?`useState(${clock})`:'useState(0)').replace(/import\s+['"][^'"]+\.css['"];?/g,''),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
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
const {NotablePanel}=await import(await load(resolve(root,'app/notable-control.tsx')));
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

test('Korund unavailable book keeps uncertain same-request confirmation available',()=>{
 const html=render(KorundPlanPanel,{...common,scene:'market',plan:null,uncertain:true,error:'Network interrupted.'});
 assert.match(html,/Confirm previous action/);assert.match(html,/Retry uses the same request/);
 assert.doesNotMatch(html,/<button[^>]*disabled[^>]*>Confirm previous action/);
 const saving=render(KorundPlanPanel,{...common,scene:'market',plan:null,uncertain:true,pending:true});
 assert.match(saving,/<button[^>]*disabled[^>]*>Confirm previous action/);
});

test('Korund queue waiting reason distinguishes an existing request from joining',async()=>{
 const {KorundPlanPanel:ClockedPanel}=await import(await load(resolve(root,'app/korund-plan-panel.tsx'),Date.parse('2050-01-01T00:00:00Z')));
 const queued=render(ClockedPanel,{...common,scene:'market',plan:{...korund,queue:{waiting:3,position:2,requestId:'fixture-request'}}});
 assert.match(queued,/Wait for earlier requests to collect or cancel. Your place is retained./);
 assert.doesNotMatch(queued,/Join the queue and wait/);
 const outsider=render(ClockedPanel,{...common,scene:'market',plan:{...korund,queue:{waiting:3,position:null,requestId:null}}});
 assert.match(outsider,/Join the queue and wait for earlier requests/);
 const head=render(ClockedPanel,{...common,scene:'market',plan:{...korund,queue:{waiting:3,position:1,requestId:'fixture-request'}}});
 assert.doesNotMatch(head,/<button[^>]*disabled[^>]*>Redeem/);
});

test('disabled Notables show authored examples and accessible reasons rather than fabricated live responses',()=>{
 const profile={id:'fixture-notable',name:'Fixture chronicler',role:'Court chronicler',persona:'Public records only.',introduction:'Authored introduction.'};
 const html=render(NotablePanel,{view:{profile,enabled:false,dailyLimit:20,source:'authored',reason:'AI conversations are disabled.'},onRefresh(){},onSubmit(){}});
 assert.match(html,/AI character/);assert.match(html,/Authored persona introduction/);assert.match(html,/Authored topic example/);assert.match(html,/disabled[^>]*>Ask this public topic/);assert.match(html,/AI conversations are disabled. These examples are authored./);assert.doesNotMatch(html,/AI-generated response/);
 assert.match(render(NotablePanel,{view:null,error:'Profile unavailable.',onRefresh(){},onSubmit(){}}),/role="alert"/);
});

test('both civic inbox launchers expose the same expanded state',async()=>{
 const source=await readFile(resolve(root,'app/citizen-dock.tsx'),'utf8');const tree=ts.createSourceFile('dock.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const buttons=[];const visit=node=>{if(ts.isJsxOpeningElement(node)&&node.tagName.getText(tree)==='button')buttons.push(node);ts.forEachChild(node,visit);};visit(tree);
 const bell=buttons.find(node=>node.attributes.properties.some(attr=>ts.isJsxAttribute(attr)&&attr.name.getText(tree)==='className'&&attr.initializer?.text==='game-notifications'));assert.ok(bell);const expanded=bell.attributes.properties.find(attr=>ts.isJsxAttribute(attr)&&attr.name.getText(tree)==='aria-expanded');assert.equal(expanded?.initializer?.expression?.getText(tree),"tab==='inbox'");
});

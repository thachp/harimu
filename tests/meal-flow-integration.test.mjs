/** Actual client command + actual API, isolated SQLite only; no live timers or citizens. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { localRuntime } from './helpers/local-runtime.mjs';
import { validMarketCommand } from '../lib/market.ts';
const require=createRequire(import.meta.url);
const source=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8');
const tree=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let commandNode;function find(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='runMarket')commandNode=node;ts.forEachChild(node,find);}find(tree);assert.ok(commandNode);
const commandJs=ts.transpileModule(commandNode.getText(tree),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const marketJs=ts.transpileModule(await readFile(new URL('../app/citizen-market.tsx',import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText;
const exports={};new Function('exports','require',marketJs)(exports,name=>name==='./display-preferences'?{useDisplayTimestamp:()=>require('../lib/display-preferences.ts').displayTimestamp}:name==='./game-timer'?{GameTimer:()=>null}:name==='react'?{useState:initial=>[initial,()=>{}],useEffect(){}}:require(name));
const flatten=node=>[node,...[node?.props?.children].flat(Infinity).filter(Boolean).flatMap(child=>typeof child==='object'?flatten(child):[child])];
function client(snapshot,fetch){
 const state={Capacity:snapshot.capacity,Economy:snapshot.economy,Market:snapshot.market};const ref=current=>({current});
 const bindings={clerkConfigured:true,citizenSessionStatus:'ready',citizenNation:{id:'kindle'},citizenEpoch:ref(1),workLock:ref(false),marketIntent:ref(null),playerIntent:ref(null),korundIntent:ref(null),aurelleIntent:ref(null),validMarketCommand,persistIntents(){},fetch};
 for(const name of ['WorkPending','WorkError','MarketCommand','Economy','Market','PlayerMarket','Capacity','RecentAction'])bindings[`set${name}`]=value=>{state[name]=value;};
 bindings.viewMode='household';bindings.announce=(_origin,text)=>{state.RecentAction=text;};
 const run=command=>{const scope={...bindings,economy:state.Economy,market:state.Market};return new Function(...Object.keys(scope),`${commandJs};return runMarket;`)(...Object.values(scope))(command);};
 const render=()=>flatten(exports.CitizenMarket({market:state.Market,economy:state.Economy,capacity:state.Capacity,busy:Boolean(state.WorkPending),uncertain:Boolean(state.MarketCommand)&&!state.WorkPending,pendingAction:state.MarketCommand?.action,showTrading:false,onMeal(){},onTrade(){},onRetry(){}}));
 return {state,bindings,run,render};
}
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const meal=n=>({action:'household-meal',requestId:id(n)});
const food=state=>state.inventory.find(item=>item.item==='food')?.quantity??0;
async function setup(t){const r=await localRuntime();t.after(()=>r.close());const enrolled=await r.call('citizen','meal-new',{action:'enroll',nationId:'kindle',expectedNationId:null});assert.equal(enrolled.data.capacity,18);assert.equal(food(enrolled.data.economy),2);return {r,snapshot:enrolled.data};}
test('normal first household meal stays pending without false interruption, then restores exactly four capacity',async t=>{
 const {r,snapshot}=await setup(t);let release;const gate=new Promise(resolve=>{release=resolve;});
 const c=client(snapshot,async(_url,options)=>{await gate;const response=await r.call('citizen','meal-new',JSON.parse(options.body));return Response.json(response.data,{status:response.status});});
 const pending=c.run(meal(1));assert.equal(c.state.WorkPending,true);
 assert.equal(c.render().some(node=>node?.props?.role==='alert'),false);
 assert.equal(c.render().some(node=>node?.type==='button'&&String(node.props.children).startsWith('Retry')),false);
 release();await pending;
 assert.equal(c.state.Capacity,22);assert.equal(food(c.state.Economy),0);
 assert.equal(c.bindings.marketIntent.current,null);assert.equal(c.state.MarketCommand,null);assert.equal(c.state.WorkError,null);
 assert.match(c.state.RecentAction,/Household fed/);
});
test('lost meal response retries the identical receipt without extra food or capacity',async t=>{
 const {r,snapshot}=await setup(t);let attempts=0;const sent=[];
 const c=client(snapshot,async(_url,options)=>{const command=JSON.parse(options.body);sent.push(command);const response=await r.call('citizen','meal-new',command);if(++attempts===1)throw new Error('Fixture response lost after committed meal');return Response.json(response.data,{status:response.status});});
 await c.run(meal(2));assert.match(c.state.WorkError,/Retry the household meal/);assert.equal(c.state.WorkPending,false);
 assert.ok(c.render().includes('Retry household meal'));assert.equal(c.bindings.marketIntent.current.requestId,id(2));
 await c.run(meal(3));assert.equal(attempts,1,'new intent cannot overwrite uncertain receipt');
 await c.run(c.bindings.marketIntent.current);assert.deepEqual(sent[0],sent[1]);assert.equal(c.state.Capacity,22);assert.equal(food(c.state.Economy),0);assert.equal(c.bindings.marketIntent.current,null);
 const receipts=await r.db.prepare('SELECT COUNT(*) AS count FROM citizen_economy_events WHERE clerk_user_id=?').bind('meal-new').first();assert.equal(receipts.count,1);
});
test('household cooldown rejects before and permits the exact boundary in an isolated fixture',async t=>{
 const {r}=await setup(t);const first=await r.call('citizen','meal-new',meal(4));assert.equal(first.status,200);const ready=Date.parse(first.data.market.mealReadyAt);
 // Test fixtures provide fresh food and spent capacity; production data is untouched.
 await r.db.prepare('UPDATE citizens SET capacity=10 WHERE clerk_user_id=?').bind('meal-new').run();
 await r.db.prepare("INSERT INTO citizen_economy_events (id,clerk_user_id,kind,item,quantity_delta,wallet_delta,occurred_at) VALUES (?,?,'buy','food',4,-400,?)").bind(id(7),'meal-new',Math.floor(r.now/1000)).run();
 await r.db.prepare('UPDATE capacity_clocks SET recovered_at=? WHERE clerk_user_id=?').bind(Math.floor((ready-1000)/1000),'meal-new').run();
 r.setNow(ready-1000);assert.equal((await r.call('citizen','meal-new',meal(5))).status,409);
 r.setNow(ready);const allowed=await r.call('citizen','meal-new',meal(6));assert.equal(allowed.status,200);assert.equal(food(allowed.data.economy),2);
});
test('fresh Kindle grant and no-meal cooldown persist across reads and reopen',async t=>{
 const {r,snapshot}=await setup(t);assert.equal(snapshot.market.mealReadyAt,null);
 for(let n=0;n<3;n++){const read=await r.call('citizen','meal-new');assert.equal(read.status,200);assert.equal(food(read.data.economy),2);assert.equal(read.data.market.mealReadyAt,null);}
 r.reopen();const fresh=await r.call('citizen','meal-new');assert.equal(food(fresh.data.economy),2);assert.equal(fresh.data.market.mealReadyAt,null);
 const prepared=await r.call('citizen','meal-new',meal(20));assert.equal(prepared.status,200);assert.equal(food(prepared.data.economy),0);assert.ok(prepared.data.market.mealReadyAt);
 r.reopen();const consumed=await r.call('citizen','meal-new');assert.equal(food(consumed.data.economy),0);assert.equal(consumed.data.market.mealReadyAt,prepared.data.market.mealReadyAt);
 const grant=await r.db.prepare('SELECT COUNT(*) AS count,SUM(quantity) AS quantity FROM starter_food_grants WHERE clerk_user_id=?').bind('meal-new').first();assert.equal(grant.count,1);assert.equal(grant.quantity,2);
 const receipt=await r.db.prepare("SELECT COUNT(*) AS count FROM citizen_economy_events WHERE clerk_user_id=? AND kind='meal'").bind('meal-new').first();assert.equal(receipt.count,1);
});

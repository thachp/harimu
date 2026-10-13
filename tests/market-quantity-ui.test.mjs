import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {localRuntime} from './helpers/local-runtime.mjs';
const require=createRequire(import.meta.url);
const source=await readFile(new URL('../app/citizen-market.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText;
function harness(){let cursor=0;const slots=[],sent=[],exports={};new Function('exports','require',compiled)(exports,name=>name==='./display-preferences'?{useDisplayTimestamp:()=>require('../lib/display-preferences.ts').displayTimestamp}:name==='./game-timer'?{GameTimer:()=>null}:name==='react'?{useState(initial){const id=cursor++;if(!(id in slots))slots[id]=initial;return[slots[id],value=>slots[id]=value];},useEffect(){}}:require(name));const props={market:{available:true,quotes:[{item:'food',label:'Food',buyMinor:150,sellMinor:100,stock:20}],merchantCashMinor:100000,mealFood:2,mealCapacity:4,mealIntervalSeconds:86400,mealReadyAt:null},economy:{walletMinor:100000,inventory:[{item:'food',quantity:20}]},capacity:18,busy:false,uncertain:false,onTrade:(...args)=>sent.push(args),onMeal(){},onRetry(){}};const all=n=>[n,...[n?.props?.children].flat(Infinity).filter(Boolean).flatMap(c=>typeof c==='object'?all(c):[c])];const render=()=>{cursor=0;return exports.CitizenMarket(props);};const input=()=>all(render()).find(n=>n?.type==='input');const text=n=>all(n).filter(v=>typeof v==='string'||typeof v==='number').join('');const buttons=()=>all(render()).filter(n=>n?.type==='button'&&text(n).startsWith('Buy'));return{props,render,all,input,text,buttons,sent};}
test('invalid quantity shows an accessible rejection and no misleading default price or trade',()=>{
 const h=harness();for(const quantity of [-5,99999,0,11,1.5,NaN]){h.input().props.onChange({target:{valueAsNumber:quantity}});const input=h.input();assert.equal(input.props['aria-invalid'],true);assert.ok(input.props['aria-describedby']);assert.ok(h.all(h.render()).some(n=>n?.props?.id===input.props['aria-describedby']));const button=h.buttons()[0];assert.equal(button.props.disabled,true);assert.doesNotMatch(h.text(button),/1\.50 SPK/);button.props.onClick();assert.deepEqual(h.sent,[]);}
});
test('valid integer trade labels retain quantity and exact total for both boundaries',()=>{
 const h=harness();for(const quantity of [1,2,10]){h.input().props.onChange({target:{valueAsNumber:quantity}});assert.equal(h.input().props['aria-invalid'],false);const button=h.buttons()[0];assert.equal(button.props.disabled,false);assert.equal(h.text(button),`Buy ${quantity} · ${(quantity*1.5).toFixed(2)} SPK`);button.props.onClick();assert.deepEqual(h.sent.at(-1),['buy','food',quantity]);}
});
test('actual merchant API rejects invalid quantities without altering the ledger',async t=>{
 const r=await localRuntime();t.after(()=>r.close());const before=(await r.call('citizen','alice')).data.economy;
 for(const quantity of [-5,99999,0,11,1.5]){const response=await r.call('citizen','alice',{action:'market-trade',requestId:crypto.randomUUID(),side:'buy',item:'food',quantity});assert.equal(response.status,400);}
 assert.deepEqual((await r.call('citizen','alice')).data.economy,before);
});

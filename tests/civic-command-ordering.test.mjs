import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {test} from 'node:test';
import ts from 'typescript';
const require=createRequire(import.meta.url),settle=()=>new Promise(setImmediate);
const candidates=['ines-varro','tobin-achterberg','mara-quell'].map(id=>({id,name:id,platform:'Fixture'}));
for(const kind of ['ballot','petitions']){
 const source=ts.transpileModule(await readFile(new URL(`../app/${kind==='ballot'?'ranked-ballot':'collective-petitions'}.tsx`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 function harness(){
  const initial={nationId:'kindle',verification:{countedActionsEligible:true},...(kind==='ballot'?{id:'kindle-presidential-poc-1',candidates,status:'open',privacyReady:true,voted:false,result:null}:{weeklyHumans:100,asOf:1760000000,petitions:[]})};
  const states=kind==='ballot'?[initial,candidates.map(c=>c.id),'',false,false,false]:[initial,'',false,false,false,'Fixture title','Fixture petition demand'];
  let cursor=0,refCursor=0;const refs=[],requests=[],received=[];
  const react={useEffect(){},useCallback:fn=>fn,useRef(value){const i=refCursor++;return refs[i]??(refs[i]={current:value});},useState(value){const i=cursor++;if(!(i in states))states[i]=value;return[states[i],value=>states[i]=typeof value==='function'?value(states[i]):value];}};
  const exports={};new Function('exports','require','fetch',source)(exports,name=>name==='react'?react:name==='./display-preferences'?{useDisplayTimestamp:()=>String}:name==='./nation-document'?{NationDocument:'section'}:name==='./ai-disclosure'?{AiBadge:'span'}:name==='./action-button'?{ActionButton:'button'}:name==='./game-timer'?{GameTimer:'span'}:name.startsWith('../lib/')?require(`${name}.ts`):require(name),(url,options)=>new Promise((resolve,reject)=>requests.push({options,resolve:data=>resolve({ok:true,status:200,json:async()=>data}),reject})));
  const render=()=>{cursor=refCursor=0;return exports[kind==='ballot'?'RankedBallot':'CollectivePetitionsPanel']({onSnapshot:data=>received.push(data)});};
  const all=node=>[node,...[node?.props?.children].flat(Infinity).filter(Boolean).flatMap(child=>typeof child==='object'?all(child):[child])];
  const controls=()=>all(render());
  return{initial,states,requests,received,refresh:()=>controls().find(n=>n?.type==='button'&&n.props.children===`Refresh ${kind==='ballot'?'ballot status':'collective petitions'}`).props.onClick,submit:()=>controls().find(n=>n?.type==='form').props.onSubmit};
 }
 test(`${kind}: captured handlers cannot overlap a command and stale reads cannot replace its receipt`,async()=>{
  const h=harness(),refresh=h.refresh(),submit=h.submit();refresh();submit({preventDefault(){}});submit({preventDefault(){}});refresh();assert.equal(h.requests.length,2);
  const receipt={...h.initial,...(kind==='ballot'?{voted:true}:{weeklyHumans:101})};h.requests[1].resolve(receipt);await settle();h.requests[0].resolve(h.initial);await settle();assert.deepEqual(h.states[0],receipt);assert.deepEqual(h.received,[receipt]);
  h.refresh()();assert.equal(h.requests.length,3);h.requests[2].resolve(receipt);await settle();
 });
 test(`${kind}: obsolete read errors cannot overwrite an acknowledged command`,async()=>{
  const h=harness(),submit=h.submit();h.refresh()();submit({preventDefault(){}});h.requests[1].resolve(h.initial);await settle();h.requests[0].reject(Error('Obsolete read failed'));await settle();assert.equal(h.states[kind==='ballot'?2:1],'');
 });
}

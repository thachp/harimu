import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {test} from 'node:test';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const source=ts.transpileModule(await readFile(new URL('../app/square-chat.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const message={id:'fixture-message',handle:'Fixture citizen',body:'Fixture original',postedAt:1760000000,mine:true};
const snapshot=messages=>({nationId:'kindle',cityId:'fixture-city',present:0,messages});
function harness(){
 let cursor=0,refCursor=0;const states=[snapshot([message]),'Fixture new message','',false,false,false,[]],refs=[],requests=[];
 const react={useCallback:fn=>fn,useEffect(){},useRef(initial){const i=refCursor++;return refs[i]??(refs[i]={current:initial});},useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return[states[i],value=>states[i]=typeof value==='function'?value(states[i]):value];}};
 const exports={};new Function('exports','require','fetch',source)(exports,name=>name==='react'?react:name==='./square-chat.css'?{}:name==='./display-preferences'?{useDisplayTimestamp:()=>String}:name==='../lib/square-chat-validation'?{validSquareText:value=>typeof value==='string'&&value.trim().length>0&&value.length<=280}:require(name),(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve:data=>resolve({ok:true,status:200,json:async()=>data}),reject})));
 const render=()=>{cursor=refCursor=0;const wrapper=exports.SquareChat({enabled:true,nationId:'kindle',cityId:'fixture-city',presenceAllowed:false});return wrapper.type(wrapper.props);};
 const all=node=>[node,...[node?.props?.children].flat(Infinity).filter(Boolean).flatMap(child=>typeof child==='object'?all(child):[child])];
 const button=text=>all(render()).find(node=>node?.type==='button'&&node.props.children===text);
 return{states,requests,render,all,button};
}
const settle=()=>new Promise(setImmediate);
test('pre-delete refresh cannot resurrect a removed message; in-flight command suppresses further reads',async()=>{
 const h=harness();h.button('Refresh conversation').props.onClick();h.button('Remove my message').props.onClick();assert.equal(h.requests.length,2);
 h.button('Refresh conversation').props.onClick();assert.equal(h.requests.length,2);
 h.requests[1].resolve(snapshot([]));await settle();h.requests[0].resolve(snapshot([message]));await settle();assert.deepEqual(h.states[0].messages,[]);
 h.button('Refresh conversation').props.onClick();assert.equal(h.requests.length,3);h.requests[2].resolve(snapshot([]));await settle();
});
test('pre-post refresh cannot remove the successfully posted message or restore an old read error',async()=>{
 const h=harness();h.button('Refresh conversation').props.onClick();h.all(h.render()).find(node=>node?.type==='form').props.onSubmit({preventDefault(){}});
 const added={...message,id:'fixture-new',body:'Fixture new message'};h.requests[1].resolve(snapshot([added,message]));await settle();h.requests[0].reject(Error('Old refresh failed'));await settle();
 assert.deepEqual(h.states[0].messages,[added,message]);assert.equal(h.states[2],'');assert.equal(h.states[1],'');
});
test('latest refresh wins when read responses finish out of order',async()=>{
 const h=harness();h.button('Refresh conversation').props.onClick();h.button('Refresh conversation').props.onClick();h.requests[1].resolve(snapshot([]));await settle();h.requests[0].resolve(snapshot([message]));await settle();assert.deepEqual(h.states[0].messages,[]);
});

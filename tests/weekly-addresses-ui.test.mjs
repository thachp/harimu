import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const compile=async file=>ts.transpileModule(await readFile(new URL(`../app/${file}`,import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText;
const action={};new Function('exports','require',await compile('action-button.tsx'))(action,require);
const tags={};new Function('exports','require',await compile('ai-disclosure.tsx'))(tags,require);
const documents={};new Function('exports','require',await compile('nation-document.tsx'))(documents,name=>name==='../lib/nation-themes'?require('../lib/nation-themes.ts'):require(name));
const compiled=await compile('weekly-addresses.tsx');
const imports=name=>name==='./nation-document'?documents:name==='./action-button'?action:name==='./ai-disclosure'?tags:name==='./display-preferences'?{useDisplayTimestamp:()=>require('../lib/display-preferences.ts').displayTimestamp}:name==='./game-timer'?{GameTimer:()=>null}:require(name);
const real={};new Function('exports','require',compiled)(real,imports);
const address={id:'kindle:address:0',week:0,scheduledAt:100,publishedAt:101,leaderName:'Ines Varro',office:'President',title:'Public institutions',transcript:'Authored fixture transcript. No outcome is announced.',provenance:'authored-poc',agree:0,disagree:0,ownReaction:null};
test('authored transcripts show portrait, truthful provenance, actual counts and linked disabled reasons',()=>{
 const html=renderToStaticMarkup(React.createElement(real.AddressTranscript,{address,busy:false,uncertain:false,onReact(){}}));
 assert.match(html,/Stylized portrait of Ines Varro/);assert.match(html,/Authored PoC transcript/);assert.match(html,/no live AI generation/);assert.doesNotMatch(html,/AI-generated/);assert.match(html,/Agree 0/);
 const saved=renderToStaticMarkup(React.createElement(real.AddressTranscript,{address:{...address,ownReaction:'agree',agree:1},busy:false,uncertain:false,onReact(){}}));assert.match(saved,/Your reaction is already recorded/);assert.match(saved,/aria-describedby/);assert.match(saved,/disabled/);
});
const all=n=>[n,...[n?.props?.children].flat(Infinity).filter(Boolean).flatMap(c=>typeof c==='object'?all(c):[c])];
const text=n=>all(n).filter(v=>typeof v==='string'||typeof v==='number').join('');
function harness(){let cursor=0,effects=[],cleanups=[],slots=[],requests=[];const react={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],value=>slots[i]=typeof value==='function'?value(slots[i]):value];},useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},useEffect(fn){effects.push(fn);}};
 const exports={};new Function('exports','require','fetch',compiled)(exports,name=>name==='react'?react:imports(name),(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject})));
 const render=()=>{cursor=0;effects=[];return exports.WeeklyAddresses({nationId:'kindle'});};const runEffects=()=>{cleanups.forEach(fn=>fn?.());cleanups=effects.map(fn=>fn());};
 const button=(label)=>all(render()).find(n=>n?.props?.onClick&&text(n).includes(label));const finish=async(request,data,status=200)=>{request.resolve({ok:status===200,status,json:async()=>data});await new Promise(resolve=>setImmediate(resolve));};
 return{render,runEffects,button,finish,requests,unmount:()=>cleanups.forEach(fn=>fn?.())};
}
const archive={nationId:'kindle',currentWeek:0,nextAddressAt:604900,addresses:[address],nextBeforeWeek:null};
test('archive waits for opening; interrupted reaction retries the same immutable request',async()=>{
 const h=harness();h.render();h.runEffects();assert.equal(h.requests.length,0);h.button('Read address').props.onClick();h.render();h.runEffects();await h.finish(h.requests[0],archive);
 const card=all(h.render()).find(n=>n?.type===real.AddressTranscript||n?.props?.address);card.props.onReact('agree');await new Promise(resolve=>setImmediate(resolve));const post=h.requests[1];assert.equal(post.url,'/api/addresses');const original=JSON.parse(post.options.body);assert.equal(original.expectedNationId,'kindle');
 post.reject(Error('Fixture network interruption'));await new Promise(resolve=>setImmediate(resolve));h.button('Confirm original reaction').props.onClick();await new Promise(resolve=>setImmediate(resolve));assert.equal(h.requests[2].options.body,post.options.body);
 await h.finish(h.requests[2],archive);assert.doesNotMatch(text(h.render()),/Confirm original reaction/);h.unmount();
});
test('foreign archive responses are rejected and unmounted archive reads cannot update state',async()=>{
 const h=harness();h.button('Read address').props.onClick();h.render();h.runEffects();await h.finish(h.requests[0],{...archive,nationId:'korund'});assert.match(text(h.render()),/Citizenship changed/);assert.ok(!all(h.render()).some(n=>n?.props?.address));
 const late=harness();late.button('Read address').props.onClick();late.render();late.runEffects();late.unmount();await late.finish(late.requests[0],archive);assert.ok(!all(late.render()).some(n=>n?.props?.address));
});

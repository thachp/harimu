import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {test} from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {displayTimestamp} from '../lib/display-preferences.ts';
const require=createRequire(import.meta.url);
const compile=async file=>ts.transpileModule(await readFile(new URL(`../app/${file}`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const actions={};new Function('exports','require',await compile('action-button.tsx'))(actions,require);
const source=await compile('collective-petitions.tsx');
const petition={id:'00000000-0000-4000-8000-000000000020',title:'Publish the waterworks audit',demand:'Publish an audited repair plan for the public waterworks.',createdAt:1760000000,expiresAt:1760604800,weeklyHumans:100,threshold:3,signatures:2,signed:false,mine:false,status:'collecting',reachedAt:null,response:null};
const snapshot=(eligible=true)=>({nationId:'kindle',asOf:1760000100,weeklyHumans:100,petitions:[petition],verification:{countedActionsEligible:eligible,tier:eligible?1:0,status:eligible?'eligible':'unavailable',reason:eligible?'Verified fixture human.':'Phone verification is unavailable; no signature can count.'}});
function harness(data,{failure=false}={}){
 let cursor=0,refCursor=0,fail=failure;const states=[data,'',false,false,false,'A valid petition title','A sufficiently detailed fixture demand.'],refs=[],requests=[],received=[];
 const react={useCallback:fn=>fn,useEffect(){},useRef(initial){const i=refCursor++;return refs[i]??(refs[i]={current:initial});},useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return[states[i],value=>states[i]=typeof value==='function'?value(states[i]):value];}};
 const exports={};new Function('exports','require','fetch',source)(exports,name=>name==='react'?react:name==='./display-preferences'?{useDisplayTimestamp:()=>displayTimestamp}:name==='./game-timer'?{GameTimer:()=>React.createElement('span',null,'Fixture deadline timer')}:name==='./action-button'?actions:name==='../lib/collective-petitions'?require('../lib/collective-petitions.ts'):require(name),async(url,options)=>{requests.push({url,body:options?.body});if(fail){fail=false;throw Error('Fixture connection interrupted.');}return{ok:true,status:200,json:async()=>data};});
 const render=()=>{cursor=0;refCursor=0;return exports.CollectivePetitionsPanel({onSnapshot:value=>received.push(value)});};
 const all=node=>[node,...[node?.props?.children].flat(Infinity).filter(Boolean).flatMap(child=>typeof child==='object'?all(child):[child])];
 const action=text=>all(render()).find(node=>node?.type===actions.ActionButton&&node.props.children===text);
 return{render,all,action,requests,received,states};
}
test('unverified form and sign handlers remain blocked with linked visible reasons even when directly invoked',async()=>{
 const h=harness(snapshot(false));const html=renderToStaticMarkup(h.render());assert.match(html,/Phone verification is unavailable/);assert.match(html,/aria-describedby=/);assert.match(html,/disabled/);
 h.action('Sign petition').props.onClick();h.all(h.render()).find(node=>node?.type==='form').props.onSubmit({preventDefault(){}});await new Promise(setImmediate);assert.equal(h.requests.length,0);
});
test('interrupted signing retries the identical receipt and blocks a different petition command',async()=>{
 const h=harness(snapshot(),{failure:true});h.action('Sign petition').props.onClick();await new Promise(setImmediate);assert.equal(h.requests.length,1);const original=h.requests[0].body;
 assert.match(renderToStaticMarkup(h.render()),/Retry same petition command/);h.action('Sign petition').props.onClick();assert.equal(h.requests.length,1);
 h.action('Retry same petition command').props.onClick();await new Promise(setImmediate);assert.equal(h.requests.length,2);assert.equal(h.requests[1].body,original);assert.equal(h.received.length,1);
});
test('foreign response namespace cannot replace the citizen petition list',async()=>{
 const data=snapshot();const h=harness({...data,nationId:'korund'});h.action('Sign petition').props.onClick();await new Promise(setImmediate);assert.equal(h.received.length,0);assert.match(renderToStaticMarkup(h.render()),/Citizenship changed/);
});
test('expired and response states show recorded facts and never fake open ballots or Cabinet actions',()=>{
 const data=snapshot(false);data.petitions=[{...petition,status:'expired'}, {...petition,id:petition.id+'-awaiting',status:'awaiting-response',signatures:3,reachedAt:1760000200}, {...petition,id:petition.id+'-responded',status:'responded',signatures:3,reachedAt:1760000200,response:{text:'Fixture Cabinet record: audit acknowledged.',at:1760000300}}];
 const html=renderToStaticMarkup(harness(data).render());assert.match(html,/Expired below the threshold/);assert.match(html,/Awaiting Cabinet response/);assert.match(html,/Fixture Cabinet record: audit acknowledged/);assert.doesNotMatch(html,/Sign petition|Cast vote|Approved automatically|Live AI/);
});
if(process.env.HARIMU_PETITION_FIXTURE){
 const css=(await Promise.all(['globals.css','game-shell.css'].map(file=>readFile(new URL(`../app/${file}`,import.meta.url),'utf8')))).join('\n');const data=snapshot(false);data.petitions=[petition,{...petition,id:petition.id+'-awaiting',status:'awaiting-response',signatures:3,reachedAt:1760000200},{...petition,id:petition.id+'-expired',status:'expired'}];
 await writeFile(process.env.HARIMU_PETITION_FIXTURE,`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Harimu isolated petition fixture</title><style>${css}\nbody{background:#0b1c24;color:#dce7e8;padding:16px;font-family:Inter,system-ui,sans-serif}main{max-width:420px;margin:auto}.game-inspector-body{padding:0;overflow:visible}</style><main><h1>Isolated petition fixtures</h1><p>Fixture humans and records only. No live game requests or authentication.</p><div class="game-inspector-body">${renderToStaticMarkup(harness(data).render())}</div></main></html>`);
}

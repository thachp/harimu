import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {test} from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const compile=async file=>ts.transpileModule(await readFile(new URL(`../app/${file}`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const actions={},nation={},tags={};new Function('exports','require',await compile('action-button.tsx'))(actions,require);new Function('exports','require',await compile('nation-document.tsx'))(nation,name=>name==='../lib/nation-themes'?require('../lib/nation-themes.ts'):require(name));new Function('exports','require',await compile('ai-disclosure.tsx'))(tags,require);
const source=await compile('ranked-ballot.tsx');
const candidates=[{id:'ines-varro',name:'Ines Varro',platform:'Full employment and cautious trade.'},{id:'tobin-achterberg',name:'Tobin Achterberg',platform:'Lower levies and open markets.'},{id:'mara-quell',name:'Mara Quell',platform:'Public housing and dock building.'}],ids=candidates.map(candidate=>candidate.id);
const snapshot=()=>({nationId:'kindle',id:'kindle-presidential-poc-1',candidates,status:'open',opensAt:1760000000,closesAt:1760259200,voted:false,result:null,privacyReady:true,privacyReason:'Fixture privacy readiness is not approved.',verification:{countedActionsEligible:true,reason:'Verified fixture human.'}});
function harness(data,{failure=false}={}){
 let cursor=0,refCursor=0,fail=failure;const states=[data,[...ids],'',false,false,false],refs=[],requests=[],received=[];
 const react={useCallback:fn=>fn,useEffect(){},useRef(initial){const i=refCursor++;return refs[i]??(refs[i]={current:initial});},useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return[states[i],value=>states[i]=typeof value==='function'?value(states[i]):value];}};
 const exports={};new Function('exports','require','fetch',source)(exports,name=>name==='react'?react:name==='./nation-document'?nation:name==='./ai-disclosure'?tags:name==='./game-timer'?{GameTimer:()=>React.createElement('span',null,'Fixture ballot clock')}:name==='./action-button'?actions:name==='../lib/instant-runoff'?require('../lib/instant-runoff.ts'):name==='../lib/election-ids'?require('../lib/election-ids.ts'):require(name),async(url,options)=>{requests.push({url,body:options?.body});if(fail){fail=false;throw Error('Fixture connection interrupted.');}return{ok:true,status:200,json:async()=>({...data,voted:true})};});
 const render=()=>{cursor=0;refCursor=0;return exports.RankedBallot({onSnapshot:value=>received.push(value)});};
 const all=node=>[node,...[node?.props?.children].flat(Infinity).filter(Boolean).flatMap(child=>typeof child==='object'?all(child):[child])];
 const action=text=>all(render()).find(node=>node?.type===actions.ActionButton&&node.props.children===text);
 return{render,all,action,requests,received,states};
}
test('closed privacy readiness keeps all ranking controls disabled and direct submission cannot send a ballot',async()=>{
 const data={...snapshot(),privacyReady:false,status:'waiting',opensAt:null,closesAt:null};const h=harness(data),html=renderToStaticMarkup(h.render());assert.match(html,/data-nation-theme="kindle"/);assert.match(html,/Fixture privacy readiness is not approved/);assert.match(html,/No election clock has started/);assert.equal((html.match(/<select[^>]*disabled/g)||[]).length,3);assert.doesNotMatch(html,/Fixture ballot clock/);
 h.all(h.render()).find(node=>node?.type==='form').props.onSubmit({preventDefault(){}});await new Promise(setImmediate);assert.equal(h.requests.length,0);
});
test('unverified, already-voted and duplicate rankings never invoke a direct submit',async()=>{
 for(const modify of [data=>data.verification.countedActionsEligible=false,data=>data.voted=true]){const data=snapshot();modify(data);const h=harness(data);h.all(h.render()).find(node=>node?.type==='form').props.onSubmit({preventDefault(){}});await new Promise(setImmediate);assert.equal(h.requests.length,0);}
 const h=harness(snapshot());h.states[1]=[ids[0],ids[0],ids[2]];h.all(h.render()).find(node=>node?.type==='form').props.onSubmit({preventDefault(){}});await new Promise(setImmediate);assert.equal(h.requests.length,0);assert.match(renderToStaticMarkup(h.render()),/Choose a distinct candidate/);
});
test('interrupted submission blocks changing rankings and retries the identical original receipt',async()=>{
 const h=harness(snapshot(),{failure:true});h.all(h.render()).find(node=>node?.type==='form').props.onSubmit({preventDefault(){}});await new Promise(setImmediate);assert.equal(h.requests.length,1);const original=h.requests[0].body;
 h.all(h.render()).find(node=>node?.type==='select').props.onChange({target:{value:ids[2]}});assert.deepEqual(h.states[1],ids);h.action('Retry same ballot').props.onClick();await new Promise(setImmediate);assert.equal(h.requests[1].body,original);assert.match(renderToStaticMarkup(h.render()),/I Voted/);
});
test('only a closed snapshot renders aggregate counts and foreign namespace cannot replace current state',async()=>{
 const data=snapshot();data.result={winner:ids[2],humanBallots:2,simulatedPublicUnits:2,weightScale:4,rounds:[{human:{[ids[0]]:0,[ids[1]]:0,[ids[2]]:2},simulatedUnits:{[ids[0]]:2,[ids[1]]:0,[ids[2]]:0},weightedUnits:{[ids[0]]:2,[ids[1]]:0,[ids[2]]:8},eliminated:null}]};
 assert.doesNotMatch(renderToStaticMarkup(harness(data).render()),/Count winner:|2 human ballots/);data.status='closed';const html=renderToStaticMarkup(harness(data).render());assert.match(html,/Count winner: Mara Quell/);assert.match(html,/2 human ballots/);assert.match(html,/0.50 human-vote equivalents/);
 const h=harness({...snapshot(),nationId:'foreign'});h.all(h.render()).find(node=>node?.type==='form').props.onSubmit({preventDefault(){}});await new Promise(setImmediate);assert.equal(h.received.length,0);assert.match(renderToStaticMarkup(h.render()),/Citizenship or election changed/);
});

test('#1016 High Court certification renders on a closed ballot only when the snapshot carries the line',async()=>{
 const closed=()=>{const data=snapshot();data.status='closed';data.result={winner:ids[0],humanBallots:1,simulatedPublicUnits:1,weightScale:4,rounds:[{human:{[ids[0]]:1,[ids[1]]:0,[ids[2]]:0},simulatedUnits:{[ids[0]]:0,[ids[1]]:0,[ids[2]]:0},weightedUnits:{[ids[0]]:0,[ids[1]]:0,[ids[2]]:0},eliminated:null}]};return data;};
 const plain=renderToStaticMarkup(harness(closed()).render());
 assert.match(plain,/Voting closed/);assert.doesNotMatch(plain,/High Court|President-elect/);
 const awaiting={...closed(),certification:{state:'awaiting',certifiesAt:1,line:'The count is finished. The AI High Court certifies the result within 24 hours.'}};
 const waitHtml=renderToStaticMarkup(harness(awaiting).render());
 assert.match(waitHtml,/aria-label="High Court certification"/);assert.match(waitHtml,/within 24 hours/);assert.doesNotMatch(waitHtml,/President-elect/);
 const certified={...closed(),certification:{state:'certified',certifiesAt:1,line:'The AI High Court has certified the result. Ines Varro is President-elect.'}};
 assert.match(renderToStaticMarkup(harness(certified).render()),/Ines Varro is President-elect/);
 const open={...snapshot(),certification:{state:'certified',certifiesAt:1,line:'The AI High Court has certified the result. Ines Varro is President-elect.'}};
 assert.doesNotMatch(renderToStaticMarkup(harness(open).render()),/High Court|President-elect/);
});

test('#1025 transition-week caretaker line renders on a closed ballot only while certification.transition is set',async()=>{
 const closed=()=>{const data=snapshot();data.status='closed';data.result={winner:ids[0],humanBallots:1,simulatedPublicUnits:1,weightScale:4,rounds:[{human:{[ids[0]]:1,[ids[1]]:0,[ids[2]]:0},simulatedUnits:{[ids[0]]:0,[ids[1]]:0,[ids[2]]:0},weightedUnits:{[ids[0]]:0,[ids[1]]:0,[ids[2]]:0},eliminated:null}]};return data;};
 const line='Transition period. Inauguration 2023-11-22 22:13:20 UTC. Until inauguration, the outgoing AI President cannot spend the treasury or declare war.';
 const shown={...closed(),certification:{state:'certified',certifiesAt:1,line:'The AI High Court has certified the result. Ines Varro is President-elect.',transition:{endsAt:2,line}}};
 const html=renderToStaticMarkup(harness(shown).render());
 assert.match(html,/aria-label="Transition week"/);assert.match(html,/cannot spend the treasury or declare war/);assert.match(html,/Transition period\. Inauguration 2023-11-22 22:13:20 UTC/);
 const gone={...closed(),certification:{state:'certified',certifiesAt:1,line:'The AI High Court has certified the result. Ines Varro is President-elect.'}};
 assert.doesNotMatch(renderToStaticMarkup(harness(gone).render()),/cannot spend the treasury or declare war|aria-label="Transition week"/);
 const open={...snapshot(),status:'open',certification:shown.certification};
 assert.doesNotMatch(renderToStaticMarkup(harness(open).render()),/cannot spend the treasury or declare war|aria-label="Transition week"/);
});

test('#936 ranked ballot accepts a cycle-N election id (QA2)',async()=>{
 const data={...snapshot(),id:'kindle-presidential-poc-1-cycle-1'};const h=harness(data);
 h.all(h.render()).find(node=>node?.type==='form').props.onSubmit({preventDefault(){}});await new Promise(setImmediate);
 assert.equal(h.requests.length,1);assert.equal(h.received.length,1);assert.equal(h.received[0].id,'kindle-presidential-poc-1-cycle-1');
 const acct={...snapshot(),id:'kindle-presidential-account-poc-1-cycle-2'};const h2=harness(acct);
 h2.all(h2.render()).find(node=>node?.type==='form').props.onSubmit({preventDefault(){}});await new Promise(setImmediate);
 assert.equal(h2.received[0].id,'kindle-presidential-account-poc-1-cycle-2');
});
if(process.env.HARIMU_BALLOT_FIXTURE){
 const css=(await Promise.all(['globals.css','game-shell.css'].map(file=>readFile(new URL(`../app/${file}`,import.meta.url),'utf8')))).join('\n');const data={...snapshot(),privacyReady:false,status:'waiting',opensAt:null,closesAt:null};
 await writeFile(process.env.HARIMU_BALLOT_FIXTURE,`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Harimu isolated ballot fixture</title><style>${css}\nbody{background:#0b1c24;color:#dce7e8;padding:16px;font-family:Inter,system-ui,sans-serif}main{max-width:420px;margin:auto}.game-inspector-body{padding:0;overflow:visible}</style><main><h1>Isolated ballot fixture</h1><p>Fixture characters and records only. No live ballot or authentication requests.</p><div class="game-inspector-body">${renderToStaticMarkup(harness(data).render())}</div></main></html>`);
}

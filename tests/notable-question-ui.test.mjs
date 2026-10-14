import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {test} from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {notableProfile} from '../lib/notable-profiles.ts';
const require=createRequire(import.meta.url),exports={};
const source=ts.transpileModule(await readFile(new URL('../app/notable-control.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
new Function('exports','require',source)(exports,name=>name==='react'?{...React,useState:value=>[value,()=>{}]}:name==='../lib/notable-profiles'?require('../lib/notable-profiles.ts'):name==='./action-button'?{ActionButton:'button'}:require(name));
const view={profile:notableProfile('kindle'),enabled:true,reason:'Isolated fixture',dailyLimit:20,source:'authored'};
const all=node=>[node,...[node?.props?.children].flat(Infinity).filter(Boolean).flatMap(child=>typeof child==='object'?all(child):[child])];
test('explicit textarea has accessible label, length and transmission disclosure; native Enter remains a newline',()=>{
 const tree=exports.NotablePanel({view,question:'Public question',onRefresh(){},onSubmit(){}}),html=renderToStaticMarkup(tree),textarea=all(tree).find(n=>n?.type==='textarea');assert.match(html,/for="notable-question"/);assert.match(html,/Cloudflare AI/);assert.match(html,/Private chat, household drafts and conversation history are never added/);assert.equal(textarea.props.maxLength,600);assert.equal(textarea.props.onKeyDown,undefined);assert.equal(textarea.props['aria-describedby'],'notable-question-disclosure notable-question-length');
});
test('form submits only explicit bounded text and pending or disabled service retains text without sending',()=>{
 for(const state of [{pending:true},{unresolved:{requestId:'fixture',notableId:view.profile.id,topic:'news',question:'Original public question'}},{view:{...view,enabled:false}},{question:'tiny'}]){const sent=[],tree=exports.NotablePanel({view,question:'Public question',onRefresh(){},onSubmit:(...args)=>sent.push(args),...state});all(tree).find(n=>n?.type==='form').props.onSubmit({preventDefault(){}});assert.equal(sent.length,0);assert.equal(all(tree).find(n=>n?.type==='textarea').props.value,state.question??'Public question');}
 const sent=[],tree=exports.NotablePanel({view,question:'  What public work is recorded?  ',onRefresh(){},onSubmit:(...args)=>sent.push(args)});all(tree).find(n=>n?.type==='form').props.onSubmit({preventDefault(){}});assert.deepEqual(sent,[['news','What public work is recorded?']]);
});

test('shared allowance prevents an unaffordable freeform request while retaining an affordable listed topic',()=>{
 const budget={remainingMicroUsd:83400,topicMicroUsd:72400,questionMicroUsd:136400,blocked:false};
 for(const state of [{question:'A public question',budget},{question:'',budget:{...budget,blocked:true}}]){const sent=[],tree=exports.NotablePanel({view:{...view,budget:state.budget},question:state.question,onRefresh(){},onSubmit:(...args)=>sent.push(args)});all(tree).find(n=>n?.type==='form').props.onSubmit({preventDefault(){}});assert.equal(sent.length,0);assert.match(renderToStaticMarkup(tree),/Shared AI allowance/);}
 const sent=[],tree=exports.NotablePanel({view:{...view,budget},question:'',onRefresh(){},onSubmit:(...args)=>sent.push(args)});all(tree).find(n=>n?.type==='form').props.onSubmit({preventDefault(){}});assert.deepEqual(sent,[['news',undefined]]);
});

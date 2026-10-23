// #768: each card's date stamp sits as a dateline right under its own headline, inside its own card,
// so it can't be read as the next card's stamp (it used to trail the card body, just above the next headline).
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {test} from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const compile=async file=>ts.transpileModule(await readFile(new URL(`../app/${file}`,import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText;
const tags={};new Function('exports','require',await compile('ai-disclosure.tsx'))(tags,require);
const documents={};new Function('exports','require',await compile('nation-document.tsx'))(documents,name=>name==='../lib/nation-themes'?require('../lib/nation-themes.ts'):require(name));
const real={};new Function('exports','require',await compile('national-news.tsx'))(real,name=>name==='./wire-stories'?{WireStories:()=>null}:name==='../lib/wire-bylines'?require('../lib/wire-bylines.ts'):name==='../lib/press-templates'?require('../lib/press-templates.ts'):name==='../lib/news-intro-copy'?require('../lib/news-intro-copy.ts'):name==='../lib/kill-switch-copy'?require('../lib/kill-switch-copy.ts'):name==='../lib/morning-brief'?require('../lib/morning-brief.ts'):name==='./nation-document'?documents:name==='./display-preferences'?{useDisplayTimestamp:()=>value=>`STAMP-${value}`}:name==='./weekly-addresses'?{WeeklyAddresses:()=>null}:name==='./ai-disclosure'?tags:require(name));
test('#768 each news card shows its own date as a dateline directly under its headline',()=>{
 const items=[{id:'a',title:'Alpha',text:'first',source:'system',occurredAt:3000},{id:'b',title:'Beta',text:'second',source:'deterministic',occurredAt:2000},{id:'c',title:'Gamma',text:'third',source:'model',occurredAt:1000}];
 for(const nationId of ['kindle','korund','aurelle']){
  const html=renderToStaticMarkup(React.createElement(real.NewsEdition,{news:{nationId,title:'T',style:{kindle:'press',korund:'state',aurelle:'court'}[nationId],fetchedAt:0,statistics:{citizens:0,completedShifts:0,food:0},items}}));
  const cards=[...html.matchAll(/<article>([\s\S]*?)<\/article>/g)].map(m=>m[1]);
  assert.equal(cards.length,3);
  for(const [i,item] of items.entries()){
   assert.match(cards[i],new RegExp(`^<h3>${item.title}</h3><time class="news-dateline" dateTime="${new Date(item.occurredAt).toISOString()}">STAMP-${item.occurredAt}</time>`));
   assert.equal((cards[i].match(/<time/g)??[]).length,1);
  }
 }
});

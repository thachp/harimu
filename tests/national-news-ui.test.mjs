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
const source=await compile('national-news.tsx');
const real={};new Function('exports','require',source)(real,name=>name==='./ai-disclosure'?tags:require(name));
const edition=nationId=>({nationId,title:{kindle:'Kindle Press',korund:'Korund State Media',aurelle:'Aurelle Court Gazette'}[nationId],style:{kindle:'press',korund:'state',aurelle:'court'}[nationId],fetchedAt:1768489200000,statistics:{citizens:2,completedShifts:1,food:4},items:[{id:'record',title:'Work recorded',text:'4 food recorded',source:'system',occurredAt:1768489200000},{id:'policy',title:'Statement',text:'A bounded proposal.',source:'deterministic',occurredAt:1768489200000}]});
const all=n=>[n,...[n?.props?.children].flat(Infinity).filter(Boolean).flatMap(c=>typeof c==='object'?all(c):[c])];
test('all national editions show truthful statistics and distinguish system, SI and actual AI content',()=>{
 for(const nationId of ['kindle','korund','aurelle']){
  const news=edition(nationId),html=renderToStaticMarkup(React.createElement(real.NewsEdition,{news}));
  assert.match(html,new RegExp(news.title));assert.match(html,/System record/);assert.match(html,/Simulated statement/);assert.doesNotMatch(html,/AI-generated/);
  assert.match(html,/Registered citizens/);assert.match(html,/Completed paid shifts/);assert.match(html,/do not measure progress against a production quota/);
  assert.match(html,new RegExp(`news-${news.style}`));
  news.items.push({...news.items[1],id:'actual-model',source:'model'});
  assert.match(renderToStaticMarkup(React.createElement(real.NewsEdition,{news})),/AI-generated/);
 }
});
function harness(){
 let cursor=0,effects=[],slots=[],requests=[],closeOrder=[];
 const react={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v];},useRef(){const i=cursor++;if(!(i in slots))slots[i]={current:{showModal(){},close(){closeOrder.push('native-close');},focus(){}}};return slots[i];},useEffect(fn){effects.push(fn);}};
 const fetch=(url,options)=>new Promise(resolve=>requests.push({url,options,resolve}));
 const exports={};new Function('exports','require','fetch','document',source)(exports,name=>name==='react-dom'?{createPortal:node=>node}:name==='react'?react:name==='./ai-disclosure'?tags:require(name),fetch,{body:{}});
 let dialogType;
 const props={nationId:'kindle',session:'ready',configured:true};
 const renderControl=()=>{cursor=0;effects=[];return exports.NationalNewsControl(props);};
 let tree=renderControl();all(tree).find(n=>n?.type==='button').props.onClick();tree=renderControl();dialogType=all(tree).find(n=>typeof n?.type==='function').type;
 slots=[];
 const dialogProps={...props,onClose(){closeOrder.push('restore-focus');}};
 const render=()=>{cursor=0;effects=[];return dialogType(dialogProps);};
 return{dialogProps,render,requests,closeOrder,effects:()=>effects};
}
test('news rejects a foreign edition and ignores interrupted response after account/nation unmount',async()=>{
 const h=harness();h.render();const cleanup=h.effects()[1]();assert.equal(h.requests.length,1);assert.equal(h.requests[0].url,'/api/news');
 cleanup();assert.equal(h.requests[0].options.signal.aborted,true);
 h.requests[0].resolve({ok:true,json:async()=>edition('kindle')});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(all(h.render()).some(n=>n?.props?.news),false);
 const other=harness();other.render();other.effects()[1]();other.requests[0].resolve({ok:true,json:async()=>edition('korund')});await new Promise(resolve=>setImmediate(resolve));
 const tree=other.render();assert.ok(all(tree).includes('Citizenship changed. Close news and refresh your citizen.'));assert.equal(all(tree).some(n=>n?.props?.news),false);
});
test('anonymous, loading, unenrolled and local sample news never request a live edition',()=>{
 for(const props of [{session:'anonymous'},{session:'loading'},{session:'error'},{nationId:null},{configured:false}]){
  const h=harness();Object.assign(h.dialogProps,props);const tree=h.render();h.effects()[1]();assert.equal(h.requests.length,0);assert.equal(all(tree).some(n=>n?.type==='p'&&n.props.role==='status'),true);
 }
});

test('news dismissal closes native modal before restoring focus through Close, Escape and backdrop',()=>{
 for(const action of ['button','escape','backdrop']){
  const h=harness(),tree=h.render(),dialog=all(tree).find(node=>node?.type==='dialog');
  if(action==='button')all(tree).find(node=>node?.type==='button'&&node.props.children==='Close news').props.onClick();
  else if(action==='escape')dialog.props.onCancel({preventDefault(){},stopPropagation(){}});
  else {const target={getBoundingClientRect:()=>({left:10,right:100,top:10,bottom:100})};dialog.props.onClick({target,currentTarget:target,clientX:0,clientY:0});}
  assert.deepEqual(h.closeOrder,['native-close','restore-focus']);
 }
});

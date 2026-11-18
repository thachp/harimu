import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {localRuntime} from './helpers/local-runtime.mjs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const compile=async file=>ts.transpileModule(await readFile(new URL(`../app/${file}`,import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText;
const tags={};new Function('exports','require',await compile('ai-disclosure.tsx'))(tags,require);
const documents={};new Function('exports','require',await compile('nation-document.tsx'))(documents,name=>name==='../lib/nation-themes'?require('../lib/nation-themes.ts'):require(name));
const source=await compile('national-news.tsx');
const real={};new Function('exports','require',source)(real,name=>name==='./wire-stories'?{WireStories:()=>null}:name==='../lib/wire-bylines'?require('../lib/wire-bylines.ts'):name==='../lib/press-templates'?require('../lib/press-templates.ts'):name==='../lib/news-intro-copy'?require('../lib/news-intro-copy.ts'):name==='../lib/kill-switch-copy'?require('../lib/kill-switch-copy.ts'):name==='../lib/morning-brief'?require('../lib/morning-brief.ts'):name==='./nation-document'?documents:name==='./display-preferences'?{useDisplayTimestamp:()=>require('../lib/display-preferences.ts').displayTimestamp}:name==='./weekly-addresses'?{WeeklyAddresses:()=>null}:name==='./ai-disclosure'?tags:require(name));
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
test('each edition is labeled for its system: State Media templates with truthful widget, court decrees, free press',()=>{
 const render=news=>renderToStaticMarkup(React.createElement(real.NewsEdition,{news}));
 const korund=edition('korund');korund.items.push({id:'t',title:'Brigades deliver',text:'1 shift',source:'deterministic',kind:'template',occurredAt:1768489200000});
 const k=render(korund);assert.match(k,/System statistics · truthful/);assert.match(k,/cannot change these numbers/);assert.match(k,/State Media template/);assert.match(k,/Propaganda Directorate/);
 const aurelle=edition('aurelle');aurelle.items.push({id:'d',title:'By order of the Crown: Royal decree',text:'x',source:'deterministic',kind:'decree',occurredAt:1768489200000});
 const a=render(aurelle);assert.match(a,/Court gazette · decree/);assert.match(a,/Herald/);assert.doesNotMatch(a,/System statistics · truthful/);
 assert.match(render(edition('kindle')),/Free press/);
});
function harness(){
 let cursor=0,effects=[],slots=[],requests=[],closeOrder=[];
 const react={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],v=>slots[i]=typeof v==='function'?v(slots[i]):v];},useRef(){const i=cursor++;if(!(i in slots))slots[i]={current:{showModal(){},close(){closeOrder.push('native-close');},focus(){}}};return slots[i];},useEffect(fn){effects.push(fn);}};
 const fetch=(url,options)=>new Promise(resolve=>requests.push({url,options,resolve}));
 const exports={};new Function('exports','require','fetch','document',source)(exports,name=>name==='./wire-stories'?{WireStories:()=>null}:name==='../lib/wire-bylines'?require('../lib/wire-bylines.ts'):name==='../lib/press-templates'?require('../lib/press-templates.ts'):name==='../lib/news-intro-copy'?require('../lib/news-intro-copy.ts'):name==='../lib/kill-switch-copy'?require('../lib/kill-switch-copy.ts'):name==='../lib/morning-brief'?require('../lib/morning-brief.ts'):name==='./nation-document'?documents:name==='./display-preferences'?{useDisplayTimestamp:()=>require('../lib/display-preferences.ts').displayTimestamp}:name==='react-dom'?{createPortal:node=>node}:name==='react'?react:name==='./weekly-addresses'?{WeeklyAddresses:()=>null}:name==='./ai-disclosure'?tags:require(name),fetch,{body:{}});
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

test('#688 intro: a Kindle edition with no model-written item reads "Free press · system records." with no AI wording; with one, the AI intro is unchanged',()=>{
 const render=news=>renderToStaticMarkup(React.createElement(real.NewsEdition,{news}));
 const off=edition('kindle');assert.equal(off.items.some(i=>i.source==='model'),false);
 const h=render(off);assert.match(h,/Free press · system records\. Recorded/);assert.doesNotMatch(h,/AI articles|AI-generated/);
 const on=edition('kindle');on.items.push({...on.items[1],id:'m',source:'model'});
 const a=render(on);assert.match(a,/Free press · system records and AI articles\./);assert.match(a,/AI-generated/);
 for(const nationId of ['korund','aurelle'])assert.doesNotMatch(render(edition(nationId)),/AI articles/,nationId);
});
test('#764: a muted news desk shows the persona-muted notice; a normal edition does not',()=>{
 const notice=require('../lib/kill-switch-copy.ts').personaMuted.notice.text;
 assert.equal(renderToStaticMarkup(React.createElement(real.NewsEdition,{news:edition('kindle')})).includes(notice),false);
 const html=renderToStaticMarkup(React.createElement(real.NewsEdition,{news:{...edition('kindle'),personaMuted:true}}));
 assert.match(html,/data-persona-muted="true"/);assert.equal(html.includes(notice),true);
});
test('#981: a plan-stat line renders only when the edition carries one, and the visible number is that line', () => {
 const render = news => renderToStaticMarkup(React.createElement(real.NewsEdition, { news }));
 const off = render(edition('korund'));
 assert.doesNotMatch(off, /news-plan-stat|of plan/);
 const line = 'Food brigades press on: 87% of plan'; // not recomputed from percent 88: the panel prints the server line only
 const on = render({ ...edition('korund'), planStat: { resource: 'food', output: 35, target: 40, percent: 88, line } });
 assert.match(on, /class="news-plan-stat"/); assert.match(on, new RegExp(line));
 assert.equal(on.split('87').length - 1, 1, 'the widget shows the server line once');
 assert.doesNotMatch(on, /88/);
 assert.match(on, /Work recorded/);
});
test('#742: an edition in templates-only mode shows the template-mode footer; a normal edition does not',()=>{
 const footer=require('../lib/kill-switch-copy.ts').templateMode.footer.text;
 assert.doesNotMatch(renderToStaticMarkup(React.createElement(real.NewsEdition,{news:edition('korund')})),new RegExp(footer));
 const html=renderToStaticMarkup(React.createElement(real.NewsEdition,{news:{...edition('korund'),templatesOnly:true}}));
 assert.equal(html.split(footer).length-1,2,'one edition footer plus one on the non-system item');assert.match(html,/data-template-mode="true"/);
});

const FLAG='HARIMU_KINDLE_NEWSPAPERS_ENABLED';
const playerArticle=(over={})=>({id:'player-1',title:'Shifts posted',text:'Twelve shifts cleared at the yard.\n\nWages are on the board.',source:'player',kind:'player-article',paperName:'Harbor Ledger',authorName:'Ada Shore',paragraphs:['Twelve shifts cleared at the yard.','Wages are on the board.'],occurredAt:1768489200000,...over});
const renderEdition=news=>renderToStaticMarkup(React.createElement(real.NewsEdition,{news}));
const playerBlock=html=>{const start=html.indexOf('data-news-kind="player-article"');assert.ok(start>=0);return html.slice(start,html.indexOf('</li>',start));};
const showsAsText=(html,raw)=>{
  assert.equal(html.includes(raw),false,raw);
  const lt=raw.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
  const hex=raw.replaceAll('&','&amp;').replaceAll('<','&#x3C;').replaceAll('>','&#x3E;');
  assert.ok(html.includes(lt)||html.includes(hex),raw);
};

test('#1461 a player article shows the paper name and byline, and never an AI or template label',()=>{
  const footer=require('../lib/kill-switch-copy.ts').templateMode.footer.text;
  const news=edition('kindle');news.items.push(playerArticle());news.templatesOnly=true;
  const html=renderEdition(news),block=playerBlock(html);
  assert.match(block,/class="news-paper-name">Harbor Ledger</);
  assert.match(block,/class="news-byline">Ada Shore</);
  assert.match(block,/Shifts posted/);
  assert.match(block,/Twelve shifts cleared at the yard\./);
  assert.match(block,/Wages are on the board\./);
  assert.doesNotMatch(block,/AI-generated|Simulated statement|System record|ai-text-tag|news-template-mode/);
  assert.equal(block.includes(footer),false);
  assert.match(html,/System record/);
  assert.match(html,/Simulated statement/);
  assert.match(html,new RegExp(footer));
});

test('#1461 markup in the paper name, headline, byline and paragraphs renders as literal text',()=>{
  const news=edition('kindle');
  news.items.push(playerArticle({
    title:'<script>alert(1)</script>',
    paperName:'<img src=x onerror=alert(1)>',
    authorName:'<em>x</em>',
    paragraphs:['<script>x</script>','<img src=x onerror=alert(1)>'],
    text:'<script>x</script>',
  }));
  const html=renderEdition(news),block=playerBlock(html);
  for(const raw of ['<script>alert(1)</script>','<img src=x onerror=alert(1)>','<em>x</em>','<script>x</script>']) showsAsText(block,raw);
  assert.doesNotMatch(block,/<script[\s>]|<img[\s>]|<em[\s>]/);
  assert.doesNotMatch(source,/dangerouslySetInnerHTML/);
});

test('#1461 a missing or blank author name falls back to A citizen',()=>{
  for(const authorName of [undefined,'','   ']){
    const block=playerBlock(renderEdition({...edition('kindle'),items:[...edition('kindle').items,playerArticle({authorName})]}));
    assert.match(block,/class="news-byline">A citizen</,String(authorName));
    assert.doesNotMatch(block,/>Ada Shore</);
  }
  assert.match(source,/typeof name\s*===\s*'string'\s*&&\s*name\.trim\(\)\s*\?\s*name\.trim\(\)\s*:\s*'A citizen'/);
});

test('#1461 flag off: a Kindle, Korund or Aurelle edition with no player items is unchanged',()=>{
  for(const nationId of ['kindle','korund','aurelle']){
    const html=renderEdition(edition(nationId));
    assert.doesNotMatch(html,/news-paper-name|news-byline|data-news-kind="player-article"|A citizen/,nationId);
    assert.match(html,/System record/,nationId);
    assert.match(html,/Simulated statement/,nationId);
    assert.doesNotMatch(html,/AI-generated/,nationId);
  }
});

test('#1461 flag-off GET /api/news renders without player chrome',async t=>{
  const r=await localRuntime();t.after(()=>r.close());
  const res=await r.call('news','alice');
  assert.equal(res.status,200);
  assert.ok(res.data.items.every(i=>i.kind!=='player-article'&&i.source!=='player'));
  const html=renderEdition(res.data);
  assert.doesNotMatch(html,/news-paper-name|news-byline|data-news-kind="player-article"/);
  assert.match(html,/System record/);
});

test('#1461 flag on: the edition shows a published article with a byline and no AI label',async t=>{
  const r=await localRuntime();t.after(()=>r.close());
  r.setFixtureEnv(FLAG,'true');
  await r.db.prepare("UPDATE citizens SET display_name='Ada Shore' WHERE clerk_user_id='alice'").run();
  assert.equal((await r.call('news','alice',{action:'found-paper',requestId:randomUUID(),name:'Harbor Ledger'})).status,200);
  assert.equal((await r.call('news','alice',{action:'publish',requestId:randomUUID(),headline:'Shifts posted',paragraphs:['Twelve shifts cleared at the yard.','Wages are on the board.']})).status,200);
  const res=await r.call('news','bob');
  assert.equal(res.status,200);
  const html=renderEdition(res.data),block=playerBlock(html);
  assert.match(block,/class="news-paper-name">Harbor Ledger</);
  assert.match(block,/class="news-byline">Ada Shore</);
  assert.match(block,/Shifts posted/);
  assert.doesNotMatch(block,/AI-generated|Simulated statement|ai-text-tag/);
});

test('#1461 long paper names and headlines wrap: no horizontal overflow at 375px',async()=>{
  const css=await readFile(new URL('../app/game-shell.css',import.meta.url),'utf8');
  assert.match(css,/\.national-news-items article\{[^}]*overflow-wrap:anywhere/);
  assert.match(css,/\.national-news-items h3,\s*\.national-news-items p,\s*\.national-news-items \.news-paper-name,\s*\.national-news-items \.news-byline\{[^}]*overflow-wrap:anywhere/);
});


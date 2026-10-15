import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as discovery from '../lib/nation-discovery.ts';
const require = createRequire(import.meta.url);
const source = await readFile(new URL('../app/game-shell.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
const exports = {};
let effects = [];
let stateCursor=0,stateOverrides={};
new Function('exports','require',compiled)(exports,name=>name==='@/lib/market-visibility'?require('../lib/market-visibility.ts'):name==='@/lib/context-strip-copy'?require('../lib/context-strip-copy.ts'):name==='@/lib/hud-help'?require('../lib/hud-help.ts'):name==='@/lib/nation-themes'?require('../lib/nation-themes.ts'):name==='@/lib/nation-emblem'?require('../lib/nation-emblem.ts'):name==='./nation-symbol'?{NationSymbol:()=>null}:name==='./nation-crest'?{NationCrest:()=>null}:name==='@/lib/action-reasons'?require('../lib/action-reasons.ts'):name==='./display-preferences'?{useDisplayTimestamp:()=>require('../lib/display-preferences.ts').displayTimestamp}:name==='./game-settings'?{GameSettings:()=>null}:name==='@/lib/notice-scope'?require('../lib/notice-scope.ts'):name==='./game-timer'?{GameTimer:()=>null}:name==='react'?{useEffect(fn){effects.push(fn);},useState(initial){const slot=stateCursor++;return [stateOverrides[slot]??initial,()=>{}];}}:name==='@/lib/nation-discovery'?discovery:name==='@phosphor-icons/react'?new Proxy({},{get:(_,key)=>String(key)}):name.endsWith('.css')?{}:name==='./game-viewport'?{default:()=>null}:require(name));
const props={view:'square',nation:{id:'kindle',name:'Kindle'},nations:[],capacity:18,localDemo:false,panel:null,onNavigate(){}};
function nodes(node){if(!node || typeof node!=='object')return [node]; if(typeof node.type==='function' && node.type.name==='HudHelp')return nodes(node.type(node.props));return [node,...[node.props?.children].flat(Infinity).flatMap(nodes)];}
const render=extra=>{stateCursor=0;return nodes(exports.GameShell({...props,...extra}));};
const text=tree=>tree.filter(n=>typeof n==='string').join(' ');
test('unsigned and pre-citizenship views expose no fake citizen resources or real-time clock',()=>{const tree=render();assert.match(text(tree),/Resources unlock after citizenship/);assert.match(text(tree),/Nation preview/);assert.match(text(tree),/World preview/);assert.doesNotMatch(text(tree),/Citizen realm|REAL TIME|—/);assert.ok(!tree.includes(18));});
test('#455/#533: while the citizen row loads the top bar shows a neutral or loading line, never the default Kindle name; anonymous never says loading',()=>{
  const loading=text(render({identityHold:'loading',viewedNationHeld:true}));
  assert.match(loading,/Loading your citizen…/); assert.doesNotMatch(loading,/Nation preview|Your citizen/); assert.doesNotMatch(loading,/HARIMU Kindle|Kindle \//); assert.match(loading,/Your nation/);
  assert.match(loading,/Your city/); assert.doesNotMatch(loading,/Forgehaven/, 'the breadcrumb city is held too');
  const neutral=text(render({identityHold:'neutral',viewedNationHeld:true,currentCityName:'Forgehaven'}));
  assert.doesNotMatch(neutral,/Loading your citizen…|Nation preview|Your citizen|Forgehaven/); assert.match(neutral,/HARIMU/);
  const visited=text(render({identityHold:'loading',viewedNationHeld:false,currentCityName:'Forgehaven'}));
  assert.match(visited,/Loading your citizen…/); assert.match(visited,/Forgehaven/, 'a visited nation keeps its city');
  const own=text(render({identityHold:'none',citizenNation:{id:'korund',name:'Korund'}}));
  assert.match(own,/Korund/); assert.match(own,/Your citizen/); assert.doesNotMatch(own,/Loading your citizen…/); assert.doesNotMatch(own,/HARIMU Kindle/);
  const anon=text(render({}));
  assert.match(anon,/Nation preview/); assert.doesNotMatch(anon,/Loading your citizen…/, 'anonymous: the normal preview line');
});
test('citizen resource help is keyboard native and screen reader descriptive, with explicit snapshot loading',()=>{const tree=render({citizenNation:props.nation});const summaries=tree.filter(n=>n?.type==='summary');assert.equal(summaries.length,6);for(const summary of summaries){const description=tree.find(n=>n?.props?.id===summary.props['aria-describedby']);assert.ok(description);assert.ok(text(nodes(description)).length>40);}assert.match(text(tree),/Loading world/);assert.match(text(tree),/real-time deadline/);assert.match(text(tree),/Loading/);});
test('world snapshot uses compressed day and visits while Civic is active for nation view',()=>{const tree=render({view:'nation',worldClock:{gameDay:2,latestTick:1,pendingTicks:0}});assert.match(text(tree),/Day 2 · 12×/);assert.match(text(tree),/TICK 1 · ON VISITS/);assert.equal(tree.find(n=>n?.type==='button'&&n.props['aria-label']==='Open Civic').props['aria-current'],'page');assert.equal(tree.find(n=>n?.type==='a'&&n.props.className==='game-glossary').props.href,'https://docs.harimu.com/appendices/glossary/');});

test('only success notices expire; errors remain until dismissed',()=>{
  const originalSet=globalThis.setTimeout,originalClear=globalThis.clearTimeout;
  let delay,callback,cleared=false;
  globalThis.setTimeout=(fn,ms)=>{callback=fn;delay=ms;return 7;};
  globalThis.clearTimeout=id=>{cleared=id===7;};
  try {
    effects=[];const success=render({notice:'Shift started',noticeKind:'success'});const cleanup=effects[0]();assert.equal(delay,8000);assert.equal(typeof callback,'function');cleanup();assert.equal(cleared,true);assert.equal(success.find(n=>n?.props?.className==='game-notice').props.role,'status');
    effects=[];delay=undefined;const error=render({notice:'Please retry',noticeKind:'error'});assert.equal(effects[0](),undefined);assert.equal(delay,undefined);assert.equal(error.find(n=>n?.props?.className==='game-notice').props.role,'alert');
  } finally {globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear;}
});

test('empty context copy reflects open and collapsed details without inventing inventory needs',()=>{
  assert.match(text(render({view:'household'})),/Details are open/);
  assert.doesNotMatch(text(render({view:'household'})),/Show details to view/);
  stateOverrides={0:true};
  try {assert.match(text(render({view:'household'})),/Show details to view available actions/);assert.doesNotMatch(text(render({view:'household'})),/Details are open/);} finally {stateOverrides={};}
});

test('#551: the live region is always present in the top bar and only its text changes; the normal identity line is never inside it',()=>{
  const status=extra=>render(extra).filter(n=>n&&typeof n==='object'&&n.props?.role==='status');
  for(const hold of ['none','neutral','loading']){assert.equal(status({identityHold:hold}).length,1,`one status container while hold is ${hold}`);}
  const words=extra=>nodes(status(extra)[0]).filter(n=>typeof n==='string').join('');
  assert.equal(words({identityHold:'loading'}),'Loading your citizen…');
  assert.equal(words({identityHold:'neutral'}),'','neutral: empty, so nothing is announced');
  assert.equal(words({identityHold:'none',citizenNation:{id:'korund',name:'Korund'}}),'','the normal line is outside the live region: it is not announced twice');
  assert.match(text(render({identityHold:'none',citizenNation:{id:'korund',name:'Korund'}})),/Your citizen/);
});

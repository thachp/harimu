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
new Function('exports','require',compiled)(exports,name=>name==='@/lib/market-visibility'?require('../lib/market-visibility.ts'):name==='@/lib/hud-help'?require('../lib/hud-help.ts'):name==='@/lib/action-reasons'?require('../lib/action-reasons.ts'):name==='./display-preferences'?{useDisplayTimestamp:()=>require('../lib/display-preferences.ts').displayTimestamp}:name==='./game-settings'?{GameSettings:()=>null}:name==='@/lib/notice-scope'?require('../lib/notice-scope.ts'):name==='./game-timer'?{GameTimer:()=>null}:name==='react'?{useEffect(fn){effects.push(fn);},useState(initial){const slot=stateCursor++;return [stateOverrides[slot]??initial,()=>{}];}}:name==='./nation-strip-filters'?{NationStripFilters:()=>null}:name==='@/lib/nation-discovery'?discovery:name==='@phosphor-icons/react'?new Proxy({},{get:(_,key)=>String(key)}):name.endsWith('.css')?{}:name==='./game-viewport'?{default:()=>null}:require(name));
const props={view:'square',nation:{id:'kindle',name:'Kindle'},nations:[],capacity:18,localDemo:false,panel:null,onNavigate(){}};
function nodes(node){if(!node || typeof node!=='object')return [node]; if(typeof node.type==='function' && node.type.name==='HudHelp')return nodes(node.type(node.props));return [node,...[node.props?.children].flat(Infinity).flatMap(nodes)];}
const render=extra=>{stateCursor=0;return nodes(exports.GameShell({...props,...extra}));};
const text=tree=>tree.filter(n=>typeof n==='string').join(' ');
test('unsigned and pre-citizenship views expose no fake citizen resources or real-time clock',()=>{const tree=render();assert.match(text(tree),/Resources unlock after citizenship/);assert.match(text(tree),/Nation preview/);assert.match(text(tree),/World preview/);assert.doesNotMatch(text(tree),/Citizen realm|REAL TIME|—/);assert.ok(!tree.includes(18));});
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
  stateOverrides={3:true};
  try {assert.match(text(render({view:'household'})),/Show details to view available actions/);assert.doesNotMatch(text(render({view:'household'})),/Details are open/);} finally {stateOverrides={};}
});

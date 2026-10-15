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
new Function('exports','require',compiled)(exports,name=>name==='@/lib/market-visibility'?require('../lib/market-visibility.ts'):name==='@/lib/hud-help'?require('../lib/hud-help.ts'):name==='@/lib/nation-themes'?require('../lib/nation-themes.ts'):name==='@/lib/nation-emblem'?require('../lib/nation-emblem.ts'):name==='./nation-symbol'?{NationSymbol:()=>null}:name==='@/lib/action-reasons'?require('../lib/action-reasons.ts'):name==='./display-preferences'?{useDisplayTimestamp:()=>require('../lib/display-preferences.ts').displayTimestamp}:name==='./game-settings'?{GameSettings:()=>null}:name==='@/lib/notice-scope'?require('../lib/notice-scope.ts'):name==='./game-timer'?{GameTimer:()=>null}:name==='react'?{useEffect(fn){effects.push(fn);},useState(initial){const slot=stateCursor++;return [stateOverrides[slot]??initial,()=>{}];}}:name==='@/lib/nation-discovery'?discovery:name==='@phosphor-icons/react'?new Proxy({},{get:(_,key)=>String(key)}):name.endsWith('.css')?{}:name==='./game-viewport'?{default:()=>null}:require(name));
const props={view:'square',nation:{id:'kindle',name:'Kindle'},nations:[],capacity:18,localDemo:false,panel:null,onNavigate(){}};
function nodes(node){if(!node || typeof node!=='object')return [node]; if(typeof node.type==='function' && node.type.name==='HudHelp')return nodes(node.type(node.props));return [node,...[node.props?.children].flat(Infinity).flatMap(nodes)];}
const render=extra=>{stateCursor=0;return nodes(exports.GameShell({...props,...extra}));};
const text=tree=>tree.filter(n=>typeof n==='string').join(' ');
// ---- #379: visitor wording (setup above is the same GameShell harness as game-hud.test.mjs) ----
const panelProps={panel:'panel'};
test('#379: a visitor sees "VISITOR PREVIEW", a citizen (or a citizen still loading) keeps "CITIZEN LIFE"',()=>{
  const visitor=text(render({...panelProps}));
  assert.match(visitor,/VISITOR PREVIEW/);assert.doesNotMatch(visitor,/CITIZEN LIFE/);
  assert.match(text(render({...panelProps,guestDemo:true})),/VISITOR PREVIEW/);
  assert.match(text(render({...panelProps,localDemo:true})),/VISITOR PREVIEW/);
  const citizen=text(render({...panelProps,citizenNation:{id:'kindle',name:'Kindle'}}));
  assert.match(citizen,/CITIZEN LIFE/);assert.doesNotMatch(citizen,/VISITOR PREVIEW/);
  const loading=text(render({...panelProps,identityLoading:true}));
  assert.match(loading,/CITIZEN LIFE/);assert.doesNotMatch(loading,/VISITOR PREVIEW/);
  assert.match(text(render({...panelProps,view:'world'})),/NATION INSPECTION/,'inspection views are unchanged for everyone');
  assert.match(text(render({...panelProps,view:'world',citizenNation:{id:'kindle',name:'Kindle'}})),/NATION INSPECTION/);
});
test('#379: the clock help says what 12× means (docs: world-clock-pacing, 1 real day = 12 game days)',()=>{
  const summaryHelp=node=>String(node?.props?.help??'');
  const tree=exports.GameShell({...props,worldClock:{gameDay:2,latestTick:1}});
  const flat=n=>[n,...[n?.props?.children].flat(Infinity).flatMap(c=>c&&typeof c==='object'?flat(c):[c])];
  assert.ok(flat(tree).some(n=>summaryHelp(n).includes('one real day is 12 game days')));
});
test('#379: the viewport label and selection say "Household" for visitors and keep "Your household" for citizens',async()=>{
  const {locationLabel,locationSelection}=await import('../lib/game-viewport.ts');
  assert.equal(locationLabel('home','Your household'),'Your household');
  assert.equal(locationLabel('home','Your household',true),'Household');
  assert.equal(locationLabel('market','Forgehaven market',true),'Forgehaven market','only the household label changes');
  assert.equal(locationSelection('home','kindle').label,'Your household');
  assert.equal(locationSelection('home','kindle',true).label,'Household');
  assert.equal(locationSelection('home','kindle',true).detail,locationSelection('home','kindle').detail);
  assert.equal(locationSelection('market','korund',true).label,'State ration store');
});
test('#379: GameViewport defaults to citizen wording and the shell passes the visitor flag',async()=>{
  const viewport=await readFile(new URL('../app/game-viewport.tsx',import.meta.url),'utf8');
  assert.match(viewport,/visitor = false/);assert.match(viewport,/locationLabel\(building\.location, building\.label, visitor\)/);
  assert.match(source,/<GameViewport visitor=\{visitor\}/);
  assert.match(source,/const visitor = !citizenNation && !identityLoading;/);
});
test('#379: first-visit guide and country map wording do not call a visitor a citizen',async()=>{
  const guide=await readFile(new URL('../app/first-visit-guide.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(guide,/You are a citizen/);assert.match(guide,/Who runs the government/);
  assert.match(guide,/you become a citizen only when you choose a nation and confirm/);
  const {liveNations}=await import('../lib/nation-discovery.ts');
  assert.deepEqual([...liveNations],['kindle','korund','aurelle'],'the guide names the three playable nations; update it if this list changes');
  assert.match(guide,/Three of them \(Kindle, Korund and Aurelle\) are playable/);
  const country=await readFile(new URL('../app/country-scene.tsx',import.meta.url),'utf8');
  assert.match(country,/preview \? 'Presence shows in your own nation' : 'Online count unavailable'/,'citizens keep "Online count unavailable"');
});

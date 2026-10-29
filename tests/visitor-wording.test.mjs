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
new Function('exports','require',compiled)(exports,name=>name==='@/lib/market-visibility'?require('../lib/market-visibility.ts'):name==='@/lib/ui-v2-world'?require('../lib/ui-v2-world.ts'):name==='@/lib/ui-v2-rail'?require('../lib/ui-v2-rail.ts'):name==='@/lib/ui-v2-city'?require('../lib/ui-v2-city.ts'):name==='@/lib/nation-skin'?require('../lib/nation-skin.ts'):name==='@/lib/aurelle-wallet-parity'?require('../lib/aurelle-wallet-parity.ts'):name==='@/lib/faith-festival-hud'?require('../lib/faith-festival-hud.ts'):name==='@/lib/korund-wallet-rations'?require('../lib/korund-wallet-rations.ts'):name==='./korund-wallet-rations'?{KorundWalletRations:()=>null}:name==='@/lib/ui-v2-mobile'?require('../lib/ui-v2-mobile.ts'):name==='@/lib/context-strip-copy'?require('../lib/context-strip-copy.ts'):name==='@/lib/hud-help'?require('../lib/hud-help.ts'):name==='@/lib/nation-themes'?require('../lib/nation-themes.ts'):name==='@/lib/nation-emblem'?require('../lib/nation-emblem.ts'):name==='@/lib/topbar-countdown'?require('../lib/topbar-countdown.ts'):name==='@/lib/world-age'?require('../lib/world-age.ts'):name==='@/lib/game-season'?require('../lib/game-season.ts'):name==='./topbar-countdown'?{TopbarCountdown:()=>null}:name==='./nation-symbol'?{NationSymbol:()=>null}:name==='./nation-crest'?{NationCrest:()=>null}:name==='@/lib/action-reasons'?require('../lib/action-reasons.ts'):name==='./display-preferences'?{useDisplayTimestamp:()=>require('../lib/display-preferences.ts').displayTimestamp}:name==='./game-settings'?{GameSettings:()=>null}:name==='@/lib/notice-scope'?require('../lib/notice-scope.ts'):name==='./game-timer'?{GameTimer:()=>null}:name==='react'?{useEffect(fn){effects.push(fn);},useState(initial){const slot=stateCursor++;return [stateOverrides[slot]??initial,()=>{}];}}:name==='@/lib/nation-discovery'?discovery:name==='@phosphor-icons/react'?new Proxy({},{get:(_,key)=>String(key)}):name.endsWith('.css')?{}:name==='./game-viewport'?{default:()=>null}:require(name));
const props={view:'square',nation:{id:'kindle',name:'Kindle'},nations:[],capacity:18,localDemo:false,panel:null,onNavigate(){}};
function nodes(node){if(!node || typeof node!=='object')return [node]; if(typeof node.type==='function' && node.type.name==='HudHelp')return nodes(node.type(node.props));return [node,...[node.props?.children].flat(Infinity).flatMap(nodes)];}
const render=extra=>{stateCursor=0;return nodes(exports.GameShell({...props,...extra}));};
const text=tree=>tree.filter(n=>typeof n==='string').join(' ');
// ---- #379: visitor wording (setup above is the same GameShell harness as game-hud.test.mjs) ----
const panelProps={panel:'panel'};
test('#379: a visitor sees "VISITOR PREVIEW", a citizen (or a citizen still loading) keeps "CITIZEN LIFE"',()=>{
  const visitor=text(render({...panelProps,visitorSession:true}));
  assert.match(visitor,/VISITOR PREVIEW/);assert.doesNotMatch(visitor,/CITIZEN LIFE/);
  assert.match(text(render({...panelProps,visitorSession:true,guestDemo:true})),/VISITOR PREVIEW/);
  assert.match(text(render({...panelProps,visitorSession:true,localDemo:true})),/VISITOR PREVIEW/);
  const citizen=text(render({...panelProps,visitorSession:true,citizenNation:{id:'kindle',name:'Kindle'}}));
  assert.match(citizen,/CITIZEN LIFE/);assert.doesNotMatch(citizen,/VISITOR PREVIEW/);
  const loading=text(render({...panelProps,identityHold:'loading'}));
  assert.match(text(render({...panelProps})),/CITIZEN LIFE/,'default is citizen wording');
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
  assert.match(source,/<GameViewport marketOpen=\{[^}]*\} visitor=\{visitor\}/);
  assert.match(source,/const visitor = !citizenNation && visitorSession;/);
});
test('#379: first-visit guide and country map wording do not call a visitor a citizen',async()=>{
  const guide=await readFile(new URL('../app/first-visit-guide.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(guide,/You are a citizen/);assert.match(guide,/Who runs the government/);
  assert.match(guide,/you become a citizen only when you choose a nation and confirm the Oath of Citizenship, which is permanent/);
  const {liveNations}=await import('../lib/nation-discovery.ts');
  assert.deepEqual([...liveNations],['kindle','korund','aurelle'],'the guide names the three playable nations; update it if this list changes');
  assert.match(guide,/Three of them \(Kindle, Korund and Aurelle\) are playable/);
  const country=await readFile(new URL('../app/country-scene.tsx',import.meta.url),'utf8');
  assert.match(country,/preview \? 'Presence shows in your own nation' : 'Online count unavailable'/,'citizens keep "Online count unavailable"');
});

test('#379: a citizen reloading a city URL while the session loads never sees visitor wording (and the scene is not rebuilt after load)',async()=>{
  const nav=await import('../lib/scene-navigation.ts');
  const url='?view=square&nation=kindle&city=forgehaven';
  // identityHold is 'none' here when the sign-in hint is unknown (a valid ?nation= is shown at once), so it cannot be the visitor signal...
  assert.equal(nav.identityHold(url,['kindle','korund','aurelle'],true,false,'unknown'),'none');
  // ...isVisitorSession is: false while the session loads or errors, true only once it is known to be a visitor.
  assert.equal(nav.isVisitorSession(false,true,'loading'),false);
  assert.equal(nav.isVisitorSession(false,true,'error'),false);
  assert.equal(nav.isVisitorSession(true,true,'ready'),false);
  assert.equal(nav.isVisitorSession(false,true,'anonymous'),true);
  assert.equal(nav.isVisitorSession(false,true,'ready'),true);
  assert.equal(nav.isVisitorSession(false,false,'loading'),true,'local demo is a visitor');
  // Loading -> ready as a citizen: the wording is citizen wording at every step, so the flag never flips.
  const kindle={id:'kindle',name:'Kindle'};
  for (const [citizenNation,status] of [[undefined,'loading'],[kindle,'ready']]) {
    const out=text(render({...panelProps,citizenNation,visitorSession:nav.isVisitorSession(Boolean(citizenNation),true,status)}));
    assert.match(out,/CITIZEN LIFE/);assert.doesNotMatch(out,/VISITOR PREVIEW/);
  }
  const page=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8');
  assert.match(page,/<GameShell visitorSession=\{isVisitorSession\(Boolean\(citizenNation\), clerkConfigured, citizenSessionStatus\)\}/);
});

test('#379: the context strip and footer note do not call a visitor a citizen; a citizen, a loading session and the demos keep their labels',()=>{
  const visitor=text(render({...panelProps,visitorSession:true}));
  assert.match(visitor,/Visitor preview/);assert.match(visitor,/CITY DISTRICTS · VISITOR VIEW/);assert.doesNotMatch(visitor,/Citizen snapshot|CITIZEN VIEW/);
  const citizen=text(render({...panelProps,visitorSession:true,citizenNation:{id:'kindle',name:'Kindle'}}));
  assert.match(citizen,/Citizen snapshot/);assert.match(citizen,/CITY DISTRICTS · CITIZEN VIEW/);assert.doesNotMatch(citizen,/Visitor preview/);
  const loading=text(render({...panelProps,identityHold:'loading'}));
  assert.match(loading,/Citizen snapshot/);assert.doesNotMatch(loading,/Visitor preview/);
  assert.match(text(render({...panelProps,visitorSession:true,guestDemo:true})),/Disposable sample/);
  assert.match(text(render({...panelProps,visitorSession:true,localDemo:true})),/Browser-local demo/);
  assert.match(text(render({...panelProps,visitorSession:true,view:'country'})),/Static lore · opt-in presence/);
});

test('#379: the World tab is a real GET submit before hydration (?view=world&nation=…), and onClick still navigates client-side without a reload',()=>{
  const calls=[];let prevented=0;
  const tree=render({visitorSession:true,onNavigate:v=>calls.push(v),nation:{id:'aurelle',name:'Aurelle'}});
  const el=type=>tree.filter(n=>n&&typeof n==='object'&&n.type===type);
  const form=el('form').find(f=>f.props.id==='world-tab-form');
  assert.ok(form,'a hidden GET form carries the World tab target');assert.equal(form.props.method,'get');assert.equal(form.props.hidden,true);
  const hidden=el('input').find(i=>i.props.name==='nation');assert.equal(hidden.props.type,'hidden');assert.equal(hidden.props.value,'aurelle','the viewed nation travels with the click');
  const dock=el('button').filter(b=>/^Open /.test(b.props['aria-label']??''));
  const world=dock.find(b=>b.props['aria-label']==='Open World');
  assert.equal(world.props.type,'submit');assert.equal(world.props.form,'world-tab-form');assert.equal(world.props.name,'view');assert.equal(world.props.value,'world','submits ?view=world');
  for(const b of dock.filter(b=>b!==world))assert.equal(b.props.type,'button',`${b.props['aria-label']} stays a plain button`);
  world.props.onClick({preventDefault(){prevented++;}});
  assert.equal(prevented,1,'after hydration the default submit is cancelled, so there is no page reload');assert.deepEqual(calls,['world']);
});

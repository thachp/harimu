import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as disclosure from '../lib/government-disclosure.ts';
const require=createRequire(import.meta.url),Timer=()=>null;
const all=n=>[n,...[n?.props?.children].flat(Infinity).filter(Boolean).flatMap(c=>typeof c==='object'?all(c):[c])];
async function load(file){const compiled=ts.transpileModule(await readFile(new URL(file,import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;const exports={};new Function('exports','require',compiled)(exports,name=>name==='@/lib/market-visibility'?require('../lib/market-visibility.ts'):name==='@/lib/context-strip-copy'?require('../lib/context-strip-copy.ts'):name==='./display-preferences'?{useDisplayTimestamp:()=>require('../lib/display-preferences.ts').displayTimestamp}:name==='./nation-document'?{NationDocument:'section'}:name==='./leader-panel'?{LeaderPanel:()=>null}:name==='./ai-disclosure'?{AiBadge:()=>null}:name==='../lib/government-disclosure'?disclosure:name==='react'?{useState:initial=>[initial,()=>{}],useEffect(){}}:name==='@/lib/notice-scope'?require('../lib/notice-scope.ts'):name==='./game-timer'?{GameTimer:Timer}:name==='../lib/game-time'?require('../lib/game-time.ts'):name==='@/lib/daily-briefing'?require('../lib/daily-briefing.ts'):name==='@/lib/aurelle'?{aurelleFoodPriceMinor:200}:name==='@/lib/nation-discovery'?require('../lib/nation-discovery.ts'):name==='@/lib/hud-help'?require('../lib/hud-help.ts'):name==='@/lib/nation-themes'?require('../lib/nation-themes.ts'):name==='@/lib/nation-emblem'?require('../lib/nation-emblem.ts'):name==='./nation-symbol'?{NationSymbol:()=>null}:name==='./nation-crest'?{NationCrest:()=>null}:name==='@/lib/action-reasons'?require('../lib/action-reasons.ts'):name==='react/jsx-runtime'?require(name):{});return exports;}
test('actual shell shift chip converts authoritative seconds to milliseconds for the shared real/game timer',async()=>{const {GameShell}=await load('../app/game-shell.tsx');const nodes=all(GameShell({view:'workplace',nation:{id:'kindle',name:'Kindle'},capacity:18,shiftSummary:{title:'Harvest',endsAt:1791911944},onNavigate(){},onSelectNation(){}}));const timer=nodes.find(n=>n?.type===Timer);assert.equal(timer.props.endsAt,1791911944000);assert.equal(timer.props.compact,true);assert.equal(timer.props.label,'Shift');});
test('actual earlier-nation escrow keeps its exact original deadline and unavailable claim gate on first render',async()=>{const {PriorNationShift}=await load('../app/korund-plan-panel.tsx');const deadline='2026-10-13T17:19:04.992Z';const nodes=all(PriorNationShift({shift:{completesAt:deadline,orderName:'Original harvest',wageMinor:800},currency:'SPK',pending:false,uncertain:false,onClaim(){},onRetry(){}}));const timer=nodes.find(n=>n?.type===Timer);assert.equal(timer.props.endsAt,deadline);assert.equal(timer.props.label,'Original shift ready');assert.ok(nodes.some(n=>n?.props?.reason==='Checking the shift timer…'));});

test('daily briefing forwards recovery, shift and meal ISO deadlines without changing them',async()=>{
 const {DailyBriefing}=await load('../app/daily-briefing.tsx');
 const recovery='2026-10-14T00:00:00Z',shift='2026-10-13T19:00:00Z',meal='2026-10-13T18:00:00Z';
 const nodes=all(DailyBriefing({economy:{walletMinor:0,inventory:[{item:'food',quantity:2}],nextRecoveryAt:recovery},shifts:[{completesAt:shift,orderName:'Harvest'}],capacity:18,market:{available:true,mealReadyAt:meal,mealFood:2,mealCapacity:4},government:null,citizenNationName:'Kindle',localDemo:false,onRefresh(){},onOpenWork(){},onOpenMarket(){}}));
 assert.deepEqual(nodes.filter(n=>n?.type===Timer).map(n=>n.props.endsAt),[recovery,shift,meal]);
});
test('active civic priority converts authoritative epoch seconds for the shared expiry timer',async()=>{
 const {GovernmentPanel}=await load('../app/government-panel.tsx');const snapshot={roles:[],decision:{title:'Food',reason:'Need',proposedSpendMinor:0},availableBudgetMinor:0,petitions:[],review:{active:true,reviewedAt:1791911944,expiresAt:1791919144,petitionCount:1}};
 const props={snapshot,verification:null,localDemo:false,pending:false,error:null,onPetition(){}};
 const timer=all(GovernmentPanel(props)).find(n=>n?.type===Timer);assert.equal(timer.props.endsAt,1791919144000);
 snapshot.review.active=false;assert.equal(all(GovernmentPanel(props)).find(n=>n?.type===Timer),undefined);
});
test('Korund coupon expiry remains original ISO and both national assignments show real and game durations',async()=>{
 const {KorundPlanPanel}=await load('../app/korund-plan-panel.tsx');const expiry='2026-10-14T02:00:00Z';
 const props={plan:{available:true,walletMinor:0,foodQuantity:0,gameWeek:1,couponFoodRemaining:2,couponExpiresAt:expiry,shifts:[],assignment:{name:'Brigade',hours:2,capacityCost:4,wageMinor:800,foodOutput:4}},scene:'workplace',capacity:18,pending:false,uncertain:false,localDemo:false,error:null,onCommand(){},onRetry(){},onRefresh(){},onNavigate(){}};
 const nodes=all(KorundPlanPanel(props));assert.equal(nodes.find(n=>n?.type===Timer).props.endsAt,expiry);assert.ok(nodes.includes('2h'));assert.ok(nodes.includes('1d'));
 const {AurellePlanPanel}=await load('../app/aurelle-plan-panel.tsx');const royal=all(AurellePlanPanel({...props,plan:{available:true,charter:{name:'Charter',active:true},shifts:[],walletMinor:0,foodQuantity:0,publicFundMinor:800}}));assert.ok(royal.includes('2h'));assert.ok(royal.includes('1d'));
});

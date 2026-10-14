import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {test} from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import * as squareValidation from '../lib/square-chat-validation.ts';
import {simulateGovernment} from '../lib/government.ts';
const require=createRequire(import.meta.url);
async function component(file,name) {
  const source=await readFile(new URL(`../app/${file}`,import.meta.url),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText;
  const GameTimer=['government-panel.tsx','leader-panel.tsx'].includes(file)?await component('game-timer.tsx','GameTimer'):null;
  const LeaderPanel=file==='government-panel.tsx'?await component('leader-panel.tsx','LeaderPanel'):null;
  const AiBadge=file!=='ai-disclosure.tsx'?await component('ai-disclosure.tsx','AiBadge'):null;
  const AiTextTag=file!=='ai-disclosure.tsx'?await component('ai-disclosure.tsx','AiTextTag'):null;
  const NationDocument=['government-panel.tsx','leader-panel.tsx'].includes(file)?await component('nation-document.tsx','NationDocument'):null;
  const exports={};
  new Function('exports','require',compiled)(exports,name=>name==='@/lib/action-reasons'?require('../lib/action-reasons.ts'):name==='./display-preferences'?{useDisplayTimestamp:()=>require('../lib/display-preferences.ts').displayTimestamp}:name==='./nation-document'?{NationDocument}:name==='../lib/nation-themes'?require('../lib/nation-themes.ts'):name==='./leader-panel'?{LeaderPanel}:name==='./ai-disclosure'?{AiBadge,AiTextTag}:name==='../lib/leader-personas'?require('../lib/leader-personas.ts'):name.endsWith('.css')?{}:name==='../lib/square-chat-validation'?squareValidation:name==='./game-timer'?{GameTimer}:name==='../lib/government-disclosure'?require('../lib/government-disclosure.ts'):name==='../lib/game-time'?require('../lib/game-time.ts'):require(name));
  return exports[name];
}
const SquareChat=await component('square-chat.tsx','SquareChat');
const GovernmentPanel=await component('government-panel.tsx','GovernmentPanel');
const render=(Component,props)=>renderToStaticMarkup(React.createElement(Component,props));
test('Square identifies signed-in unenrolled citizens without requesting sign-in or enabling chat',()=>{
  const html=render(SquareChat,{enabled:false,nationId:null,configured:true,session:'ready'});
  assert.match(html,/You are signed in\. Choose a nation/);
  assert.doesNotMatch(html,/Sign in|Local demo|<textarea|Send message/);
});
test('Square distinguishes anonymous, loading, account error and local demo',()=>{
  for(const [props,expected] of [
    [{configured:true,session:'anonymous'},/Sign in, then choose citizenship/],
    [{configured:true,session:'loading'},/Loading your citizen account/],
    [{configured:true,session:'error'},/could not be loaded/],
    [{configured:false,session:'ready'},/Local demo has no chat/],
  ]) assert.match(render(SquareChat,{enabled:false,nationId:null,...props}),expected);
});
test('supported Civic missing data offers retry rather than claiming implementation is planned',()=>{
  for(const nationId of ['kindle','korund','aurelle']) {
    const html=render(GovernmentPanel,{snapshot:null,nationId,onRetry(){}});
    assert.match(html,/saved decisions have not loaded/);
    assert.match(html,/Retry government preview/);
    assert.doesNotMatch(html,/coming soon|not built yet|Request priority for/);
  }
  assert.match(render(GovernmentPanel,{snapshot:null,nationId:'fulmara'}),/Civic play coming soon/);
});
test('loaded Civic shows actual policy and disabled petitions when verification is unavailable',()=>{
  const snapshot=simulateGovernment({nationId:'kindle',availableBudgetMinor:9000,foodSecurity:80,petitionCounts:{}});
  const html=render(GovernmentPanel,{snapshot,nationId:'kindle',verification:{countedActionsEligible:false,reason:'Phone verification is not available yet.'},localDemo:false,pending:false,error:null,onPetition(){}});
  assert.match(html,/Food security reserve/);
  assert.equal((html.match(/<button[^>]*disabled/g)||[]).length,3);
  assert.match(html,/Request priority for/);
  assert.doesNotMatch(html,/Government preview unavailable|Civic play coming soon/);
});

test('City chat distinguishes nationwide messages from opt-in city presence',()=>{
  const html=render(SquareChat,{enabled:true,nationId:'kindle',cityId:'kindle-capital',session:'ready'});
  assert.match(html,/Conversation is nation-wide/);
  assert.match(html,/Presence counts only citizens in your current city/);
  assert.match(html,/sharing turns off when you travel/);
  assert.match(html,/Share my presence while this city is visible/);
  assert.doesNotMatch(html,/<input[^>]*checked|this square/);
});
test('City presence remains disabled when the current city is unavailable',()=>{
  const html=render(SquareChat,{enabled:true,nationId:'kindle',session:'ready'});
  assert.match(html,/<input[^>]*disabled/);
});

test('closed nation Civic local previews use official disclosures without internal rationale',()=>{
 for(const nationId of ['korund','aurelle']) {
  const snapshot=simulateGovernment({nationId,availableBudgetMinor:0,foodSecurity:35,petitionCounts:{}});
  const html=render(GovernmentPanel,{snapshot,nationId,localDemo:true,pending:false,onPetition(){}});
  assert.match(html,nationId==='korund'?/Chairman&#x27;s official statement/:/Royal decree/);
  assert.match(html,/Why\?/);assert.match(html,/Simulated statement/);
  assert.doesNotMatch(html,/35\/100|below the 40-point/);
 }
});

test('all MVP leaders have portraits, SI badges, programme status and lawful disclosure',()=>{
 for(const nationId of ['kindle','korund','aurelle']) {
  const snapshot=simulateGovernment({nationId,availableBudgetMinor:1000,foodSecurity:35,petitionCounts:{}});
  const html=render(GovernmentPanel,{snapshot,nationId,localDemo:true,pending:false,onPetition(){}});
  assert.match(html,/Stylized portrait/);assert.match(html,/Authored preview persona/);assert.match(html,/Current pledges and programme/);assert.match(html,/Enforced by rules/);assert.match(html,/Proposed/);
  assert.match(html,/class="ai-badge"/);assert.doesNotMatch(html,/AI-generated/);
  assert.equal((html.match(/Why\?/g)||[]).length,1);
 }
});

test('dock chat outside City keeps nation conversation but disables presence with an explicit reason',()=>{
 const html=render(SquareChat,{enabled:true,nationId:'kindle',cityId:'kindle-capital',session:'ready',presenceAllowed:false});
 assert.match(html,/Open your current City view before sharing presence/);assert.match(html,/<input[^>]*disabled/);assert.doesNotMatch(html,/<input[^>]*checked/);
});

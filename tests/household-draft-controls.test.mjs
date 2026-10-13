import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import ts from 'typescript';
const source=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function actualFunction(name){let found;function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text===name)found=node;ts.forEachChild(node,visit);}visit(ast);assert.ok(found);return ts.transpileModule(found.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;}
function invoke(name,scope,...args){return new Function(...Object.keys(scope),`${actualFunction(name)};return ${name};`)(...Object.values(scope))(...args);}
test('household draft and selection guards perform no changes while saving or session unavailable',async()=>{
 for(const decisionPending of [true,false]){
  const actions=[];const scope={decisionPending,citizenNation:{id:'kindle'},clerkConfigured:true,citizenSessionStatus:decisionPending?'ready':'loading',setCompletedPlanIds(){actions.push('selection');},setPlanSaved(){actions.push('saved');},setDecisionError(){actions.push('error');}};
  await invoke('saveHouseholdPlan',scope);assert.deepEqual(actions,[]);
  if(decisionPending){invoke('togglePlan',scope,'option');assert.deepEqual(actions,[]);}
 }
 const actions=[];invoke('togglePlan',{decisionPending:false,citizenNation:{id:'aurelle'},setCompletedPlanIds(){actions.push('selection');}},'option');assert.deepEqual(actions,[]);
});
test('household commitments reject other economies and insufficient capacity before mutation',async()=>{
 const actions=[];const base={decisionPending:false,clerkConfigured:true,citizenSessionStatus:'ready',citizenEpoch:{current:1},availablePlanningItems:[{id:'option',effects:{capacity:-4}}],committedDecision:null,capacity:3,setDecisionError:value=>actions.push(value),setDecisionPending:()=>actions.push('pending')};
 await invoke('commitDecision',{...base,citizenNation:{id:'aurelle'}},{optionId:'option'});assert.deepEqual(actions,[]);
 await invoke('commitDecision',{...base,citizenNation:{id:'kindle'}},{optionId:'option'});assert.deepEqual(actions,['Not enough Work Capacity for this commitment.']);
});

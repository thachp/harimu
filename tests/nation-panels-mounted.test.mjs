// #410: Korund and Aurelle citizens must see their own plan panel (Begin shift, ration or chartered food counter,
// meals and coupons) in the Work, Market and Household scenes, not only in the City "Daily loop".
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { localRuntime } from './helpers/local-runtime.mjs';
import { resolveLocalModule } from './helpers/component-module.mjs';
import { nationPlanPanelNation } from '../lib/nation-panels.ts';
import { firstWeekArcs } from '../lib/first-week.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
// Compile the real panel components for SSR (same approach as aurelle-ui.test.mjs).
async function componentModule(path) {
  let source=(await readFile(path,'utf8')).replace(/import\s+['"][^'"]+\.css['"];?/g,'');
  let output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  for (const match of [...output.matchAll(/from (['"])([^'"]+)\1/g)]) {
    const specifier=match[2];let url;
    if (specifier.endsWith('.css')) url='data:text/javascript,export default {}';
    else if (specifier.startsWith('@/') || specifier.startsWith('.')) {
      const base=specifier.startsWith('@/')?resolve(root,specifier.slice(2)):resolve(dirname(path),specifier);
      const child=await resolveLocalModule(base);
      assert.ok(child,`Resolve actual component dependency ${specifier}`);
      url=await componentModule(child);
    } else url=import.meta.resolve(specifier);
    output=output.replace(match[0],`from ${JSON.stringify(url)}`);
  }
  return `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
}
const {KorundPlanPanel}=await import(await componentModule(resolve(root,'app/korund-plan-panel.tsx')));
const {AurellePlanPanel}=await import(await componentModule(resolve(root,'app/aurelle-plan-panel.tsx')));
const noop=()=>{};
const baseProps={capacity:18,pending:false,uncertain:false,localDemo:false,error:null,onCommand:noop,onRetry:noop,onRefresh:noop,onNavigate:noop};
const panels={korund:[KorundPlanPanel,'korundPlan'],aurelle:[AurellePlanPanel,'aurellePlan']};
const render=(nation,plan,scene)=>renderToStaticMarkup(React.createElement(panels[nation][0],{...baseProps,plan,scene}));
// What each scene must offer a brand-new citizen of that nation.
const expected={
  korund:{workplace:[/Begin assigned shift/],market:[/Redeem this week’s food coupons/,/Join ration queue/],household:[/Prepare ration meal/,/ration coupons/i]},
  aurelle:{workplace:[/Begin chartered service/],market:[/Buy 1 food/,/Buy 2 food/],household:[/Prepare meal/]},
};

test('a freshly enrolled Korund or Aurelle citizen can start a shift and the Work, Market and Household scenes render the nation panel',async t=>{
  const r=await localRuntime();t.after(()=>r.close());await r.call('world',null);
  for(const nation of ['korund','aurelle']){
    const user=`fresh-${nation}`;
    const enrolled=await r.call('citizen',user,{action:'enroll',nationId:nation,expectedNationId:null});
    assert.equal(enrolled.status,200,JSON.stringify(enrolled.data));
    const citizen=await r.call('citizen',user);
    const plan=citizen.data[panels[nation][1]];
    assert.equal(plan.available,true);
    // The server side already works: the missing piece was only the UI mount.
    const started=await r.call('citizen',user,{action:`${nation}-start-work`,requestId:randomUUID()});
    assert.equal(started.status,200,JSON.stringify(started.data));
    const fresh=(await r.call('citizen',`${user}-b`,{action:'enroll',nationId:nation,expectedNationId:null})).status===200
      ? (await r.call('citizen',`${user}-b`)).data[panels[nation][1]] : null;
    assert.ok(fresh,'second fresh citizen enrolls');
    for(const scene of ['workplace','market','household']){
      assert.equal(nationPlanPanelNation(nation,scene),nation);
      const html=render(nation,fresh,scene);
      for(const pattern of expected[nation][scene]) assert.match(html,pattern,`${nation} ${scene} shows ${pattern}`);
    }
  }
});

test('only Korund and Aurelle mount a nation plan panel, and only in Work, Market and Household; Kindle keeps its own scenes',()=>{
  for(const scene of ['workplace','market','household']){
    assert.equal(nationPlanPanelNation('kindle',scene),null);
    assert.equal(nationPlanPanelNation('hoarvale',scene),null);
    assert.equal(nationPlanPanelNation(null,scene),null);
  }
  for(const nation of ['korund','aurelle']) for(const scene of ['world','country','square','government','nation']) assert.equal(nationPlanPanelNation(nation,scene),null);
});

test('page.tsx mounts the nation plan panel inside the citizen scene and keeps Kindle’s Work and Market blocks',async()=>{
  const source=await readFile(resolve(root,'app/page.tsx'),'utf8');
  const ast=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const initializer=name=>{let found;(function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(ast)===name)found=node.initializer;ts.forEachChild(node,visit);})(ast);assert.ok(found,`${name} declared`);return found.getText(ast);};
  const scene=initializer('citizenScene'),loop=initializer('dailyLoop');
  assert.match(scene,/nationPlanPanelNation\(citizenNation\.id,\s*viewMode\)\s*&&\s*dailyLoop/,'citizenScene mounts the daily loop (nation panel) for Work, Market and Household');
  assert.match(loop,/aurellePanel/);assert.match(loop,/korundPanel/);
  assert.match(initializer('korundPanel'),/scene=\{viewMode\}/);assert.match(initializer('aurellePanel'),/scene=\{viewMode\}/);
  assert.match(scene,/<WorkShiftBoard/);assert.match(scene,/<CitizenMarket showMeal=\{false\}/);
});

test('every Korund and Aurelle first-week goal that points at Work, Market or Household lands on a scene with the nation panel',()=>{
  for(const nation of ['korund','aurelle']){
    const arc=firstWeekArcs.find(entry=>entry.nationId===nation);
    for(const goal of arc.days.flatMap(day=>day.goals).filter(goal=>['workplace','market','household'].includes(goal.screen)))
      assert.equal(nationPlanPanelNation(nation,goal.screen),nation,`${goal.id} → ${goal.screen}`);
  }
});

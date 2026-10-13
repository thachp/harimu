import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const root=fileURLToPath(new URL('../',import.meta.url));
const viewportStub=`data:text/javascript;base64,${Buffer.from(`import React from ${JSON.stringify(import.meta.resolve('react'))};export default function Viewport(props){return React.createElement('div',{'data-rendered-nation':props.nationId,'data-rendered-mode':props.mode});}`).toString('base64')}`;
// Compile actual React components for SSR. Only WebGL is substituted: it cannot
// initialize on a server, and its received nation/mode remain observable here.
async function componentModule(path) {
  let source=(await readFile(path,'utf8')).replace(/import\s+['"][^'"]+\.css['"];?/g,'');
  let output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  for (const match of [...output.matchAll(/from (['"])([^'"]+)\1/g)]) {
    const specifier=match[2];let url;
    if (specifier==='./game-viewport') url=viewportStub;
    else if (specifier.startsWith('@/') || specifier.startsWith('.')) {
      const base=specifier.startsWith('@/')?resolve(root,specifier.slice(2)):resolve(dirname(path),specifier);
      let child;
      for (const extension of ['.ts','.tsx']) {try{await readFile(base+extension);child=base+extension;break;}catch{/* Try the other source extension. */}}
      assert.ok(child,`Resolve actual component dependency ${specifier}`);
      url=await componentModule(child);
    } else url=import.meta.resolve(specifier);
    output=output.replace(match[0],`from ${JSON.stringify(url)}`);
  }
  return `data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;
}
const {AurellePlanPanel}=await import(await componentModule(resolve(root,'app/aurelle-plan-panel.tsx')));
const plan={available:true,charter:{id:'estate',name:'Highspire charter',active:true},walletMinor:800,foodQuantity:2,favor:2,publicFoodRemaining:40,publicFundMinor:100000,mealReadyAt:null,shifts:[]};
const props={plan,scene:'market',capacity:14,pending:false,uncertain:false,localDemo:false,error:null,onCommand:()=>{},onRetry:()=>{},onRefresh:()=>{},onNavigate:()=>{}};
const render=changes=>renderToStaticMarkup(React.createElement(AurellePlanPanel,{...props,...changes}));
test('Aurelle market offers only bounded Crown food purchases, with no duplicate nation selector or player market',()=>{
 const html=render({}); assert.match(html,/Buy 1 food · 1.50 CRN/);assert.match(html,/Buy 2 food · 3.00 CRN/);
 assert.ok(!html.includes('<select'));assert.ok(!html.includes('Spark'));assert.ok(!html.includes('Sell'));
 assert.match(html,/Favor is social standing, not currency/);assert.match(html,/decay, spending, ranks and estates are planned/);
});
test('Aurelle action affordances refuse unfunded, inactive, uncertain and foreign-shift states',()=>{
 for(const changed of [{plan:{...plan,walletMinor:0}},{plan:{...plan,publicFoodRemaining:0}},{plan:{...plan,charter:{...plan.charter,active:false}}},{uncertain:true},{pending:true}]) {
  const html=render(changed);assert.match(html,/<button[^>]*disabled=""[^>]*>Buy 1 food/);assert.match(html,/<button[^>]*disabled=""[^>]*>Buy 2 food/);
 }
 for(const changed of [{otherShiftActive:true},{capacity:3},{plan:{...plan,publicFundMinor:799}}]) assert.match(render({scene:'workplace',...changed}),/<button[^>]*disabled=""[^>]*>Begin chartered service/);
 assert.equal((render({scene:'square'}).match(/<button/g)??[]).length,1);
});

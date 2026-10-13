import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const source=await readFile(new URL('../app/citizen-market.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText;
const exports={};
new Function('exports','require',compiled)(exports,name=>name==='./game-timer'?{GameTimer:()=>null}:name==='react'?{useState:initial=>[initial,()=>{}],useEffect:()=>{}}:require(name));
const flatten=node=>[node,...[node?.props?.children].flat(Infinity).filter(Boolean).flatMap(child=>typeof child==='object'?flatten(child):[child])];
const props={market:{available:true,quotes:[],mealFood:2,mealCapacity:4,mealIntervalSeconds:86400},economy:{inventory:[{item:'food',quantity:2}]},capacity:18,showTrading:false,onMeal(){},onTrade(){},onRetry(){}};
test('in-flight meal never claims connection interruption or offers retry',()=>{
  const nodes=flatten(exports.CitizenMarket({...props,busy:true,uncertain:true,pendingAction:'household-meal'}));
  assert.equal(nodes.some(node=>node?.props?.role==='alert'),false);
  assert.equal(nodes.some(node=>node?.type==='button'&&String(node.props.children).startsWith('Retry')),false);
  assert.equal(nodes.find(node=>node?.type==='button').props.disabled,true);
});
test('actual uncertain meal offers meal-specific recovery and disables a second meal',()=>{
  let retries=0;
  const nodes=flatten(exports.CitizenMarket({...props,busy:false,uncertain:true,pendingAction:'household-meal',onRetry(){retries++;}}));
  assert.ok(nodes.includes('Connection interrupted. Confirm the previous household meal before preparing another.'));
  nodes.find(node=>node?.type==='button'&&node.props.children==='Retry household meal').props.onClick();
  assert.equal(retries,1);
  assert.equal(nodes.filter(node=>node?.type==='button').at(-1).props.disabled,true);
});
test('uncertain merchant trade retains transaction recovery language',()=>{
  const nodes=flatten(exports.CitizenMarket({...props,busy:false,uncertain:true,pendingAction:'market-trade'}));
  assert.ok(nodes.includes('Connection interrupted. Confirm the previous transaction before starting another.'));
});

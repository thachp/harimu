import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const root=fileURLToPath(new URL('../',import.meta.url));
const viewportStub=`data:text/javascript;base64,${Buffer.from(`import React from ${JSON.stringify(import.meta.resolve('react'))};export default function Viewport(props){return React.createElement('div',{'data-rendered-nation':props.nationId,'data-rendered-mode':props.mode,'data-selected-nation':props.selectedNationId,'data-tour-nation':props.cameraTourNationId});}`).toString('base64')}`;
// Compile actual React components for SSR. Only WebGL is substituted: it cannot
// initialize on a server, and its received nation/mode remain observable here.
async function componentModule(path) {
  let source=(await readFile(path,'utf8')).replace(/import\s+['"][^'"]+\.css['"];?/g,'');
  let output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  for (const match of [...output.matchAll(/from (['"])([^'"]+)\1/g)]) {
    const specifier=match[2];let url;
    if (specifier==='./game-viewport') url=viewportStub;
    else if (specifier.endsWith('.css')) url='data:text/javascript,export default new Proxy({}, {get:(_,key)=>String(key)})';
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
const {NationInstitutions}=await import(await componentModule(resolve(root,'app/nation-institutions.tsx')));
const {GameShell}=await import(await componentModule(resolve(root,'app/game-shell.tsx')));
const nations=Array.from({length:10},(_,index)=>({id:['kindle','korund','aurelle'][index]??`nation-${index}`,
  name:`Nation ${index} with a deliberately lengthy name`,shortName:`N${index}`,capital:`Capital ${index}`,
  government:`Government ${index}`,economy:`Economy ${index}`,currency:`Currency ${index}`,religion:`Faith stance ${index}`,
  population:'Seeded 1m',treasury:'Seeded 100m',stability:70,motto:`Motto ${index}`,tradeStatus:'Illustrative corridor'}));
const noAction=()=>{throw new Error('Inspection must not invoke a citizen command during rendering.');};
const jobs=[{id:'harvest',name:'Harvest fixture',detail:'Recorded contribution',cost:4,nationId:'kindle'}];
const props={capacity:18,workOrders:jobs,workPending:false,onWorldView:noAction,
  onHousehold:noAction,onWorkplace:noAction,onCommitWork:noAction};

test('shortlist stays in the existing strip and tour camera focus preserves the inspected nation',()=>{
  const html=renderToStaticMarkup(React.createElement(GameShell,{view:'world',nation:nations[0],nations,capacity:18,localDemo:false,panel:null,onNavigate:noAction,onSelectNation:noAction,cameraTourNationId:'korund',shortlistIds:['kindle','korund','aurelle'],contextItems:nations.map(n=>({id:n.id,label:n.name,detail:n.capital,selected:n.id==='kindle',onSelect:noAction}))}));
  assert.match(html,/data-selected-nation="kindle"/);
  assert.match(html,/data-tour-nation="korund"/);
  assert.match(html,/Shortlist · /);
  assert.equal((html.match(/>Suggested<\/small>/g)??[]).length,3);
});

test('compact institutions renders every inspected nation without a duplicate picker and with coherent headings',()=>{
  for (const nation of nations) {
    const html=renderToStaticMarkup(React.createElement(NationInstitutions,{...props,nation,citizenNation:nations[1]}));
    assert.ok(!html.includes('<select'));assert.ok(!html.includes('<option'));
    assert.ok(html.includes(`aria-label="${nation.name} institutions"`));
    assert.ok(!html.includes('<h2>Institutions</h2>'));assert.ok(html.includes(`<h3>${nation.capital}</h3>`));
    assert.ok(html.includes(nation.government));assert.ok(html.includes(nation.economy));assert.ok(html.includes(nation.religion));
    assert.match(html,/role="group" aria-label="Institution systems"/);
    assert.equal((html.match(/aria-pressed="true"/g)??[]).length,1);
    assert.match(html,/Illustrative starting figures, not measured live conditions/);
    assert.match(html,/no live AI model (?:is )?connected/);
    assert.ok(!html.includes('<main'));assert.ok(!html.includes('<canvas'));assert.ok(!html.includes('Day 42'));
  }
});

test('foreign nation inspection cannot expose paid shift commands; own shifts retain capacity and pending guards',()=>{
  const render=(citizenNation,capacity=18,workPending=false)=>renderToStaticMarkup(React.createElement(NationInstitutions,
    {...props,nation:nations[0],citizenNation,capacity,workPending}));
  const foreign=render(nations[1]);assert.ok(!foreign.includes('Start shift'));assert.match(foreign,/Your citizenship remains N1/);
  assert.match(render(nations[0]),/Start shift/);
  for (const html of [render(nations[0],3),render(nations[0],18,true)]) assert.match(html,/<button type="button" disabled=""[^>]*>Start shift/);
});

test('shell inspection and terrain use selected nation while resources preserve citizen nation and currency',()=>{
  for (const view of ['world','nation']) {
    const html=renderToStaticMarkup(React.createElement(GameShell,{view,nation:nations[0],citizenNation:nations[1],nations,
      capacity:14,currencyCode:'LN',walletMinor:800,inventory:{food:2,materials:0,knowledge:0},localDemo:false,
      panel:React.createElement('p',null,'Inspected fixture'),onNavigate:noAction,onSelectNation:noAction}));
    assert.ok(html.includes(`nation-${nations[0].id}`));assert.ok(html.includes(nations[1].name));
    assert.ok(html.includes(`${nations[0].name} / NATION INSPECTION`));
    assert.match(html,/>LN<\/span>/);assert.match(html,/Your citizen/);
    assert.ok(html.includes(`data-rendered-nation="${view==='world'?'atlas':nations[0].id}"`));
    if(view==='nation') assert.ok(html.includes(nations[0].capital));
    assert.ok(html.includes('Open State store'));assert.ok(html.includes('Open Assignment'));
  }
});
test('the world strip has no nation filter or sort rows: all ten nations show in default order, with no filter copy',()=>{
  const html=renderToStaticMarkup(React.createElement(GameShell,{view:'world',nation:nations[0],nations,capacity:18,localDemo:false,panel:null,onNavigate:noAction,onSelectNation:noAction,contextItems:nations.map(n=>({id:n.id,label:n.name,detail:n.capital,selected:n.id==='kindle',onSelect:noAction}))}));
  for(const gone of ['All nations','Democracies','Party states','Crown &amp; Canon','Power blocs','Default order','Filter nations by power','Sort nation strip'])assert.ok(!html.includes(gone),`${gone} should be gone`);
  assert.doesNotMatch(html,/Shortlist · /,'no shortlist, no toggle row');
  const order=[...html.matchAll(/<strong>([^<]+?)(?:<small|<\/strong>)/g)].map(m=>m[1]);
  assert.deepEqual(order.slice(-nations.length),nations.map(n=>n.name),'strip cards keep the default (registry) order');
});

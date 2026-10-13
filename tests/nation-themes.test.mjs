import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {nationTheme,nationThemes} from '../lib/nation-themes.ts';
const root=fileURLToPath(new URL('../',import.meta.url));
const cache=new Map();
async function load(path){
 if(cache.has(path))return cache.get(path);
 let output=ts.transpileModule(await readFile(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 for(const match of [...output.matchAll(/^import [^\n]*from (['"])([^'"]+)\1/gm)]){
  const specifier=match[2];let url;
  if(specifier.endsWith('.css'))url='data:text/javascript,export default {}';
  else if(specifier.startsWith('@/')||specifier.startsWith('.')){
   const base=specifier.startsWith('@/')?resolve(root,specifier.slice(2)):resolve(dirname(path),specifier);
   for(const ext of ['.ts','.tsx']){try{await readFile(base+ext);url=await load(base+ext);break;}catch{/* Try source extension. */}}
   assert.ok(url,`Resolve ${specifier}`);
  }else url=import.meta.resolve(specifier);
  output=output.replace(match[0],`${match[0].slice(0,match[0].lastIndexOf('from '))}from ${JSON.stringify(url)}`);
 }
 const url=`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`;cache.set(path,url);return url;
}
const {GovernmentPanel}=await import(await load(resolve(root,'app/government-panel.tsx')));
const {KorundPlanPanel}=await import(await load(resolve(root,'app/korund-plan-panel.tsx')));
const {simulateGovernment}=await import(await load(resolve(root,'lib/government.ts')));
const base={localDemo:false,pending:false,uncertain:false,error:null,capacity:18,onCommand(){},onRetry(){},onRefresh(){},onNavigate(){},onPetition(){}};
const civic=nationId=>renderToStaticMarkup(React.createElement(GovernmentPanel,{...base,nationId,snapshot:simulateGovernment({nationId,availableBudgetMinor:0,foodSecurity:35,petitionCounts:{}}),verification:{countedActionsEligible:false,reason:'Phone verification unavailable.'}}));
const ration=renderToStaticMarkup(React.createElement(KorundPlanPanel,{...base,scene:'market',plan:{available:true,gameWeek:4,couponFoodRemaining:2,couponExpiresAt:'2050-01-01T00:00:00Z',walletMinor:800,foodQuantity:2,publicFoodRemaining:40,shifts:[],assignment:{name:'Food brigade',capacityCost:4,hours:2,wageMinor:800,foodOutput:4}}}));
const luminance=hex=>{const channels=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);return channels[0]*0.2126+channels[1]*0.7152+channels[2]*0.0722;};
const contrast=(a,b)=>{const values=[luminance(a),luminance(b)].sort((a,b)=>b-a);return(values[0]+0.05)/(values[1]+0.05);};
test('three civic themes have text/motif distinction and accessible foreground/accent contrast',()=>{
 assert.equal(new Set(Object.values(nationThemes).map(theme=>theme.symbol)).size,3);
 for(const theme of Object.values(nationThemes)){assert.ok(contrast(theme.ink,theme.paper)>=4.5);assert.ok(contrast(theme.accent,theme.paper)>=3);}
 assert.equal(nationTheme('foreign'),null);assert.equal(nationTheme('__proto__'),null);
});
test('government themes follow authoritative snapshot nation rather than inspected nation',()=>{
 for(const nationId of ['kindle','korund','aurelle']){
  const html=renderToStaticMarkup(React.createElement(GovernmentPanel,{...base,nationId:'foreign',snapshot:simulateGovernment({nationId,availableBudgetMinor:0,foodSecurity:35,petitionCounts:{}}),verification:{countedActionsEligible:false,reason:'Phone verification unavailable.'}}));
  assert.match(html,new RegExp(`data-nation-theme="${nationId}"`));assert.match(html,new RegExp(nationThemes[nationId].motif));
  assert.doesNotMatch(html,/data-nation-theme="foreign"/);
  assert.equal((html.match(/<button[^>]*disabled/g)||[]).length,3);
  if(nationId==='kindle'){assert.match(html,/There is no ballot to submit/);assert.doesNotMatch(html,/type="radio"|Cast vote/);}
  else assert.doesNotMatch(html,/35\/100|below the 40-point/);
 }
});
test('Korund ration booklet shows actual coupons, clear unknown queue and no merchant prices',()=>{
 assert.match(ration,/data-nation-theme="korund"/);assert.match(ration,/Game week 4/);assert.match(ration,/2 food coupons/);assert.match(ration,/Queue status/);assert.match(ration,/Not recorded in this preview/);
 assert.doesNotMatch(ration,/Buy |Sell |SPK|CRN|23 people|price per|1\.50/);
});
if(process.env.HARIMU_THEME_FIXTURE){
 const css=(await Promise.all(['app/globals.css','app/game-shell.css'].map(file=>readFile(resolve(root,file),'utf8')))).join('\n');
 const contents=[civic('kindle'),ration,civic('aurelle')];
 await writeFile(process.env.HARIMU_THEME_FIXTURE,`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Harimu isolated theme fixtures</title><style>${css}\nbody{background:#0b1c24;padding:20px;margin:0;color:#dce7e8}h1{font-size:22px}.fixture-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;align-items:start}.fixture-grid>*{min-width:0}.fixture-grid>.game-inspector-body{padding:0;overflow:visible}@media(max-width:760px){body{padding:12px}.fixture-grid{grid-template-columns:minmax(0,1fr)}}</style><h1>Isolated component fixtures</h1><p>Fixture records only. No authentication, network gameplay actions or live citizen data.</p><main class="fixture-grid">${contents.map(content=>`<div class="game-inspector-body">${content}</div>`).join('')}</main></html>`);
}

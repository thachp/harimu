import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const source = await readFile(new URL('../app/game-shell.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
const exports = {};
new Function('exports','require',compiled)(exports,name=>name==='react'?{useEffect(){},useState(initial){return [initial,()=>{}];}}:name==='@phosphor-icons/react'?new Proxy({},{get:(_,key)=>String(key)}):name.endsWith('.css')?{}:name==='./game-viewport'?{default:()=>null}:require(name));
const props={view:'square',nation:{id:'kindle',name:'Kindle'},nations:[],capacity:18,localDemo:false,panel:null,onNavigate(){}};
function nodes(node){if(!node || typeof node!=='object')return [node]; if(typeof node.type==='function' && node.type.name==='HudHelp')return nodes(node.type(node.props));return [node,...[node.props?.children].flat(Infinity).flatMap(nodes)];}
const render=extra=>nodes(exports.GameShell({...props,...extra}));
const text=tree=>tree.filter(n=>typeof n==='string').join(' ');
test('unsigned and pre-citizenship views expose no fake citizen resources or real-time clock',()=>{const tree=render();assert.match(text(tree),/Resources unlock after citizenship/);assert.match(text(tree),/Nation preview/);assert.match(text(tree),/World preview/);assert.doesNotMatch(text(tree),/Citizen realm|REAL TIME|—/);assert.ok(!tree.includes(18));});
test('citizen resource help is keyboard native and screen reader descriptive, with explicit snapshot loading',()=>{const tree=render({citizenNation:props.nation});const summaries=tree.filter(n=>n?.type==='summary');assert.equal(summaries.length,6);for(const summary of summaries){const description=tree.find(n=>n?.props?.id===summary.props['aria-describedby']);assert.ok(description);assert.ok(text(nodes(description)).length>40);}assert.match(text(tree),/Loading world/);assert.match(text(tree),/real-time deadline/);assert.match(text(tree),/Loading/);});
test('world snapshot uses compressed day and visits while Civic is active for nation view',()=>{const tree=render({view:'nation',worldClock:{gameDay:2,latestTick:1,pendingTicks:0}});assert.match(text(tree),/Day 2 · 12×/);assert.match(text(tree),/TICK 1 · ON VISITS/);assert.equal(tree.find(n=>n?.type==='button'&&n.props['aria-label']==='Open Civic').props['aria-current'],'page');assert.equal(tree.find(n=>n?.type==='a'&&n.props.className==='game-glossary').props.href,'https://docs.harimu.com/appendices/glossary/');});

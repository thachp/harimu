import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {test} from 'node:test';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const source=await readFile(new URL('../app/work-shift-board.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText;
function render(now){
 const exports={},visits=[],claims=[];
 new Function('exports','require',compiled)(exports,name=>name==='@/lib/income-tax'?require('../lib/income-tax.ts'):name==='@/lib/action-reasons'?require('../lib/action-reasons.ts'):name==='./display-preferences'?{useDisplayTimestamp:()=>require('../lib/display-preferences.ts').displayTimestamp}:name==='./game-timer'?{GameTimer:()=>null}:name==='react'?{useState:()=>[now,()=>{}],useEffect(){}}:require(name));
 const completesAt='2026-10-13T17:19:04.992Z';
 const tree=exports.WorkShiftBoard({shifts:[{id:'shift',orderName:'Harvest',completesAt,claimedAt:null}],pending:false,error:null,localDemo:false,economy:null,onRefresh(){},onClaim:id=>claims.push(id),onNavigate:view=>visits.push(view)});
 const all=node=>[node,...[node?.props?.children].flat(Infinity).filter(Boolean).flatMap(child=>typeof child==='object'?all(child):[child])];
 return {nodes:all(tree),visits,claims,completesAt};
}
test('Work offers collapsed navigation-only waiting choices without repeating daily guidance',()=>{
 const h=render(Date.parse('2026-10-13T16:00:00Z'));
 const details=h.nodes.find(node=>node?.type==='details');assert.ok(details);assert.equal(details.props.open,undefined);
 for(const [label,view] of [['Read Civic decisions','government'],['Visit citizen chat','square'],['Write a private household note','household']]){
  h.nodes.find(node=>node?.type==='button'&&node.props.children===label).props.onClick();assert.equal(h.visits.at(-1),view);
 }
 assert.deepEqual(h.claims,[]);assert.equal(h.nodes.find(node=>node?.type==='time').props.dateTime,h.completesAt);
 assert.ok(h.nodes.find(node=>node?.type==='button'&&node.props.children==='Collect wages and goods').props['aria-disabled']);
 assert.ok(!h.nodes.some(node=>typeof node==='string'&&node.includes('Your daily loop')));
});
test('completed shifts retain collection and omit waiting choices',()=>{
 const h=render(Date.parse('2026-10-13T17:19:04.992Z'));
 assert.equal(h.nodes.find(node=>node?.type==='details'),undefined);
 assert.equal(h.nodes.find(node=>node?.type==='button'&&node.props.children==='Collect wages and goods').props['aria-disabled'],false);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const source = await readFile(new URL('../app/daily-loop.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
function render(now, claimedAt = null, flags = {}) {
  const navigated = []; const mutations = [];
  const exports = {};
  new Function('exports', 'require', compiled)(exports, name => name === './display-preferences' ? {useDisplayTimestamp:()=>require('../lib/display-preferences.ts').displayTimestamp} : name === './game-timer' ? {GameTimer:()=>null} : name === 'react' ? {useState:()=>[now,()=>{}],useEffect() {}} : name === './daily-loop-choice' ? require('../app/daily-loop-choice.ts') : require(name));
  const completesAt = '2026-10-13T17:19:04.992Z';
  const tree = exports.DailyLoop({nationName:'Kindle',supported:true,localDemo:false,view:'market',economy:{inventory:[],walletMinor:0},market:null,
    shifts:[{id:'shift',orderName:'Harvest',startedAt:'2026-10-13T15:19:04.992Z',completesAt,claimedAt}],capacity:18,jobs:[],busy:false,uncertain:false,...flags,
    onNavigate:view=>navigated.push(view),onClaim:id=>mutations.push(id),onStart:()=>mutations.push('start'),onRefresh(){},onBuyFood(){},onMeal(){}});
  const all = node => [node,...[node?.props?.children].flat(Infinity).filter(Boolean).flatMap(child=>typeof child==='object'?all(child):[child])];
  const nodes = all(tree);
  return {nodes,navigated,mutations,button:label=>nodes.find(node=>node?.type==='button'&&node.props.children===label),completesAt};
}
test('an underway shift offers useful scene visits without issuing financial or civic commands',()=>{
  const h=render(Date.parse('2026-10-13T16:00:00Z'));
  for (const [label,view] of [['Read Civic decisions','government'],['Visit citizen chat','square'],['Write a private household note','household']]) {
    assert.ok(h.button(label),label);h.button(label).props.onClick();assert.equal(h.navigated.at(-1),view);
  }
  assert.deepEqual(h.mutations,[]);
  assert.equal(h.nodes.find(n=>n?.type==='time').props.dateTime,h.completesAt);
  assert.ok(h.nodes.some(n=>typeof n==='string'&&n.includes('2 real hours · 24 game hours')));
  assert.ok(h.nodes.some(n=>typeof n==='string'&&n.includes('close the game')));
});
test('wait choices disappear at completion and never replace collection',()=>{
  const h=render(Date.parse('2026-10-13T17:19:04.992Z'));
  assert.equal(h.button('Read Civic decisions'),undefined);
  assert.ok(h.nodes.includes('Your wages and goods are ready'));
  assert.deepEqual(h.mutations,[]);
});

test('daily actions explain saving or confirmation and reject direct activation',()=>{
 for(const flags of [{busy:true},{uncertain:true}]){
  const h=render(Date.parse('2026-10-13T17:19:04.992Z'),null,flags);
  const button=h.button(flags.busy ? 'Saving action…' : 'Open work board');assert.equal(button.props.disabled,true);assert.equal(button.props['aria-describedby'],'daily-loop-action-reason');
  button.props.onClick();assert.deepEqual(h.navigated,[]);assert.deepEqual(h.mutations,[]);
  assert.ok(h.nodes.some(node=>node?.props?.id==='daily-loop-action-reason'));
 }
});

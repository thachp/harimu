import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {test} from 'node:test';
import ts from 'typescript';
import * as preferences from '../lib/onboarding-preferences.ts';
const require=createRequire(import.meta.url);
const source=await readFile(new URL('../app/first-visit-guide.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText;
function harness(initialStage) {
  const slots=[]; let cursor=0, dismissed=0, tried=0, suggested=[];
  const exports={};
  new Function('exports','require',compiled)(exports,name=>name==='react'?{useState(initial){const index=cursor++; if (!(index in slots)) slots[index]=initial; return [slots[index],value=>{slots[index]=typeof value==='function'?value(slots[index]):value;}];}}:name.includes('onboarding-preferences')?preferences:name.endsWith('.css')?{default:{}}:require(name));
  const render=()=>{cursor=0;return exports.FirstVisitGuide({initialStage,onShortlist(ids){suggested=ids;},onDismiss(){dismissed++;},onTryGuest(){tried++;}});};
  const all=node=>[node,...[node?.props?.children].flat(Infinity).flatMap(child=>child&&typeof child==='object'?all(child):[child])];
  const button=(tree,label)=>all(tree).find(node=>node?.type==='button'&&node.props.children===label);
  return {render,all,button,dismissed:()=>dismissed,tried:()=>tried,suggested:()=>suggested};
}
test('optional introduction reaches disposable preview after accurate government disclosure',()=>{
  const h=harness();
  assert.ok(h.all(h.render()).includes('Welcome to Harimu'));
  h.button(h.render(),'About government').props.onClick();
  assert.ok(h.all(h.render()).some(node=>typeof node==='string'&&node.includes('No live AI model is connected')));
  h.button(h.render(),'Optional interests').props.onClick();
  h.button(h.render(),'Suggest three nations').props.onClick();
  assert.equal(h.suggested().length,3);
  assert.ok(h.all(h.render()).some(node=>typeof node==='string'&&node.includes('nation strip at the bottom')));
  h.button(h.render(),'Try a sample day').props.onClick();
  assert.equal(h.tried(),1);
});
test('every guide stage is immediately skippable and closable without guest actions',()=>{
  for(const stage of ['arrival','government','preferences','explore']) {
    const h=harness(stage),tree=h.render();
    h.button(tree,'Skip guide · explore').props.onClick();
    h.button(tree,'Close').props.onClick();
    assert.equal(h.dismissed(),2);
    assert.equal(h.tried(),0);
  }
});

test('question skip clears suggestions and Back returns to preferences without choosing citizenship',()=>{
 const h=harness('preferences');
 h.button(h.render(),'Suggest three nations').props.onClick();
 assert.equal(h.suggested().length,3);
 h.button(h.render(),'Back').props.onClick();
 h.button(h.render(),'Skip questions').props.onClick();
 assert.deepEqual(h.suggested(),[]);
 assert.equal(h.tried(),0);
 assert.ok(h.all(h.render()).includes('Explore before you choose'));
});

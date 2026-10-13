import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const source = await readFile(new URL('../app/citizenship-dialog.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
function harness(storage = new Map()) {
  const slots = []; let cursor = 0; let effects = [];
  const react = { useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], value => { slots[index] = value; }]; }, useRef() { return { current: null }; }, useEffect(fn) { effects.push(fn); }, useCallback(fn) { return fn; } };
  const exports = {};
  const window = {sessionStorage: {getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}};
  new Function('exports', 'require', 'window', compiled)(exports, name => name === 'react' ? react : name.endsWith('.css') ? {session:'session'} : require(name), window);
  const props = {nation:{id:'kindle',name:'Kindle',government:'Republic',economy:'Market',currency:'SPK',color:'#fff'}, expectedNationId:null, reviewStorageKey:'alice', session:'ready',pending:false,error:null,signInControl:'Sign in',onRetrySession(){},onConfirm(){},onClose(){}};
  const render = () => {cursor=0;effects=[];return exports.CitizenshipDialog(props);};
  const all = node => [node, ...(node?.props?.children ? [node.props.children].flat(Infinity).flatMap(child=>child && typeof child==='object' ? all(child):[child]) : [])];
  const button = (tree,label) => all(tree).find(node=>node?.type==='button'&&node.props.children===label);
  return {props,render,button,all,storage,restore:async()=>{effects[0]?.();await Promise.resolve();}};
}
test('nation review precedes oath and consent is fresh after back or changing nation',()=>{
  const h=harness();let tree=h.render();
  assert.ok(h.all(tree).includes('Step 1 of 2 · Review your nation'));
  assert.equal(h.button(tree,'Confirm citizenship'),undefined);
  h.button(tree,'Continue to oath').props.onClick();tree=h.render();
  assert.ok(h.all(tree).includes('Step 2 of 2 · Oath of citizenship'));
  assert.equal(h.button(tree,'Confirm citizenship').props.disabled,true);
  h.all(tree).find(node=>node?.type==='input').props.onChange({target:{checked:true}});
  assert.equal(h.button(h.render(),'Confirm citizenship').props.disabled,false);
  h.button(h.render(),'Back to review').props.onClick();
  h.button(h.render(),'Continue to oath').props.onClick();
  assert.equal(h.button(h.render(),'Confirm citizenship').props.disabled,true);
  h.props.nation={...h.props.nation,id:'korund',name:'Korund'};
  assert.ok(h.all(h.render()).includes('Step 1 of 2 · Review your nation'));
});
test('exact account review survives interruption but acceptance does not and cancellation clears it',async()=>{
  const storage=new Map();const h=harness(storage);
  h.button(h.render(),'Continue to oath').props.onClick();
  const resumed=harness(storage);resumed.render();await resumed.restore();
  assert.ok(resumed.all(resumed.render()).includes('Step 2 of 2 · Oath of citizenship'));
  assert.equal(resumed.button(resumed.render(),'Confirm citizenship').props.disabled,true);
  const foreign=harness(storage);foreign.props.reviewStorageKey='bob';foreign.render();await foreign.restore();
  assert.ok(foreign.all(foreign.render()).includes('Step 1 of 2 · Review your nation'));
  let closed=false;resumed.props.onClose=()=>{closed=true;};
  resumed.button(resumed.render(),'Keep exploring').props.onClick();
  assert.equal(closed,true);assert.equal(storage.size,0);
});
test('anonymous oath keeps sign-in control and error state offers retry without submitting',()=>{
  const h=harness();h.props.session='anonymous';h.button(h.render(),'Continue to oath').props.onClick();
  assert.ok(h.all(h.render()).includes('Sign in'));assert.equal(h.button(h.render(),'Confirm citizenship'),undefined);
  let retry=false;h.props.session='error';h.props.onRetrySession=()=>{retry=true;};
  h.button(h.render(),'Retry loading citizen').props.onClick();assert.equal(retry,true);
});

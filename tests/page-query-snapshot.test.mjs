import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { sceneFromSearch } from '../lib/scene-navigation.ts';
const require = createRequire(import.meta.url);
const source = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
function requestSnapshot(search) {
  let snapshot, selected, afterSnapshot=false;
  const stop = new Error('Captured initial query state');
  const react = {
    useRef:()=>({current:null}), useEffect(){}, useCallback:fn=>fn,
    useState(initial) { const value=typeof initial==='function'?initial():initial; if(afterSnapshot){selected=value;throw stop;} return[value,()=>{}]; },
    useSyncExternalStore(subscribe,readClient,readServer) {snapshot=readServer();afterSnapshot=true;return snapshot;},
  };
  const exports={};
  new Function('exports','require',compiled)(exports,name=>name==='react'?react:name==='next/navigation'?{useSearchParams:()=>new URLSearchParams(search)}:name==='@/lib/scene-navigation'?require('../lib/scene-navigation.ts'):name==='react/jsx-runtime'?require(name):{});
  assert.throws(()=>exports.default(),error=>error===stop);
  return {snapshot,selected,scene:sceneFromSearch(snapshot)};
}
test('actual page initial server query snapshot preserves deep-linked World/nation and initial exploration',()=>{
  assert.deepEqual(requestSnapshot('?view=world&nation=korund'),{snapshot:'?view=world&nation=korund',selected:'korund',scene:'world'});
  assert.deepEqual(requestSnapshot('?view=nation&nation=fulmara'),{snapshot:'?view=nation&nation=fulmara',selected:'fulmara',scene:'nation'});
});
test('actual page default and invalid query retain safe scene and nation fallbacks',()=>{
  assert.deepEqual(requestSnapshot(''),{snapshot:'',selected:'kindle',scene:'square'});
  assert.deepEqual(requestSnapshot('?view=missing&nation=missing'),{snapshot:'?view=missing&nation=missing',selected:'kindle',scene:'square'});
});

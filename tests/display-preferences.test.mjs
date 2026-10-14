import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {displayPreferences,displayTimestamp,graphicsOptions,defaultDisplayPreferences} from '../lib/display-preferences.ts';
const require=createRequire(import.meta.url);
const compiled=ts.transpileModule(await readFile(new URL('../app/display-preferences.tsx',import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText;
function harness(saved){
 const slots=[],effects=[],tasks=[],listeners=new Map();let cursor=0,blocked=false,stored=saved;
 const react={createContext:()=>({Provider:'provider'}),useContext(){},useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],value=>{slots[i]=value;}];},useEffect(fn){effects.push(fn);}};
 const storage={getItem(){if(blocked)throw Error('Storage blocked');return stored;},setItem(key,value){assert.equal(key,'harimu:display-preferences:v1');if(blocked)throw Error('Storage blocked');stored=value;}};
 const window={addEventListener:(key,fn)=>listeners.set(key,fn),removeEventListener:key=>listeners.delete(key)};
 const exports={};new Function('exports','require','localStorage','window','queueMicrotask',compiled)(exports,name=>name==='react'?react:name==='../lib/display-preferences'?require('../lib/display-preferences.ts'):require(name),storage,window,fn=>tasks.push(fn));
 const render=()=>{cursor=0;return exports.DisplayPreferencesProvider({children:'fixture'}).props.value;};
 render();const cleanup=effects[0]();
 return{render,flush:()=>tasks.splice(0).forEach(fn=>fn()),saved:()=>stored,block:()=>{blocked=true;},external(value){stored=value;listeners.get('storage')({key:'harimu:display-preferences:v1'});},cleanup,listeners};
}
test('preferences allow only supported values and never retain arbitrary stored fields',()=>{
 assert.deepEqual(displayPreferences({graphics:'low',timeFormat:'12',citizen:'private'}),{graphics:'low',timeFormat:'12',motion:'system',textScale:100});
 for(const input of [null,'low',{graphics:'ultra',timeFormat:'locale'}])assert.deepEqual(displayPreferences(input),{graphics:'standard',timeFormat:'24',motion:'system',textScale:100});
});
test('low graphics reduces resolution and disables expensive features; standard clamps device density',()=>{
 assert.deepEqual(graphicsOptions('low',3),{pixelRatio:1,shadows:false,antialias:false});
 assert.equal(graphicsOptions('standard',3).pixelRatio,2);
 for(const ratio of [NaN,Infinity,0,-1])assert.equal(graphicsOptions('standard',ratio).pixelRatio,1);
});
test('12/24-hour formatting changes presentation, consistently uses UTC and rejects invalid dates',()=>{
 const value='2026-01-01T17:30:00Z';assert.match(displayTimestamp(value,'24'),/17:30:00 UTC/);assert.match(displayTimestamp(value,'12'),/05:30:00 pm UTC/);
 assert.match(displayTimestamp('2026-01-01T00:00:00Z','24'),/00:00:00 UTC/);assert.equal(displayTimestamp('invalid'),'Time unavailable');
});
test('provider hydrates deterministically, persists only display values and follows another tab',()=>{
 const h=harness(JSON.stringify({graphics:'low',timeFormat:'12',token:'discard'}));assert.equal(h.render().preferences.graphics,'standard');h.flush();assert.equal(h.render().preferences.graphics,'low');
 h.render().save({graphics:'standard',timeFormat:'12',motion:'system',textScale:100});assert.deepEqual(JSON.parse(h.saved()),{graphics:'standard',timeFormat:'12',motion:'system',textScale:100});
 h.external(JSON.stringify({graphics:'low',timeFormat:'24',motion:'system'}));assert.deepEqual(h.render().preferences,{graphics:'low',timeFormat:'24',motion:'system',textScale:100});h.cleanup();assert.equal(h.listeners.size,0);
});
test('unavailable browser storage still permits settings for this visit and reports persistence limitation',()=>{
 const h=harness(null);h.block();h.flush();assert.equal(h.render().storageAvailable,false);h.render().save({graphics:'low',timeFormat:'12',motion:'system',textScale:100});assert.equal(h.render().preferences.graphics,'low');assert.equal(h.render().storageAvailable,false);h.cleanup();
 const invalid=harness('{bad json');invalid.flush();assert.equal(invalid.render().storageAvailable,false);invalid.cleanup();
});

test('explicit reduced motion is retained without allowing unsupported motion modes',()=>{
 assert.equal(displayPreferences({motion:'reduce'}).motion,'reduce');
 for(const motion of ['full','none',null,123])assert.equal(displayPreferences({motion}).motion,'system');
});

test('text size (#80) accepts only 100/125/150 and defaults to 100',()=>{
 for(const textScale of [100,125,150])assert.equal(displayPreferences({textScale}).textScale,textScale);
 for(const textScale of [0,90,200,'150',null,undefined,Infinity])assert.equal(displayPreferences({textScale}).textScale,100);
 assert.equal(defaultDisplayPreferences.textScale,100);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { globeTourStops, globeTourNext, globeTourStepMs } from '../lib/globe-tour.ts';
const require=createRequire(import.meta.url);
const compiled=ts.transpileModule(await readFile(new URL('../app/globe-tour.tsx',import.meta.url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
function harness(reduced=false,motion='system') {
 const slots=[],effects=[],pending=[],timers=new Map(),listeners=new Set(),focus=[];let cursor=0,closed=0,nextTimer=0;
 const media={matches:reduced,addEventListener:(type,fn)=>listeners.add(fn),removeEventListener:(type,fn)=>listeners.delete(fn)};
 const react={useState(initial){const i=cursor++;if(!(i in slots))slots[i]=initial;return[slots[i],value=>{slots[i]=value}];},useEffect(fn,deps){const i=cursor++;const old=effects[i];if(!old||deps.some((d,k)=>d!==old.deps[k]))pending.push(()=>{old?.cleanup?.();effects[i]={deps,cleanup:fn()};});}};
 const window={matchMedia:()=>media,setTimeout(fn,ms){assert.equal(ms,globeTourStepMs);const id=++nextTimer;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)};
 const exports={};new Function('exports','require','window','queueMicrotask',compiled)(exports,name=>name==='react'?react:name==='./display-preferences'?{useDisplayPreferences:()=>({preferences:{motion}})}:name.endsWith('.css')?{tour:'tour'}:name==='../lib/globe-tour'?require('../lib/globe-tour.ts'):require(name),window,fn=>fn());
 const props={onFocus:id=>focus.push(id),onClose:()=>closed++};
 const render=()=>{cursor=0;pending.length=0;const tree=exports.GlobeTour(props);pending.splice(0).forEach(fn=>fn());return tree;};
 const all=node=>[node,...[node?.props?.children].flat(Infinity).filter(Boolean).flatMap(n=>typeof n==='object'?all(n):[n])];
 const button=label=>all(render()).find(n=>n?.type==='button'&&n.props.children===label);
 render();render();
 return {render,button,focus,timers,listeners,motion(value){motion=value;render();render();},get closed(){return closed;},tick(){const [id,fn]=[...timers][0]??[];assert.ok(fn);timers.delete(id);fn();render();},preference(value){media.matches=value;listeners.forEach(fn=>fn());render();},unmount(){effects.forEach(e=>e?.cleanup?.());}};
}
test('all ten official nations are visited in order and automatic tour completes after two minutes',()=>{
 assert.equal(globeTourStops.length,10);assert.equal(new Set(globeTourStops.map(s=>s.id)).size,10);assert.equal(globeTourStepMs*10,120000);assert.equal(globeTourNext(9),null);
 const h=harness();for(let i=0;i<10;i++)h.tick();assert.deepEqual(h.focus,[...globeTourStops.map(s=>s.id),null]);assert.equal(h.closed,1);h.unmount();assert.equal(h.timers.size,0);assert.equal(h.listeners.size,0);
});
test('reduced motion stays manual with Back Next Skip and no timer',()=>{
 const h=harness(true);assert.equal(h.timers.size,0);assert.equal(h.button('Back').props.disabled,true);h.button('Next').props.onClick();h.render();assert.equal(h.focus.at(-1),'confluence');h.button('Back').props.onClick();h.render();assert.equal(h.focus.at(-1),'kindle');h.button('Skip tour').props.onClick();assert.equal(h.focus.at(-1),null);assert.equal(h.closed,1);h.unmount();
});
test('pause, changed motion preference, and interruption clear automatic timers',()=>{
 const h=harness();assert.equal(h.timers.size,1);h.button('Pause').props.onClick();h.render();assert.equal(h.timers.size,0);h.button('Play automatically').props.onClick();h.render();assert.equal(h.timers.size,1);h.preference(true);assert.equal(h.timers.size,0);assert.equal(h.button('Play automatically'),undefined);h.unmount();assert.equal(h.listeners.size,0);
 const interrupted=harness();interrupted.button('Stop tour').props.onClick();interrupted.unmount();assert.equal(interrupted.timers.size,0);assert.equal(interrupted.focus.at(-1),null);
});

test('browser reduced-motion choice overrides normal device motion and clears an active tour',()=>{
 const reduced=harness(false,'reduce');assert.equal(reduced.timers.size,0);assert.equal(reduced.button('Play automatically'),undefined);reduced.button('Next').props.onClick();reduced.render();assert.equal(reduced.focus.at(-1),'confluence');reduced.unmount();
 const active=harness();assert.equal(active.timers.size,1);active.motion('reduce');assert.equal(active.timers.size,0);assert.equal(active.button('Play automatically'),undefined);active.unmount();
});

import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {test} from 'node:test';
import {build} from 'esbuild';
import {crestEdge,nationCrest,nationCrestLabel,nationCrests,uiV2CrestEnabled} from '../lib/nation-crests.ts';
import {nationMarks} from '../lib/nation-themes.ts';
import {globeTourStops} from '../lib/globe-tour.ts';
const root=new URL('../',import.meta.url);const read=path=>readFile(new URL(path,root),'utf8');
const luminance=hex=>{const c=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4);return c[0]*0.2126+c[1]*0.7152+c[2]*0.0722;};
const contrast=(a,b)=>{const v=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (v[0]+0.05)/(v[1]+0.05);};
// The documented emblem motifs: harimu-docs production/art-direction.mdx, Iconography.
const documented={kindle:'An open ballot-star in a hexagon',confluence:'Three joined rivers',meridian:'A gear on a meridian line',korund:'A stone keystone',aurelle:'A winged crown',ilmar:'A prism-eye',hoarvale:'A crown over a parliament arc',varkand:'Five bars in a watchtower',veldwood:'A ring of seven leaves',fulmara:"Scales over a ship's prow"};

test('every nation in the world data has a crest with the documented motif, and crests reuse the #79 marks (#392 S1)',()=>{
 const ids=globeTourStops.map(stop=>stop.id);
 assert.equal(ids.length,10);assert.deepEqual(Object.keys(nationCrests).sort(),[...ids].sort());assert.deepEqual(Object.keys(nationCrests).sort(),Object.keys(nationMarks).sort(),'same ten ids as the #79 marks');
 for(const id of ids){const crest=nationCrest(id);assert.ok(crest,id);assert.equal(crest.motif,documented[id],`${id} motif is the documented one`);assert.ok(crest.palette.length>=3,`${id} lists its documented palette`);
  assert.ok(nationCrestLabel(id,nationMarks[id].name).startsWith(`${nationMarks[id].name} crest: `),id);}
 assert.equal(nationCrestLabel('kindle','Kindle Republic'),'Kindle Republic crest: an open ballot-star in a hexagon');
 assert.equal(nationCrest('foreign'),null);assert.equal(nationCrest('__proto__'),null);assert.equal(nationCrestLabel('foreign','X'),null);
});
test('crest colours are readable: motif on field 4.5:1, gold edge on the dark bar, and the ten drawings are all different and inside the viewBox',()=>{
 const seen=new Set();
 for(const [id,crest] of Object.entries(nationCrests)){
  for(const key of ['field','mark','accent'])assert.match(crest[key],/^#[0-9a-f]{6}$/,`${id}.${key}`);
  assert.ok(contrast(crest.mark,crest.field)>=4.5,`${id} motif contrast ${contrast(crest.mark,crest.field).toFixed(2)}`);
  assert.ok(contrast(crestEdge,'#102934')>=3,'gold edge on the inspector header');
  assert.ok(crest.d.length>20&&!seen.has(crest.d),`${id} has its own drawing`);seen.add(crest.d);
  const nums=[...crest.d.replace(/a[-\d.\s]+/g,' ').matchAll(/-?\d+(?:\.\d+)?/g)].map(m=>Number(m[0]));assert.ok(nums.length>=8);
  for(const n of nums)assert.ok(n>=-4&&n<=56,`${id} coordinate ${n} outside the crest box`);
 }
});
test('the crest flag is exactly "true" and ships off in wrangler.jsonc (flag-off pin)',async()=>{
 assert.equal(uiV2CrestEnabled('true'),true);for(const v of [undefined,'false','','1','TRUE'])assert.equal(uiV2CrestEnabled(v),false);
 assert.match(await read('wrangler.jsonc'),/"NEXT_PUBLIC_HARIMU_UI_V2_CREST": "false"/);
});
test('the crest component renders nothing with the flag off, and a named svg with it on (flag-off pin)',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'crest-'));
 const entry=`import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import {NationCrest} from './app/nation-crest.tsx';
  export const off=renderToStaticMarkup(<NationCrest id="kindle"/>), forced=renderToStaticMarkup(<NationCrest id="aurelle" force/>), labelled=renderToStaticMarkup(<NationCrest id="aurelle" force labelled/>), unknown=renderToStaticMarkup(<NationCrest id="foreign" force/>);`;
 const result=await build({stdin:{contents:entry,resolveDir:new URL('../',import.meta.url).pathname,loader:'tsx'},bundle:true,write:false,format:'cjs',platform:'node',jsx:'automatic',logLevel:'silent',define:{'process.env.NEXT_PUBLIC_HARIMU_UI_V2_CREST':'"false"','process.env.NODE_ENV':'"production"'}});
 await writeFile(join(dir,'crest.cjs'),result.outputFiles[0].text);const out=createRequire(import.meta.url)(join(dir,'crest.cjs'));
 assert.equal(out.off,'');assert.equal(out.unknown,'');
 assert.match(out.forced,/data-nation-crest="aurelle"/);assert.match(out.forced,/data-nation-pattern="diagonal"/);assert.match(out.forced,/title="Aurelle crest: a winged crown"/);assert.match(out.forced,/<svg[^>]*aria-hidden="true"/);assert.doesNotMatch(out.forced,/role="img"|aria-label/);assert.match(out.labelled,/<svg[^>]*role="img"[^>]*aria-label="Aurelle crest: a winged crown"/);assert.doesNotMatch(out.labelled,/aria-hidden/);
});
test('the inspector header is the only consumer, every pattern has crest CSS, and the layout stays clipped to the shield',async()=>{
 const shell=await read('app/game-shell.tsx'),css=await read('app/game-shell.css');
 assert.match(shell,/<header className="game-inspector-title">\{identityHold === .none. && !viewedNationHeld && <NationCrest id=\{nation\.id\} size=\{44\} \/>\}/); // not while the identity is loading or the viewed nation is held (#455, #533, #571)
 assert.equal((shell.match(/<NationCrest /g)||[]).length,1);
 for(const mark of Object.values(nationMarks))assert.match(css,new RegExp(`\\.nation-crest\\[data-nation-pattern="${mark.pattern}"\\]`),mark.pattern);
 assert.match(css,/\.nation-crest\{[^}]*clip-path:polygon\(/);
});

test('every esbuild harness that bundles the shell defines the crest flag (a missing define throws "process is not defined" in the browser, #571)',async()=>{
 const{readdir,readFile}=await import('node:fs/promises');
 const dir=new URL('../scripts/',import.meta.url);
 const bundlers=[];
 for(const f of await readdir(dir)){if(!f.endsWith('.mjs'))continue;const src=await readFile(new URL(f,dir),'utf8');if(/from 'esbuild'/.test(src)&&/define:\s*\{/.test(src))bundlers.push([f,src]);}
 assert.ok(bundlers.length>=2,'found the shell bundlers');
 for(const[f,src]of bundlers)assert.match(src,/'process\.env\.NEXT_PUBLIC_HARIMU_UI_V2_CREST'/,`${f} must define NEXT_PUBLIC_HARIMU_UI_V2_CREST`);
});

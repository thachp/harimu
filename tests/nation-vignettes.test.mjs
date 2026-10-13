import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {nationVignettes,nationVignette,vignetteOutcome} from '../lib/nation-vignettes.ts';
test('all ten nations offer distinct deterministic choices with explicit teaching rules',()=>{
 assert.deepEqual(nationVignettes.map(example=>example.id).sort(),['kindle','confluence','meridian','korund','aurelle','ilmar','hoarvale','varkand','veldwood','fulmara'].sort());
 for(const example of nationVignettes){assert.equal(example.choices.length,2);assert.notEqual(example.choices[0].label,example.choices[1].label);for(let choice=0;choice<2;choice++){assert.ok(vignetteOutcome(example.id,choice).endsWith(example.rule));assert.equal(vignetteOutcome(example.id,choice),vignetteOutcome(example.id,choice));}assert.equal(vignetteOutcome(example.id,2),null);assert.ok(example.source.startsWith('https://docs.harimu.com/'));}
 assert.equal(nationVignette('unknown').id,'kindle');
 assert.match(nationVignette('confluence').rule,/approved AI deputies/);assert.match(nationVignette('meridian').rule,/not citizen ballots/);
});
test('teaching component and model cannot invoke persistence or game commands and badge stays outside choice branches',async()=>{
 const sources=await Promise.all(['../app/nation-vignette.tsx','../lib/nation-vignettes.ts'].map(path=>readFile(new URL(path,import.meta.url),'utf8')));
 for(const source of sources)assert.doesNotMatch(source,/\b(fetch|localStorage|sessionStorage|D1|authenticatedUserId)\b|\/api\//);
 assert.ok(sources[0].indexOf('Illustrative sample')<sources[0].indexOf('{choice===null'));
 assert.match(sources[0],/role="status"/);assert.match(sources[0],/Back to sample choices/);assert.match(sources[0],/Reset national sample/);
});

test('actual vignette choices, back, reset and nation changes keep teaching state isolated',async()=>{
 const ts=(await import('typescript')).default;
 const {createRequire}=await import('node:module');const require=createRequire(import.meta.url);
 const source=await readFile(new URL('../app/nation-vignette.tsx',import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
 const slots=[];let cursor=0;
 const react={useState(initial){const index=cursor++;if(!(index in slots))slots[index]=initial;return [slots[index],value=>{slots[index]=value;}];}};
 const exports={};new Function('exports','require',compiled)(exports,name=>name==='react'?react:name==='@/lib/nation-vignettes'?{nationVignette,vignetteOutcome}:name.endsWith('.css')?{}:require(name));
 const flatten=node=>[node,...[node?.props?.children].flat(Infinity).filter(Boolean).flatMap(child=>typeof child==='object'?flatten(child):[child])];
 let nationId='kindle';const render=()=>{cursor=0;return flatten(exports.NationVignette({nationId}));};
 const button=(nodes,label)=>nodes.find(node=>node?.type==='button'&&node.props.children===label);
 const badge='Illustrative sample · no real votes, resources, receipts or world changes';
 let nodes=render();assert.ok(nodes.includes(badge));
 button(nodes,nationVignette('kindle').choices[0].label).props.onClick();nodes=render();
 assert.ok(nodes.includes(vignetteOutcome('kindle',0)));assert.ok(nodes.includes(badge));
 button(nodes,'Back to sample choices').props.onClick();nodes=render();
 assert.ok(button(nodes,nationVignette('kindle').choices[0].label));assert.equal(nodes.some(node=>node?.props?.role==='status'),false);
 button(nodes,nationVignette('kindle').choices[1].label).props.onClick();nodes=render();
 button(nodes,'Reset national sample').props.onClick();nodes=render();assert.ok(button(nodes,nationVignette('kindle').choices[0].label));
 button(nodes,nationVignette('kindle').choices[0].label).props.onClick();nationId='meridian';nodes=render();
 assert.ok(nodes.includes(badge));assert.ok(button(nodes,nationVignette('meridian').choices[0].label));
 assert.equal(nodes.includes(vignetteOutcome('kindle',0)),false);assert.equal(nodes.some(node=>node?.props?.role==='status'),false);
 button(nodes,nationVignette('meridian').choices[1].label).props.onClick();nodes=render();assert.ok(nodes.includes(vignetteOutcome('meridian',1)));assert.ok(nodes.includes(badge));
});

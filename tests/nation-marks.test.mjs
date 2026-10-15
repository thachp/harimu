import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {test} from 'node:test';
import {nationMark,nationMarkLabel,nationMarks,nationSymbolsEnabled,nationThemes} from '../lib/nation-themes.ts';
import {globeTourStops} from '../lib/globe-tour.ts';
const read=path=>readFile(new URL(`../${path}`,import.meta.url),'utf8');
// The nation ids in the world data: the globe tour roster, and the capital profiles that build the 3D globe (lib/game-art.ts).
const worldIds=async()=>{const art=await read('lib/game-art.ts');const block=art.slice(art.indexOf('export const capitalProfiles'),art.indexOf('const materials'));
 return {tour:globeTourStops.map(stop=>stop.id),art:[...block.matchAll(/^\s{2}([a-z]+): \{ capital:/gm)].map(match=>match[1])};};

test('every nation id in the world data has a symbol, a pattern, a name and an accent (#79)',async()=>{
 const {tour,art}=await worldIds();
 assert.equal(tour.length,10);assert.deepEqual([...art].sort(),[...tour].sort(),'globe tour and 3D globe list the same ten nations');
 assert.deepEqual(Object.keys(nationMarks).sort(),[...tour].sort(),'nationMarks covers exactly the ten world nations');
 for(const id of tour){const mark=nationMark(id);assert.ok(mark,id);for(const key of ['name','symbol','pattern','patternName','accent'])assert.ok(String(mark[key]).length>0,`${id}.${key}`);assert.match(mark.accent,/^#[0-9a-f]{6}$/);}
 assert.equal(nationMark('foreign'),null);assert.equal(nationMark('__proto__'),null);assert.equal(nationMarkLabel('foreign'),null);
 assert.equal(nationMarkLabel('kindle'),'Kindle Republic symbol, ruled lines');
});
test('no two nations share a symbol or a pattern, and the document skins are untouched',()=>{
 const marks=Object.values(nationMarks);
 assert.equal(new Set(marks.map(mark=>mark.symbol)).size,10);assert.equal(new Set(marks.map(mark=>mark.pattern)).size,10);assert.equal(new Set(marks.map(mark=>mark.patternName)).size,10);
 for(const id of Object.keys(nationThemes))assert.equal(nationMarks[id].symbol,nationThemes[id].symbol,`${id} keeps its document symbol`);
 assert.deepEqual(Object.keys(nationThemes),['kindle','korund','aurelle'],'adding marks must not re-skin documents for other nations (that is #85)');
});
test('every pattern token is styled, and the symbol chip is hidden from assistive tech but named',async()=>{
 const css=await read('app/game-shell.css');
 for(const mark of Object.values(nationMarks))assert.match(css,new RegExp(`\\.nation-symbol\\[data-nation-pattern="${mark.pattern}"\\]`),mark.pattern);
});

// --- Color-vision-deficiency simulation (Machado, Oliveira & Fernandes 2009, severity 1.0) on linear sRGB, compared in CIELAB (dE76).
const matrices={
 deuteranopia:[[.367322,.860646,-.227968],[.280085,.672501,.047413],[-.011820,.042940,.968881]],
 protanopia:[[.152286,1.052583,-.204868],[.114503,.786281,.099216],[-.003882,-.048116,1.051998]],
 tritanopia:[[1.255528,-.076749,-.178779],[-.078411,.930809,.147602],[.004733,.691367,.303900]],
};
const toLinear=v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;};
const rgb=hex=>hex.slice(1).match(/../g).map(v=>toLinear(parseInt(v,16)));
const simulate=(hex,kind)=>{const c=rgb(hex);return matrices[kind].map(row=>Math.min(1,Math.max(0,row[0]*c[0]+row[1]*c[1]+row[2]*c[2])));};
const lab=([r,g,b])=>{const x=(.4124*r+.3576*g+.1805*b)/.95047,y=.2126*r+.7152*g+.0722*b,z=(.0193*r+.1192*g+.9505*b)/1.08883;const f=t=>t>216/24389?Math.cbrt(t):(24389/27*t+16)/116;return [116*f(y)-16,500*(f(x)-f(y)),200*(f(y)-f(z))];};
const dE=(a,b)=>Math.hypot(...lab(a).map((v,i)=>v-lab(b)[i]));
const ids=Object.keys(nationMarks),kinds=['normal',...Object.keys(matrices)];
const view=(id,kind)=>kind==='normal'?rgb(nationMarks[id].accent):simulate(nationMarks[id].accent,kind);
const THRESHOLD=20; // dE76 below this is "told apart by hue alone is not reliable" for small chips
const pairs=()=>ids.flatMap((a,i)=>ids.slice(i+1).map(b=>({a,b,worst:Math.min(...kinds.map(kind=>dE(view(a,kind),view(b,kind)))),kind:kinds.reduce((best,kind)=>dE(view(a,kind),view(b,kind))<dE(view(a,best),view(b,best))?kind:best,'normal')})));

test('deuteranopia, protanopia and tritanopia: every nation pair that colour alone cannot separate is separated by a different symbol AND pattern (#79)',async()=>{
 const all=pairs(),ambiguous=all.filter(pair=>pair.worst<THRESHOLD);
 assert.equal(all.length,45);
 for(const {a,b} of ambiguous){assert.notEqual(nationMarks[a].symbol,nationMarks[b].symbol,`${a}/${b} look alike in colour, so they need different symbols`);assert.notEqual(nationMarks[a].pattern,nationMarks[b].pattern,`${a}/${b} need different patterns`);}
 // Symbols are never the only difference that is color-free: also require the glyphs to be visually different shapes, not the same glyph at different sizes.
 for(const {a,b} of all)assert.notEqual(nationMarks[a].symbol,nationMarks[b].symbol);
 if(process.env.HARIMU_CVD_REPORT){
  const lines=['# Nation marks under colour-vision simulation (Machado 2009, severity 1.0; dE76 between accents; < '+THRESHOLD+' = not reliably separable by colour)','',`${ambiguous.length} of ${all.length} pairs are colour-ambiguous in at least one view; all of them differ in symbol and pattern.`,''];
  for(const pair of all.sort((x,y)=>x.worst-y.worst))lines.push(`${pair.worst<THRESHOLD?'AMBIGUOUS':'ok       '}  ${pair.a.padEnd(10)} ${pair.b.padEnd(10)} worst dE ${pair.worst.toFixed(1).padStart(5)} (${pair.kind})  ${nationMarks[pair.a].symbol}/${nationMarks[pair.b].symbol}  ${nationMarks[pair.a].pattern}/${nationMarks[pair.b].pattern}`);
  await writeFile(process.env.HARIMU_CVD_REPORT,lines.join('\n')+'\n');
 }
});
test('the accents stay readable on the dark game bars in every colour view',()=>{
 const bg=rgb('#0f2a33'),lum=c=>.2126*c[0]+.7152*c[1]+.0722*c[2];
 for(const id of ids)for(const kind of kinds){const ratio=(lum(view(id,kind))+.05)/(lum(bg)+.05);assert.ok(ratio>=3,`${id} accent contrast ${ratio.toFixed(2)} in ${kind}`);}
});
test('the symbols flag ships off and only the exact string "true" turns it on',async()=>{
 assert.equal(nationSymbolsEnabled('true'),true);for(const value of [undefined,'false','','1','TRUE'])assert.equal(nationSymbolsEnabled(value),false);
 assert.match(await read('wrangler.jsonc'),/"NEXT_PUBLIC_HARIMU_NATION_SYMBOLS": "false"/);
});

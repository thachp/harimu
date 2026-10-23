/** #81 population bands: thresholds, no exact counts leave the server, text-not-colour UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';
import { populationBand, populationBands, populationBandThresholds, populationBandLabel, pioneerNote } from '../lib/population-bands.ts';

test('thresholds: below 80% of the average = Needs citizens, from 130% = Thriving, else Growing', () => {
  assert.deepEqual(populationBandThresholds,{needsBelow:0.8,thrivingFrom:1.3});
  assert.equal(populationBand(79,100),'needs-citizens');
  assert.equal(populationBand(80,100),'growing');
  assert.equal(populationBand(129,100),'growing');
  assert.equal(populationBand(130,100),'thriving');
  assert.equal(populationBand(0,0),'growing','no enrollments: nobody is nudged');
  assert.equal(populationBand(NaN,10),'needs-citizens');
});

test('thresholds are configurable', () => {
  assert.equal(populationBand(85,100,{needsBelow:0.9,thrivingFrom:1.1}),'needs-citizens');
  assert.equal(populationBand(110,100,{needsBelow:0.9,thrivingFrom:1.1}),'thriving');
});

test('shard average includes nations with zero citizens; unknown ids ignored', () => {
  const ids=['kindle','korund','aurelle','veldwood'];
  // average = (60+30+10+0)/4 = 25 → kindle 240% thriving, korund 120% growing, aurelle 40% needs, veldwood 0 needs
  assert.deepEqual(populationBands(ids,{kindle:60,korund:30,aurelle:10,ghost:999}),{kindle:'thriving',korund:'growing',aurelle:'needs-citizens',veldwood:'needs-citizens'});
  assert.deepEqual(populationBands([], {kindle:1}),{});
  assert.deepEqual(populationBands(['a','b'],{}),{a:'growing',b:'growing'});
});

test('#212 nations that are not playable are Coming soon, never Needs citizens, and stay out of the average', () => {
  const playable=id=>['kindle','korund','aurelle'].includes(id);
  // playable average = (30+30+24)/3 = 28; empty preview nations must not drag it down to make kindle "thriving"
  assert.deepEqual(populationBands(['kindle','korund','aurelle','veldwood','fulmara'],{kindle:30,korund:30,aurelle:24},undefined,playable),
    {kindle:'growing',korund:'growing',aurelle:'growing',veldwood:'coming-soon',fulmara:'coming-soon'});
  assert.deepEqual(populationBands(['veldwood'],{},undefined,playable),{veldwood:'coming-soon'});
});

test('labels are text and the pioneer note is honest that bonuses are not live', () => {
  assert.deepEqual(Object.values(populationBandLabel),['Thriving','Growing','Needs citizens','Coming soon']);
  assert.match(pioneerNote,/cosmetic and convenience only/i); assert.match(pioneerNote,/not active/i);
});

test('#212 rendered /api/world output: bands only, no enrollment counts; preview nations are Coming soon', async t => {
  const r=await localRuntime(); t.after(()=>r.close());
  // Distinctive counts so any leak is easy to spot in the response.
  const counts={kindle:37,korund:11,aurelle:4}; const stamp=new Date().toISOString(); let i=0;
  for(const [nation,n] of Object.entries(counts))for(let k=0;k<n;k++)await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,created_at,updated_at) VALUES (?,?,?,?)").bind(`band-fixture-${i++}`,nation,stamp,stamp).run();
  const res=await r.call('world',null); assert.equal(res.status,200);
  const nations=res.data.nations; assert.ok(Array.isArray(nations)&&nations.length>=10);
  const band=Object.fromEntries(nations.map(n=>[n.id,n.populationBand]));
  // playable average = (37+11+4)/3 ≈ 17.3 → kindle 2.1× thriving, korund 0.63× needs, aurelle 0.23× needs
  assert.deepEqual({kindle:band.kindle,korund:band.korund,aurelle:band.aurelle},{kindle:'thriving',korund:'needs-citizens',aurelle:'needs-citizens'});
  for(const n of nations)if(!['kindle','korund','aurelle'].includes(n.id))assert.equal(n.populationBand,'coming-soon',`${n.id} is not playable yet`);
  const keysDeep=v=>v&&typeof v==='object'?Object.entries(v).flatMap(([k,x])=>[k,...keysDeep(x)]):[];
  for(const n of nations){
    // `population` is the static lore string (e.g. "8.4 million"), checked below.
    for(const key of keysDeep(n).filter(k=>k!=='population'))assert.doesNotMatch(key,/citizen|enrol|population(?!Band)|count/i,`${n.id} exposes ${key}`);
    assert.ok(!(n.id in counts)||String(n.population)!==String(counts[n.id]),'lore population is not the enrollment count');
    const values=Object.values(n).filter(v=>typeof v==='number');
    if(n.id in counts)assert.ok(!values.includes(counts[n.id]),`${n.id} exposes its raw count`);
  }
  assert.ok(!JSON.stringify(nations).includes('"citizens"'));
});

test('strip and preview panel show the band as text; pioneer note is a keyboard-reachable disclosure', async () => {
  const page=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8');
  const shell=await readFile(new URL('../app/game-shell.tsx',import.meta.url),'utf8');
  assert.match(page,/badge: nation\.populationBand && !\(nation\.populationBand === 'coming-soon' && openNations\?\.includes\(nation\.id\)\) \? populationBandLabel\[nation\.populationBand\]/);
  assert.match(shell,/item\.badge && <small className="population-band-badge" data-band=\{item\.badge\}>\{item\.badge\}<\/small>/);
  // #392 S3: the band <dd> is built in page.tsx and placed under its Population label by app/scene-panels-v2.tsx (flag off: facts list; flag on: stats row)
  assert.match(page,/const populationFact = selected\.populationBand && !\(selected\.populationBand === 'coming-soon' && openNations\?\.includes\(selected\.id\)\) \? <dd className="population-band" data-band=\{selected\.populationBand\}>\{populationBandLabel\[selected\.populationBand\]\}<\/dd> : null;/);
  const panels=await readFile(new URL('../app/scene-panels-v2.tsx',import.meta.url),'utf8');
  assert.match(panels,/\{population && <><dt>Population<\/dt>\{population\}<\/>\}/);
  assert.match(panels,/population \? \[\{ label: 'Population', value: population \}\]/);
  assert.match(page,/selected\.populationBand === 'needs-citizens' && <details className="pioneer-note"><summary>/);
  const css=await readFile(new URL('../app/game-shell.css',import.meta.url),'utf8');
  assert.match(css,/\.population-band-badge\[data-band="Needs citizens"\]\{border-style:dashed/,'not colour alone');
  assert.match(css,/\.pioneer-note>summary:focus-visible\{outline:2px solid/);
  assert.match(css,/\.population-band-badge\{[^}]*font-size:calc\(12px \* var\(--text-scale, 1\)\)/,'#212 badge is at least 12px and scales');
  assert.doesNotMatch(css,/\.population-band-badge\{[^}]*font-size:calc\(1[01]px/);
  assert.match(shell,/nationIsPreview\(item\.id, openNations\) && item\.badge !== 'Coming soon'/,'no double Preview + Coming soon badge');
});

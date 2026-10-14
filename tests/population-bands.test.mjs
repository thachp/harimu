/** #81 population bands: thresholds, no exact counts leave the server, text-not-colour UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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

test('labels are text and the pioneer note is honest that bonuses are not live', () => {
  assert.deepEqual(Object.values(populationBandLabel),['Thriving','Growing','Needs citizens']);
  assert.match(pioneerNote,/cosmetic and convenience only/i); assert.match(pioneerNote,/not active/i);
});

test('world API sends bands only, never enrollment counts', async () => {
  const route=await readFile(new URL('../app/api/world/route.ts',import.meta.url),'utf8');
  assert.match(route,/COUNT\(\*\) AS citizens FROM citizens/);
  assert.match(route,/populationBand: bands\[nation\.id\]/);
  assert.doesNotMatch(route,/citizens:\s*row|enrollments:|citizenCount/);
});

test('strip and preview panel show the band as text; pioneer note is a keyboard-reachable disclosure', async () => {
  const page=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8');
  const shell=await readFile(new URL('../app/game-shell.tsx',import.meta.url),'utf8');
  assert.match(page,/badge: nation\.populationBand && populationBandLabel\[nation\.populationBand\]/);
  assert.match(shell,/item\.badge && <small className="population-band-badge" data-band=\{item\.badge\}>\{item\.badge\}<\/small>/);
  assert.match(page,/<dt>Population<\/dt><dd className="population-band" data-band=\{selected\.populationBand\}>\{populationBandLabel\[selected\.populationBand\]\}<\/dd>/);
  assert.match(page,/selected\.populationBand === 'needs-citizens' && <details className="pioneer-note"><summary>/);
  const css=await readFile(new URL('../app/game-shell.css',import.meta.url),'utf8');
  assert.match(css,/\.population-band-badge\[data-band="Needs citizens"\]\{border-style:dashed/,'not colour alone');
  assert.match(css,/\.pioneer-note>summary:focus-visible\{outline:2px solid/);
});

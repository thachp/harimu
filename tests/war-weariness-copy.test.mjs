import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { COUP_NAME_MAX } from '../lib/palace-coup-copy.ts';
import { kindlePress, korundStateMedia, aurelleGazette } from '../lib/press-templates.ts';

// lib/war-weariness-copy.ts re-exports the shared name cap from './palace-coup-copy' (extensionless for tsc/Next):
// rewrite the specifier and transpile, as tests/war-copy.test.mjs does.
const src=readFileSync('lib/war-weariness-copy.ts','utf8').replace("from './palace-coup-copy'",`from ${JSON.stringify(pathToFileURL(resolve('lib/palace-coup-copy.ts')).href)}`);
const out=join(mkdtempSync(join(tmpdir(),'war-weariness-copy-')),'war-weariness-copy.mjs');
writeFileSync(out,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const W = await import(pathToFileURL(out).href);
const { wearinessStrip:ST, wearinessBanners:BN, wearinessNews:NW, wearinessNewsFor, wearinessRelief:RL, WEARINESS_NATIONS, WEARINESS_LEVELS, WEARINESS_PLACEHOLDERS, WEARINESS_NAME_MAX, WEARINESS_LABEL_MAX, WEARINESS_LINE_MAX, WEARINESS_BODY_MAX } = W;

const news=()=>NW.flatMap(n=>WEARINESS_LEVELS.map(l=>({nation:n.nationId,level:l,n:n.notices[l]})));
const banners=()=>WEARINESS_NATIONS.flatMap(n=>WEARINESS_LEVELS.map(l=>BN[n][l]));
const labels=()=>[ST.label,ST.korundLabel,ST.levelLine,...Object.values(ST.levelNames),...banners(),...news().map(x=>x.n.headline)];
const lines=()=>[...ST.tooltip,...ST.weekly,...RL].map(l=>l.text);
const bodies=()=>news().map(x=>x.n.body);
const all=()=>[...labels(),...lines(),...bodies()];
const fill=t=>WEARINESS_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(WEARINESS_NAME_MAX)),t);
// Everything a Korund citizen can see.
const korundFacing=()=>[ST.korundLabel,...Object.values(ST.levelNames),...WEARINESS_LEVELS.map(l=>BN.korund[l]),...WEARINESS_LEVELS.flatMap(l=>[wearinessNewsFor('korund').notices[l].headline,wearinessNewsFor('korund').notices[l].body]),...ST.tooltip.map(l=>l.text),...ST.weekly.map(l=>l.text),...RL.map(l=>l.text)];

test('shared name cap re-exported; limits 40/80/140; placeholder set', () => {
  assert.equal(WEARINESS_NAME_MAX,COUP_NAME_MAX); assert.equal(WEARINESS_NAME_MAX,24); assert.equal(WEARINESS_LABEL_MAX,40); assert.equal(WEARINESS_LINE_MAX,80); assert.equal(WEARINESS_BODY_MAX,140);
  assert.deepEqual([...WEARINESS_PLACEHOLDERS],['{amount}','{band}']);
});
test('every nation and level is covered for both the banner and the news line; every line is a proposal', () => {
  assert.deepEqual([...WEARINESS_NATIONS],['kindle','korund','aurelle']); assert.deepEqual([...WEARINESS_LEVELS],['rising','high','severe']);
  assert.deepEqual(Object.keys(BN).sort(),[...WEARINESS_NATIONS].sort()); for (const n of WEARINESS_NATIONS) assert.deepEqual(Object.keys(BN[n]).sort(),[...WEARINESS_LEVELS].sort());
  assert.deepEqual(NW.map(x=>x.nationId),[...WEARINESS_NATIONS]); for (const n of NW) { assert.equal(n.proposal,true); assert.deepEqual(Object.keys(n.notices).sort(),[...WEARINESS_LEVELS].sort()); assert.equal(wearinessNewsFor(n.nationId),n); }
  assert.equal(news().length,9); for (const x of news()) { assert.equal(x.n.proposal,true); assert.equal(typeof x.n.aiBadge,'boolean'); assert.ok(x.n.id.startsWith(x.nation)); }
  assert.deepEqual(Object.keys(ST.levelNames),[...WEARINESS_LEVELS]); assert.equal(ST.tooltip.length,2); assert.equal(ST.weekly.length,2); assert.equal(RL.length,2);
  for (const l of [...ST.tooltip,...ST.weekly,...RL]) assert.equal(l.proposal,true);
  assert.equal(ST.proposal,true); assert.equal(new Set(all()).size,all().length-(all().length-new Set(all()).size));
  assert.equal(new Set(banners()).size,9); assert.equal(new Set(bodies()).size,9);
});
test('limits: labels, banners and headlines 40; lines 80; news bodies 140, with every placeholder filled to 24 characters', () => {
  for (const t of labels()) assert.ok(fill(t).length<=WEARINESS_LABEL_MAX,`${t} (${fill(t).length})`);
  for (const t of lines()) assert.ok(fill(t).length<=WEARINESS_LINE_MAX,`${t} (${fill(t).length})`);
  for (const t of bodies()) assert.ok(fill(t).length<=WEARINESS_BODY_MAX,`${t} (${fill(t).length})`);
});
test('only {amount} and {band}, in the right lines; news, banners, tooltip and relief have none', () => {
  for (const t of all()) for (const m of t.match(/\{[^}]*\}/g)??[]) assert.ok(WEARINESS_PLACEHOLDERS.includes(m),`${m} in ${t}`);
  assert.equal(ST.levelLine,'{band}'); for (const l of ST.weekly) { assert.match(l.text,/\{amount\}/); assert.doesNotMatch(l.text,/\{band\}/); }
  for (const t of [...banners(),...bodies(),...news().map(x=>x.n.headline),...ST.tooltip.map(l=>l.text),...RL.map(l=>l.text),...Object.values(ST.levelNames)]) assert.doesNotMatch(t,/\{/,t);
});
test('no figures: no digits, number words, percent or thresholds anywhere; amounts only through {amount}', () => {
  for (const t of all()) assert.doesNotMatch(t.replace(/\{[^}]*\}/g,''),/\d|%|percent|\b(one|two|three|four|five|six|ten|twice|once|half|double)\b|\b(hours?|days?|months?|years?)\b|\bthreshold|\bcap(ped)?\b/i,t);
});
test('Korund never says the population is tired of the war: no weariness, tired, exhausted or fatigue anywhere a Korund citizen sees', () => {
  for (const t of korundFacing()) assert.doesNotMatch(t,/weari|weary|tired|exhaust|fatigue|sick of|enough of|want\w* (this|the) war|doubt|end the war|calls? to end/i,t);
  assert.equal(ST.korundLabel,'Resolve'); for (const l of WEARINESS_LEVELS) assert.match(BN.korund[l],/Resolve|resolve/);
  assert.match(wearinessNewsFor('korund').notices.rising.headline,/Resolve is being tested/);
});
test('Kindle is frank; Aurelle speaks of the Crown\'s patience and the realm\'s burden', () => {
  assert.equal(BN.kindle.rising,'War weariness is rising'); for (const l of WEARINESS_LEVELS) assert.match(wearinessNewsFor('kindle').notices[l].body,/^Republic Wire Service: /);
  assert.match(wearinessNewsFor('kindle').notices.high.body,/polls/);
  assert.match(BN.aurelle.rising,/patience/); assert.match(BN.aurelle.high,/burden/); assert.match(BN.aurelle.severe,/burden/);
  for (const l of WEARINESS_LEVELS) assert.match(wearinessNewsFor('aurelle').notices[l].body,/patience|burden/);
});
test('AI badge (#381, ui-ux 23.2): Korund State Media (own war) and the Crown\'s "Be it known" are badged; Kindle and Gazette reports are not; system lines carry no badge', () => {
  for (const x of news()) {
    const expected=x.nation==='korund'||/^Be it known/.test(x.n.body);
    assert.equal(x.n.aiBadge,expected,x.n.id);
    if (x.nation==='korund') assert.match(x.n.body,/^Korund State Media reports: /);
    if (x.nation==='aurelle'&&!x.n.aiBadge) assert.match(x.n.body,/^The Court Gazette reports that /);
  }
  assert.equal(wearinessNewsFor('aurelle').notices.severe.aiBadge,true); assert.equal(wearinessNewsFor('aurelle').notices.rising.aiBadge,false);
  for (const o of [ST]) assert.equal('aiBadge' in o,false); for (const l of [...ST.tooltip,...ST.weekly,...RL]) assert.equal('aiBadge' in l,false);
  assert.ok(news().every(x=>x.nation==='aurelle'||x.n.aiBadge===(x.nation==='korund')));
});
test('bylines match lib/press-templates.ts and lead the news bodies', () => {
  const by=Object.fromEntries(NW.map(n=>[n.nationId,n.byline]));
  assert.deepEqual(by.kindle,kindlePress.byline); assert.deepEqual(by.korund,korundStateMedia.byline); assert.deepEqual(by.aurelle,aurelleGazette.byline);
});
test('weekly notice and relief: Unrest only via {amount}; relief never promises a drop or an amount', () => {
  for (const l of ST.weekly) assert.match(l.text,/Unrest/); for (const l of ST.tooltip) assert.match(l.text,/Unrest/);
  assert.match(ST.tooltip[0].text,/Losses and lost squares speed it up/);
  for (const l of RL) { assert.match(l.text,/war (is over|has ended)|The war/i); assert.doesNotMatch(l.text,/fall|drop|eas|relief|reduc|less|\{/i,l.text); }
  for (const t of [...ST.tooltip.map(l=>l.text),...ST.weekly.map(l=>l.text),...RL.map(l=>l.text)]) assert.doesNotMatch(t,/Republic Wire|State Media|Court Gazette|Be it known/);
});
test('tone: no violence, no casualties named, no Notable, no other nations, no real-world reference', () => {
  const t=all().join(' ');
  assert.doesNotMatch(t,/\b(kill\w*|dead|death|die[sd]?|casualt\w*|blood|massacre|slain|loot\w*)\b/i);
  assert.doesNotMatch(t,/Notable|@|\b(Meridian|Ilmar|Varkand|Veldwood|Hoarvale|Fulmara|Confluence)\b/);
  assert.doesNotMatch(t,/\b(Earth|America|Europe|England|France|Japan|China|Russia)\b/);
});
test('unwired: nothing in app/, components/ or lib/ imports war-weariness-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components'),...walk('lib')]) if (/\.(t|j)sx?$/.test(f)&&!f.endsWith('war-weariness-copy.ts')) assert.doesNotMatch(readFileSync(f,'utf8'),/war-weariness-copy/, f);
});
test('QA3 fixes: the tooltip does not claim the weekly step grows; Kindle officials are weighing, not obliged; relief lines carry no weariness wording', () => {
  assert.doesNotMatch(ST.tooltip[1].text,/each (game )?week|every (game )?week|faster|grows? (each|every)/i); assert.match(ST.tooltip[1].text,/in all/);
  assert.doesNotMatch(wearinessNewsFor('kindle').notices.high.body,/must|obliged|required/i); assert.match(wearinessNewsFor('kindle').notices.high.body,/weighing/);
  for (const l of RL) assert.doesNotMatch(l.text,/weari|weary/i,l.text);
});

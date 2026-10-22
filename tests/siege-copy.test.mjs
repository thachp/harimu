import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { COUP_NAME_MAX } from '../lib/palace-coup-copy.ts';
import { kindlePress, korundStateMedia, aurelleGazette } from '../lib/press-templates.ts';

// lib/siege-copy.ts re-exports the shared name cap from './palace-coup-copy' (extensionless for tsc/Next):
// rewrite the specifier and transpile, as tests/war-copy.test.mjs does.
const src=readFileSync('lib/siege-copy.ts','utf8').replace("from './palace-coup-copy'",`from ${JSON.stringify(pathToFileURL(resolve('lib/palace-coup-copy.ts')).href)}`);
const out=join(mkdtempSync(join(tmpdir(),'siege-copy-')),'siege-copy.mjs');
writeFileSync(out,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const S = await import(pathToFileURL(out).href);
const { siegeNotices:SN, siegeNoticesFor, siegeStrip:ST, siegeRules:SR, capturePrivate:CP, SIEGE_NATIONS, SIEGE_EVENTS, SIEGE_VARIANTS, SIEGE_PLACEHOLDERS, SIEGE_NAME_MAX, SIEGE_HEADLINE_MAX, SIEGE_BODY_MAX } = S;

const notices=()=>SN.flatMap(n=>SIEGE_EVENTS.flatMap(e=>SIEGE_VARIANTS.map(v=>({nation:n.nationId,event:e,variant:v,n:n.notices[e][v]}))));
const headlines=()=>notices().map(x=>x.n.headline);
const lines=()=>[...notices().map(x=>x.n.body),ST.caption.text,...SR.lines.map(l=>l.text),CP.defender.text,CP.attacker.text];
const all=()=>[...headlines(),...lines()];
const fill=t=>t.replaceAll('{n}','1').replaceAll('{city}','W'.repeat(SIEGE_NAME_MAX)).replaceAll('{attacker}','W'.repeat(SIEGE_NAME_MAX)).replaceAll('{defender}','W'.repeat(SIEGE_NAME_MAX));

test('shared name cap re-exported; limits 40/140; placeholder set', () => {
  assert.equal(SIEGE_NAME_MAX,COUP_NAME_MAX); assert.equal(SIEGE_NAME_MAX,24); assert.equal(SIEGE_HEADLINE_MAX,40); assert.equal(SIEGE_BODY_MAX,140);
  assert.deepEqual([...SIEGE_PLACEHOLDERS],['{city}','{attacker}','{defender}','{n}']);
});
test('every key is present: three nations, five events, report and own variants, strip, rules, two private notices; every line proposal', () => {
  assert.deepEqual([...SIEGE_NATIONS],['kindle','korund','aurelle']); assert.deepEqual(SN.map(x=>x.nationId),[...SIEGE_NATIONS]);
  assert.deepEqual([...SIEGE_EVENTS],['opened','first-assault','city-falls','assault-held','lifted']); assert.deepEqual([...SIEGE_VARIANTS],['report','own']);
  for (const n of SN) { assert.equal(n.proposal,true); assert.deepEqual(Object.keys(n.notices).sort(),[...SIEGE_EVENTS].sort()); for (const e of SIEGE_EVENTS) assert.deepEqual(Object.keys(n.notices[e]).sort(),['own','report']); assert.equal(siegeNoticesFor(n.nationId),n); }
  assert.equal(notices().length,30); for (const x of notices()) { assert.equal(x.n.proposal,true); assert.equal(typeof x.n.aiBadge,'boolean'); assert.ok(x.n.id.startsWith(x.nation),x.n.id); }
  assert.equal(new Set(notices().map(x=>x.n.id)).size,30); assert.equal(new Set(notices().map(x=>x.n.body)).size,30);
  assert.equal(ST.proposal,true); assert.equal(SR.lines.length,3); assert.equal(CP.proposal,true);
});
test('limits: headlines 40, bodies and lines 140, with name placeholders filled to 24 characters', () => {
  for (const t of headlines()) assert.ok(fill(t).length<=SIEGE_HEADLINE_MAX,`${t} (${fill(t).length})`);
  for (const t of lines()) assert.ok(fill(t).length<=SIEGE_BODY_MAX,`${t} (${fill(t).length})`);
});
test('only {city}, {attacker}, {defender} and {n}, in the right places', () => {
  for (const t of all()) for (const m of t.match(/\{[^}]*\}/g)??[]) assert.ok(SIEGE_PLACEHOLDERS.includes(m),`${m} in ${t}`);
  for (const x of notices()) assert.match(x.n.body,/\{city\}/,x.n.id);
  assert.match(ST.caption.text,/\{city\}/); assert.match(ST.caption.text,/\{n\}/); assert.equal(ST.caption.text,'Siege of {city}: {n} of 2 successful assault days');
  assert.match(CP.defender.text,/\{city\}/); assert.match(CP.defender.text,/\{attacker\}/); assert.match(CP.attacker.text,/\{city\}/); assert.match(CP.attacker.text,/\{defender\}/);
  for (const l of SR.lines) assert.doesNotMatch(l.text,/\{/);
});
test('no invented figures: no digit but the "2" of the caption; no percent, strength, troops, odds or timers; number words only "two"', () => {
  const allowed=/two successful assaults on two different days|two successful assaults on two days|at least two successful assaults|another day|different days|2 successful assault days/g;
  for (const t of all()) { const bare=t.replace(/\{[^}]*\}/g,'').replace(allowed,''); assert.doesNotMatch(bare,/\d|%|percent|\b(one|three|four|five|six|ten|twice|once)\b|\b(hours?|days?|weeks?|minutes?)\b|\b(hp|strength|troops?|soldiers?|army|armies|odds|chance|control)\b|\bcap(ped)?\b/i,t); }
});
test('badge rule (#381, ui-ux 23.2): Aurelle "Be it known" and Korund own-siege lines are badged; Kindle and every report are not', () => {
  for (const x of notices()) {
    const expected=x.variant==='own'&&x.nation!=='kindle';
    assert.equal(x.n.aiBadge,expected,x.n.id);
    if (x.nation==='aurelle'&&x.variant==='own') assert.match(x.n.body,/^Be it known/);
    if (x.nation==='aurelle'&&x.variant==='report') assert.match(x.n.body,/^The Court Gazette reports/);
    if (/Be it known/.test(x.n.body)) assert.equal(x.n.aiBadge,true,x.n.id);
  }
});
test('bylines match lib/press-templates.ts and lead the body', () => {
  const by=Object.fromEntries(SN.map(n=>[n.nationId,n.byline]));
  assert.deepEqual(by.kindle,kindlePress.byline); assert.deepEqual(by.korund,korundStateMedia.byline); assert.deepEqual(by.aurelle,aurelleGazette.byline);
  for (const x of notices()) { if (x.nation==='kindle') assert.match(x.n.body,/^Republic Wire Service: /); if (x.nation==='korund') assert.match(x.n.body,/^Korund State Media reports: /); }
});
test('the two-day rule is only the docs\' rule: second assault on another day; first assault never captures', () => {
  for (const e of ['first-assault']) for (const x of notices().filter(y=>y.event===e)) assert.match(x.n.body,/second|another day/,x.n.id);
  for (const x of notices().filter(y=>y.event==='city-falls')) assert.match(x.n.body,/fallen|taken|captured/,x.n.id);
  assert.match(SR.lines[0].text,/at least two successful assaults on two different days/); assert.match(SR.lines[0].text,/defense window/);
  for (const x of notices().filter(y=>y.event==='lifted')) assert.match(x.n.body,/not captured|stands/,x.n.id);
});
test('capitals and Heartland are never capturable; Frontier outposts can be; no copy says a capital falls', () => {
  assert.equal(SR.lines[1].text,'Capitals and other Heartland cities can never be captured.'); assert.match(SR.lines[2].text,/Frontier/);
  for (const t of [...notices().map(x=>x.n.body),ST.caption.text,CP.defender.text,CP.attacker.text]) assert.doesNotMatch(t,/\bcapitals?\b|\bHeartland\b/i,t);
});
test('tone (docs 15.4): citizens are never killed; no violence, loot or glory; no Notable, other nations, real-world reference', () => {
  const t=all().join(' ');
  assert.doesNotMatch(t,/\b(kill|killed|dead|death|die[sd]?|casualt\w*|massacre|slain|blood|burn|loot|slaughter|glor\w*|victory|conquer\w*|crush\w*)\b/i);
  assert.doesNotMatch(t,/Notable|@|\b(Meridian|Ilmar|Varkand|Veldwood|Hoarvale|Fulmara|Confluence)\b/);
  assert.doesNotMatch(t,/\b(Earth|America|Europe|England|France|Japan|China|Russia|Versailles|Napoleon)\b/);
  for (const x of notices()) { if (x.nation!=='kindle') assert.doesNotMatch(x.n.body,/Republic Wire Service/); if (x.nation!=='korund') assert.doesNotMatch(x.n.body,/State Media/); if (x.nation!=='aurelle') assert.doesNotMatch(x.n.body,/Be it known|Court Gazette/); }
});
test('system lines carry no byline or AI badge: strip, rules and private notices', () => {
  for (const o of [ST,SR,CP]) assert.equal('aiBadge' in o,false);
  for (const l of [ST.caption,...SR.lines,CP.defender,CP.attacker]) { assert.equal('aiBadge' in l,false); assert.doesNotMatch(l.text,/Republic Wire|State Media|Court Gazette|Be it known/); }
});
test('wired only through app/siege-panel.tsx (#620): nothing else in app/, components/ or lib/ imports siege-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components'),...walk('lib')]) if (/\.(t|j)sx?$/.test(f)&&!f.endsWith('siege-copy.ts')&&f!=='app/siege-panel.tsx') assert.doesNotMatch(readFileSync(f,'utf8'),/\bsiege-copy\b/, f);
});

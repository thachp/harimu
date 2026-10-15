import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { COUP_NAME_MAX } from '../lib/palace-coup-copy.ts';

// The module re-exports the shared name cap from './palace-coup-copy' (extensionless for tsc/Next): rewrite the specifier and transpile.
const src=readFileSync('lib/canvassing-chrome-copy.ts','utf8').replace("from './palace-coup-copy'",`from ${JSON.stringify(pathToFileURL(resolve('lib/palace-coup-copy.ts')).href)}`);
const out=join(mkdtempSync(join(tmpdir(),'canvassing-chrome-copy-')),'canvassing-chrome-copy.mjs');
writeFileSync(out,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const C = await import(pathToFileURL(out).href);
const { canvassJoin:J, canvassActions:A, canvassStatus:S, canvassVisibility:V, CANVASS_NAME_MAX, CANVASS_NUMBER_MAX, CANVASS_PLACEHOLDERS, CANVASS_LABEL_MAX, CANVASS_LINE_MAX, CANVASS_BODY_MAX } = C;

const labels=()=>[J.heading,A.start.label,A.finish.label,A.timerLabel,V.ariaLabel,V.heading];
const lines=()=>[A.start.accessibleName,A.finish.accessibleName,J.prompt.text,S.district.text,S.cost.text,S.cooldown.text,V.row.text,V.empty.text,V.note.text];
const bodies=()=>[J.note.text];
const all=()=>[...labels(),...lines(),...bodies()];
const fill=t=>t.replaceAll('{cost}','9'.repeat(CANVASS_NUMBER_MAX)).replaceAll('{points}','9'.repeat(CANVASS_NUMBER_MAX)).replace(/\{(party|candidate|district)\}/g,'W'.repeat(CANVASS_NAME_MAX));

test('shared name cap re-exported; limits 40/80/140; the five placeholders', () => {
  assert.equal(CANVASS_NAME_MAX,COUP_NAME_MAX); assert.equal(CANVASS_NUMBER_MAX,6); assert.equal(CANVASS_LABEL_MAX,40); assert.equal(CANVASS_LINE_MAX,80); assert.equal(CANVASS_BODY_MAX,140);
  assert.deepEqual([...CANVASS_PLACEHOLDERS],['{party}','{candidate}','{district}','{cost}','{points}']);
});
test('covers every #503 placeholder: join prompt, Start and Finish, district, cooldown, cost, visibility heading and per-district count', () => {
  assert.equal(J.prompt.text,'Join a party to canvass for its candidate.'); assert.equal(A.start.label,'Start canvassing'); assert.equal(A.finish.label,'Finish canvassing');
  assert.equal(S.district.text,'Your district: {district}.'); assert.equal(S.cooldown.text,'Come back tomorrow.'); assert.equal(S.cost.text,'Canvassing costs {cost} Work Capacity.');
  assert.match(V.heading,/^Visibility for \{candidate\}$/); assert.equal(V.row.text,'{district}: {points}');
  for (const l of [J.prompt,J.note,S.district,S.cost,S.cooldown,V.row,V.empty,V.note]) assert.equal(l.proposal,true); for (const o of [J,A,S,V]) assert.equal(o.proposal,true);
  assert.equal(new Set(all()).size,all().length);
});
test('limits: labels 40, lines 80, bodies 140, with every placeholder filled to its cap', () => {
  for (const t of labels()) assert.ok(fill(t).length<=CANVASS_LABEL_MAX,`${t} (${fill(t).length})`);
  for (const t of lines()) assert.ok(fill(t).length<=CANVASS_LINE_MAX,`${t} (${fill(t).length})`);
  for (const t of bodies()) assert.ok(fill(t).length<=CANVASS_BODY_MAX,`${t} (${fill(t).length})`);
});
test('only the known placeholders, and each used where it belongs', () => {
  for (const t of all()) for (const m of t.match(/\{[^}]*\}/g)??[]) assert.ok(CANVASS_PLACEHOLDERS.includes(m),`${m} in ${t}`);
  assert.ok(S.cost.text.includes('{cost}')); assert.ok(V.row.text.includes('{points}')); assert.ok(S.district.text.includes('{district}')); assert.ok(V.heading.includes('{candidate}'));
  assert.ok(A.start.accessibleName.includes('{party}')); assert.ok(A.finish.accessibleName.includes('{party}'));
});
test('no figure is written into any line: all numbers come through {cost} and {points}', () => {
  for (const t of all()) { const bare=t.replace(/\{[^}]*\}/g,''); assert.doesNotMatch(bare,/\d|%|\b(one|two|three|four|five|six|ten|twice|once|half|dozen)\b/i,t); }
  for (const t of all()) assert.doesNotMatch(t.replace(/\{[^}]*\}/g,''),/\b(points?|credits?|rewards?|coins?|gold|currency|Standing|Favor|Piety)\b/i,t);
});
test('visibility, not votes: the lines that mention visibility say it is display only or not votes; no line implies a vote effect', () => {
  for (const t of [J.note.text,V.empty.text,V.note.text]) assert.match(t,/not votes|display only|does not count as votes/,t);
  for (const t of all()) { assert.doesNotMatch(t,/\b(sway\w*|win\w*|boost\w*|swing\w*|persuad\w*|convert\w*|tally|tallies|ballot\w*|poll\w*|elect\w*|result\w*|lead\w*|ahead|gain\w*)\b/i,t); }
  for (const t of all().filter(x=>/\bvotes?\b/i.test(x))) assert.match(t,/\b(not|never)\b|does not/i,t);
  assert.match(J.note.text,/visibility/); assert.match(V.note.text,/Visibility is display only/);
});
test('system chrome: no byline, no AI badge, no press voice, no in-game voice lines', () => {
  for (const o of [J,A,S,V]) { assert.equal('aiBadge' in o,false); assert.equal('byline' in o,false); }
  for (const t of all()) assert.doesNotMatch(t,/Republic Wire|State Media|Court Gazette|Be it known|Chairman|Crown|AI-generated|AI candidate/,t);
});
test('does not repeat the existing canvassing copy lines', () => {
  const camp=readFileSync('lib/campaign-copy.ts','utf8');
  for (const t of [J.note.text,V.empty.text,V.note.text,...lines().filter(x=>x!==J.prompt.text&&x!==S.cooldown.text)]) assert.ok(!camp.includes(t),t);
});
test('tone: plain and short; no urgency or pressure, nothing about other nations', () => {
  const t=all().join(' ');
  assert.doesNotMatch(t,/!|\b(hurry|now or never|last chance|must|failure|fail|lose|lost|punish\w*)\b/i);
  assert.doesNotMatch(t,/Notable|@|\b(Korund|Aurelle|Varkand|Meridian|Ilmar)\b/);
});
test('unwired: nothing in app/, components/ or lib/ imports canvassing-chrome-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components'),...walk('lib')]) if (/\.(t|j)sx?$/.test(f)&&!f.endsWith('canvassing-chrome-copy.ts')) assert.doesNotMatch(readFileSync(f,'utf8'),/canvassing-chrome-copy/, f);
});

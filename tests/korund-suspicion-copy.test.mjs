import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { COUP_NAME_MAX } from '../lib/palace-coup-copy.ts';
import { korundUndergroundCopy as UG } from '../lib/faith-copy.ts';

// lib/korund-suspicion-copy.ts re-exports the shared name cap from './palace-coup-copy' (extensionless for tsc/Next):
// rewrite the specifier and transpile, as tests/aurelle-favor-copy.test.mjs does.
const src=readFileSync('lib/korund-suspicion-copy.ts','utf8').replace("from './palace-coup-copy'",`from ${JSON.stringify(pathToFileURL(resolve('lib/palace-coup-copy.ts')).href)}`);
const out=join(mkdtempSync(join(tmpdir(),'korund-suspicion-copy-')),'korund-suspicion-copy.mjs');
writeFileSync(out,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const K = await import(pathToFileURL(out).href);
const { suspicionIndicator:SI, correctionDuty:CD, appeal:AP, dutyEnded:DE, appealStateFor, APPEAL_KEYS, SUSPICION_PLACEHOLDERS, SUSPICION_NAME_MAX, SUSPICION_LABEL_MAX, SUSPICION_LINE_MAX } = K;

const labels=()=>[SI.label,SI.privateTag,SI.levelLine,CD.label,CD.daysLeft,AP.button];
const lines=()=>[...SI.tooltip,CD.banner,CD.repeatOnly,CD.cap,CD.playable,AP.explainer,...APPEAL_KEYS.map(k=>AP.states[k]),DE.organ,DE.system].map(l=>l.text);
const all=()=>[...labels(),...lines()];
const fill=t=>SUSPICION_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(SUSPICION_NAME_MAX)),t);

test('shared name cap re-exported; limits 40/80; placeholder set', () => {
  assert.equal(SUSPICION_NAME_MAX,COUP_NAME_MAX); assert.equal(SUSPICION_NAME_MAX,24); assert.equal(SUSPICION_LABEL_MAX,40); assert.equal(SUSPICION_LINE_MAX,80);
  assert.deepEqual([...SUSPICION_PLACEHOLDERS],['{level}','{days}']);
});
test('every key is present: indicator, duty status, appeal button and four states, duty-ended notices; every line proposal', () => {
  assert.equal(SI.label,'Suspicion'); assert.equal(SI.tooltip.length,2); assert.equal(CD.label,'Correction Duty'); assert.equal(AP.button,'Appeal');
  assert.deepEqual([...APPEAL_KEYS],['submitted','pending','upheld','overturned']); assert.deepEqual(Object.keys(AP.states).sort(),[...APPEAL_KEYS].sort());
  for (const k of APPEAL_KEYS) assert.equal(appealStateFor(k),AP.states[k]);
  for (const l of [...SI.tooltip,CD.banner,CD.repeatOnly,CD.cap,CD.playable,AP.explainer,...APPEAL_KEYS.map(k=>AP.states[k]),DE.organ,DE.system]) assert.equal(l.proposal,true);
  for (const o of [SI,CD,AP,DE]) assert.equal(o.proposal,true);
  assert.equal(new Set(lines()).size,lines().length);
});
test('limits: labels 40, lines 80, with every placeholder filled to 24 characters', () => {
  for (const t of labels()) assert.ok(fill(t).length<=SUSPICION_LABEL_MAX,`${t} (${fill(t).length})`);
  for (const t of lines()) assert.ok(fill(t).length<=SUSPICION_LINE_MAX,`${t} (${fill(t).length})`);
});
test('only known placeholders, in the right lines', () => {
  for (const t of all()) for (const m of t.match(/\{[^}]*\}/g)??[]) assert.ok(SUSPICION_PLACEHOLDERS.includes(m),`${m} in ${t}`);
  assert.match(SI.levelLine,/\{level\}/); assert.match(CD.daysLeft,/\{days\}/);
  for (const t of lines()) assert.doesNotMatch(t,/\{/);
});
test('no invented figures: the only digit anywhere is the docs\' seven-day cap in one line (14.6, 8.18)', () => {
  for (const t of all()) { const bare=t.replace(/\{[^}]*\}/g,''); if (t===CD.cap.text) { assert.equal(t,'Correction Duty lasts at most 7 real days.'); continue; } assert.doesNotMatch(bare,/\d|%|percent|\b(one|two|three|four|five|six|seven|ten|twice|once)\b|\b(hours?|weeks?|months?|years?)\b|\bthreshold|\bodds\b|\bchance\b/i,t); }
  assert.doesNotMatch(SI.levelLine.replace(/\{[^}]*\}/g,''),/\d/);
});
test('AI badge (#381): only the State Security banner and duty-ended line are badged; labels, tooltip, caption and appeal lines are system lines', () => {
  assert.equal(CD.banner.aiBadge,true); assert.equal(DE.organ.aiBadge,true);
  assert.match(CD.banner.text,/^State Security: /); assert.match(DE.organ.text,/^State Security: /);
  for (const l of [...SI.tooltip,CD.repeatOnly,CD.cap,CD.playable,AP.explainer,...APPEAL_KEYS.map(k=>AP.states[k]),DE.system]) { assert.equal(l.aiBadge,undefined,l.text); assert.doesNotMatch(l.text,/^State Security:/); }
});
test('appeal goes to staff: no odds, timing or promised outcome; the four states differ', () => {
  assert.match(AP.explainer.text,/staff/); for (const k of APPEAL_KEYS) assert.match(AP.states[k].text,/appeal|Correction Duty/);
  assert.match(AP.states.submitted.text,/staff review/); assert.match(AP.states.pending.text,/staff review/);
  assert.match(AP.states.upheld.text,/stands/); assert.match(AP.states.overturned.text,/lifted/);
  assert.equal(new Set(APPEAL_KEYS.map(k=>AP.states[k].text)).size,4);
  for (const k of APPEAL_KEYS) assert.doesNotMatch(AP.states[k].text,/\b(soon|quickly|within|always|never|likely)\b/i);
});
test('Correction Duty rules from the docs: repeat discoveries only, capped, a playable loop kept', () => {
  assert.match(CD.repeatOnly.text,/repeat discovery/); assert.match(CD.cap.text,/at most/); assert.match(CD.playable.text,/still play/);
});
test('does not duplicate the existing discovery notices (#322, #371)', () => {
  const dup=[UG.discovery.first.text,UG.discovery.repeat.text];
  for (const t of all()) { assert.ok(!dup.includes(t),t); assert.doesNotMatch(t,/An inspection found a shrine/); }
});
test('tone (#322, §14.6): quiet and abstract; no violence, arrest, believers named, State Media, Notable or other nations', () => {
  const t=all().join(' ');
  assert.doesNotMatch(t,/\b(arrest|prison|jail|torture|kill|blood|beat|desecrat|raid|punish|traitor|heretic)\w*/i);
  assert.doesNotMatch(t,/State Media|Notable|@/); assert.doesNotMatch(t,/\b(Kindle|Aurelle|Meridian|Ilmar|Varkand|Veldwood|Hoarvale|Fulmara|Confluence)\b/);
  assert.doesNotMatch(t,/\b(Earth|America|Europe|Russia|China)\b/);
});
test('unwired: nothing in app/, components/ or lib/ imports korund-suspicion-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components'),...walk('lib')]) if (/\.(t|j)sx?$/.test(f)&&!f.endsWith('korund-suspicion-copy.ts')) assert.doesNotMatch(readFileSync(f,'utf8'),/korund-suspicion-copy/, f);
});

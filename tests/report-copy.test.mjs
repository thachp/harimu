import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// lib/report-copy.ts has no imports: transpile it to a temporary .mjs (Node type-stripping needs extensions on imports).
const src=readFileSync('lib/report-copy.ts','utf8');
const out=join(mkdtempSync(join(tmpdir(),'report-copy-')),'report-copy.mjs');
writeFileSync(out,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const R = await import(pathToFileURL(out).href);
const { reportTargets:TG, reportTargetFor, reportHeader:HD, reportReasons:RS, reasonsFor, reportNote:NT, reportActions:AC, reportStates:ST, REPORT_TARGET_IDS, REPORT_REASON_IDS, REPORT_LABEL_MAX, REPORT_LINE_MAX } = R;

const labels=()=>[HD.title,...TG.map(x=>x.entryLabel),...RS.map(x=>x.label),NT.label,AC.submit,AC.cancel,AC.retry];
const lines=()=>[HD.line.text,...TG.map(x=>x.accessibleName),NT.placeholder.text,ST.sent.text,ST.duplicate.text,ST.failed.text];
const all=()=>[...labels(),...lines()];

test('limits: labels 40 and lines (with accessible names) 80; no placeholders anywhere', () => {
  assert.equal(REPORT_LABEL_MAX,40); assert.equal(REPORT_LINE_MAX,80);
  for (const x of labels()) assert.ok(x.length<=REPORT_LABEL_MAX,`${x} (${x.length})`);
  for (const x of lines()) assert.ok(x.length<=REPORT_LINE_MAX,`${x} (${x.length})`);
  for (const x of all()) assert.doesNotMatch(x,/\{|\}/,x);
});
test('every key is present: four targets with a label and accessible name, the shared header, six reasons, note, actions and three states; every line a proposal', () => {
  assert.deepEqual([...REPORT_TARGET_IDS],['citizen-message','ai-leader-address','ai-news','notable-reply']); assert.deepEqual(TG.map(x=>x.id),[...REPORT_TARGET_IDS]);
  assert.deepEqual([...REPORT_REASON_IDS],['real-world-politics','hate-harassment','threats-danger','sexual-content','ai-inappropriate','spam-other']); assert.deepEqual(RS.map(x=>x.id),[...REPORT_REASON_IDS]);
  for (const x of TG) { assert.equal(x.proposal,true); assert.equal(reportTargetFor(x.id),x); assert.ok(x.entryLabel.length>0&&x.accessibleName.length>0); assert.notEqual(x.entryLabel,x.accessibleName); }
  for (const x of RS) { assert.equal(x.proposal,true); assert.equal(typeof x.aiOnly,'boolean'); }
  for (const l of [HD.line,NT.placeholder,ST.sent,ST.duplicate,ST.failed]) assert.equal(l.proposal,true);
  for (const o of [HD,NT,AC,ST]) assert.equal(o.proposal,true);
  assert.equal(new Set(all().filter(x=>x!==HD.title)).size,all().length-1);
});
test('the OOC header is one constant for every nation: outside the game, not an in-game act, to Harimu moderators, in no nation\'s voice', () => {
  assert.match(HD.line.text,/Harimu moderators/); assert.match(HD.line.text,/outside the game/); assert.match(HD.line.text,/not an in-game act/); assert.match(HD.title,/Harimu moderators/);
  assert.doesNotMatch([HD.title,HD.line.text].join(' '),/\b(Kindle|Korund|Aurelle|Republic|Chairman|Crown|Assembly|Presidium|Court|State Media|citizen|comrade|realm)\b|Be it known/);
  assert.equal(Object.keys(HD).sort().join(),'line,proposal,title');
});
test('no in-game mechanics wording: no Suspicion, informing, denunciation, surveillance, Correction Duty, duty or appeal', () => {
  for (const x of all()) assert.doesNotMatch(x,/Suspicion|\binform\w*|denounc\w*|surveil\w*|Correction|\bduty\b|\bappeal\w*|\bspy\w*|\bsnitch\w*|\bclaimant\w*|\bcharge\w*|\bcase\b/i,x);
});
test('the AI-only reason is marked, is the only one, and shows for AI targets only', () => {
  assert.deepEqual(RS.filter(x=>x.aiOnly).map(x=>x.id),['ai-inappropriate']); assert.equal(RS.find(x=>x.id==='ai-inappropriate').label,'AI said something it shouldn\'t');
  assert.deepEqual(TG.filter(x=>x.aiTarget).map(x=>x.id),['ai-leader-address','ai-news','notable-reply']); assert.equal(reportTargetFor('citizen-message').aiTarget,false);
  assert.equal(reasonsFor('citizen-message').length,5); assert.equal(reasonsFor('citizen-message').some(x=>x.id==='ai-inappropriate'),false);
  for (const id of ['ai-leader-address','ai-news','notable-reply']) { assert.equal(reasonsFor(id).length,6); assert.ok(reasonsFor(id).some(x=>x.id==='ai-inappropriate')); }
  assert.deepEqual(reasonsFor('ai-news').map(x=>x.id),[...REPORT_REASON_IDS]);
});
test('reasons follow 21.1 and 21.4: real-world politics, hate or harassment, threats or personal details, sexual content, AI misbehavior, spam or other', () => {
  assert.match(RS[0].label,/Real-world politics/); assert.match(RS[1].label,/Hate or harassment/); assert.match(RS[2].label,/Threats/); assert.match(RS[2].label,/personal details/); assert.match(RS[3].label,/Sexual content/); assert.match(RS[5].label,/Spam/);
});
test('the AI targets are named as AI and the Notable reply is named only where the docs name it', () => {
  assert.match(reportTargetFor('ai-leader-address').accessibleName,/AI leader address/); assert.match(reportTargetFor('ai-news').accessibleName,/AI-written news/); assert.match(reportTargetFor('citizen-message').accessibleName,/chat message/);
  assert.match(reportTargetFor('notable-reply').accessibleName,/Notable reply/);
  for (const x of all()) if (/Notable/.test(x)) assert.equal(x,reportTargetFor('notable-reply').accessibleName);
  for (const x of TG) assert.match(x.accessibleName,/Harimu moderators/);
});
test('promises nothing: no review time, outcome, action or anonymity; no figures', () => {
  for (const x of all()) assert.doesNotMatch(x,/\d|%|\b(anonymous\w*|confidential\w*|private\w*|secret\w*|hidden)\b|\b(will be|will|within|soon|quickly|immediately|reviewed|action|punish\w*|ban\w*|remov\w*|guarantee\w*)\b/i,x);
  assert.match(ST.sent.text,/^Report sent to Harimu moderators\.$/);
});
test('result states are plain and consistent: sent, already reported, failed with a retry; the failure does not blame the player', () => {
  assert.match(ST.duplicate.text,/already reported/); assert.match(ST.failed.text,/not sent/); assert.match(ST.failed.text,/try again/i); assert.equal(AC.retry,'Try again');
  assert.doesNotMatch(ST.failed.text,/\b(you|your)\b/i); assert.equal(AC.submit,'Send report'); assert.equal(AC.cancel,'Cancel');
});
test('AI badge (#381, ui-ux 23.2): all system lines, no byline, no AI voice, no badge field', () => {
  for (const o of [HD,NT,AC,ST,...TG,...RS]) assert.equal('aiBadge' in o,false);
  for (const l of [HD.line,NT.placeholder,ST.sent,ST.duplicate,ST.failed]) assert.equal('aiBadge' in l,false);
  for (const x of all()) assert.doesNotMatch(x,/Be it known|by royal decree|State Media|Republic Wire Service|Court Gazette|Republic Wire/,x);
});
test('tone: no real-world names, places, parties or symbols, no other nations', () => {
  const x=all().join(' ');
  assert.doesNotMatch(x,/\b(Earth|America\w*|Europe\w*|England|France|Japan|China|Russia\w*|Trump|Biden|Putin)\b/);
  assert.doesNotMatch(x,/\b(Kindle|Korund|Aurelle|Meridian|Ilmar|Varkand|Veldwood|Hoarvale|Fulmara|Confluence)\b|@/);
});
test('wired only where intended: lib/reports.ts and app/report-button.tsx (#743) import report-copy, nothing else does', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  const allowed=new Set(['lib/reports.ts','app/report-button.tsx']);
  for (const f of allowed) assert.match(readFileSync(f,'utf8'),/report-copy/, f);
  for (const f of [...walk('app'),...walk('components'),...walk('lib')]) if (/\.(t|j)sx?$/.test(f)&&!f.endsWith('report-copy.ts')&&!allowed.has(f)) assert.doesNotMatch(readFileSync(f,'utf8'),/report-copy/, f);
});

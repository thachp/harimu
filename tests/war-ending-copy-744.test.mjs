import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { COUP_NAME_MAX } from '../lib/palace-coup-copy.ts';
import { PEACE_LOCK_SECONDS } from '../lib/war-rules.ts';
import { kindlePress, korundStateMedia, aurelleGazette } from '../lib/press-templates.ts';

// lib/war-ending-copy.ts re-exports the shared name cap from './palace-coup-copy' (extensionless for tsc/Next): rewrite the
// specifier and transpile, as tests/peace-copy.test.mjs does.
const src=readFileSync('lib/war-ending-copy.ts','utf8').replace("from './palace-coup-copy'",`from ${JSON.stringify(pathToFileURL(resolve('lib/palace-coup-copy.ts')).href)}`);
const out=join(mkdtempSync(join(tmpdir(),'war-ending-copy-')),'war-ending-copy.mjs');
writeFileSync(out,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const M=await import(pathToFileURL(out).href);
const { endingProposal:O, endingPending:D, endingResults:R, endingPress:PR, endingPressFor, endingBodyFor, endingRefusals:RF, endingRefusalFor, ENDING_NATIONS, ENDING_KINDS, ENDING_PRESS_EVENTS, WAR_ENDING_PLACEHOLDERS, WAR_ENDING_NAME_MAX, WAR_ENDING_LABEL_MAX, WAR_ENDING_LINE_MAX, WAR_ENDING_PEACE_LOCK_DAYS, WAR_ENDING_MAX_CEDED_SQUARES, WAR_ENDING_MIN_CEDED_SQUARES }=M;

const endingsSrc=readFileSync('lib/war-endings.ts','utf8');
const proposeSrc=endingsSrc.slice(endingsSrc.indexOf('export async function proposeWarEnding'), endingsSrc.indexOf('export async function decideWarEndings'));
/** Reasons proposeWarEnding can return, in source order, from the fail() calls. Not a hard-coded list. */
const proposeReasons=[...proposeSrc.matchAll(/fail\(\s*4\d\d,\s*'([a-z_]+)'/g)].map(m=>m[1]).filter((r,i,a)=>a.indexOf(r)===i);

const isLine=v=>!!v&&typeof v==='object'&&typeof v.text==='string'&&v.proposal===true;
const skip=new Set(['proposal','aiBadge','nationId','reason']);
const walk=(value,acc)=>{
 if(typeof value==='string') acc.labels.push(value);
 else if(isLine(value)) acc.lines.push(value);
 else if(value&&typeof value==='object') for(const [k,v] of Object.entries(value)) if(!skip.has(k)) walk(v,acc);
 return acc;
};
const bag=walk({O,D,R,PR,RF},{labels:[],lines:[]});
const labels=()=>bag.labels;
const lines=()=>bag.lines.map(l=>l.text);
const fill=t=>WAR_ENDING_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(WAR_ENDING_NAME_MAX)),t);
const pressLines=()=>PR.flatMap(x=>[...Object.values(x.report),...(x.crown?Object.values(x.crown):[])]);

test('shape: proposal, pending bodies, results and press for all three nations; every line is a proposal',()=>{
 assert.deepEqual([...ENDING_NATIONS],['kindle','korund','aurelle']);
 assert.deepEqual([...ENDING_KINDS],['surrender','concession']);
 assert.deepEqual([...ENDING_PRESS_EVENTS],['surrenderEnacted','concessionRatified','endingRejected']);
 for(const o of [O,D,R]) assert.equal(o.proposal,true);
 assert.equal(O.surrenderButton,'Propose surrender'); assert.equal(O.concessionButton,'Propose a concession');
 for(const l of [O.surrenderPrompt,O.concessionPrompt,O.squareCaption,D.status,D.surrenderScope,D.concessionScope,R.surrenderEnacted,R.surrenderRejected,R.concessionEnacted,R.concessionRejected,R.peaceLock,R.nationalControl]) assert.equal(l.proposal,true);
 for(const n of ENDING_NATIONS) for(const k of ENDING_KINDS){ const l=endingBodyFor(n,k); assert.equal(l,D[n][k]); assert.equal(l.proposal,true); assert.ok(l.text.length>0); }
 assert.deepEqual(PR.map(x=>x.nationId),[...ENDING_NATIONS]);
 for(const x of PR){
  assert.equal(x.proposal,true); assert.equal(endingPressFor(x.nationId),x);
  assert.deepEqual(Object.keys(x.headline).sort(),[...ENDING_PRESS_EVENTS].sort());
  assert.deepEqual(Object.keys(x.report).sort(),[...ENDING_PRESS_EVENTS].sort());
  for(const l of Object.values(x.report)){ assert.equal(l.proposal,true); assert.equal(typeof l.aiBadge,'boolean'); }
 }
 assert.ok(!endingPressFor('kindle').crown&&!endingPressFor('korund').crown);
 assert.deepEqual(Object.keys(endingPressFor('aurelle').crown).sort(),['concessionRatified','surrenderEnacted']);
});
test('re-exports the shared name cap; labels and headlines 40, lines 80, with every placeholder filled to 24 characters',()=>{
 assert.equal(WAR_ENDING_NAME_MAX,COUP_NAME_MAX); assert.equal(WAR_ENDING_NAME_MAX,24);
 assert.equal(WAR_ENDING_LABEL_MAX,40); assert.equal(WAR_ENDING_LINE_MAX,80);
 for(const t of labels()) assert.ok(fill(t).length<=WAR_ENDING_LABEL_MAX,`${t} (${fill(t).length})`);
 for(const t of lines()) assert.ok(fill(t).length<=WAR_ENDING_LINE_MAX,`${t} (${fill(t).length})`);
 for(const x of PR) for(const h of Object.values(x.headline)) assert.doesNotMatch(h,/\{/,'headlines are fixed text');
 for(const t of [O.surrenderButton,O.concessionButton]) assert.doesNotMatch(t,/\{/);
});
test('placeholders: only {other} and {readyAt}; {readyAt} only on the peace-lock line; press uses {other} only',()=>{
 assert.deepEqual([...WAR_ENDING_PLACEHOLDERS],['{other}','{readyAt}']);
 const all=[...labels(),...lines()];
 for(const t of all) for(const m of t.match(/\{[^}]*\}/g)??[]) assert.ok(WAR_ENDING_PLACEHOLDERS.includes(m),`${m} in ${t}`);
 assert.deepEqual(lines().filter(t=>t.includes('{readyAt}')),[R.peaceLock.text]);
 for(const l of pressLines()) assert.deepEqual(l.text.match(/\{[^}]+\}/g),['{other}'],l.text);
 for(const l of [O.surrenderPrompt,O.concessionPrompt,R.surrenderEnacted,R.surrenderRejected,R.concessionEnacted,R.concessionRejected]) assert.deepEqual(l.text.match(/\{[^}]+\}/g),['{other}']);
 assert.deepEqual(R.peaceLock.text.match(/\{[^}]+\}/g),['{readyAt}']);
});
test('figures are the code\'s own: peace-lock days, maxCededSquares, and the Kindle vote the code implements',()=>{
 assert.equal(PEACE_LOCK_SECONDS%86400,0);
 assert.equal(WAR_ENDING_PEACE_LOCK_DAYS,PEACE_LOCK_SECONDS/86400);
 assert.equal(WAR_ENDING_PEACE_LOCK_DAYS,10);
 const max=Number(endingsSrc.match(/export const maxCededSquares = (\d+)/)[1]);
 assert.equal(WAR_ENDING_MAX_CEDED_SQUARES,max);
 assert.match(endingsSrc,/value\.length < 1/);
 assert.match(endingsSrc,/Cede 1 to \$\{maxCededSquares\}/);
 assert.equal(WAR_ENDING_MIN_CEDED_SQUARES,1);
 assert.match(endingsSrc,/yes \* 2 > total/);
 assert.match(endingsSrc,/yes \* 3 >= total \* 2/);
 assert.match(endingsSrc,/stance === 'surrender' \? 'simple-majority'/);
 assert.match(endingsSrc,/'two-thirds'/);
 assert.match(endingsSrc,/kind === 'surrender' \? \[side\(proposer, 'surrender'\)\] : \[side\(proposer, 'cede'\), side\(other, 'receive'\)\]/);
 assert.match(readFileSync('lib/diplomacy-rules.ts','utf8'),/nation === 'korund' \? 'Chairman' : 'Crown'/);
 assert.match(R.peaceLock.text,new RegExp(`\\b${WAR_ENDING_PEACE_LOCK_DAYS} real days\\b`));
 assert.match(O.squareCaption.text,new RegExp(`\\b${WAR_ENDING_MIN_CEDED_SQUARES} to ${WAR_ENDING_MAX_CEDED_SQUARES}\\b`));
 assert.match(endingRefusalFor('bad_squares').line.text,new RegExp(`\\b${WAR_ENDING_MIN_CEDED_SQUARES} to ${WAR_ENDING_MAX_CEDED_SQUARES}\\b`));
 assert.match(D.kindle.surrender.text,/simple majority/); assert.match(D.kindle.surrender.text,/more than half/);
 assert.match(D.kindle.concession.text,/at least two-thirds/);
 assert.match(D.surrenderScope.text,/surrendering nation alone/); assert.match(D.concessionScope.text,/both nations/);
 assert.match(D.kindle.surrender.text,/Assembly/); assert.match(D.korund.surrender.text,/Chairman/); assert.match(D.aurelle.surrender.text,/Crown/);
 const range=`${WAR_ENDING_MIN_CEDED_SQUARES} to ${WAR_ENDING_MAX_CEDED_SQUARES}`;
 const lock=`${WAR_ENDING_PEACE_LOCK_DAYS} real days`;
 for(const t of [...labels(),...lines()]){
  const bare=t.replaceAll(range,'').replaceAll(lock,'').replaceAll('two-thirds','');
  assert.doesNotMatch(bare,/\d|%|percent|\b(one|two|three|four|five|six|seven|eight|nine|ten|dozen|days?|weeks?|hours?)\b/i,t);
 }
});
test('every refusal reason proposeWarEnding returns has one line, enumerated from lib/war-endings.ts',()=>{
 assert.ok(proposeReasons.length>=8,proposeReasons.join(','));
 assert.deepEqual(RF.map(x=>x.reason),proposeReasons);
 for(const reason of proposeReasons){
  const hit=RF.filter(x=>x.reason===reason);
  assert.equal(hit.length,1,reason);
  assert.equal(endingRefusalFor(reason),hit[0]);
  assert.equal(hit[0].proposal,true); assert.equal(hit[0].line.proposal,true);
  assert.match(hit[0].line.text,/^Refused\. /,hit[0].line.text);
  assert.equal('aiBadge' in hit[0].line,false);
 }
 assert.equal(endingRefusalFor('not_ratified'),undefined);
 assert.equal(endingRefusalFor('stale'),undefined);
 for(const t of lines()) assert.doesNotMatch(t,/\b(bad_request|bad_squares|not_found|war_ended|not_a_party|square_not_cedable|ending_pending|request_reused)\b/,t);
});
test('Decision 109: no compensation, and no line says private title changes hands',()=>{
 for(const t of lines()){
  assert.doesNotMatch(t,/compensat|reparation|indemnit|tribute|buyout|relocation|demilitari|\bpay(?:ment|s|ing)?\b|\bpaid\b|\brefund\b|\bdamages\b/i,t);
  assert.doesNotMatch(t,/changes hands|change hands|title (?:passes|transfers|is transferred|is ceded|is lost)/i,t);
  assert.doesNotMatch(t,/private (?:land|title|squares?) (?:is |are |was |were )?(?:ceded|transferred|lost|given|passed|moved)/i,t);
 }
 assert.match(O.squareCaption.text,/Only Frontier squares your nation governs/);
 assert.match(O.squareCaption.text,/never privately owned/);
 assert.match(endingRefusalFor('square_not_cedable').line.text,/Only Frontier squares your nation governs, never privately owned/);
 assert.match(R.nationalControl.text,/national control only/);
 assert.match(R.nationalControl.text,/Private title stays with its owner/);
 assert.match(R.peaceLock.text,/after enactment/);
 assert.match(R.surrenderEnacted.text,/war with \{other\} is over/);
 assert.match(R.concessionRejected.text,/goes on/);
});
test('bylines match the press packs; AI badge on Crown "Be it known" lines and Korund State Media lines (#381)',()=>{
 assert.deepEqual(endingPressFor('kindle').byline,kindlePress.byline);
 assert.deepEqual(endingPressFor('korund').byline,korundStateMedia.byline);
 assert.deepEqual(endingPressFor('aurelle').byline,aurelleGazette.byline);
 for(const x of PR){
  for(const l of Object.values(x.report)){ assert.equal(l.aiBadge,x.nationId==='korund'); assert.doesNotMatch(l.text,/Be it known/); }
  if(x.crown) for(const l of Object.values(x.crown)){ assert.equal(l.aiBadge,true); assert.match(l.text,/^Be it known/); }
 }
 assert.match(endingPressFor('korund').report.surrenderEnacted.text,/^State Media:/);
 assert.match(endingPressFor('aurelle').report.concessionRatified.text,/^Court Gazette:/);
 assert.doesNotMatch(endingPressFor('kindle').report.surrenderEnacted.text,/State Media|Gazette|Be it known/);
});
test('voices stay distinct; nothing glorifies the ending or names a real-world power',()=>{
 const t=lines().join(' ');
 assert.doesNotMatch(t,/Notable|\b(Earth|America|Russia|China|Versailles|Geneva|NATO|UN)\b/);
 assert.doesNotMatch(t,/\b(victory|triumph|glory|crush|revenge|enemy|punish)\b/i);
 assert.doesNotMatch(endingPressFor('korund').report.endingRejected.text,/weari|defeat|Chairman refused/i);
 assert.match(D.status.text,/awaits ratification/);
});
test('unwired: nothing in app/, components/ or lib/ imports war-ending-copy',()=>{
 const walkDir=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walkDir(p):[p];}); } catch { return []; } };
 for(const f of [...walkDir('app'),...walkDir('components'),...walkDir('lib')]) if(/\.(t|j)sx?$/.test(f)&&!f.endsWith('war-ending-copy.ts')) assert.doesNotMatch(readFileSync(f,'utf8'),/war-ending-copy/,f);
});

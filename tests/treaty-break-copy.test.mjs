import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { COUP_NAME_MAX } from '../lib/palace-coup-copy.ts';
import { kindlePress, korundStateMedia, aurelleGazette } from '../lib/press-templates.ts';

// lib/treaty-break-copy.ts re-exports the shared name cap from './palace-coup-copy' (extensionless for tsc/Next):
// rewrite the specifier and transpile, as tests/war-copy.test.mjs does.
const src=readFileSync('lib/treaty-break-copy.ts','utf8').replace("from './palace-coup-copy'",`from ${JSON.stringify(pathToFileURL(resolve('lib/palace-coup-copy.ts')).href)}`);
const out=join(mkdtempSync(join(tmpdir(),'treaty-break-copy-')),'treaty-break-copy.mjs');
writeFileSync(out,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const T = await import(pathToFileURL(out).href);
const { treatyBreak:TB, breakCost:BC, napBlocked:NB, breakNews:BN, breakNewsFor, brokenPactRumors:RU, BREAK_FAILURE_KEYS, BREAK_NATIONS, BREAK_FRAMINGS, NAP_BLOCK_REASON, TREATY_BREAK_PLACEHOLDERS, TREATY_BREAK_NAME_MAX, TREATY_BREAK_LABEL_MAX, TREATY_BREAK_LINE_MAX, TREATY_BREAK_BODY_MAX } = T;

const news=()=>BN.flatMap(n=>BREAK_FRAMINGS.map(f=>({nation:n.nationId,framing:f,n:n.notices[f]})));
const labels=()=>[TB.label,BC.label,NB.label,...news().map(x=>x.n.headline)];
const lines=()=>[...TB.success,...BREAK_FAILURE_KEYS.map(k=>TB.failures[k]),BC.words,BC.amounts,...NB.lines,...RU].map(l=>l.text);
const bodies=()=>news().map(x=>x.n.body);
const all=()=>[...labels(),...lines(),...bodies()];
const fill=t=>TREATY_BREAK_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(TREATY_BREAK_NAME_MAX)),t);

test('shared name cap re-exported; limits 40/80/140; placeholder set', () => {
  assert.equal(TREATY_BREAK_NAME_MAX,COUP_NAME_MAX); assert.equal(TREATY_BREAK_LABEL_MAX,40); assert.equal(TREATY_BREAK_LINE_MAX,80); assert.equal(TREATY_BREAK_BODY_MAX,140);
  assert.deepEqual([...TREATY_BREAK_PLACEHOLDERS],['{breaker}','{other}','{nation}','{treaty}','{legitimacy}','{reputation}']);
});
test('failure keys and the NAP reason mirror the server (lib/diplomacy.ts breakTreaty, lib/war.ts)', () => {
  const dip=readFileSync('lib/diplomacy.ts','utf8'), war=readFileSync('lib/war.ts','utf8');
  const body=dip.slice(dip.indexOf('export async function breakTreaty'),dip.indexOf('export async function runAiTreatyProposals'));
  const reasons=[...body.matchAll(/fail\(\d+, '([a-z_]+)'/g)].map(m=>m[1]);
  assert.deepEqual([...new Set(reasons)].sort(),[...BREAK_FAILURE_KEYS].sort());
  assert.deepEqual(Object.keys(TB.failures).sort(),[...BREAK_FAILURE_KEYS].sort());
  assert.match(war,new RegExp(`${NAP_BLOCK_REASON}:`)); assert.equal(NB.reason,NAP_BLOCK_REASON); assert.equal(NAP_BLOCK_REASON,'non_aggression');
});
test('every key is present: success, five failures, cost, refusal, two framings for each nation, rumors; every line is a proposal', () => {
  assert.equal(TB.success.length,2); assert.equal(NB.lines.length,2); assert.equal(RU.length,2);
  assert.deepEqual([...BREAK_NATIONS],['kindle','korund','aurelle']); assert.deepEqual([...BREAK_FRAMINGS],['own','other']);
  assert.deepEqual(BN.map(x=>x.nationId),[...BREAK_NATIONS]); for (const n of BN) { assert.equal(n.proposal,true); assert.deepEqual(Object.keys(n.notices).sort(),['other','own']); assert.equal(breakNewsFor(n.nationId),n); }
  for (const l of [...TB.success,...BREAK_FAILURE_KEYS.map(k=>TB.failures[k]),BC.words,BC.amounts,...NB.lines]) assert.equal(l.proposal,true);
  for (const x of news()) { assert.equal(x.n.proposal,true); assert.equal(typeof x.n.aiBadge,'boolean'); assert.ok(x.n.id.startsWith(x.nation)); }
  for (const o of [TB,BC,NB]) assert.equal(o.proposal,true); for (const x of RU) { assert.equal(x.proposal,true); assert.equal(x.rumor,true); }
  assert.equal(news().length,6); assert.equal(new Set(lines()).size,lines().length); assert.equal(new Set(bodies()).size,6);
});
test('limits: labels and headlines 40, lines 80, news bodies 140, with every placeholder filled to 24 characters', () => {
  for (const t of labels()) assert.ok(fill(t).length<=TREATY_BREAK_LABEL_MAX,`${t} (${fill(t).length})`);
  for (const t of lines()) assert.ok(fill(t).length<=TREATY_BREAK_LINE_MAX,`${t} (${fill(t).length})`);
  for (const t of bodies()) assert.ok(fill(t).length<=TREATY_BREAK_BODY_MAX,`${t} (${fill(t).length})`);
});
test('only known placeholders, in the right lines', () => {
  for (const t of all()) for (const m of t.match(/\{[^}]*\}/g)??[]) assert.ok(TREATY_BREAK_PLACEHOLDERS.includes(m),`${m} in ${t}`);
  for (const l of TB.success) { assert.match(l.text,/\{breaker\}/); assert.match(l.text,/\{treaty\}/); }
  assert.match(BC.amounts.text,/\{legitimacy\}/); assert.match(BC.amounts.text,/\{reputation\}/); assert.doesNotMatch(BC.words.text,/\{/);
  for (const l of NB.lines) assert.match(l.text,/\{nation\}/);
  for (const k of BREAK_FAILURE_KEYS) assert.doesNotMatch(TB.failures[k].text,/\{/);
  for (const x of news()) assert.match(x.n.body,x.framing==='own'?/\{other\}/:/\{breaker\}/,x.n.id);
  for (const l of RU) assert.doesNotMatch(l.text,/\{/);
});
test('no numbers: no digits, number words or percent; the cost is named in words and amounts only through placeholders', () => {
  for (const t of all()) assert.doesNotMatch(t.replace(/\{[^}]*\}/g,''),/\d|%|percent|\b(one|two|three|four|five|six|ten|twice|once|half)\b|\b(hours?|days?|weeks?|months?|years?)\b|\bcap(ped)?\b/i,t);
  assert.match(BC.words.text,/Legitimacy and global Reputation/); assert.equal(BC.amounts.text.replace(/\{[^}]*\}/g,'').includes(':'),true);
  assert.match(breakNewsFor('kindle').notices.own.body,/Legitimacy and global Reputation/);
  for (const t of all()) if (/Legitimacy|Reputation/.test(t)) assert.match(t,/costs?|Cost/,t);
});
test('the cost is named only for a pact (§13.2): no trade-agreement cost, no cost in the failure or refusal lines', () => {
  for (const l of [...TB.success,...BREAK_FAILURE_KEYS.map(k=>TB.failures[k]),...NB.lines]) assert.doesNotMatch(l.text,/Legitimacy|Reputation/,l.text);
  assert.match(BC.words.text,/pact/); for (const x of news()) assert.match(x.n.body,/pact/,x.n.id);
});
test('NAP refusal names the counterpart, says a pact is in force and says no war; failures say what to do, never blame an official', () => {
  for (const l of NB.lines) { assert.match(l.text,/non-aggression pact/); assert.match(l.text,/\{nation\}/); }
  assert.match(NB.lines[0].text,/in force/); assert.match(NB.lines[1].text,/bars a declaration/);
  assert.match(TB.failures.not_in_force.text,/not in force/); assert.match(TB.failures.not_signatory.text,/signed/); assert.match(TB.failures.disabled.text,/not open yet/);
  for (const t of lines()) assert.doesNotMatch(t,/\b(Chairman|Crown|Assembly|President|Monarch|clerk|official)\b/,t);
});
test('voices: Kindle frank and names the Legitimacy hit; Korund calls its own break a necessary correction; Aurelle cites the Crown\'s honor', () => {
  assert.match(breakNewsFor('kindle').notices.own.body,/^Republic Wire Service: /); assert.match(breakNewsFor('kindle').notices.other.body,/^Republic Wire Service: /);
  assert.match(breakNewsFor('korund').notices.own.body,/necessary correction/); assert.equal(breakNewsFor('korund').notices.own.headline,'A necessary correction');
  assert.match(breakNewsFor('korund').notices.own.body,/^Korund State Media reports: /); assert.match(breakNewsFor('korund').notices.other.body,/^Korund State Media reports: /);
  assert.match(breakNewsFor('aurelle').notices.own.body,/honor of the realm/); assert.match(breakNewsFor('aurelle').notices.other.body,/^The Court Gazette reports that /);
});
test('AI badge (#381, ui-ux 23.2): the Chairman\'s and the Crown\'s own breaks are badged; Kindle, the other-side reports, system lines and rumors are not', () => {
  for (const x of news()) {
    const expected=x.framing==='own'&&x.nation!=='kindle';
    assert.equal(x.n.aiBadge,expected,x.n.id);
    if (/^Be it known/.test(x.n.body)) assert.equal(x.n.aiBadge,true);
  }
  assert.match(breakNewsFor('korund').notices.own.body,/the Chairman/); assert.match(breakNewsFor('aurelle').notices.own.body,/^Be it known/);
  for (const o of [TB,BC,NB]) assert.equal('aiBadge' in o,false); for (const l of [...TB.success,...BREAK_FAILURE_KEYS.map(k=>TB.failures[k]),BC.words,BC.amounts,...NB.lines]) assert.equal('aiBadge' in l,false);
  for (const x of RU) { assert.equal(x.aiBadge,false); assert.match(x.text,/[Rr]umor/); assert.match(x.text,/rumor|Rumor/); assert.doesNotMatch(x.text,/Be it known|decree|Chairman|Crown|Presidium/); }
});
test('bylines match lib/press-templates.ts', () => {
  const by=Object.fromEntries(BN.map(n=>[n.nationId,n.byline]));
  assert.deepEqual(by.kindle,kindlePress.byline); assert.deepEqual(by.korund,korundStateMedia.byline); assert.deepEqual(by.aurelle,aurelleGazette.byline);
});
test('does not repeat the existing lines in lib/diplomacy-copy.ts or lib/war-copy.ts', () => {
  const dip=readFileSync('lib/diplomacy-copy.ts','utf8'), war=readFileSync('lib/war-copy.ts','utf8');
  for (const t of lines()) { assert.ok(!dip.includes(`'${t}'`),t); assert.ok(!war.includes(`'${t}'`),t); }
});
test('tone: no violence or glory, no Notable, no other nations, no real-world reference', () => {
  const t=all().join(' ');
  assert.doesNotMatch(t,/\b(kill\w*|blood|betray\w*|traitor\w*|treacher\w*|revenge|glor\w*)\b/i);
  assert.doesNotMatch(t,/Notable|@|\b(Meridian|Ilmar|Varkand|Veldwood|Hoarvale|Fulmara|Confluence)\b/);
  assert.doesNotMatch(t,/\b(Earth|America|Europe|England|France|Japan|China|Russia)\b/);
});
test('unwired: nothing in app/, components/ or lib/ imports treaty-break-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components'),...walk('lib')]) if (/\.(t|j)sx?$/.test(f)&&!f.endsWith('treaty-break-copy.ts')) assert.doesNotMatch(readFileSync(f,'utf8'),/treaty-break-copy/, f);
});

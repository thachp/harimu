import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { COUP_NAME_MAX } from '../lib/palace-coup-copy.ts';

// lib/war-refusal-copy.ts re-exports the shared name cap from './palace-coup-copy' (extensionless for tsc/Next):
// rewrite the specifier and transpile, as tests/war-copy.test.mjs does.
const src=readFileSync('lib/war-refusal-copy.ts','utf8').replace("from './palace-coup-copy'",`from ${JSON.stringify(pathToFileURL(resolve('lib/palace-coup-copy.ts')).href)}`);
const out=join(mkdtempSync(join(tmpdir(),'war-refusal-copy-')),'war-refusal-copy.mjs');
writeFileSync(out,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const R = await import(pathToFileURL(out).href);
const { declarationRefusals:DR, refusalFor, mobilizationCountdown:MC, mobilizationCountdownLabel:ML, REFUSAL_KEYS, REFUSAL_NATIONS, REFUSAL_PLACEHOLDERS, REFUSAL_NAME_MAX, REFUSAL_LABEL_MAX, REFUSAL_CAPTION_MAX, REFUSAL_LINE_MAX, ACTIVE_OFFENSIVE_WARS_MAX, MOBILIZATION_HOURS } = R;

const labels=()=>[...DR.map(x=>x.label),ML.text];
const refusalLines=()=>DR.flatMap(x=>x.lines.map(l=>l.text));
const captions=()=>REFUSAL_NATIONS.map(n=>MC[n].text);
const all=()=>[...labels(),...refusalLines(),...captions()];
const fill=t=>REFUSAL_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(REFUSAL_NAME_MAX)),t);

test('shared name cap re-exported; limits 40/80/140; placeholders; the docs figures', () => {
  assert.equal(REFUSAL_NAME_MAX,COUP_NAME_MAX); assert.equal(REFUSAL_LABEL_MAX,40); assert.equal(REFUSAL_CAPTION_MAX,80); assert.equal(REFUSAL_LINE_MAX,140);
  assert.deepEqual([...REFUSAL_PLACEHOLDERS],['{endsAt}','{nextAt}','{days}']);
  assert.equal('OFFENSIVE_WAR_INTERVAL_DAYS' in R,false); assert.equal(ACTIVE_OFFENSIVE_WARS_MAX,2); assert.equal(MOBILIZATION_HOURS,48);
});
test('every key is present: three refusals with two variants each, a countdown caption per nation; every line is a proposal', () => {
  assert.deepEqual([...REFUSAL_KEYS],['rate_limit','active_war_cap','casus_belli']); assert.deepEqual(DR.map(x=>x.key),[...REFUSAL_KEYS]);
  for (const x of DR) { assert.equal(x.proposal,true); assert.equal(x.lines.length,2); assert.equal(refusalFor(x.key),x); for (const l of x.lines) assert.equal(l.proposal,true); }
  assert.deepEqual([...REFUSAL_NATIONS],['kindle','korund','aurelle']); assert.deepEqual(Object.keys(MC).sort(),['aurelle','kindle','korund']);
  for (const n of REFUSAL_NATIONS) assert.equal(MC[n].proposal,true); assert.equal(ML.proposal,true);
  assert.equal(new Set(refusalLines()).size,6); assert.equal(new Set(captions()).size,3);
});
test('limits: labels 40, countdown captions 80, refusal lines 140, with every placeholder filled to 24 characters', () => {
  for (const t of labels()) assert.ok(fill(t).length<=REFUSAL_LABEL_MAX,`${t} (${fill(t).length})`);
  for (const t of captions()) assert.ok(fill(t).length<=REFUSAL_CAPTION_MAX,`${t} (${fill(t).length})`);
  for (const t of refusalLines()) assert.ok(fill(t).length<=REFUSAL_LINE_MAX,`${t} (${fill(t).length})`);
});
test('only known placeholders, in the right lines', () => {
  for (const t of all()) for (const m of t.match(/\{[^}]*\}/g)??[]) assert.ok(REFUSAL_PLACEHOLDERS.includes(m),`${m} in ${t}`);
  assert.match(refusalFor('rate_limit').lines[1].text,/\{nextAt\}/); assert.match(refusalFor('rate_limit').lines[0].text,/every \{days\}\.$/); for (const n of REFUSAL_NATIONS) assert.match(MC[n].text,/\{endsAt\}/);
  for (const t of [...refusalFor('active_war_cap').lines,...refusalFor('casus_belli').lines].map(l=>l.text)) assert.doesNotMatch(t,/\{/,t);
  for (const t of labels()) assert.doesNotMatch(t,/\{/,t);
});
test('{days} is a pre-formatted string that carries its unit, so the line reads right for one day and for many; the line itself writes no unit', () => {
  const line=refusalFor('rate_limit').lines[0].text;
  assert.doesNotMatch(line.replace('{days}',''),/\breal days?\b|\bdays?\b/i);
  for (const [days,expected] of [['1 real day','every 1 real day.'],['14 real days','every 14 real days.']]) assert.ok(line.replace('{days}',days).endsWith(expected),days);
  assert.ok(!line.replace('{days}','1 real day').includes('1 real days'));
});
test('figures: only the docs\' 1 and 2 (rate limits), and the interval is the {days} placeholder; no other digits or number words anywhere', () => {
  assert.match(refusalFor('rate_limit').lines[0].text,/at most 1 new offensive war every \{days\}\.$/); assert.match(refusalFor('active_war_cap').lines[0].text,/at most 2 active offensive wars/);
  for (const t of all()) { const bare=t.replace(/\{[^}]*\}/g,'').replace(/\bat most 1 new\b|\bat most 2 active\b|\balready has 2 active\b/g,''); assert.doesNotMatch(bare,/\d|%|percent|\b(one|two|three|four|five|six|seven|ten|twice|once|half)\b|\b(hours?|weeks?|months?|years?)\b/i,t); }
  for (const t of captions()) assert.doesNotMatch(t.replace(/\{[^}]*\}/g,''),/\d/,t);
});
test('refusals give reasons, not threats; the casus belli line names no score or threshold; the rate limit is not blamed on anyone', () => {
  for (const t of refusalLines()) { assert.match(t,/^The declaration was not made\. /,t); assert.doesNotMatch(t,/\b(will|must|or else|punish\w*|retaliat\w*|revenge|threat\w*|warn\w*|you)\b/i,t); }
  for (const t of refusalFor('casus_belli').lines.map(l=>l.text)) assert.doesNotMatch(t,/score|threshold|model|\bAI\b|\d/i,t);
  for (const t of refusalLines()) assert.doesNotMatch(t,/\b(Chairman|Crown|Assembly|Cabinet|President|Presidium|Monarch|official)\b/,t);
});
test('does not repeat refusals owned elsewhere: no Founding Period, non-aggression or peace lock, no treaty-break wording, and no line duplicated from the war copy', () => {
  for (const t of refusalLines()) assert.doesNotMatch(t,/Founding|non-aggression|pact|peace|treaty|ceasefire|\bbreak|\bbroke/i,t);
  const war=readFileSync('lib/war-copy.ts','utf8'), brk=readFileSync('lib/treaty-break-copy.ts','utf8');
  for (const t of [...refusalLines(),...captions()]) { assert.ok(!war.includes(t),t); assert.ok(!brk.includes(t),t); }
});
test('countdown captions: each nation has its own, system captions with no byline, officials or badge; no weakness for Korund; Aurelle formal', () => {
  for (const t of captions()) { assert.doesNotMatch(t,/Republic Wire|State Media|Court Gazette|Be it known|Chairman|Crown|Assembly/,t); assert.match(t,/before then|before \{endsAt\}/); }
  assert.match(MC.kindle.text,/^The Republic is mobilizing\./); assert.match(MC.korund.text,/^Brigades hold the plan/); assert.match(MC.aurelle.text,/^The realm musters/);
  assert.doesNotMatch(MC.korund.text,/weari|weary|tired|doubt|fear|afraid/i);
});
test('AI badge (#381, ui-ux 23.2): every line is a system line, so none is badged and none carries an aiBadge field', () => {
  for (const x of DR) { assert.equal('aiBadge' in x,false); for (const l of x.lines) assert.equal('aiBadge' in l,false); }
  for (const n of REFUSAL_NATIONS) assert.equal('aiBadge' in MC[n],false); assert.equal('aiBadge' in ML,false);
  for (const t of all()) assert.doesNotMatch(t,/Be it known|by royal decree|State Media|Republic Wire Service|Court Gazette/,t);
});
test('tone: nothing glorifies war; no violence, no real-world names, no Notable, no other nations', () => {
  const t=all().join(' ');
  assert.doesNotMatch(t,/\b(kill\w*|blood|glor\w*|victor\w*|conquer\w*|crush\w*|army|armies|battle\w*|casualt\w*|loot\w*)\b/i);
  assert.doesNotMatch(t,/Notable|@|\b(Meridian|Ilmar|Varkand|Veldwood|Hoarvale|Fulmara|Confluence)\b/);
  assert.doesNotMatch(t,/\b(Earth|America|Europe|England|France|Japan|China|Russia)\b/);
});
test('unwired: nothing in app/, components/ or lib/ imports war-refusal-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components'),...walk('lib')]) if (/\.(t|j)sx?$/.test(f)&&!f.endsWith('war-refusal-copy.ts')) assert.doesNotMatch(readFileSync(f,'utf8'),/war-refusal-copy/, f);
});

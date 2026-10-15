import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { COUP_NAME_MAX } from '../lib/palace-coup-copy.ts';

// The module re-exports the shared name cap from './palace-coup-copy' (extensionless for tsc/Next): rewrite the specifier and transpile.
const src=readFileSync('lib/wellbeing-break-copy.ts','utf8').replace("from './palace-coup-copy'",`from ${JSON.stringify(pathToFileURL(resolve('lib/palace-coup-copy.ts')).href)}`);
const out=join(mkdtempSync(join(tmpdir(),'wellbeing-break-copy-')),'wellbeing-break-copy.mjs');
writeFileSync(out,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const W = await import(pathToFileURL(out).href);
const { breakSettings:S, breakReminder:R, breakLimitNotice:N, breakReassurance:A, BREAK_NAME_MAX, BREAK_PLACEHOLDERS, BREAK_LABEL_MAX, BREAK_LINE_MAX, BREAK_BODY_MAX } = W;

const labels=()=>[S.sessionReminder.label,S.intervalLabel,S.timeLimit.label,S.limitLabel,R.title,R.actions.keepPlaying,R.actions.takeBreak,N.title,N.actions.keepPlaying,N.actions.takeBreak];
const lines=()=>[S.sessionReminder.help.text,S.timeLimit.help.text,N.body.text,N.settingsNote.text,A.identity.text];
const bodies=()=>[...R.bodies.map(b=>b.text),A.absence.text,A.protection.text];
const all=()=>[...labels(),...lines(),...bodies()];
const fill=t=>BREAK_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(BREAK_NAME_MAX)),t);

test('shared name cap re-exported; limits 40/80/140; the two placeholders', () => {
  assert.equal(BREAK_NAME_MAX,COUP_NAME_MAX); assert.equal(BREAK_LABEL_MAX,40); assert.equal(BREAK_LINE_MAX,80); assert.equal(BREAK_BODY_MAX,140);
  assert.deepEqual([...BREAK_PLACEHOLDERS],['{interval}','{limit}']);
});
test('exports every #537 item: settings labels and help, the reminder (title, 3 to 5 bodies, two actions), the limit notice with the settings note, the reassurance; all proposal true', () => {
  assert.ok(R.bodies.length>=3&&R.bodies.length<=5); assert.equal(R.actions.keepPlaying,'Keep playing'); assert.equal(R.actions.takeBreak,'Take a break');
  assert.deepEqual(N.actions,R.actions); assert.match(N.settingsNote.text,/change your limit in settings/);
  assert.match(S.intervalLabel,/\{interval\}/); assert.match(S.limitLabel,/\{limit\}/);
  for (const l of [S.sessionReminder.help,S.timeLimit.help,N.body,N.settingsNote,A.identity,A.absence,A.protection,...R.bodies]) assert.equal(l.proposal,true); for (const o of [S,R,N,A]) assert.equal(o.proposal,true);
  assert.equal(new Set([...lines(),...bodies()]).size,lines().length+bodies().length);
});
test('limits with placeholders filled to 24 characters', () => {
  for (const t of labels()) assert.ok(fill(t).length<=BREAK_LABEL_MAX,`${t} (${fill(t).length})`);
  for (const t of lines()) assert.ok(fill(t).length<=BREAK_LINE_MAX,`${t} (${fill(t).length})`);
  for (const t of bodies()) assert.ok(fill(t).length<=BREAK_BODY_MAX,`${t} (${fill(t).length})`);
});
test('only {interval} in the interval label and {limit} in the limit label', () => {
  for (const t of all()) for (const m of t.match(/\{[^}]*\}/g)??[]) assert.ok(BREAK_PLACEHOLDERS.includes(m),`${m} in ${t}`);
  for (const t of all().filter(x=>x!==S.intervalLabel&&x!==S.limitLabel)) assert.doesNotMatch(t,/\{/,t);
});
test('no digits and no number words: intervals and limits arrive only through placeholders', () => {
  for (const t of all()) assert.doesNotMatch(t.replace(/\{[^}]*\}/g,''),/\d|%|\b(one|two|three|four|five|six|seven|ten|twice|once|half|hours?|minutes?|days?|weeks?)\b/i,t);
});
test('no pressure and no fear of missing out: no streaks, urgency, guilt, rewards for staying or counts of time played', () => {
  for (const t of all()) { assert.doesNotMatch(t,/\b(streaks?|don'?t miss|miss out|missing out|hurry|last chance|before it'?s too late|while you can|daily bonus|bonus|reward\w*|catch up|falling behind|fall behind|keep your|must|should|need to|have to)\b/i,t); assert.doesNotMatch(t,/!/,t); }
  for (const t of [...R.bodies.map(b=>b.text),N.body.text]) assert.doesNotMatch(t,/too much|addict\w*|waste\w*|lazy|guilt\w*|unhealthy|problem\w*|worried|concerned/i,t);
});
test('no clinical or health claims, no promise beyond the docs: nothing on treatment, wellbeing scores, monitoring or what the game tracks', () => {
  for (const t of all()) { assert.doesNotMatch(t,/\b(therap\w*|diagnos\w*|treatment|disorder|mental health|anxiety|depress\w*|stress\w*|sleep\w*|doctor|medical|clinical|healthy|health)\b/i,t); assert.doesNotMatch(t,/\b(track\w*|monitor\w*|measure\w*|score\w*|data|logged|we notice|we can see|we know|guarantee\w*|promise\w*|always|never|forever)\b/i,t); }
});
test('the reassurance stays inside the wellbeing page: identity kept, absence not punished, offline players protected (small balances, inflation)', () => {
  assert.match(A.identity.text,/without losing your identity/); assert.match(A.absence.text,/does not punish you for being away/); assert.match(A.protection.text,/Offline players are protected/); assert.match(A.protection.text,/small balances get some inflation protection/);
  for (const t of [A.identity.text,A.absence.text,A.protection.text]) assert.doesNotMatch(t,/savings|home|house|property|wallet|rank|office|job|progress|nothing (is|will be) lost/i,t);
  assert.doesNotMatch(A.protection.text,/shield\w*|fully|completely|all of|safe/i);
});
test('one neutral system voice: no byline, no AI badge, no nation, leader or outlet voice, no real-world references', () => {
  for (const o of [S,R,N,A]) { assert.equal('aiBadge' in o,false); assert.equal('byline' in o,false); }
  for (const t of all()) { assert.doesNotMatch(t,/Republic Wire|State Media|Court Gazette|Be it known|Chairman|Crown|President|Kindle|Korund|Aurelle|AI-generated|AI character|Notable|@/,t); assert.doesNotMatch(t,/\b(Earth|America\w*|Europe\w*|England|France|Japan|China|Russia|Tessera|NFT|on-chain)\b/,t); }
});
test('unwired: nothing in app/, components/ or lib/ imports wellbeing-break-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components'),...walk('lib')]) if (/\.(t|j)sx?$/.test(f)&&!f.endsWith('wellbeing-break-copy.ts')) assert.doesNotMatch(readFileSync(f,'utf8'),/wellbeing-break-copy/, f);
});

test('no continuity promise anywhere in the reminders: the citizen ages and may be succeeded by an heir, and the savings shield is partial, so no body or notice says the citizen, home or savings stay as they are', () => {
  for (const t of [...R.bodies.map(b=>b.text),N.body.text,N.settingsNote.text,A.identity.text,A.absence.text,A.protection.text]) assert.doesNotMatch(t,/\b(citizen|citizens|savings|home|house|property|wallet|balance|balances|account|progress|rank|office|job|heir|character|will be waiting|waiting for you|be there when|stay as|stays as|as you left|where you left|nothing (is|will be) lost|nothing changes|keeps? (your|everything)|safe)\b/i,t);
  assert.ok(R.bodies.some(b=>b.text==='Take a break if you would like to. There is no pressure to stay.'));
});

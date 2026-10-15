import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { mayoralBallotCopy as B, instantRunoffExplainer as X, recallCopy as R, MAYORAL_NAME_MAX, MAYORAL_NUMBER_MAX, MAYORAL_LABEL_MAX, MAYORAL_LINE_MAX, MAYORAL_PLACEHOLDERS } from '../lib/mayoral-recall-copy.ts';

const labels=()=>[B.title,B.submitButton,B.candidateChip,X.title,R.title,R.startButton,R.signButton,R.progress,R.voteTitle,R.keepOption,R.recallOption];
const lineObjs=()=>[B.whoRuns,B.whoVotes,B.oneBallot,B.instructions,B.submitConfirm,B.submitted,B.notEligible,B.termNote,B.result,...X.lines,R.about,R.whoSigns,R.signed,R.reached,R.votePrompt,R.stays,R.recalled,R.aiNote];
const lines=()=>lineObjs().map(l=>l.text);
const all=()=>[...labels(),...lines()];
const NUM=['{terms}','{signed}','{needed}'];
const fill=t=>MAYORAL_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(NUM.includes(p)?MAYORAL_NUMBER_MAX:MAYORAL_NAME_MAX)),t);

test('shape: ballot chrome, a three-line instant-runoff explainer and the recall petition and vote; every line proposal and distinct', () => {
  for (const o of [B,X,R]) assert.equal(o.proposal,true);
  for (const l of lineObjs()) { assert.equal(l.proposal,true); assert.ok(l.text.length>0); }
  assert.equal(X.lines.length,3);
  assert.equal(new Set(all()).size,all().length);
  assert.equal(B.submitButton,'Submit ranking'); assert.equal(B.title,'Mayor of {city}'); assert.equal(R.progress,'{signed} of {needed} signatures');
});
test('limits: local caps 24 and 6, labels 40, lines 100, with {city} and {name} filled to 24 and the numbers to six characters', () => {
  assert.equal(MAYORAL_NAME_MAX,24); assert.equal(MAYORAL_NUMBER_MAX,6); assert.equal(MAYORAL_LABEL_MAX,40); assert.equal(MAYORAL_LINE_MAX,100);
  for (const t of labels()) assert.ok(fill(t).length<=MAYORAL_LABEL_MAX, `${t} (${fill(t).length})`);
  for (const t of lines()) assert.ok(fill(t).length<=MAYORAL_LINE_MAX, `${t} (${fill(t).length})`);
});
test('placeholders: only {city}, {name}, {terms}, {signed} and {needed}, each used, and the figures only through placeholders', () => {
  assert.deepEqual([...MAYORAL_PLACEHOLDERS],['{city}','{name}','{terms}','{signed}','{needed}']);
  const t=all().join(' ');
  for (const m of t.matchAll(/\{[^}]+\}/g)) assert.ok(MAYORAL_PLACEHOLDERS.includes(m[0]), m[0]);
  for (const p of MAYORAL_PLACEHOLDERS) assert.ok(t.includes(p), p);
  assert.match(B.termNote.text,/\{terms\}/); assert.match(R.progress,/\{signed\}.*\{needed\}/);
  for (const t2 of [...X.lines.map(l=>l.text),B.instructions.text,R.about.text,R.whoSigns.text,R.reached.text]) assert.doesNotMatch(t2,/\{/,t2);
});
test('no invented figure: no digits, percentages, day counts, thresholds or turnout; the instant-runoff lines carry no number words', () => {
  for (const t of all()) {
    assert.doesNotMatch(t,/\d|%|percent|\b(day|days|week|weeks|hour|hours|month|months|year|years|quorum|threshold|turnout|margin|landslide)\b/i,t);
  }
  for (const t of [...X.lines.map(l=>l.text),R.about.text,R.whoSigns.text,R.reached.text]) assert.doesNotMatch(t,/\b(one|two|three|four|five|six|ten|half|third|quarter)\b/i,t);
});
test('humans vote and AI personas run: the chrome says so, humans never stand, only verified human citizens vote and sign', () => {
  assert.match(B.whoRuns.text,/Every candidate is an AI/); assert.match(B.whoRuns.text,/Humans vote and AI personas run/);
  assert.match(B.whoVotes.text,/verified human citizens/); assert.match(R.whoSigns.text,/verified human citizens/);
  assert.match(R.about.text,/AI Mayor or Assembly member/); assert.match(B.candidateChip,/^AI /);
  for (const t of all()) assert.doesNotMatch(t,/\b(humans? (can|may|will) (stand|run)|AI citizens? (can|may|will) (vote|sign))\b/i,t);
});
test('the instant-runoff explainer names the method and nothing else: ranked choices, the last place candidate drops, votes move on', () => {
  assert.match(X.lines[0].text,/rank the candidates/i); assert.match(X.lines[1].text,/last place/); assert.match(X.lines[2].text,/next choice/);
  assert.equal(X.title,'How ranked voting works');
  for (const t of [X.title,...X.lines.map(l=>l.text)]) assert.doesNotMatch(t,/runoff|instant|ballot box|seat|district|eligib|turnout|quota/i,t);
});
test('one verified person, one ballot is stated and no more: nothing about how eligibility is checked or what is stored', () => {
  assert.match(B.oneBallot.text,/Each verified person gets one ballot/);
  for (const t of all()) assert.doesNotMatch(t,/\b(photo|id card|passport|phone|email|biometric|fingerprint|face|selfie|upload)\b/i,t);
});
test('recall lines say the office holder stays or is recalled and promise nothing about what follows', () => {
  assert.match(R.stays.text,/stays in office/); assert.match(R.recalled.text,/has been recalled/);
  assert.match(R.votePrompt.text,/stay in office/); assert.equal(R.keepOption,'Keep in office'); assert.equal(R.recallOption,'Recall');
  for (const t of [R.stays.text,R.recalled.text,R.reached.text]) assert.doesNotMatch(t,/special election|new mayor|soon|within|replace|successor|vacan|resign|impeach|removed from the game|banned/i,t);
});
test('an AI office holder is never described as able to ignore a binding result', () => {
  assert.match(R.aiNote.text,/\{name\} is an AI/); assert.match(R.aiNote.text,/binding/);
  for (const t of all()) assert.doesNotMatch(t,/ignore|override|veto|appeal|non-binding|advisory|suggest/i,t);
});
test('AI marking follows ui-ux 23.2: one neutral system voice, no byline, no AI badge, no AI persona speaking', () => {
  for (const o of [B,X,R]) { assert.equal('aiBadge' in o,false); assert.equal('byline' in o,false); }
  for (const t of all()) assert.doesNotMatch(t,/\bI am an AI\b|\bI will\b|\bmy (fellow|friends|voters)\b|Be it known|hereby|Gazette|Wire Service|["“”]/i,t);
});
test('term note: a mayor can serve at most {terms} terms, through the placeholder only', () => {
  assert.equal(B.termNote.text,'A mayor can serve at most {terms} terms.');
});
test('calm and neutral: no urgency, pressure or blame, no real-world party, person or place, no on-chain topics, no endorsement', () => {
  for (const t of all()) {
    assert.doesNotMatch(t,/\b(must|hurry|urgent|last chance|act now|don't miss)\b/i,t);
  }
  const t=all().join(' ');
  assert.doesNotMatch(t,/\b(Earth|America|Congress|Senate|Parliament|Democrat|Republican|Labour|Tory|London|Washington|Brexit)\b|!/);
  assert.doesNotMatch(t,/endors|Tessera|chain|NFT|token|wallet|Spark|reward|badge|XP|prize/i);
  assert.doesNotMatch(t,/Kindle|Aurelle|Korund|Assembly of|President/);
});
test('unwired: nothing in app/, components/ or lib/ imports mayoral-recall-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components'),...walk('lib')]) if (/\.(t|j)sx?$/.test(f)&&!f.endsWith('mayoral-recall-copy.ts')) assert.doesNotMatch(readFileSync(f,'utf8'),/mayoral-recall-copy/, f);
});

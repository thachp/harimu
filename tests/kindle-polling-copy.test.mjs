import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { kindlePress } from '../lib/press-templates.ts';
import { voterIntentPrompt as VP, pollCard as PC, residentMood as RM, pollPress as PP, pollPressFor, kindlePollingCopy as C, PRESS_FRAME_KEYS, POLL_NAME_PLACEHOLDERS, POLL_NUMBER_PLACEHOLDERS, POLL_NAME_MAX, POLL_NUMBER_MAX, POLL_LABEL_MAX, POLL_LINE_MAX, POLL_HEADLINE_MAX, POLL_BODY_MAX } from '../lib/kindle-polling-copy.ts';

const labels=()=>[VP.title,VP.answerButton,VP.declineButton,PC.title,PC.sampleSize,PC.margin,RM.label];
const lineObjs=()=>[VP.question,VP.voluntary,VP.notAVote,VP.privacy,VP.thanks,PC.marginExplainer,PC.sampleExplainer,PC.empty,RM.explainer,RM.sourceNote];
const lines=()=>[...lineObjs().map(l=>l.text),PC.fieldDates];
const bodies=()=>PP.map(f=>f.body);
const heads=()=>PP.map(f=>f.headline);
const all=()=>[...labels(),...lines(),...bodies(),...heads()];
const PH=[...POLL_NAME_PLACEHOLDERS,...POLL_NUMBER_PLACEHOLDERS];
const fill=t=>{ let a=t; for (const p of POLL_NAME_PLACEHOLDERS) a=a.replaceAll(p,'W'.repeat(POLL_NAME_MAX)); for (const p of POLL_NUMBER_PLACEHOLDERS) a=a.replaceAll(p,'9'.repeat(POLL_NUMBER_MAX)); return a; };

test('shape: prompt, card, mood strip and two press frames; every line proposal and distinct; proposal byline', () => {
  for (const o of [VP,PC,RM,C]) assert.equal(o.proposal,true);
  for (const l of lineObjs()) assert.equal(l.proposal,true);
  assert.deepEqual([...PRESS_FRAME_KEYS],['lead-change','race-tightens']); assert.deepEqual(PP.map(f=>f.key),[...PRESS_FRAME_KEYS]);
  for (const f of PP) { assert.equal(f.proposal,true); assert.equal(pollPressFor(f.key),f); }
  assert.equal(pollPressFor('nope'),undefined);
  assert.equal(new Set(all()).size,all().length);
});
test('limits: local caps 24 and 6; labels 40, lines 100, headlines 70 with every placeholder filled to its cap', () => {
  assert.equal(POLL_NAME_MAX,24); assert.equal(POLL_NUMBER_MAX,6); assert.equal(POLL_LABEL_MAX,40); assert.equal(POLL_LINE_MAX,100); assert.equal(POLL_HEADLINE_MAX,70);
  for (const t of labels()) assert.ok(fill(t).length<=POLL_LABEL_MAX,`${t} (${fill(t).length})`);
  for (const t of lines()) assert.ok(fill(t).length<=POLL_LINE_MAX,`${t} (${fill(t).length})`);
  assert.equal(POLL_BODY_MAX,140); for (const t of bodies()) assert.ok(fill(t).length<=POLL_BODY_MAX,`${t} (${fill(t).length})`);
  for (const t of heads()) assert.ok(fill(t).length<=POLL_HEADLINE_MAX,`${t} (${fill(t).length})`);
});
test('placeholders: only the allow-listed six, each used; the card carries dates, sample and margin', () => {
  const t=all().join(' '); for (const m of t.matchAll(/\{[^}]*\}/g)) assert.ok(PH.includes(m[0]),m[0]);
  for (const p of PH) assert.ok(t.includes(p),p);
  assert.match(PC.fieldDates,/\{from\} to \{to\}/); assert.match(PC.sampleSize,/\{n\}/); assert.match(PC.margin,/±\{margin\}/);
  for (const l of [...lineObjs().map(l=>l.text),RM.label]) assert.doesNotMatch(l,/\{/,l);
});
test('numbers only through placeholders: no digits, percents or number words anywhere', () => {
  for (const t of all()) assert.doesNotMatch(t.replace(/\{[^}]*\}/g,''),/\d|%|percent|\b(one|two|three|four|five|six|seven|ten|twice|half|hundred|thousand|majority|points?)\b/i,t);
});
test('no line says or implies that answering a poll casts a ballot or counts as a vote', () => {
  assert.match(VP.notAVote.text,/^A poll answer is not a vote\./);
  for (const t of [VP.question.text,VP.voluntary.text,VP.privacy.text,VP.thanks.text,VP.answerButton,VP.declineButton,VP.title,...PP.flatMap(f=>[f.headline,f.body])]) assert.doesNotMatch(t,/\b(cast|ballot|your vote counts|counts as a vote|voted|voting now|vote now)\b/i,t);
  assert.doesNotMatch(VP.answerButton+VP.declineButton,/vote/i);
});
test('every resident-mood string says it is not a vote, and none calls residents a bloc or voters', () => {
  for (const t of [RM.label,RM.explainer.text,RM.sourceNote.text]) assert.match(t,/not votes|do not vote|not counted as votes/,t);
  for (const t of [RM.label,RM.explainer.text,RM.sourceNote.text]) assert.doesNotMatch(t,/\bbloc\b|\bvoters?\b|\bballots?\b|\bNPC\b|\bsupport\b/i,t);
  assert.match(RM.sourceNote.text,/not part of the poll/);
});
test('voluntary and private only as the docs say: skipping costs nothing, AI candidates see only the published poll; no other privacy or retention promise', () => {
  assert.match(VP.voluntary.text,/up to you/); assert.match(VP.voluntary.text,/Skipping changes nothing/);
  assert.equal(VP.privacy.text,'AI candidates see only the published poll, never your answer.');
  assert.match(PC.sampleExplainer.text,/random sample of voluntary answers from human citizens/);
  for (const t of all()) assert.doesNotMatch(t,/\b(anonymous\w*|confidential\w*|deleted|erased|forever|stored|kept for|encrypted|secure\w*|guarantee\w*|private\w*)\b/i,t);
});
test('press frames: Republic Wire Service reports about a poll, unbadged, no AI voice, margin only via placeholder', () => {
  for (const f of PP) { assert.equal(f.aiBadge,false); assert.match(f.body,/^Republic Wire Service: /); assert.match(f.body,/±\{margin\}/); }
  for (const o of [VP,PC,RM,C]) assert.equal('aiBadge' in o,false);
  for (const t of all()) assert.doesNotMatch(t,/^Be it known|By royal decree|\bI am an AI\b|Crown|State Media|Court Gazette|Chairman|["“”]/,t);
});
test('no reward, badge, prize or XP wording, no betting or prediction markets, nothing on-chain, no other nation, no real-world names', () => {
  for (const t of all()) {
    assert.doesNotMatch(t,/reward|\bbadge|prize|\bXP\b|bonus|Spark|score|\b(bet\w*|odds|wager\w*|gambl\w*|prediction market)\b/i,t);
    assert.doesNotMatch(t,/Tessera|\bTSR\b|\bchain\b|NFT|token|wallet|\bland\b/i,t);
    assert.doesNotMatch(t,/Korund|Aurelle|Varkand|Meridian|Ilmar|Fulmara|Hoarvale|Confluence|Gallup|Reuters|America|Europe/,t);
  }
});
test('no string here repeats a string from another lib module', () => {
  const others=readdirSync('lib').filter(f=>/\.ts$/.test(f)&&f!=='kindle-polling-copy.ts').map(f=>readFileSync(`lib/${f}`,'utf8')).join('\n');
  for (const t of all()) assert.ok(!others.includes(`'${t}'`)&&!others.includes(`"${t}"`)&&!others.includes(`\`${t}\``),t);
});
test('the header names no other lib module path', () => {
  const head=readFileSync('lib/kindle-polling-copy.ts','utf8').split('*/')[0];
  assert.doesNotMatch(head,/\blib\/|\.ts\b|app\/|components\//);
});
test('unwired: nothing in app/, components/ or lib/ imports kindle-polling-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components'),...walk('lib')]) if (/\.(t|j)sx?$/.test(f)&&!f.endsWith('kindle-polling-copy.ts')) assert.doesNotMatch(readFileSync(f,'utf8'),/kindle-polling-copy/,f);
});
test('one canonical byline: the press bodies open with the Kindle pack byline from the press templates, and this module defines none of its own', () => {
  assert.deepEqual(kindlePress.byline,{name:'Republic Wire Service',proposal:true});
  const src=readFileSync('lib/kindle-polling-copy.ts','utf8');
  assert.doesNotMatch(src,/name:'Republic Wire Service'/); assert.doesNotMatch(src,/BYLINE=/); assert.doesNotMatch(src,/^import /m);
  for (const b of bodies()) assert.ok(b.startsWith(`${kindlePress.byline.name}: `),b);
});

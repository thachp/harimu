import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { favorDecayExplainer as E, favorDecayTip as T, favorDecayNotice as N, favorDecayEmpty as Z, favorDecayCopy as C, FAVOR_DECAY_NAME_MAX, FAVOR_DECAY_LABEL_MAX, FAVOR_DECAY_LINE_MAX, FAVOR_DECAY_PLACEHOLDERS } from '../lib/favor-decay-copy.ts';

const lineObjs=()=>[...E.lines,T,...N,...Z];
const lines=()=>lineObjs().map(l=>l.text);
const all=()=>[E.label,...lines()];
const fill=t=>FAVOR_DECAY_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(FAVOR_DECAY_NAME_MAX)),t);

test('shape: an explainer, a tip, two notice variants and two empty variants; every line proposal and distinct', () => {
  for (const o of [E,C]) assert.equal(o.proposal,true);
  for (const l of lineObjs()) { assert.equal(l.proposal,true); assert.ok(l.text.length>0); }
  assert.equal(E.lines.length,2); assert.equal(N.length,2); assert.equal(Z.length,2);
  assert.equal(new Set(all()).size,all().length);
  assert.deepEqual(Object.keys(C),['explainer','tip','notice','empty','proposal']);
});
test('limits: local name cap 24, labels 40, lines 100, with {favor} filled to 24 characters', () => {
  assert.equal(FAVOR_DECAY_NAME_MAX,24); assert.equal(FAVOR_DECAY_LABEL_MAX,40); assert.equal(FAVOR_DECAY_LINE_MAX,100);
  assert.ok(fill(E.label).length<=FAVOR_DECAY_LABEL_MAX);
  for (const t of lines()) assert.ok(fill(t).length<=FAVOR_DECAY_LINE_MAX, `${t} (${fill(t).length})`);
});
test('the only placeholder is {favor}; both notices use it and nothing else does', () => {
  assert.deepEqual([...FAVOR_DECAY_PLACEHOLDERS],['{favor}']);
  for (const m of all().join(' ').matchAll(/\{[^}]+\}/g)) assert.equal(m[0],'{favor}');
  for (const l of N) assert.match(l.text,/\{favor\}/);
  for (const t of [...E.lines.map(l=>l.text),T.text,...Z.map(l=>l.text),E.label]) assert.doesNotMatch(t,/\{/,t);
});
test('no invented rate: no digits, number words, percentages, intervals or speed words', () => {
  for (const t of all()) {
    assert.doesNotMatch(t,/\d|%|percent/i,t);
    assert.doesNotMatch(t,/\b(one|two|three|four|five|six|ten|half|twice|double)\b/i,t);
    assert.doesNotMatch(t,/\b(per|every|each|daily|weekly|hourly|monthly|day|days|week|weeks|hour|hours|month|months|minute|minutes|rate|interval|quickly|slowly|fast|soon|idle|inactive|inactivity|absence|away)\b/i,t);
  }
});
test('says what the docs say: Royal Favor fades over time, and service earns it again; names no mechanic beyond that', () => {
  for (const t of [E.lines[0].text,T.text,N[1].text]) assert.match(t,/fades over time/);
  assert.match(E.lines[1].text,/Service to the Crown earns it again/);
  assert.match(E.lines[1].text,/gifts, victories, audiences and verse/);
  for (const l of [...Z,...N]) assert.match(l.text,/Royal Favor|Favor/);
  for (const t of all()) assert.doesNotMatch(t,/spend|spent|cost|price|buy|sell|trade|tax|tribute|rank|estate|pardon|petition|charter|Spark|currency|money|coin/i,t);
});
test('calm and not a punishment: no threat, no urgency, no blame, no promise to restore it or to keep it', () => {
  for (const t of all()) {
    assert.doesNotMatch(t,/\b(punish\w*|penalt\w*|lose|lost|losing|forfeit\w*|warning|beware|hurry|urgent|last chance|act now|must|never|always|guarantee\w*|promise\w*|restore\w*|recover\w*|keeps? forever)\b/i,t);
    assert.doesNotMatch(t,/!/,t);
  }
});
test('the explainer label is the only question; no clinical, real-world or on-chain wording', () => {
  assert.equal(all().filter(t=>t.includes('?')).length,1); assert.match(E.label,/\?$/);
  assert.doesNotMatch(all().join(' '),/\b(Earth|real world|medieval|Europe|king of England|Tessera|chain|NFT|token|wallet)\b/i);
});
test('one neutral court voice: no byline, no Crown decree, no AI badge', () => {
  for (const o of [E,C]) { assert.equal('aiBadge' in o,false); assert.equal('byline' in o,false); }
  for (const t of all()) assert.doesNotMatch(t,/Be it known|hereby|decree|we, |the Crown (says|speaks|decrees)|\bI am an AI\b|Gazette/i,t);
});
test('no string here repeats a string from another lib module, so a screen never shows the same line from two sources', () => {
  const others=readdirSync('lib').filter(f=>/\.ts$/.test(f)&&f!=='favor-decay-copy.ts').map(f=>readFileSync(`lib/${f}`,'utf8')).join('\n');
  for (const t of all()) assert.ok(!others.includes(`'${t}'`)&&!others.includes(`"${t}"`)&&!others.includes(`\`${t}\``), t);
});
test('unwired: nothing in app/, components/ or lib/ imports favor-decay-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components'),...walk('lib')]) if (/\.(t|j)sx?$/.test(f)&&!f.endsWith('favor-decay-copy.ts')) assert.doesNotMatch(readFileSync(f,'utf8'),/favor-decay-copy/, f);
});

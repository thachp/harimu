import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// lib/system-codex-copy.ts has no imports: transpile it to a temporary .mjs (Node type-stripping needs extensions on imports).
const src=readFileSync('lib/system-codex-copy.ts','utf8');
const out=join(mkdtempSync(join(tmpdir(),'system-codex-copy-')),'system-codex-copy.mjs');
writeFileSync(out,ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const C = await import(pathToFileURL(out).href);
const { SYSTEM_STYLIZED_NOTE:NOTE, codexHeadings:HD, systemCodex:SC, systemCodexFor, CODEX_NATIONS, SYSTEM_HEADING_MAX, SYSTEM_LINE_MAX, SYSTEM_NOTE_MAX } = C;

const FIELDS=['power','goods','voice','strength','weakness'];
const nationLines=n=>[...n.power,n.goods,n.voice,n.strength,n.weakness].map(l=>l.text);
const headings=()=>[HD.power,HD.goods,HD.voice,HD.strength,HD.weakness];
const lines=()=>SC.flatMap(nationLines);
const all=()=>[NOTE,...headings(),...lines()];

test('limits: headings 40, lines 100, the shared note 160; no placeholders', () => {
  assert.equal(SYSTEM_HEADING_MAX,40); assert.equal(SYSTEM_LINE_MAX,100); assert.equal(SYSTEM_NOTE_MAX,160);
  for (const t of headings()) assert.ok(t.length<=SYSTEM_HEADING_MAX,`${t} (${t.length})`);
  for (const t of lines()) assert.ok(t.length<=SYSTEM_LINE_MAX,`${t} (${t.length})`);
  assert.ok(NOTE.length<=SYSTEM_NOTE_MAX,`${NOTE.length}`);
  for (const t of all()) assert.doesNotMatch(t,/\{|\}/,t);
});
test('SYSTEM_STYLIZED_NOTE states both 21.2 points: stylized and not a portrait of any real state; real countries vary widely and change over time', () => {
  assert.match(NOTE,/stylized simulation/); assert.match(NOTE,/not a portrait of any real country or people/); assert.match(NOTE,/Real countries vary widely and change over time/);
});
test('each MVP nation has all five fields: two power lines, goods, voice, one strength, one weakness; every line a proposal', () => {
  assert.deepEqual([...CODEX_NATIONS],['kindle','korund','aurelle']); assert.deepEqual(SC.map(x=>x.nationId),[...CODEX_NATIONS]);
  assert.deepEqual(Object.keys(HD).sort(),[...FIELDS,'proposal'].sort());
  for (const n of SC) { assert.equal(n.proposal,true); assert.equal(systemCodexFor(n.nationId),n); assert.deepEqual(Object.keys(n).sort(),[...FIELDS,'nationId','proposal'].sort()); assert.equal(n.power.length,2);
    for (const l of [...n.power,n.goods,n.voice,n.strength,n.weakness]) { assert.equal(l.proposal,true); assert.ok(l.text.length>10); } }
  assert.equal(HD.proposal,true); assert.equal(new Set(lines().filter(t=>t!=='Every office is held by an AI persona.')).size,lines().length-3);
});
test('the §8.7 fact that every office is held by an AI persona is stated for each nation', () => {
  for (const n of SC) { assert.equal(n.power[1].text,'Every office is held by an AI persona.'); }
});
// 'one person' is the docs' rule by a single ruler, not a figure, so 'one' is not in the number-word list.
test('figures: none; no digits, number words or numeric weights', () => {
  for (const t of all()) assert.doesNotMatch(t,/\d|%|percent|\b(two|three|four|five|six|seven|ten|twice|half)\b|\b(weights?|thresholds?)\b/i,t);
});
test('neutral voice: no nation press voice, byline or AI voice, no marketing or judgment words, and no badge field', () => {
  for (const t of all()) assert.doesNotMatch(t,/Kindle Press|State Media|Court Gazette|Be it known|by royal decree\.|\b(best|worst|ideal|perfect|tyran\w*|dictator\w*|oppress\w*|regime|utopi\w*|villain\w*|evil|superior|inferior|glorious|great)\b/i,t);
  for (const o of [HD,...SC]) assert.equal('aiBadge' in o,false); for (const n of SC) for (const l of [...n.power,n.goods,n.voice,n.strength,n.weakness]) assert.equal('aiBadge' in l,false);
});
test('no real country, people, party or leader: not even the nation pages\' Inspiration rows', () => {
  const t=all().join(' ');
  assert.doesNotMatch(t,/\b(US|USA|America\w*|Europe\w*|England|Britain|British|France|French|Japan\w*|China|Chinese|Russia\w*|Soviet|Germany|German|Italy|Rome|Roman|Greek|Persian|Stalin\w*|Lenin\w*|Mao|Hitler|Louis|Napoleon|Churchill)\b/);
  assert.doesNotMatch(t,/\b(liberal|capitalis\w*|communis\w*|socialis\w*|fascis\w*|absolutis\w*|monarchist\w*|democra\w*|authoritarian|totalitarian)\b/i);
  assert.doesNotMatch(t,/Workers' Party|Politburo|Meridian|Ilmar|Varkand|Veldwood|Hoarvale|Fulmara|Confluence|Notable|@/);
});
test('balance: no nation is the villain or the correct choice: each has one strength and one weakness in the same shape, and none is praised or condemned outright', () => {
  for (const n of SC) { assert.ok(n.strength.text.length>0&&n.weakness.text.length>0); assert.doesNotMatch(n.strength.text,/\b(but|however|although|yet)\b/i); assert.doesNotMatch(n.weakness.text,/\b(but|however|although|yet)\b/i); }
  for (const t of lines()) assert.doesNotMatch(t,/\b(should|must|better than|worse than|the best|the right|the wrong|join us|you will)\b/i,t);
});
test('each line matches its docs row: spot checks of the paraphrases', () => {
  const k=systemCodexFor('kindle'), r=systemCodexFor('korund'), a=systemCodexFor('aurelle');
  assert.match(k.power[0].text,/vote for the President and the Assembly/); assert.match(k.goods.text,/privately owned/); assert.match(k.voice.text,/Votes decide/); assert.match(k.strength.text,/Free press, free speech and free movement/); assert.match(k.weakness.text,/gridlock/); assert.match(k.weakness.text,/lowest baseline security/);
  assert.match(r.power[0].text,/Chairman rules for life/); assert.match(r.power[0].text,/Presidium/); assert.match(r.goods.text,/state owns all firms/); assert.match(r.voice.text,/Votes are recorded, not heeded/); assert.match(r.strength.text,/highest baseline security/); assert.match(r.weakness.text,/shortages/); assert.match(r.weakness.text,/one person rules/);
  assert.match(a.power[0].text,/Monarch rules by royal decree/); assert.match(a.power[0].text,/Privy Council/); assert.match(a.goods.text,/guild charters/); assert.match(a.voice.text,/claimant/); assert.match(a.voice.text,/Royal Favor/); assert.match(a.strength.text,/noble ranks/); assert.match(a.weakness.text,/legitimacy hinges on one person/);
});
test('no wording from other codex notes: the faith note is not reused, and lines are plain statements with no codex jargon about action sets', () => {
  const faith=readFileSync('lib/faith-copy.ts','utf8');
  for (const t of [NOTE,...lines()]) assert.ok(!faith.includes(`'${t}'`),t);
  for (const t of lines()) assert.doesNotMatch(t,/action set|legal action|SystemTemplate/i,t);
});
test('unwired: nothing in app/, components/ or lib/ imports system-codex-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components'),...walk('lib')]) if (/\.(t|j)sx?$/.test(f)&&!f.endsWith('system-codex-copy.ts')) assert.doesNotMatch(readFileSync(f,'utf8'),/system-codex-copy/, f);
});

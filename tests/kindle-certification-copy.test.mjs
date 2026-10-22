import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { kindlePress } from '../lib/press-templates.ts';
import { votingOpen as VO, certStates as CS, resultsCaption as RC, transitionBanner as TB, certPress as CP, certStateFor, certPressFor, kindleCertificationCopy as C, CERT_STATE_KEYS, CERT_PRESS_KEYS, CERT_NAME_PLACEHOLDERS, CERT_NUMBER_PLACEHOLDERS, CERT_NAME_MAX, CERT_NUMBER_MAX, CERT_LABEL_MAX, CERT_LINE_MAX, CERT_HEADLINE_MAX, CERT_BODY_MAX } from '../lib/kindle-certification-copy.ts';

const labels=()=>[VO.closesAt,...CS.map(s=>s.label),RC.turnout,RC.district,TB.label,TB.inauguration];
const lineObjs=()=>[VO.hidden,...CS.map(s=>s.line),RC.npcNote,TB.line];
const lines=()=>lineObjs().map(l=>l.text);
const bodies=()=>CP.map(f=>f.body);
const heads=()=>CP.map(f=>f.headline);
const all=()=>[...labels(),...lines(),...bodies(),...heads()];
const PH=[...CERT_NAME_PLACEHOLDERS,...CERT_NUMBER_PLACEHOLDERS];
const fill=t=>{ let a=t; for (const p of CERT_NAME_PLACEHOLDERS) a=a.replaceAll(p,'W'.repeat(CERT_NAME_MAX)); for (const p of CERT_NUMBER_PLACEHOLDERS) a=a.replaceAll(p,'9'.repeat(CERT_NUMBER_MAX)); return a; };
const st=k=>certStateFor(k).line.text;

test('shape: voting-open lines, four states in order, results caption, transition banner, two press frames; every line proposal and distinct', () => {
  for (const o of [VO,RC,TB,C]) assert.equal(o.proposal,true);
  for (const l of lineObjs()) assert.equal(l.proposal,true);
  assert.deepEqual([...CERT_STATE_KEYS],['counting','awaiting','certified','under-review']); assert.deepEqual(CS.map(s=>s.key),[...CERT_STATE_KEYS]);
  for (const s of CS) { assert.equal(s.proposal,true); assert.equal(certStateFor(s.key),s); }
  assert.deepEqual([...CERT_PRESS_KEYS],['certified','under-review']); assert.deepEqual(CP.map(f=>f.key),[...CERT_PRESS_KEYS]);
  for (const f of CP) { assert.equal(f.proposal,true); assert.equal(certPressFor(f.key),f); }
  assert.equal(certStateFor('nope'),undefined);
  assert.equal(new Set(all()).size,all().length);
});
test('limits: local caps 24 and 6; labels 40, lines 100, headlines 70, bodies 140 with every placeholder filled', () => {
  assert.equal(CERT_NAME_MAX,24); assert.equal(CERT_NUMBER_MAX,6);
  for (const [ts,max] of [[labels(),CERT_LABEL_MAX],[lines(),CERT_LINE_MAX],[heads(),CERT_HEADLINE_MAX],[bodies(),CERT_BODY_MAX]]) for (const t of ts) assert.ok(fill(t).length<=max,`${t} (${fill(t).length}>${max})`);
});
test('placeholders: only the allow-listed six, each used where it belongs', () => {
  const t=all().join(' '); for (const m of t.matchAll(/\{[^}]*\}/g)) assert.ok(PH.includes(m[0]),m[0]);
  for (const p of PH) assert.ok(t.includes(p),p);
  assert.match(VO.closesAt,/\{closesAt\}/); assert.match(RC.turnout,/\{turnout\}/); assert.match(RC.district,/^\{district\}: \{count\} ballots$/); assert.match(TB.inauguration,/^Inauguration \{inaugurationAt\}$/); assert.doesNotMatch(TB.line.text,/\{/);
  assert.match(st('certified'),/\{winner\}/); assert.doesNotMatch(st('under-review'),/\{/);
});
test('figures: the docs\' 24 hours once, in the awaiting line; nothing else is a number', () => {
  assert.match(st('awaiting'),/within 24 hours/);
  for (const t of all()) { const bare=t.replace(/\{[^}]*\}/g,''); if (t===st('awaiting')) { assert.equal((bare.match(/\d+/g)??[]).join(),'24'); continue; }
    assert.doesNotMatch(bare,/\d|%|percent|\b(one|two|three|four|five|six|seven|ten|twice|half|hundred|thousand|majority)\b|\b(hours?|days?|weeks?)\b/i,t); }
});
test('docs facts (§9.1, §9.5): results hidden until close, automatic count, AI High Court certifies, outgoing President cannot spend the treasury or declare war', () => {
  assert.match(VO.hidden.text,/hidden until the polls close/); assert.match(st('counting'),/runs automatically/);
  assert.match(st('awaiting'),/AI High Court certifies/); assert.match(st('certified'),/AI High Court has certified/);
  assert.match(TB.line.text,/outgoing AI President cannot spend the treasury or declare war/); assert.match(RC.turnout,/^Verified-human turnout/);
});
test('the fraud-flag review is neutral: no accusation, no candidate, no flagged-ballot count, no fraud or cheat wording', () => {
  for (const t of [st('under-review'),certPressFor('under-review').body,certPressFor('under-review').headline]) {
    assert.doesNotMatch(t,/\{|\d|\b(fraud\w*|cheat\w*|rigg\w*|stolen|steal\w*|illegal|criminal|guilty|suspect\w*|multi-account|bots?|fake)\b/i,t);
  }
  assert.match(st('under-review'),/Nobody is accused/); assert.match(certPressFor('under-review').body,/named nobody/);
});
test('no claim that NPCs or residents vote; the residents note says they are not part of the count', () => {
  assert.match(RC.npcNote.text,/Residents do not vote/); assert.match(RC.npcNote.text,/not part of the count/);
  for (const t of all()) assert.doesNotMatch(t,/\bNPCs? (vote|voted|ballots?)\b|residents (vote|voted)\b|AI (voters?|bloc)/i,t);
});
test('badge (§23.2 / #381): system notices and Republic Wire Service reports are unbadged; no AI voice, Crown or other nation', () => {
  for (const f of CP) { assert.equal(f.aiBadge,false); assert.match(f.body,/^Republic Wire Service: /); }
  for (const o of [VO,RC,TB,C,...CS]) assert.equal('aiBadge' in o,false);
  for (const t of all()) assert.doesNotMatch(t,/^Be it known|By royal decree|\bI am an AI\b|Crown|State Media|Court Gazette|Chairman|Korund|Aurelle|Varkand|["“”]/,t);
});
test('no reward, badge, prize or XP wording, nothing on-chain, no persistence or outcome promise, no real-world names', () => {
  for (const t of all()) {
    assert.doesNotMatch(t,/reward|\bbadge|prize|\bXP\b|bonus|Spark|score|Tessera|\bTSR\b|\bchain\b|NFT|token|wallet|\bland\b/i,t);
    assert.doesNotMatch(t,/\b(guarantee\w*|always|forever|never fails|certainly)\b/i,t);
    assert.doesNotMatch(t,/\b(America\w*|Supreme Court|Congress|Senate|Electoral College|White House)\b/,t);
  }
});
test('no string here repeats a string from another lib module', () => {
  const others=readdirSync('lib').filter(f=>/\.ts$/.test(f)&&f!=='kindle-certification-copy.ts').map(f=>readFileSync(`lib/${f}`,'utf8')).join('\n');
  for (const t of all()) assert.ok(!others.includes(`'${t}'`)&&!others.includes(`"${t}"`)&&!others.includes(`\`${t}\``),t);
});
test('the header names no other lib module path', () => {
  const head=readFileSync('lib/kindle-certification-copy.ts','utf8').split('*/')[0];
  assert.doesNotMatch(head,/\blib\/|\.ts\b|app\/|components\//);
});
test('unwired: nothing in app/, components/ or lib/ imports kindle-certification-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components'),...walk('lib')]) if (/\.(t|j)sx?$/.test(f)&&!f.endsWith('kindle-certification-copy.ts')) assert.doesNotMatch(readFileSync(f,'utf8'),/kindle-certification-copy/,f);
});
test('one canonical byline: the press bodies open with the Kindle pack byline from the press templates, and this module defines none of its own', () => {
  assert.deepEqual(kindlePress.byline,{name:'Republic Wire Service',proposal:true});
  const src=readFileSync('lib/kindle-certification-copy.ts','utf8');
  assert.doesNotMatch(src,/name:'Republic Wire Service'/); assert.doesNotMatch(src,/BYLINE=/); assert.doesNotMatch(src,/^import /m);
  for (const b of bodies()) assert.ok(b.startsWith(`${kindlePress.byline.name}: `),b);
});

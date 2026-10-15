import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { hallChrome as CH, hallExplainer as EX, hallComposer as CO, hallRefusals as RF, hallRefusalFor, diplomaticHallCopy as C, HALL_REFUSAL_KEYS, HALL_NAME_MAX, HALL_NUMBER_MAX, HALL_LABEL_MAX, HALL_LINE_MAX, HALL_PLACEHOLDERS } from '../lib/diplomatic-hall-copy.ts';

const labels=()=>[CH.tabLabel,CH.headerTitle,CO.placeholder,CO.sendButton,CO.nationTag.text,CO.nationTag.accessibleName];
const lineObjs=()=>[CH.emptyState,EX.line,EX.inCharacter,EX.nationNote,...RF.map(r=>r.line)];
const lines=()=>lineObjs().map(l=>l.text);
const all=()=>[...labels(),...lines()];
const fill=t=>HALL_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(p==='{max}'?HALL_NUMBER_MAX:HALL_NAME_MAX)),t);
const refusal=k=>hallRefusalFor(k).line.text;

test('shape: tab, header, empty state, explainer, composer with a nation tag, and four refusals in check order; every line proposal and distinct', () => {
  for (const o of [CH,EX,CO,C]) assert.equal(o.proposal,true);
  for (const l of lineObjs()) { assert.equal(l.proposal,true); assert.ok(l.text.trim().length>0); }
  assert.deepEqual(RF.map(r=>r.key),[...HALL_REFUSAL_KEYS]); assert.deepEqual([...HALL_REFUSAL_KEYS],['nation_closed','signed_out','rate_limit','too_long']);
  for (const r of RF) { assert.equal(r.proposal,true); assert.equal(hallRefusalFor(r.key),r); }
  assert.equal(hallRefusalFor('nope'),undefined); assert.equal(new Set(all()).size,all().length);
  assert.equal(CH.tabLabel,'Diplomatic Hall');
});
test('limits: local caps 24 and 6, labels 40, lines 100, with {nation} filled to 24 and {max} to six characters', () => {
  assert.equal(HALL_NAME_MAX,24); assert.equal(HALL_NUMBER_MAX,6); assert.equal(HALL_LABEL_MAX,40); assert.equal(HALL_LINE_MAX,100);
  for (const t of labels()) assert.ok(fill(t).length<=HALL_LABEL_MAX, `${t} (${fill(t).length})`);
  for (const t of lines()) assert.ok(fill(t).length<=HALL_LINE_MAX, `${t} (${fill(t).length})`);
});
test('placeholders: only {nation} (the tag) and {max} (the too-long refusal), each used, nowhere else', () => {
  assert.deepEqual([...HALL_PLACEHOLDERS],['{nation}','{max}']);
  const t=all().join(' ');
  for (const m of t.matchAll(/\{[^}]+\}/g)) assert.ok(HALL_PLACEHOLDERS.includes(m[0]), m[0]);
  for (const p of HALL_PLACEHOLDERS) assert.ok(t.includes(p), p);
  assert.match(CO.nationTag.text,/^\{nation\} citizen$/); assert.match(CO.nationTag.accessibleName,/\{nation\}/); assert.match(refusal('too_long'),/\{max\}/);
  for (const x of all().filter(s=>s!==CO.nationTag.text&&s!==CO.nationTag.accessibleName&&s!==refusal('too_long'))) assert.doesNotMatch(x,/\{/,x);
});
test('no figure is written: no digits, number words or limits; the post limit arrives only through {max}', () => {
  for (const t of all()) assert.doesNotMatch(t,/\d|%|\b(one|two|three|four|five|six|ten|hundred|thousand|half|twice|per|every|each hour|minutes?|seconds?|hours?|days?|weeks?)\b/i,t);
});
test('who can read it: citizens of the nations in the hall, in character; the nation is shown next to the name; the docs\' Korund exception is the refusal, not the explainer', () => {
  assert.match(EX.line.text,/Citizens of the nations in this hall can read and post here/); assert.match(EX.inCharacter.text,/in character/); assert.match(EX.nationNote.text,/Your nation is shown next to your name/);
  assert.doesNotMatch(EX.line.text+EX.inCharacter.text+EX.nationNote.text,/Korund|Kindle|Aurelle|all nations|everyone|anyone|world/i);
});
test('the closed-nation refusal is neutral: it names no nation, says nothing about what is said in the hall, and hints at no workaround', () => {
  const t=refusal('nation_closed'); assert.equal(t,'The Diplomatic Hall is closed to your nation.');
  assert.doesNotMatch(t,/Korund|Kindle|Aurelle|other nations?|saying|said|talk\w*|post(s|ed)?\b|messages?|conversation\w*|read|radio|delegate\w*|accredit\w*|State Media|propaganda|comrade|Chairman|Presidium|forbidden|banned|illegal|crime/i);
  assert.doesNotMatch(t,/\{/);
});
test('the other refusals are plain: signed out, posting too quickly, too long; none blames the player or promises anything', () => {
  assert.match(refusal('signed_out'),/Sign in as a citizen/); assert.match(refusal('rate_limit'),/posting too quickly/); assert.match(refusal('too_long'),/too long/);
  for (const k of HALL_REFUSAL_KEYS) assert.doesNotMatch(refusal(k),/\b(must|should|stupid|spam\w*|abus\w*|violat\w*|banned|warning|punish\w*|penalt\w*|suspend\w*|report\w*|guarantee\w*|promise\w*)\b|!/i,k);
});
test('no promise that posts are private, safe or temporary, and no claim about who else reads them or what is stored', () => {
  for (const t of all()) assert.doesNotMatch(t,/\b(private|privately|secret\w*|confidential\w*|only you|just you|anonymous\w*|hidden|safe\w*|secure\w*|delete\w*|erased?|expire\w*|remember\w*|logged|recorded|monitor\w*|watch\w*)\b/i,t);
});
test('one neutral system voice: no byline, no AI badge, no nation voice, no reward, badge, prize or XP wording, no real-world names', () => {
  for (const o of [CH,EX,CO,C]) { assert.equal('aiBadge' in o,false); assert.equal('byline' in o,false); }
  for (const r of RF) { assert.equal('aiBadge' in r,false); assert.equal('byline' in r,false); }
  for (const t of all()) {
    assert.doesNotMatch(t,/reward|badge|prize|\bXP\b|bonus|points?\b|Spark|score/i,t);
    assert.doesNotMatch(t,/Comrade|Crown|Herald|Republic|Gazette|Wire Service|State Media|Be it known|Majesty|realm|Chairman|\bI am an AI\b|["“”]/i,t);
    assert.doesNotMatch(t,/\b(Earth|real world|United Nations|UN|embassy|ambassador|Tessera|chain|NFT|token|wallet)\b/,t);
  }
});
test('no string here repeats a string from another lib module', () => {
  const others=readdirSync('lib').filter(f=>/\.ts$/.test(f)&&f!=='diplomatic-hall-copy.ts').map(f=>readFileSync(`lib/${f}`,'utf8')).join('\n');
  for (const t of all()) assert.ok(!others.includes(`'${t}'`)&&!others.includes(`"${t}"`)&&!others.includes(`\`${t}\``), t);
});
test('the header names no other lib module path', () => {
  const head=readFileSync('lib/diplomatic-hall-copy.ts','utf8').split('*/')[0];
  assert.doesNotMatch(head,/\blib\/|\.ts\b|app\/|components\//);
});
test('wired only into the Diplomatic Hall route (#599 slice 1): nothing else in app/, components/ or lib/ imports diplomatic-hall-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components'),...walk('lib')]) if (/\.(t|j)sx?$/.test(f)&&!f.endsWith('diplomatic-hall-copy.ts')&&f!=='app/api/diplomatic-hall/route.ts') assert.doesNotMatch(readFileSync(f,'utf8'),/diplomatic-hall-copy/, f);
});

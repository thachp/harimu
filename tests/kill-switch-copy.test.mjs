import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { personaMuted as P, decisionsFrozen as D, templateMode as T, killSwitchExplainer as X, killSwitchCopy as C, KILL_SWITCH_NAME_MAX, KILL_SWITCH_LABEL_MAX, KILL_SWITCH_LINE_MAX, KILL_SWITCH_PLACEHOLDERS } from '../lib/kill-switch-copy.ts';

const labels=()=>[P.label,D.label,T.label,X.label];
const lineObjs=()=>[P.notice,P.notablesPanel,D.strip,D.stripUntil,T.footer,...X.lines];
const lines=()=>lineObjs().map(l=>l.text);
const all=()=>[...labels(),...lines()];
const fill=t=>KILL_SWITCH_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(KILL_SWITCH_NAME_MAX)),t);
const noUntil=()=>all().filter(t=>!t.includes('{until}'));

test('shape: persona muted, decisions frozen, template mode and one shared explainer; every line proposal and non-empty and distinct', () => {
  for (const o of [P,D,T,X,C]) assert.equal(o.proposal,true);
  for (const l of lineObjs()) { assert.equal(l.proposal,true); assert.ok(l.text.trim().length>0); }
  assert.equal(X.lines.length,3); assert.equal(new Set(all()).size,all().length);
  assert.deepEqual(Object.keys(C),['personaMuted','decisionsFrozen','templateMode','explainer','proposal']);
  assert.equal(X.label,'What does this mean?');
});
test('limits: local name cap 24, labels 40, lines 100, with {until} filled to 24 characters', () => {
  assert.equal(KILL_SWITCH_NAME_MAX,24); assert.equal(KILL_SWITCH_LABEL_MAX,40); assert.equal(KILL_SWITCH_LINE_MAX,100);
  for (const t of labels()) assert.ok(fill(t).length<=KILL_SWITCH_LABEL_MAX, `${t} (${fill(t).length})`);
  for (const t of lines()) assert.ok(fill(t).length<=KILL_SWITCH_LINE_MAX, `${t} (${fill(t).length})`);
});
test('the only placeholder is {until}, documented, optional: one strip variant uses it and the plain strip does not', () => {
  assert.deepEqual([...KILL_SWITCH_PLACEHOLDERS],['{until}']);
  for (const m of all().join(' ').matchAll(/\{[^}]+\}/g)) assert.equal(m[0],'{until}');
  assert.match(D.stripUntil.text,/\{until\}/); assert.doesNotMatch(D.strip.text,/\{/);
  assert.equal(all().filter(t=>t.includes('{until}')).length,1);
  const src=readFileSync('lib/kill-switch-copy.ts','utf8'); assert.match(src,/\{until\}[^\n]*placeholder|placeholder[^\n]*\{until\}|the one optional time is the \{until\}/);
});
test('identical across Kindle, Korund and Aurelle: one set, no nation key, no nation name, no nation-voice word', () => {
  for (const o of [P,D,T,X,C]) for (const k of Object.keys(o)) assert.doesNotMatch(k,/kindle|korund|aurelle/i);
  for (const t of all()) assert.doesNotMatch(t,/Kindle|Korund|Aurelle|Comrade|Crown|Herald|Republic|Gazette|Wire Service|State Media|Be it known|realm|Majesty|Citizens of|brigade|Chairman|President|Monarch|by decree/i,t);
});
test('no staff member and no reason category is named, and nothing says when it will end unless a time is given', () => {
  for (const t of all()) assert.doesNotMatch(t,/\b(moderator|admin\w*|operator|engineer|developer|hate\w*|extremis\w*|abus\w*|violat\w*|polic(y|ies)|offens\w*|banned?|punish\w*|flagged|filter\w*|classifier|report(ed|s)?|complaint\w*|appeal\w*|because|due to|caused by)\b/i,t);
  for (const t of noUntil()) assert.doesNotMatch(t,/\b(soon|shortly|briefly|temporar\w*|until|for now|for a while|later|tomorrow|today|minutes?|hours?|days?)\b/i,t);
});
test('no claim beyond the docs: nothing about services, play, progress or safety continuing, and no figure', () => {
  for (const t of all()) {
    assert.doesNotMatch(t,/\d|%/,t);
    assert.doesNotMatch(t,/\b(services?|everyday|day-to-day|continues?|continuing|keep playing|progress|your actions|economy|safe|safety|fair|fairness|guarantee\w*|promise\w*|restored?|resume\w*|back to normal)\b/i,t);
  }
});
test('the muted-persona lines say plainly that the character is an AI; the other lines are system lines about the switch', () => {
  assert.match(P.notice.text,/this AI/i); assert.match(P.notablesPanel.text,/This AI/);
  for (const t of [P.notice.text,P.notablesPanel.text]) assert.match(t,/paused/);
  assert.match(D.strip.text,/paused by staff/); assert.match(T.footer.text,/standard template/);
});
test('out of character and calm: no threat, urgency, blame or in-fiction excuse; the explainer says it is not part of the story and each use is logged', () => {
  assert.match(X.lines[1].text,/each use is logged/); assert.match(X.lines[2].text,/not part of the story/);
  for (const t of all()) { assert.doesNotMatch(t,/!/,t); assert.doesNotMatch(t,/\b(must|hurry|urgent|warning|beware|sorry|apolog\w*|unfortunately|oops|glitch|bug|error|failed|broken)\b/i,t); }
  assert.equal(all().filter(t=>t.includes('?')).length,1);
});
test('AI marking follows ui-ux 23.2: no byline and no AI badge anywhere; no AI persona speaks', () => {
  for (const o of [P,D,T,X,C]) { assert.equal('aiBadge' in o,false); assert.equal('byline' in o,false); }
  for (const t of all()) assert.doesNotMatch(t,/\bI am an AI\b|\bI (will|am|have)\b|\bwe (will|are|have)\b|["“”]/i,t);
});
test('no string here repeats a string from another lib module, and no real-world, clinical or on-chain wording', () => {
  const others=readdirSync('lib').filter(f=>/\.ts$/.test(f)&&f!=='kill-switch-copy.ts').map(f=>readFileSync(`lib/${f}`,'utf8')).join('\n');
  for (const t of all()) assert.ok(!others.includes(`'${t}'`)&&!others.includes(`"${t}"`)&&!others.includes(`\`${t}\``), t);
  assert.doesNotMatch(all().join(' '),/\b(Earth|real world|therapy|diagnos\w*|Tessera|chain|NFT|token|wallet)\b/i);
});
test('unwired: nothing in app/, components/ or lib/ imports kill-switch-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components'),...walk('lib')]) if (/\.(t|j)sx?$/.test(f)&&!f.endsWith('kill-switch-copy.ts')) assert.doesNotMatch(readFileSync(f,'utf8'),/kill-switch-copy/, f);
});

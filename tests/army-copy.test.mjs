import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { unitCard as U, officerOrders as OO, unitMembership as M, squadStance as S, supplyNotices as N, battleRound as B, ARMY_NAME_MAX, ARMY_NUMBER_MAX, ARMY_LABEL_MAX, ARMY_LINE_MAX, ARMY_CAPTION_MAX, ARMY_PLACEHOLDERS, ARMY_NUMBER_PLACEHOLDERS, ARMY_ROUND_MINUTES, ARMY_NATIONS, SUPPLY_STATES, STANCES } from '../lib/army-copy.ts';

const labels=()=>[U.title,U.strengthLabel,U.moraleLabel,U.supplyLabel,...SUPPLY_STATES.map(k=>U.supplyStates[k]),U.commanderLabel,U.memberCountLabel,M.joinButton,M.leaveButton,S.label,...STANCES.map(k=>S.labels[k])];
const systemLines=()=>[M.joinConfirm,M.leaveConfirm,M.joined,M.left,M.drillsHelper,M.notEligible,M.notOpenYet,M.actionFailed,...STANCES.map(k=>S.helpers[k]),S.oneInput,N.dailyLoss,B.summary,B.explainer];
const captions=()=>[...ARMY_NATIONS.map(n=>N.cut[n]),...ARMY_NATIONS.map(n=>N.restored[n])];
const lines=()=>systemLines().map(l=>l.text);
const caps=()=>captions().map(l=>l.text);
const orders=()=>OO.map(l=>l.text);
const all=()=>[...labels(),...lines(),...caps(),...orders()];
const fill=t=>ARMY_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(ARMY_NUMBER_PLACEHOLDERS.includes(p)?ARMY_NUMBER_MAX:ARMY_NAME_MAX)),t);

test('shape: unit card, three supply states, three stances, join and leave, supply notices per nation, a round summary; every line proposal and distinct', () => {
  for (const o of [U,M,S,N,B]) assert.equal(o.proposal,true);
  for (const l of [...systemLines(),...captions(),...OO]) { assert.equal(l.proposal,true); assert.ok(l.text.trim().length>0); }
  assert.deepEqual([...SUPPLY_STATES],['supplied','low','cut']); assert.deepEqual([...STANCES],['hold','advance','fall_back']); assert.deepEqual([...ARMY_NATIONS],['kindle','korund','aurelle']);
  assert.deepEqual(Object.keys(U.supplyStates),[...SUPPLY_STATES]); assert.deepEqual(Object.keys(S.labels),[...STANCES]); assert.deepEqual(Object.keys(S.helpers),[...STANCES]);
  assert.deepEqual(Object.keys(N.cut),[...ARMY_NATIONS]); assert.deepEqual(Object.keys(N.restored),[...ARMY_NATIONS]);
  assert.equal(OO.length,3); assert.equal(new Set(all()).size,all().length);
});
test('limits: local caps 24 and 6, labels 40, lines 100, captions 80, with every placeholder filled to its cap', () => {
  assert.equal(ARMY_NAME_MAX,24); assert.equal(ARMY_NUMBER_MAX,6); assert.equal(ARMY_LABEL_MAX,40); assert.equal(ARMY_LINE_MAX,100); assert.equal(ARMY_CAPTION_MAX,80);
  for (const t of labels()) assert.ok(fill(t).length<=ARMY_LABEL_MAX, `${t} (${fill(t).length})`);
  for (const t of [...lines(),...orders()]) assert.ok(fill(t).length<=ARMY_LINE_MAX, `${t} (${fill(t).length})`);
  for (const t of caps()) assert.ok(fill(t).length<=ARMY_CAPTION_MAX, `${t} (${fill(t).length})`);
});
test('placeholders: only the six documented ones, each used, in the lines they belong to', () => {
  assert.deepEqual([...ARMY_PLACEHOLDERS],['{unit}','{officer}','{reason}','{amount}','{round}','{result}']);
  const t=all().join(' ');
  for (const m of t.matchAll(/\{[^}]+\}/g)) assert.ok(ARMY_PLACEHOLDERS.includes(m[0]), m[0]);
  for (const p of ARMY_PLACEHOLDERS) assert.ok(t.includes(p), p);
  assert.match(U.commanderLabel,/\{officer\}/); assert.match(M.notEligible.text,/\{reason\}/); assert.match(M.actionFailed.text,/\{reason\}/); assert.doesNotMatch(M.actionFailed.text,/join/i,'neutral: not the join error'); assert.match(N.dailyLoss.text,/\{unit\}.*\{amount\}/); assert.match(B.summary.text,/\{round\}.*\{result\}/);
  for (const t2 of [...orders(),...caps(),S.oneInput.text,M.drillsHelper.text,B.explainer.text,...STANCES.map(k=>S.helpers[k].text),...labels().filter(l=>!l.includes('{'))]) assert.doesNotMatch(t2,/\{/,t2);
});
test('the only figure is the docs\' round length: 10 real minutes, in the explainer; no other digit or number word', () => {
  assert.equal(ARMY_ROUND_MINUTES,10); assert.match(B.explainer.text,/every 10 real minutes/);
  for (const t of all().filter(t=>t!==B.explainer.text)) assert.doesNotMatch(t,/\d|%|\b(one|two|three|four|five|six|ten|hundred|thousand|half|twice)\b/i,t);
});
test('AI badge (ui-ux 23.2): the three officer orders are badged and speak for an AI officer; no system line, label or caption is badged', () => {
  for (const l of OO) { assert.equal(l.aiBadge,true); assert.doesNotMatch(l.text,/\{/); }
  for (const o of [U,M,S,N,B]) assert.equal('aiBadge' in o,false);
  for (const l of [...systemLines(),...captions()]) assert.equal('aiBadge' in l,false);
  assert.match(U.commanderLabel,/\(AI\)/);
});
test('three nation voices only where flavor fits: the supply captions differ per nation; controls and helpers are one plain voice', () => {
  for (const group of [N.cut,N.restored]) assert.equal(new Set(ARMY_NATIONS.map(n=>group[n].text)).size,3);
  assert.match(N.cut.korund.text,/brigade/); assert.match(N.cut.aurelle.text,/company/); assert.doesNotMatch(N.cut.kindle.text,/brigade|company/);
  for (const t of [...labels(),...lines(),...orders()]) assert.doesNotMatch(t,/Comrade|Crown|Herald|Republic|Gazette|Wire Service|State Media|Be it known|Majesty|realm|Chairman|by decree/i,t);
  for (const t of caps()) assert.doesNotMatch(t,/Be it known|By royal decree|["“”]|Gazette|State Media|Wire Service/i,t);
});
test('what the docs say: drills raise strength and morale, cut supply costs strength each game day, a stance counts in each round; nothing more is claimed', () => {
  assert.match(M.drillsHelper.text,/drills raise the unit's strength and morale/); assert.match(N.dailyLoss.text,/each game day while supply is cut/); assert.match(S.oneInput.text,/counts in every battle round/);
  for (const t of [...lines(),...orders(),...caps()]) assert.doesNotMatch(t,/\b(wins?|guarantee\w*|always|never|double|triple|bonus|reward|prize|badge|XP|rank|promotion|wage|Spark)\b/i,t);
  for (const t of Object.values(S.helpers).map(l=>l.text)) assert.doesNotMatch(t,/\b(strength|morale|bonus|damage|attack|defense|defence|win|lose)\b/i,t);
});
test('stylized and calm: no gore, casualties, death or atrocity wording, no real army, unit, war or weapon names, no urgency, no twitch combat', () => {
  for (const t of all()) {
    assert.doesNotMatch(t,/\b(kill\w*|dead|death|die[sd]?|blood\w*|gore|wound\w*|casualt\w*|corpse\w*|massacre\w*|atrocit\w*|slaughter\w*|torture\w*|execut\w*|bomb\w*|nuclear|gas|genocide)\b/i,t);
    assert.doesNotMatch(t,/\b(Wehrmacht|Marine|Marines|Legion|Spartan\w*|Roman|Mongol|NATO|Army of|Foxhole|Napoleon|Waterloo|AK-?47|tank|rifle|machine gun)\b/,t);
    assert.doesNotMatch(t,/\b(hurry|urgent|now!|last chance|act now|don't miss|quick|twitch|click fast|reflex\w*)\b|!/i,t);
  }
});
test('the stance names are neutral proposals the docs do not name, and the helpers keep to what the docs say a stance is', () => {
  assert.deepEqual(STANCES.map(k=>S.labels[k]),['Hold','Advance','Fall back']);
  for (const k of STANCES) assert.ok(S.helpers[k].text.startsWith(`${S.labels[k]}:`),k);
  assert.match(readFileSync('lib/army-copy.ts','utf8'),/give no stance names/);
});
test('no string here repeats a string from another lib module, and no on-chain, real-world or clinical wording', () => {
  const others=readdirSync('lib').filter(f=>/\.ts$/.test(f)&&f!=='army-copy.ts').map(f=>readFileSync(`lib/${f}`,'utf8')).join('\n');
  for (const t of all()) assert.ok(!others.includes(`'${t}'`)&&!others.includes(`"${t}"`)&&!others.includes(`\`${t}\``), t);
  assert.doesNotMatch(all().join(' '),/\b(Earth|real world|therapy|Tessera|chain|NFT|token|wallet)\b/i);
});
test('wired only by #738: the army card and army rules import army-copy; nothing else does', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components'),...walk('lib')]) if (/\.(t|j)sx?$/.test(f)&&!f.endsWith('army-copy.ts')&&!['app/army-card.tsx','lib/army-rules.ts'].includes(f)) assert.doesNotMatch(readFileSync(f,'utf8'),/army-copy/, f);
});
test('officer orders do not echo the Varkand starter line (QA3 note on #602)', () => {
  for (const l of OO) assert.doesNotMatch(l.text,/Hold the line/i,l.text);
});

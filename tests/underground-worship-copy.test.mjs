import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { korundUndergroundCopy as U, korundFaithCopy, faithCopy, UNDERGROUND_PLACEHOLDERS, UNDERGROUND_LABEL_MAX, UNDERGROUND_LINE_MAX, UNDERGROUND_BYLINE } from '../lib/faith-copy.ts';
import { COUP_NAME_MAX } from '../lib/palace-coup-copy.ts';
import { korundStateMedia } from '../lib/press-templates.ts';

const newLines=()=>[U.worshipAction.confirmation,U.worshipAction.alreadyToday,...U.raidWarning,U.raidResult.devotionNote,...U.quietWeek,...U.stateMediaRumors].map(l=>l.text);
const publicLines=()=>U.stateMediaRumors.map(l=>l.text);
const privateLines=()=>newLines().filter(t=>!publicLines().includes(t));
const allNew=()=>[U.worshipAction.label,...newLines()];
const fill=t=>UNDERGROUND_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(COUP_NAME_MAX)),t);

test('limits: 40/140 raw and with {city} filled to the 24-character name cap', () => {
  assert.equal(COUP_NAME_MAX,24); assert.equal(UNDERGROUND_LABEL_MAX,40); assert.equal(UNDERGROUND_LINE_MAX,140); assert.deepEqual([...UNDERGROUND_PLACEHOLDERS],['{city}']);
  assert.ok(fill(U.worshipAction.label).length<=UNDERGROUND_LABEL_MAX);
  for (const t of newLines()) assert.ok(fill(t).length<=UNDERGROUND_LINE_MAX,`${t} (${fill(t).length})`);
});
test('shape: worship action, 2 warning, 2 quiet-week and 3 rumor lines, one raid-result line, every line proposal', () => {
  assert.equal(U.worshipAction.label,'Worship quietly');
  assert.equal(U.raidWarning.length,2); assert.equal(U.quietWeek.length,2); assert.equal(U.stateMediaRumors.length,3);
  for (const o of [U.worshipAction,U.raidResult]) assert.equal(o.proposal,true);
  for (const l of [U.worshipAction.confirmation,U.worshipAction.alreadyToday,...U.raidWarning,U.raidResult.devotionNote,...U.quietWeek,...U.stateMediaRumors]) assert.equal(l.proposal,true);
});
test('{city} is the only placeholder; every rumor uses it and no rumor uses anything else', () => {
  for (const t of allNew()) for (const m of t.match(/\{[^}]*\}/g)??[]) assert.ok(UNDERGROUND_PLACEHOLDERS.includes(m),`${m} in ${t}`);
  for (const t of publicLines()) assert.match(t,/\{city\}/,t);
  assert.doesNotMatch(U.worshipAction.confirmation.text+U.worshipAction.alreadyToday.text+U.raidResult.devotionNote.text,/\{/);
});
test('no public line (State Media rumors) names a faith, shrine, believer, person or figure', () => {
  const faithNames=Object.values(faithCopy).map(f=>f.name);
  for (const t of publicLines()) {
    for (const n of faithNames) assert.ok(!t.includes(n),`${n} in ${t}`);
    assert.doesNotMatch(t.replace(/\{city\}/g,''),/\d|%|\b(faith|faithful|believers?|shrine|worship\w*|pray\w*|devotion|suspicion|congregation|clergy|citizen|comrade|informer|arrest\w*|Correction Duty|raid\w*)\b|Kinward|Fair-Wind|Open Hand|Lumen|Quiet Path|Round/i,t);
  }
});
test('byline reuses the State Media canon; rumors are State Media voice (the plan, order, calm)', () => {
  assert.deepEqual(UNDERGROUND_BYLINE,korundStateMedia.byline);
  assert.match(publicLines().join(' '),/The plan advances|Order is kept|orderly/);
});
test('no invented figures: no digits, caps, durations or Devotion amounts in any new line ("this week" is the issue\'s own quiet-week wording)', () => {
  for (const t of allNew()) assert.doesNotMatch(t.replace(/\{[^}]*\}/g,'').replace(/this week|a quiet week/g,''),/\d|%|percent|\b(one|two|three|four|five|ten|once|twice)\b|\b(days?|weeks?|months?|hours?)\b|\bcap(s|ped)?\b|\bpoints?\b|\bmaximum\b|\bmost\b/i,t);
  assert.match(U.raidResult.devotionNote.text,/fell a little/);
});
test('private lines: quiet, no violence, arrest, desecration or punishment, no tutorial or marketing, no named faith or person', () => {
  for (const t of allNew()) assert.doesNotMatch(t,/arrest|violen|prison|punish|desecrat|beat|jail|torture|kill|blood|tutorial|store|buy|marketing|Notable|@/i,t);
  for (const t of privateLines()) for (const n of Object.values(faithCopy).map(f=>f.name)) assert.ok(!t.includes(n),t);
  assert.match(U.worshipAction.confirmation.text,/in private/); assert.match(U.worshipAction.alreadyToday.text,/already worshipped today/);
  for (const l of [...U.raidWarning,...U.quietWeek]) assert.doesNotMatch(l.text,/\braid/i,l.text);
});
test('raid result reuses the existing discovery notices; only the Devotion line is added', () => {
  assert.match(U.discovery.first.text,/^An inspection found a shrine\./); assert.match(U.discovery.repeat.text,/^An inspection found a shrine again\./);
  assert.deepEqual(Object.keys(U.discovery).sort(),['first','repeat']); assert.deepEqual(Object.keys(U.raidResult).sort(),['devotionNote','proposal']);
  assert.doesNotMatch(U.discovery.first.text,/Devotion/);
  assert.equal(U.discovery.first.text,'An inspection found a shrine. Suspicion was recorded.');
});
test('no real-world, no other nation, no gray market; no public Korund worship wording', () => {
  const t=allNew().join(' ');
  assert.doesNotMatch(t,/\b(Earth|America|Europe|China|Russia|Moscow|Soviet|Stalin|Gulag|KGB|NATO)\b/); assert.doesNotMatch(t,/\b(Kindle|Aurelle|Meridian|Ilmar|Varkand|Veldwood|Hoarvale|Fulmara|Confluence)\b/);
  assert.doesNotMatch(t,/gray|grey|black[- ]?market|banner|public(ly)? worship|festival|hidden shrine item/i);
});
test('existing #251 Korund copy is unchanged and public Korund copy stays low-key', () => {
  assert.equal(U.hiddenShrine.name,'Hidden Shrine'); assert.equal(U.congregationLines.length,4);
  assert.equal(korundFaithCopy.publicChoice,'Unaffiliated is the only public option in Korund.');
});
test('unwired: nothing in app/ or components/ imports faith-copy for the underground lines', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components')]) if (/\.(t|j)sx?$/.test(f)) assert.doesNotMatch(readFileSync(f,'utf8'),/korundUndergroundCopy|stateMediaRumors|UNDERGROUND_/, f);
});

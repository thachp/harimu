import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { invitationCopy, conversionToasts, cooldownNotices, muteCopy, hostPermissionNotices, MISSION_FAITHS, HOST_NATIONS,
  MISSION_PITCH_MAX, MISSION_LINE_MAX, MISSION_BUTTON_MAX, INVITATION_COOLDOWN_DAYS, FAITH_CHANGE_LOCK_DAYS } from '../lib/missionary-copy.ts';

const lines=()=>[...Object.values(invitationCopy),...Object.values(conversionToasts),...Object.values(cooldownNotices),...Object.values(muteCopy),...Object.values(hostPermissionNotices).flat()];
const texts=()=>[...Object.values(invitationCopy).flatMap(i=>[i.pitch,i.body,...Object.values(i.buttons)]),
  ...[...Object.values(conversionToasts),...Object.values(cooldownNotices),...Object.values(muteCopy),...Object.values(hostPermissionNotices).flat()].map(l=>l.text)];

test('covers the 3 MVP faiths and 3 host nations; every entry proposal', () => {
  assert.deepEqual(Object.keys(invitationCopy),[...MISSION_FAITHS]); assert.deepEqual(Object.keys(hostPermissionNotices),[...HOST_NATIONS]);
  assert.deepEqual([...MISSION_FAITHS],['kinward-rite','fair-wind-vow','open-hand']); assert.deepEqual([...HOST_NATIONS],['kindle','aurelle','korund']);
  for (const l of lines()) assert.equal(l.proposal,true);
  for (const [k,i] of Object.entries(invitationCopy)) assert.equal(i.faithId,k);
});
test('length limits and the three buttons', () => {
  for (const i of Object.values(invitationCopy)) { assert.ok(i.pitch.length<=MISSION_PITCH_MAX, i.pitch); assert.ok(i.body.length<=MISSION_LINE_MAX, i.body);
    assert.deepEqual(i.buttons,{accept:'Accept',notNow:'Not now',mute:'Mute missionaries'});
    for (const b of Object.values(i.buttons)) assert.ok(b.length<=MISSION_BUTTON_MAX); }
  for (const t of texts()) assert.ok(t.length<=MISSION_LINE_MAX, t);
});
test('accept names the 60-day lock; cooldown names the 14-day limit', () => {
  assert.equal(FAITH_CHANGE_LOCK_DAYS,60); assert.equal(INVITATION_COOLDOWN_DAYS,14);
  assert.match(conversionToasts.accepted.text,/faith is now changed/); assert.match(conversionToasts.accepted.text,/60 real days/);
  assert.match(cooldownNotices.invitationRecent.text,/14 days/); assert.match(cooldownNotices.faithChangeLocked.text,/60 real days/);
  assert.match(conversionToasts.declined.text,/Nothing about your faith has changed/);
});
test('host permissions follow §14.8; Korund line is faith-neutral', () => {
  assert.match(hostPermissionNotices.kindle[0].text,/open preaching/);
  assert.match(hostPermissionNotices.aurelle[0].text,/only the Kinward Rite may preach/); assert.match(hostPermissionNotices.aurelle[0].text,/private-only/);
  const k=hostPermissionNotices.korund.map(l=>l.text).join(' ');
  assert.match(k,/banned/); assert.match(k,/cannot preach here/);
  assert.doesNotMatch(k,/Kinward|Fair-Wind|Open Hand|Lumen|Round|Quiet Path|arrest|deport|raid|prison|shrine/i);
});
test('only the player chooses: no coercion or pressure, no state or missionary changing faith', () => {
  for (const t of texts()) {
    assert.doesNotMatch(t,/\b(must|forced?|required|compulsory|obey|last chance|act now|hurry|don't miss|only chance|should|will be converted|converts you)\b/i, t);
    assert.doesNotMatch(t,/(state|missionary|Crown|Monarch|Chairman) (changes|converts|will change)/i, t);
  }
  for (const i of Object.values(invitationCopy)) assert.match(i.body,/The choice is yours alone\./);
  assert.match(conversionToasts.accepted.text,/by your choice/);
});
test('social tone; faith rulings: no tiers, gating, thresholds or posture verbs; no real-world religion terms; no Notable', () => {
  for (const t of texts()) {
    assert.doesNotMatch(t,/production|output|yield|combat|bonus|boost|wages?|profit|income|faster/i, t);
    assert.doesNotMatch(t,/\b(Devotion|Newcomer|Member|Devoted|Pillar|clergy|office|unlock(s|ed)? (a|the) (tier|office)|tier|threshold)\b/i, t);
    assert.doesNotMatch(t,/\b(kneel\w*|bow\w*|stand\w*|sit\w*|prostrat\w*)\b/i, t);
    assert.doesNotMatch(t,/\b(church|mosque|temple|synagogue|priest|imam|rabbi|monk|bishop|pope|christ\w*|islam\w*|jew\w*|buddh\w*|hindu\w*|bible|quran|torah|god|pray\w*|evangel\w*|bapti\w*)\b/i, t);
    assert.doesNotMatch(t,/Notable/);
  }
});
test('unwired: nothing in app/ or components/ imports missionary-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components')]) if (/\.(t|j)sx?$/.test(f)) assert.doesNotMatch(readFileSync(f,'utf8'),/missionary-copy/, f);
});

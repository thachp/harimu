import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { mvpFestivalCopy, festivalStanceCopy, mvpFestival, MVP_FESTIVAL_IDS, FESTIVAL_LABEL_MAX, FESTIVAL_LINE_MAX } from '../lib/mvp-festival-copy.ts';

const src=readFileSync(new URL('../lib/festival-copy.ts',import.meta.url),'utf8');
const fields=f=>[f.name,f.description,f.upcoming,f.active,f.joinButton,f.joinToast];
const stanceLines=()=>Object.values(festivalStanceCopy).flatMap(s=>Object.values(s));
const all=()=>[...mvpFestivalCopy.flatMap(fields),...stanceLines().map(l=>l.text)];

test('the six canon festivals, names matching §14.1 / festival-copy.ts', () => {
  assert.deepEqual(mvpFestivalCopy.map(f=>[f.id,f.faithId,f.name]),[['night-of-names','kinward-rite','Night of Names'],['oath-day','kinward-rite','Oath Day'],['launching','fair-wind-vow','Launching'],['safe-return','fair-wind-vow','Safe Return'],['bread-day','open-hand','Bread Day'],['day-of-the-open-door','open-hand','Day of the Open Door']]);
  assert.deepEqual([...MVP_FESTIVAL_IDS],mvpFestivalCopy.map(f=>f.id));
  for (const f of mvpFestivalCopy) { assert.ok(src.includes(`f('${f.id}','${f.name}'`), f.id); assert.equal(f.proposal,true); assert.equal(mvpFestival(f.id),f); }
});
test('every festival has description, upcoming, active, join button and toast within limits', () => {
  for (const f of mvpFestivalCopy) {
    assert.ok(f.name.length<=FESTIVAL_LABEL_MAX&&f.joinButton.length<=FESTIVAL_LABEL_MAX); assert.equal(f.joinButton,'Join the festival');
    for (const t of [f.description,f.upcoming,f.active,f.joinToast]) assert.ok(t.trim()&&t.length<=FESTIVAL_LINE_MAX, t);
    assert.match(f.upcoming,new RegExp(f.name)); assert.match(f.active,new RegExp(f.name));
    assert.ok(mvpFestivalCopy.filter(x=>x.faithId===f.faithId).length===2, f.faithId);
  }
});
test('stances follow §14.2: Kindle and Aurelle endorse/tolerate (no ban); Korund bans with no banner text', () => {
  assert.deepEqual(Object.keys(festivalStanceCopy),['kindle','aurelle','korund']);
  for (const n of ['kindle','aurelle']) { const s=festivalStanceCopy[n]; assert.ok(s.endorsed&&s.tolerated); assert.equal(s.banned,undefined);
    assert.match(s.endorsed.text,/Public holiday/); assert.match(s.endorsed.text,/One fewer shift today/); assert.match(s.endorsed.text,/Stability rises/); }
  assert.doesNotMatch(festivalStanceCopy.kindle.endorsed.text,/Assembly|President|Court|Mayor/, 'docs name no endorsing body');
  assert.match(festivalStanceCopy.korund.banned.text,/Grievance among followers/);
  assert.match(festivalStanceCopy.aurelle.endorsed.text,/royal decree/); assert.match(festivalStanceCopy.aurelle.tolerated.text,/private worship/);
  const k=festivalStanceCopy.korund; assert.deepEqual(Object.keys(k),['banned']);
  assert.doesNotMatch(k.banned.text,/Kinward|Fair-Wind|Open Hand|Night of Names|Oath Day|Launching|Safe Return|Bread Day|Open Door|banner|celebrat|arrest|raid|punish|shrine/i);
  for (const l of stanceLines()) { assert.equal(l.proposal,true); assert.ok(l.text.length<=FESTIVAL_LINE_MAX); }
});
test('faith rulings: no tiers, gating, thresholds, posture verbs; location-neutral Fair-Wind; no figures', () => {
  for (const t of all()) {
    assert.doesNotMatch(t,/\b(Devotion|Newcomer|Member|Devoted|Pillar|clergy|office|tier|threshold|unlock\w*)\b/i, t);
    assert.doesNotMatch(t,/\b(kneel\w*|bow\w*|stand\w*|sit\w*|prostrat\w*)\b/i, t);
    assert.doesNotMatch(t,/\d|%/, t);
    assert.doesNotMatch(t,/production|output|combat|bonus|boost|wages?|profit/i, t);
  }
  for (const id of ['launching','safe-return']) assert.doesNotMatch(fields(mvpFestival(id)).join(' '),/chapel|harbou?r|port|dock|coast|shore/i);
});
test('no real-world religion terms, no Notable; unwired', () => {
  const t=all().join(' ');
  assert.doesNotMatch(t,/\b(church|mosque|temple|synagogue|priest|imam|rabbi|monk|bishop|pope|christ\w*|islam\w*|jew\w*|buddh\w*|hindu\w*|bible|quran|torah|god|pray\w*)\b/i);
  assert.doesNotMatch(t,/Notable/);
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components')]) if (/\.(t|j)sx?$/.test(f)) assert.doesNotMatch(readFileSync(f,'utf8'),/mvp-festival-copy/, f);
});

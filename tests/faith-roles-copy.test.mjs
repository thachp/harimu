import test from 'node:test';
import assert from 'node:assert/strict';
import { faithCopy, MVP_FAITHS, clergyRoleCopy, congregationActionCopy, devotionTierCopy, devotionTier, korundUndergroundCopy,
  CLERGY_TITLE_MAX, CLERGY_DESCRIPTION_MAX, ACTION_NAME_MAX, FAITH_LINE_MAX } from '../lib/faith-copy.ts';

const canonRoles={'kinward-rite':['Hearth-Keeper','Name-Reader'],'fair-wind-vow':['Harbor Chaplain','Pilot'],'open-hand':['Almoner','Steward']};
const korundText=()=>[korundUndergroundCopy.hiddenShrine.name,korundUndergroundCopy.hiddenShrine.description,
  ...korundUndergroundCopy.congregationLines.map(l=>l.text),korundUndergroundCopy.discovery.first.text,korundUndergroundCopy.discovery.repeat.text];

test('every §14.1 clergy role of the 3 MVP faiths has copy', () => {
  assert.deepEqual([...MVP_FAITHS],['kinward-rite','fair-wind-vow','open-hand']);
  for (const f of MVP_FAITHS) {
    assert.deepEqual(clergyRoleCopy[f].map(r=>r.title),canonRoles[f]);
    for (const r of clergyRoleCopy[f]) { assert.equal(r.proposal,true); assert.ok(r.title.length<=CLERGY_TITLE_MAX);
      assert.ok(r.description.length<=CLERGY_DESCRIPTION_MAX, r.description); assert.ok(r.description.split(/(?<=\.)\s/).length<=2, r.title); }
    // Role names must match the clergy list already in faithCopy (#114).
    for (const t of canonRoles[f]) assert.ok(faithCopy[f].clergy.some(c=>c.startsWith(t)), t);
  }
});
test('3-4 congregation actions per faith: service, rite, charity, festival; festival names are canon', () => {
  for (const f of MVP_FAITHS) { const a=congregationActionCopy[f];
    assert.ok(a.length>=3&&a.length<=4, f); assert.deepEqual([...new Set(a.map(x=>x.kind))].sort(),['charity','festival','rite','service']);
    for (const x of a) { assert.equal(x.proposal,true); assert.ok(x.name.length<=ACTION_NAME_MAX, x.name); assert.ok(x.line.length<=FAITH_LINE_MAX, x.line); }
    const fest=a.find(x=>x.kind==='festival'); assert.ok(faithCopy[f].festivals.some(fe=>(fest.name+fest.line).includes(fe.name)), f);
  }
});
test('4 Devotion tiers cover 0-100 with no gaps', () => {
  assert.equal(devotionTierCopy.length,4); assert.equal(devotionTierCopy[0].min,0); assert.equal(devotionTierCopy.at(-1).max,100);
  for (let i=1;i<4;i++) assert.equal(devotionTierCopy[i].min,devotionTierCopy[i-1].max+1);
  for (let d=0; d<=100; d++) assert.ok(devotionTier(d)); assert.equal(devotionTier(-5).label,'Newcomer'); assert.equal(devotionTier(500).label,'Pillar');
  for (const t of devotionTierCopy) { assert.equal(t.proposal,true); assert.ok(t.line.length<=FAITH_LINE_MAX, t.line); }
});
test('Devotion and clergy copy never implies a production or combat benefit', () => {
  const all=[...devotionTierCopy.map(t=>t.label+' '+t.line),...MVP_FAITHS.flatMap(f=>[...clergyRoleCopy[f].map(r=>r.description),...congregationActionCopy[f].map(a=>a.line)])];
  for (const l of all) assert.doesNotMatch(l,/production|output|yield|combat|attack|defen[cs]e|damage|strength|bonus|faster|wages?|profit|income|blessed with (wealth|victory)/i, l);
});
test('Korund underground copy follows §14.6 low-key rules', () => {
  const text=korundText(); const all=text.join(' ');
  assert.equal(korundUndergroundCopy.congregationLines.length>=3&&korundUndergroundCopy.congregationLines.length<=4,true);
  for (const l of text) assert.ok(l.length<=FAITH_LINE_MAX, l);
  assert.doesNotMatch(all,/arrest|raid|seiz|smash|burn|destroy|desecrat|beat|violen|blood|prison|jail|cell|guard|police|informer|traitor|named|believer [A-Z]/i);
  assert.doesNotMatch(all,/gray market|black market|store|buy|price|join now|discover the/i, 'never store or marketing copy');
  assert.match(korundUndergroundCopy.discovery.first.text,/^An inspection found a shrine\./); assert.match(korundUndergroundCopy.discovery.first.text,/Suspicion/);
  assert.doesNotMatch(korundUndergroundCopy.discovery.first.text,/Correction Duty/, 'first discovery: Suspicion only');
  assert.match(korundUndergroundCopy.discovery.repeat.text,/Correction Duty/); assert.match(korundUndergroundCopy.discovery.repeat.text,/up to 7 days/);
  for (const l of [korundUndergroundCopy.hiddenShrine,...korundUndergroundCopy.congregationLines,korundUndergroundCopy.discovery.first,korundUndergroundCopy.discovery.repeat]) assert.equal(l.proposal,true);
});
test('no Notable, no real-world religion terms', () => {
  const all=[...korundText(),...devotionTierCopy.map(t=>t.label+' '+t.line),...MVP_FAITHS.flatMap(f=>[...clergyRoleCopy[f].flatMap(r=>[r.title,r.description]),...congregationActionCopy[f].flatMap(a=>[a.name,a.line])])].join(' ');
  assert.doesNotMatch(all,/Notable/);
  assert.doesNotMatch(all,/\b(church|mosque|temple|synagogue|priest|imam|rabbi|monk|nun|bishop|pope|christ\w*|islam\w*|jew\w*|buddh\w*|hindu\w*|bible|quran|torah|god)\b/i);
});

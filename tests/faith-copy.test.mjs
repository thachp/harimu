import test from 'node:test';
import assert from 'node:assert/strict';
import { faithCopy, unaffiliatedCopy, korundFaithCopy, FAITH_INVENTED_NOTE, FAITH_DESCRIPTION_MAX, FAITH_LINE_MAX, faithFestivals } from '../lib/faith-copy.ts';

const canon={ 'lumen-canon':['Lumen Canon',['Long Light','Clearing'],'Prism Spire'], 'kinward-rite':['Kinward Rite',['Night of Names','Oath Day'],'Hearth of First Names'],
  'the-round':['The Round',['Turning Days'],'The Old Ring'], 'fair-wind-vow':['Fair-Wind Vow',['Launching','Safe Return'],'Harbor of Vows'],
  'quiet-path':['The Quiet Path',['Still Week','Lantern of Attention'],'High Retreat'], 'open-hand':['The Open Hand',['Bread Day','Day of the Open Door'],'Bread Hall'] };
const all=()=>[...Object.values(faithCopy).flatMap(f=>[f.name,f.archetype,f.tagline,f.description,...f.practices,...f.clergy,f.holySite,...f.festivals.flatMap(x=>[x.name,x.blurb])]),
  ...Object.values(unaffiliatedCopy),...Object.values(korundFaithCopy),FAITH_INVENTED_NOTE];
const fold=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

test('all six faiths covered with canon names, festivals and holy sites', () => {
  assert.deepEqual(Object.keys(faithCopy).sort(), Object.keys(canon).sort());
  for (const [id,[name,fests,site]] of Object.entries(canon)) { const f=faithCopy[id];
    assert.equal(f.id,id); assert.equal(f.name,name); assert.equal(f.proposal,false);
    assert.deepEqual(faithFestivals(id),fests); assert.ok(f.holySite.startsWith(site));
    assert.ok(f.practices.length>=2 && f.clergy.length>=1);
    for (const x of f.festivals) assert.equal(x.proposal,true, `${id} ${x.name} blurb is new wording`); }
});
test('length limits', () => {
  for (const f of Object.values(faithCopy)) { assert.ok(f.description.length<=FAITH_DESCRIPTION_MAX, f.id);
    for (const s of [f.tagline,...f.practices,...f.festivals.map(x=>x.blurb)]) assert.ok(s.length<=FAITH_LINE_MAX, s); }
});
test('no real-world religion names, titles or slurs', () => {
  const banned=['christ','jesus','bible','church','catholic','pope','islam','muslim','allah','quran','koran','mosque','imam','jew','juda','torah','rabbi','synagogue','hindu','vedic','buddh','dharma','nirvana','sikh','taoi','dao ','shinto','pagan','wicca','druid','mormon','zoroast','jain','baha','heathen','infidel','heretic','cult','kafir','gentile','saint','amen','hallelu','messiah','prophet'];
  for (const s of all()) for (const b of banned) assert.ok(!fold(s).includes(b), `"${s}" contains ${b}`);
});
test('Korund copy is low-key and Kindle rank/Notable rules respected', () => {
  for (const s of Object.values(korundFaithCopy)) assert.ok(!/arrest|raid|violen|prison|punish|tutorial|store|buy/i.test(s), s);
  for (const s of all()) { assert.ok(!/\bNotable\b/.test(s), s); }
  assert.ok(/invented/i.test(FAITH_INVENTED_NOTE) && /not based on any real religion/.test(FAITH_INVENTED_NOTE));
});

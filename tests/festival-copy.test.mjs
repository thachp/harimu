import test from 'node:test';
import assert from 'node:assert/strict';
import { faithFestivalCopy, nationFestivalCopy, FESTIVAL_NAME_MAX, FESTIVAL_TEXT_MAX } from '../lib/festival-copy.ts';
import { faithCopy } from '../lib/faith-copy.ts';

const nations={ kindle:['Ballot Night',"Founders' Forge Day",'Market Bell'], korund:['Plan Day','Quota Rally',"Chairman's Birthday","People's Congress"],
  aurelle:['Coronation Day','Hearth Night','Charter Fair',"Heir's Naming"], confluence:['Congress Lanterns','Canal Festival','Quota Day'],
  meridian:['Congress Week','Exam Day','Turbine Day'], ilmar:['Stilldays','Daily Vigil','Feast of First Light','Assembly Election','Great Pilgrimage'],
  hoarvale:['Opening of the Moot','Honors List Day','Aurora Night','Election Night'], varkand:['Muster Day','Rotation Day','Mandate Plebiscite','Lantern Watch'],
  veldwood:['Vote Days','Dividend Day','Glade Festival','Initiative Night'], fulmara:['Exchange Bell','Grand Regatta','Charter Day','Fair-Wind Blessing','Dock Strike'] };
const faithFests=['Long Light','Clearing','Night of Names','Oath Day','Turning Days','Launching','Safe Return','Still Week','Lantern of Attention','Bread Day','Day of the Open Door'];
const every=()=>[...Object.values(faithFestivalCopy),...Object.values(nationFestivalCopy)].flat();
const fold=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

test('every §14.1 faith festival covered and matches faith-copy', () => {
  assert.deepEqual(Object.values(faithFestivalCopy).flat().map(x=>x.name).sort(), [...faithFests].sort());
  for (const [id,list] of Object.entries(faithFestivalCopy)) assert.deepEqual(list.map(x=>x.name), faithCopy[id].festivals.map(x=>x.name));
});
test('every nation page holiday covered with canon names', () => {
  assert.deepEqual(Object.keys(nationFestivalCopy).sort(), Object.keys(nations).sort());
  for (const [n,names] of Object.entries(nations)) assert.deepEqual(nationFestivalCopy[n].map(x=>x.name), names, n);
  for (const x of nationFestivalCopy.varkand) assert.match(x.text,/Red Alert/);
});
test('ids unique, proposals marked, length limits', () => {
  const all=every(); assert.equal(new Set(all.map(x=>x.id)).size, all.length);
  for (const x of all) { assert.equal(x.proposal,true, x.id); assert.ok(x.name.length<=FESTIVAL_NAME_MAX, x.name); assert.ok(x.text.length>0 && x.text.length<=FESTIVAL_TEXT_MAX, x.id); }
  assert.equal(FESTIVAL_NAME_MAX,40); assert.equal(FESTIVAL_TEXT_MAX,140);
});
test('no real-world religion terms, no Notable, Korund stays secular', () => {
  const banned=['christ','jesus','bible','church','catholic','pope','islam','muslim','allah','quran','mosque','imam','jew','torah','rabbi','synagogue','hindu','buddh','dharma','sikh','shinto','pagan','wicca','druid','zoroast','heathen','infidel','heretic','cult','saint','amen','messiah','prophet','easter','christmas','diwali','ramadan','eid','hanukkah','passover','yule','solstice mass'];
  for (const x of every()) { const s=fold(`${x.name} ${x.text}`); for (const b of banned) assert.ok(!s.includes(b), `${x.id}: ${b}`); assert.ok(!/\bNotable\b/.test(`${x.name} ${x.text}`)); }
  for (const x of nationFestivalCopy.korund) assert.ok(!/faith|shrine|worship|prayer/i.test(x.text), x.id);
});

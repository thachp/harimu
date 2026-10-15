import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { wave2ChatterLines, wave2Chatter, WAVE2_CHATTER_NATIONS, WAVE2_CHATTER_MIN_PER_NATION, WAVE2_CHATTER_LINE_MAX, WAVE2_FESTIVALS } from '../lib/wave2-chatter.ts';
import { ambientChatterLines } from '../lib/ambient-chatter.ts';
import { citizenNameLists } from '../lib/citizen-names.ts';

test('Confluence and Hoarvale only, at least 20 lines each, unique ids and text', () => {
  assert.deepEqual([...WAVE2_CHATTER_NATIONS].sort(),['confluence','hoarvale']);
  for (const n of WAVE2_CHATTER_NATIONS) { assert.ok(wave2Chatter(n).length>=WAVE2_CHATTER_MIN_PER_NATION, n); for (const l of wave2Chatter(n)) { assert.equal(l.nation,n); assert.ok(l.id.startsWith(`${n}-`)); } }
  assert.equal(new Set(wave2ChatterLines.map(l=>l.id)).size, wave2ChatterLines.length);
  assert.equal(new Set(wave2ChatterLines.map(l=>l.text)).size, wave2ChatterLines.length);
  for (const n of ['kindle','korund','aurelle','varkand','veldwood','fulmara','meridian','ilmar','unknown']) assert.deepEqual(wave2Chatter(n),[]);
});
test('every line is AI-labeled (AiTextTag deterministic) and a proposal', () => {
  for (const l of wave2ChatterLines) { assert.equal(l.aiText,true); assert.equal(l.provenance,'deterministic'); assert.equal(l.proposal,true); }
});
test('opt-out hides all chatter', () => {
  for (const n of WAVE2_CHATTER_NATIONS) { assert.ok(wave2Chatter(n).length>0); assert.deepEqual(wave2Chatter(n,{hideAiChatter:true}),[]); }
});
test('80-character hard limit on every line', () => {
  assert.equal(WAVE2_CHATTER_LINE_MAX,80);
  for (const l of wave2ChatterLines) assert.ok(l.text.length<=80, `${l.id}: ${l.text.length}`);
});
test('no figures, no real-world references, no Notable, no citizen names, no named speakers', () => {
  const real=['earth','europe','asia','africa','america','china','japan','russia','france','britain','london','paris','rome','moscow','dollar','euro','yen','ruble','pound','vietnam','thailand','stalin','lenin','mao','trump','biden','putin','christmas','easter','ramadan','facebook','google','twitter','instagram','tiktok','iphone'];
  const names=new Set(Object.values(citizenNameLists).flatMap(l=>[...l.given,...l.family]));
  for (const l of wave2ChatterLines) { const s=l.text.toLowerCase();
    assert.doesNotMatch(l.text,/\d|%/, `${l.id} has a figure`);
    for (const r of real) assert.ok(!new RegExp(`\\b${r}\\b`).test(s), `${l.id} mentions ${r}`);
    assert.ok(!/\bNotable\b/i.test(l.text), l.id);
    // 'Aurora Night' is a canon Hoarvale festival; its first word is also in a citizen name list.
    for (const w of l.text.replaceAll('Aurora Night','').match(/\b[A-Z][a-z]+\b/g)??[]) assert.ok(!names.has(w), `${l.id} uses citizen name ${w}`); }
});
test('nation voice markers and no cross-talk between the two voices', () => {
  const voice={confluence:/canal|cooperative|ledger|bowl|stream|current|water|terrace|lantern|delta|waterwheel|Quota Day|price board|Assembly|meeting house|bread hall|pot\b/i,
    hoarvale:/queue|turn|number|coalition|bathhouse|Moot|Trading House|Frostcore|Honors|Aurora Night|Question Time|Crown House|Election Night|Rime|tenure|fjord|count party|rye|tea\b/i};
  const other={confluence:'hoarvale',hoarvale:'confluence'};
  for (const n of WAVE2_CHATTER_NATIONS) { const hits=wave2Chatter(n).filter(l=>voice[n].test(l.text)).length; assert.ok(hits>=15, `${n}: only ${hits} lines carry nation markers`);
    const crossed=wave2Chatter(n).filter(l=>voice[other[n]].test(l.text)&&!/\bcurrent\b|\bturn\b|\bnumber\b|\bbowl\b|\bpot\b|\btea\b/i.test(l.text)); assert.deepEqual(crossed.map(l=>l.id),[], `${n} lines with the other nation's markers`); }
  const confluence=wave2Chatter('confluence').map(l=>l.text).join(' '), hoarvale=wave2Chatter('hoarvale').map(l=>l.text).join(' ');
  assert.doesNotMatch(confluence,/Moot|Sovereign|Prime Minister|Honors|Crown|Kinward/); assert.doesNotMatch(hoarvale,/\bParty\b/); assert.doesNotMatch(hoarvale,/Four Pillars|cooperative|Guidance Plan|Congress|Meetwater|lantern/i);
});
test('Confluence never mocks the Four Pillars; Hoarvale never insults the Sovereign', () => {
  const confluence=wave2Chatter('confluence').map(l=>l.text).join(' ');
  assert.doesNotMatch(confluence,/Four Pillars|Pillar|General Secretary|Politburo|mock|fool|puppet|useless|ridicul|corrupt|rigged|stupid/i);
  assert.ok(wave2Chatter('confluence').some(l=>/question|perhaps/i.test(l.text)), 'indirect criticism is the voice');
  const hoarvale=wave2Chatter('hoarvale').map(l=>l.text).join(' ');
  assert.doesNotMatch(hoarvale,/Sovereign|Monarch|King|Queen|mock|fool|puppet|useless|ridicul|insult|idle|figurehead|parasite|stupid/i);
  for (const l of wave2Chatter('hoarvale')) if (/Crown House/.test(l.text)) assert.doesNotMatch(l.text,/useless|idle|fat|parasite|waste|overpaid/i, l.id);
});
test('no copy of MVP chatter', () => {
  const mvp=new Set(ambientChatterLines.map(l=>l.text));
  for (const l of wave2ChatterLines) assert.ok(!mvp.has(l.text), l.id);
});
test('context tags are optional, valid, canon festival names only, and match the line', () => {
  const ok=/^(day|night|festival:.+)$/;
  const tagged=wave2ChatterLines.filter(l=>l.context);
  assert.ok(tagged.length>0 && tagged.length<wave2ChatterLines.length, 'some lines tagged, rest generic');
  for (const n of WAVE2_CHATTER_NATIONS) assert.ok(wave2Chatter(n).some(l=>l.context?.startsWith('festival:')), `${n} has a festival line`);
  for (const l of tagged) { assert.match(l.context,ok, l.id);
    if (l.context.startsWith('festival:')) { const name=l.context.slice(9); assert.ok(WAVE2_FESTIVALS[l.nation].includes(name), `${l.id}: ${name} is not canon`); assert.ok(l.text.includes(name), `${l.id} names its festival`); } }
  assert.deepEqual(WAVE2_FESTIVALS.confluence,['Congress Lanterns','Canal Festival','Quota Day']);
  assert.deepEqual(WAVE2_FESTIVALS.hoarvale,['Opening of the Moot','Honors List Day','Aurora Night','Election Night']);
});
test('unwired: nothing in app/ or components/ imports wave2-chatter', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components')]) if (/\.(t|j)sx?$/.test(f)) assert.doesNotMatch(readFileSync(f,'utf8'),/wave2-chatter/, f);
});

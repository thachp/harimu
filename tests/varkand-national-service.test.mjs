import test from 'node:test';
import assert from 'node:assert/strict';
import { nationalServiceDays, nationalServiceDay, NATIONAL_SERVICE_TERM_DAYS, NEWCOMER_SHIELD_DAYS, SERVICE_TITLE_MAX, SERVICE_LINE_MAX,
  SERVICE_BRIEFING_MIN, SERVICE_BRIEFING_MAX, VARKAND_CANON_TERMS, redAlertLine, recruitCallSign, CALL_SIGN_REROLLS } from '../lib/varkand-national-service.ts';
import { varkandCallSigns } from '../lib/citizen-names.ts';

const lines=d=>[d.title,d.objective,...d.briefing,d.completion];
const all=()=>[...nationalServiceDays.flatMap(lines),redAlertLine.text];

test('exactly 7 days, numbered 1-7, canon term and shield lengths', () => {
  assert.equal(NATIONAL_SERVICE_TERM_DAYS,7); assert.equal(NEWCOMER_SHIELD_DAYS,14);
  assert.equal(nationalServiceDays.length,7);
  assert.deepEqual(nationalServiceDays.map(d=>d.day),[1,2,3,4,5,6,7]);
  for (const d of nationalServiceDays) { assert.ok(d.objective && d.completion, `day ${d.day}`); assert.equal(d.proposal,true, `day ${d.day} is new wording`);
    assert.ok(d.briefing.length>=SERVICE_BRIEFING_MIN && d.briefing.length<=SERVICE_BRIEFING_MAX, `day ${d.day} briefing count`); }
  assert.equal(nationalServiceDay(3)?.day,3); assert.equal(nationalServiceDay(8),undefined);
});
test('no combat deployment within the term: combat wording only appears negated', () => {
  const combat=/\b(deploy\w*|combat|front ?line|battle\w*|sortie|mobili[sz]\w*|conscript\w*|frontier duty|garrison duty|war)\b/i;
  for (const s of all()) if (combat.test(s)) assert.match(s,/\b(not|never|nor)\b/i, `affirmative combat wording: "${s}"`);
  // The shield is stated to the recruit on day 1 and again at term end.
  for (const n of [1,7]) assert.ok(nationalServiceDay(n).briefing.some(s=>/14 days/.test(s)&&/\b(not|never)\b/.test(s)), `day ${n} states the 14-day shield`);
});
test('does not glorify military rule; names its costs', () => {
  const banned=['glory','glorious','heroic','hero','valor','valour','honor to die','sacrifice','destiny','greatness','mighty','invincib','triumph','conquer','crush','enemy','enemies','traitor','obey without','unquestion','iron fist','strongman','fatherland','motherland','for the directorate','long live','hail','martyr','blood','kill','weakling','coward'];
  for (const s of all()) for (const b of banned) assert.ok(!s.toLowerCase().includes(b), `"${s}" contains "${b}"`);
  const text=all().join(' ');
  for (const cost of [/security levy/,/requisition/,/Plebiscite/,/Coups happen/,/exit permit/,/martial law/]) assert.match(text,cost);
});
test('length limits', () => {
  for (const d of nationalServiceDays) { assert.ok(d.title.length<=SERVICE_TITLE_MAX, d.title);
    for (const s of lines(d).slice(1)) assert.ok(s.length<=SERVICE_LINE_MAX, `${s.length}: ${s}`); }
});
test('canon names only, no personal names, no Notable', () => {
  const canon=new Set(VARKAND_CANON_TERMS);
  const allowed=new Set(['Recruit','Register','Registered','Today','Every','Green','Amber','Red','Service','Civilian','Do','Go','Nobody','Your','Most','You','No','Know','Find','Three','Fog','Check','Read','Visit','Work','Attend','Shift','Scrip','Alert','Level','Briefing','Chapel','Registration','Decide','Coups','Statues','Order','Reservists','From','Each','Term','Get','Chair','Marshals','Varkand\'s','Their','The','It','That','Intake','Reading','First','Who','Governs','End','Choice','Orienteering','Directorate\'s','Five','Commands','Chaplaincy','Corps','Mandate','Plebiscite','Field','Wards','Peat','Commons','Moorhald\'s','Voren','Light','Watchfast','Varkand','Directorate','Call','Kit','At','Of','And','Leaving','If','Recruits','Tessera','Training']);
  for (const s of all()) { assert.ok(!/\bNotable\b/.test(s), s);
    for (const w of s.match(/\b[A-Z][a-z']+\b/g) ?? []) assert.ok(allowed.has(w)||canon.has(w), `unvetted capitalized word "${w}" in "${s}"`); }
  for (const place of ['Watchfast','Moorhald','Voren Light','Peat Commons','Chaplaincy Corps','Mandate Plebiscite','Field Scrip']) assert.ok(canon.has(place));
});
test('Red Alert line keeps the 14-day no-combat guarantee', () => {
  assert.equal(redAlertLine.proposal,true); assert.ok(redAlertLine.text.length<=SERVICE_LINE_MAX);
  assert.match(redAlertLine.text,/Red Alert/); assert.match(redAlertLine.text,/stay in training/);
  assert.match(redAlertLine.text,/\bnot deployed\b.*14 days/);
});
test('call sign comes from the Varkand roll with one reroll; never typed', () => {
  for (let seed=0; seed<64; seed++) { const a=recruitCallSign(varkandCallSigns,seed), b=recruitCallSign(varkandCallSigns,seed,1);
    assert.ok(varkandCallSigns.includes(a)&&varkandCallSigns.includes(b)); assert.notEqual(a,b);
    assert.equal(recruitCallSign(varkandCallSigns,seed,5),b, 'rerolls are capped'); }
  assert.equal(CALL_SIGN_REROLLS,1); assert.equal(recruitCallSign(varkandCallSigns,-3),recruitCallSign(varkandCallSigns,-3));
  const d4=nationalServiceDay(4).briefing.join(' '); assert.match(d4,/assigns your call sign/); assert.match(d4,/reroll/); assert.doesNotMatch(d4,/choose|type|pick/i);
});
test('day 7 states the exit permit and its cost plainly', () => {
  const d7=nationalServiceDay(7).briefing.join(' ');
  assert.match(d7,/exit permit/); assert.match(d7,/can be denied/); assert.match(d7,/savings/); assert.match(d7,/standing/);
});

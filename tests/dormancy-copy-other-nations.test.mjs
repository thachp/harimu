import test from 'node:test';
import assert from 'node:assert/strict';
import { welcomeBackOtherNations as WB, welcomeBackOtherFor, welcomeBack, DORMANCY_OTHER_NATIONS, DORMANCY_PLACEHOLDERS, DORMANCY_NAME_MAX, DORMANCY_NUMBER_MAX, DORMANCY_LINE_MAX } from '../lib/dormancy-copy.ts';

// Leader-voice check from tests/dormancy-copy.test.mjs (MVP frames), extended with the seven nations' leaders and governing bodies
// (harimu-docs world/nations/* Government rows). No leader or body speaks, no quotation marks (QA3 on #899).
const LEADER_VOICE=new RegExp('^Be it known|By royal decree|\\bI am an AI\\b|["“”‘’«»]|\\b('+[
  'Crown','Monarch','Majesty','decree','Chairman','Presidium','Herald',
  'Party','Congress','Central Committee','Politburo','Four Pillars','General Secretary','President','Premier','Chair','Paramount Leader','Standing Committee',
  'Oracle','Supreme Oracle','Council of Elders','Elders','Synod','Guardian Synod','Assembly of the Faithful','Grand Mufti','Mufti','Lamplighters','Glaziers','Wardens',
  'Sovereign','Crown House','Moot','Ring Moot','Parliament','Prime Minister','Royal Assent',
  'Directorate','Five Commands','Marshal','Marshals','Cabinet','Technocrats',
  'Grove council','Federal Assembly','Federal Council','Council','Speaker',
  'Grand Council','Council of Ten','Lodestar','Tribune','Tribune of the Docks',
].join('|')+')\\b','i');
const fill=t=>t.replaceAll('{daysAway}','x'.repeat(DORMANCY_NAME_MAX)).replaceAll('{headlineCount}','9'.repeat(DORMANCY_NUMBER_MAX));
test('#773 follow-up: one frame per other nation, shaped like the MVP frames', () => {
  assert.deepEqual(WB.map(w=>w.nationId),[...DORMANCY_OTHER_NATIONS]); assert.equal(WB.length,7);
  for (const w of WB) {
    assert.equal(welcomeBackOtherFor(w.nationId),w); assert.equal(w.aiBadge,false); assert.equal(w.proposal,true); if (w.byline) assert.equal(w.byline.proposal,false,w.byline.name);
    for (const l of [w.greeting,w.news]) { assert.equal(l.proposal,true); assert.ok(fill(l.text).length<=DORMANCY_LINE_MAX,l.text); assert.ok(!/\d/.test(l.text),l.text);
      for (const m of l.text.match(/\{[^}]+\}/g)??[]) assert.ok(DORMANCY_PLACEHOLDERS.includes(m),m);
      assert.doesNotMatch(l.text,/missed you|penalt|hurry/i); assert.doesNotMatch(w.byline?l.text.replace(w.byline.name+':',''):l.text,LEADER_VOICE,l.text); // the canonical byline itself may name a body (Directorate Bulletin, Steamgate Herald)
      if (w.byline) assert.ok(l.text.startsWith(w.byline.name+':'),l.text); }
    assert.match(w.greeting.text,/\{daysAway\}/); assert.match(w.news.text,/\{headlineCount\}/);
  }
  const texts=[...welcomeBack,...WB].flatMap(w=>[w.greeting.text,w.news.text]); assert.equal(new Set(texts).size,texts.length);
});
test('QA3 plants: a leader or body speaking, or a quotation, fails the check', () => {
  for (const bad of ['The Grand Mufti welcomes you back.','The Speaker says welcome back.','The Moot welcomes you back.','A Marshal of the Directorate greets you.','The Oracle: welcome back.','"Welcome back," says the paper.','The Synod and the Crown House welcome you.','The Council of Ten welcomes you back.'])
    assert.match(bad,LEADER_VOICE,bad);
});

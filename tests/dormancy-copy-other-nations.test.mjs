import test from 'node:test';
import assert from 'node:assert/strict';
import { welcomeBackOtherNations as WB, welcomeBackOtherFor, welcomeBack, DORMANCY_OTHER_NATIONS, DORMANCY_PLACEHOLDERS, DORMANCY_NAME_MAX, DORMANCY_NUMBER_MAX, DORMANCY_LINE_MAX } from '../lib/dormancy-copy.ts';

const fill=t=>t.replaceAll('{daysAway}','x'.repeat(DORMANCY_NAME_MAX)).replaceAll('{headlineCount}','9'.repeat(DORMANCY_NUMBER_MAX));
test('#773 follow-up: one frame per other nation, shaped like the MVP frames', () => {
  assert.deepEqual(WB.map(w=>w.nationId),[...DORMANCY_OTHER_NATIONS]); assert.equal(WB.length,7);
  for (const w of WB) {
    assert.equal(welcomeBackOtherFor(w.nationId),w); assert.equal(w.aiBadge,false); assert.equal(w.proposal,true);
    for (const l of [w.greeting,w.news]) { assert.equal(l.proposal,true); assert.ok(fill(l.text).length<=DORMANCY_LINE_MAX,l.text); assert.ok(!/\d/.test(l.text),l.text);
      for (const m of l.text.match(/\{[^}]+\}/g)??[]) assert.ok(DORMANCY_PLACEHOLDERS.includes(m),m);
      assert.doesNotMatch(l.text,/Be it known|decree|missed you|penalt|hurry/i);
      if (w.byline) assert.ok(l.text.startsWith(w.byline.name+':'),l.text); }
    assert.match(w.greeting.text,/\{daysAway\}/); assert.match(w.news.text,/\{headlineCount\}/);
  }
  const texts=[...welcomeBack,...WB].flatMap(w=>[w.greeting.text,w.news.text]); assert.equal(new Set(texts).size,texts.length);
});

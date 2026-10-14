import test from 'node:test';
import assert from 'node:assert/strict';
import { firstLoopStep } from '../lib/first-loop.ts';
import { firstWeekArcs, firstWeekDay, visibleGoals } from '../lib/first-week.ts';

const reqs=new Set(['petitions','rank-ladder','merit-badges','notables','claimant-pledges','screen-view-tracking']);
const screens=new Set(['workplace','market','household','square','government','nation','world']);
test('arc covers days 2–7 for each MVP nation with screen and signal', () => {
  assert.deepEqual(firstWeekArcs.map(arc=>arc.nationId).sort(), ['aurelle','kindle','korund']);
  const ids=new Set();
  for (const arc of firstWeekArcs) {
    assert.deepEqual(arc.days.map(day=>day.day), [2,3,4,5,6,7]);
    for (const day of arc.days) {
      assert.ok(day.goals.length>=1 && day.theme.length>3);
      for (const goal of day.goals) {
        assert.ok(screens.has(goal.screen), goal.id); assert.ok(goal.text.length>10 && goal.signal.length>5, goal.id);
        assert.ok(!ids.has(goal.id)); ids.add(goal.id);
        if ('needsCode' in goal) assert.ok(goal.needsCode.length>3 && goal.requires.length>0 && goal.requires.every(need=>reqs.has(need)), goal.id); else assert.equal(goal.requires, undefined);
      }
    }
    assert.ok(arc.days.flatMap(day=>day.goals).filter(goal=>!goal.requires).length>=6, arc.nationId);
  }
});
test('copy uses Emberwarden and makes no reward promises', () => {
  const text=JSON.stringify(firstWeekArcs);
  assert.match(text, /Emberwarden/); assert.doesNotMatch(text, /Notable\b(?! conversation)/);
  assert.doesNotMatch(text, /\b(reward|bonus|free|earn \d|earn your|earned|gain\w*|grant)/i);
});
test('firstWeekDay maps enrollment age to arc day', () => {
  const enrolled=Date.parse('2026-10-01T00:00:00Z'); const at=d=>({nationId:'kindle',enrolledAt:new Date(enrolled).toISOString(),now:enrolled+d*86400000+1000});
  assert.equal(firstWeekDay(at(0)), null);
  assert.equal(firstWeekDay(at(1)).day, 2);
  assert.equal(firstWeekDay(at(6)).day, 7);
  assert.equal(firstWeekDay(at(7)), null);
  assert.equal(firstWeekDay({...at(2),nationId:'veldwood'}), null);
  assert.equal(firstWeekDay({...at(2),enrolledAt:'bad'}), null);
  assert.equal(firstWeekDay({...at(2),now:enrolled-1}), null);
});
test('goals requiring unbuilt features are hidden by default', () => {
  const all=firstWeekArcs.flatMap(arc=>arc.days.flatMap(day=>day.goals));
  assert.equal(all.filter(goal=>goal.requires).length, 17);
  assert.equal(all.filter(goal=>goal.requires?.includes('screen-view-tracking')).length, 11);
  const favor=all.find(goal=>goal.id==='aurelle-7-favor'); assert.equal(favor.screen,'workplace'); assert.equal(favor.requires, undefined);
  for (const arc of firstWeekArcs) for (const day of arc.days) {
    const shown=visibleGoals(day);
    assert.ok(shown.length>=1, `${arc.nationId} day ${day.day}`);
    assert.ok(shown.every(goal=>!goal.requires));
    assert.equal(visibleGoals(day,[...reqs]).length, day.goals.length);
  }
  const k7=firstWeekArcs[0].days.find(day=>day.day===7);
  assert.ok(visibleGoals(k7,['rank-ladder']).some(goal=>goal.requires?.includes('rank-ladder')));
  const a6=firstWeekArcs[2].days.find(day=>day.day===6);
  assert.ok(!visibleGoals(a6,['claimant-pledges']).some(goal=>goal.id==='aurelle-6-claimants'));
  assert.ok(visibleGoals(a6,['claimant-pledges','screen-view-tracking']).some(goal=>goal.id==='aurelle-6-claimants'));
});
test('first loop wins the day 1–3 overlap', () => {
  const enrolled=Date.parse('2026-10-01T00:00:00Z'); const now=enrolled+36*3600000;
  const base={nationId:'korund',enrolledAt:new Date(enrolled).toISOString(),now};
  const loop=firstLoopStep({...base,shifts:[],food:0});
  assert.ok(loop);
  assert.equal(firstWeekDay({...base,firstLoopActive:Boolean(loop)}), null);
  const done=firstLoopStep({...base,shifts:[],food:0,mealReadyAt:new Date(now).toISOString()});
  assert.equal(done, null);
  assert.equal(firstWeekDay({...base,firstLoopActive:Boolean(done)}).day, 2);
});

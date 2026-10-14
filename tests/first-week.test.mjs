import test from 'node:test';
import assert from 'node:assert/strict';
import { firstWeekArcs, firstWeekDay } from '../lib/first-week.ts';

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
        if ('needsCode' in goal) assert.ok(goal.needsCode.length>3);
      }
    }
    assert.ok(arc.days.flatMap(day=>day.goals).filter(goal=>!goal.needsCode).length>=8, arc.nationId);
  }
});
test('copy uses Emberwarden and makes no reward promises', () => {
  const text=JSON.stringify(firstWeekArcs);
  assert.match(text, /Emberwarden/); assert.doesNotMatch(text, /Notable\b(?! conversation)/);
  assert.doesNotMatch(text, /\b(reward|bonus|free|earn \d|grant)/i);
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

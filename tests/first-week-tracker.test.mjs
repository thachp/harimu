/** First-week tracker (#134): day progression, requires-gating, stub persistence, and the rendered UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { firstWeekArcs, firstWeekDay, visibleGoals } from '../lib/first-week.ts';
import { firstWeekTracker, goalAvailable, goalSignalDone, newlyDone, stubFirstWeekProgressStore, firstWeekStubKey } from '../lib/first-week-progress.ts';

const enrolledAt='2026-10-01T12:00:00.000Z', day=86400000, t0=Date.parse(enrolledAt);
const vis=(d,available)=>d&&{...d,goals:visibleGoals(d,available)};
const at=(n,nationId='kindle',done=[],available)=>firstWeekTracker({day:vis(firstWeekDay({nationId,enrolledAt,now:t0+(n-1)*day+60000}),available),done});

test('progresses day 2 through 7, then disappears', () => {
  assert.equal(at(1),null, 'day 1 belongs to the first loop');
  for (const n of [2,3,4,5,6,7]) assert.equal(at(n).day,n);
  assert.equal(at(8),null);
  assert.equal(firstWeekTracker({day:firstWeekDay({nationId:'unknown',enrolledAt,now:t0+day*2}),done:[]}),null);
});

test('uses #132 requires gating (visibleGoals); unbuilt goals hidden, needsCode without requires fails closed', () => {
  const all=firstWeekArcs.flatMap(a=>a.days.flatMap(d=>d.goals));
  for (const a of firstWeekArcs) for (const d of a.days) {
    const ids=firstWeekTracker({day:vis(d),done:[]})?.goals.map(e=>e.goal.id)??[];
    for (const g of all.filter(g=>g.requires)) assert.ok(!ids.includes(g.id),`${g.id} hidden`);
  }
  assert.equal(goalAvailable({id:'new-x',screen:'nation',text:'x',signal:'x',needsCode:'?'}),false);
  const d5=firstWeekArcs[0].days.find(d=>d.day===5); const pet=d5.goals.find(g=>g.requires);
  if (pet) assert.ok(firstWeekTracker({day:vis(d5,pet.requires),done:[]}).goals.some(e=>e.goal.id===pet.id),'shows once its feature is available');
});

test('no parallel requires map in the tracker module', async () => {
  const lib=await readFile(new URL('../lib/first-week-progress.ts',import.meta.url),'utf8');
  assert.doesNotMatch(lib,/firstWeekGoalRequires|availableFirstWeekFeatures|FirstWeekFeature/);
});

test('completion is driven by real records (settled shifts, meals), not manual ticks', () => {
  const k2=vis(firstWeekDay({nationId:'kindle',enrolledAt,now:t0+day+60000})); const start=t0+day;
  const shift=k2.goals.find(g=>g.id==='kindle-2-shift');
  const iso=ms=>new Date(ms).toISOString();
  assert.equal(goalSignalDone(shift,{shifts:[{orderName:'x',claimedAt:iso(start-1000)}],dayStart:start}),false,'second shift needs two');
  assert.equal(goalSignalDone(shift,{shifts:[{orderName:'x',claimedAt:iso(start-1000)},{orderName:'y',claimedAt:iso(start+1000)}],dayStart:start}),true);
  assert.equal(goalSignalDone(shift,{shifts:[{orderName:'x',claimedAt:null},{orderName:'y',claimedAt:null}],dayStart:start}),false,'unclaimed shifts do not count');
  const sell=k2.goals.find(g=>g.id==='kindle-2-sell');
  if (sell) assert.equal(goalSignalDone(sell,{shifts:[],dayStart:start}),null,'untracked signal reports null');
  const all=firstWeekArcs.flatMap(a=>a.days.flatMap(d=>d.goals));
  for (const g of all.filter(g=>/-meal$/.test(g.id))) {
    assert.equal(goalSignalDone(g,{shifts:[],mealReadyAt:iso(start+5),dayStart:start}),true,g.id);
    assert.equal(goalSignalDone(g,{shifts:[],mealReadyAt:null,dayStart:start}),false,g.id);
  }
  const t=firstWeekTracker({day:k2,done:['kindle-2-sell'],signals:{shifts:[],dayStart:start}});
  assert.ok(t.goals.every(e=>!e.done),'stored ids for untracked goals never show as done');
  const t2=firstWeekTracker({day:k2,done:[],signals:{shifts:[{orderName:'a',claimedAt:iso(start-9)},{orderName:'b',claimedAt:iso(start+9)}],dayStart:start}});
  assert.deepEqual(newlyDone(t2,[]),['kindle-2-shift']); assert.deepEqual(newlyDone(t2,['kindle-2-shift']),[]);
});

test('stub store persists per citizen key and survives bad data', () => {
  const m=new Map(); const kv={getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)};
  const s=stubFirstWeekProgressStore(kv);
  assert.deepEqual(s.load('kindle:a'),[]);
  s.save('kindle:a',['kindle-2-shift','kindle-2-shift']);
  assert.deepEqual(stubFirstWeekProgressStore(kv).load('kindle:a'),['kindle-2-shift']);
  assert.deepEqual(s.load('kindle:b'),[]);
  m.set(firstWeekStubKey('x'),'{not json'); assert.deepEqual(s.load('x'),[]);
  m.set(firstWeekStubKey('y'),'[1,"ok"]'); assert.deepEqual(s.load('y'),['ok']);
  assert.doesNotThrow(()=>stubFirstWeekProgressStore({getItem(){throw new Error('blocked')},setItem(){throw new Error('full')}}).save('z',['a']));
  assert.match(firstWeekStubKey('k'),/stub/);
});

test('page wires the tracker after the first loop and labels the stub (#135)', async () => {
  const page=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8');
  assert.match(page,/\{firstLoopHint\}\{weekTracker\}\{dailyLoop\}/);
  assert.match(page,/!firstLoop && weekDayInfo/);
  const ui=await readFile(new URL('../app/first-week-tracker.tsx',import.meta.url),'utf8');
  assert.match(ui,/<details/); assert.doesNotMatch(ui,/type="checkbox"/,'no manual ticks'); assert.match(ui,/this browser only/);
  const lib=await readFile(new URL('../lib/first-week-progress.ts',import.meta.url),'utf8');
  assert.match(lib,/STUB[^\n]*#135/);
});

/** First-week tracker (#134): day progression, requires-gating, stub persistence, and the rendered UI. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { firstWeekArcs, firstWeekDay } from '../lib/first-week.ts';
import { firstWeekTracker, goalAvailable, firstWeekGoalRequires, firstWeekFeatures, stubFirstWeekProgressStore, firstWeekStubKey } from '../lib/first-week-progress.ts';

const enrolledAt='2026-10-01T12:00:00.000Z', day=86400000, t0=Date.parse(enrolledAt);
const at=(n,nationId='kindle',done=[],features)=>firstWeekTracker({day:firstWeekDay({nationId,enrolledAt,now:t0+(n-1)*day+60000}),done,features});

test('progresses day 2 through 7, then disappears', () => {
  assert.equal(at(1),null, 'day 1 belongs to the first loop');
  for (const n of [2,3,4,5,6,7]) assert.equal(at(n).day,n);
  assert.equal(at(8),null);
  assert.equal(firstWeekTracker({day:firstWeekDay({nationId:'unknown',enrolledAt,now:t0+day*2}),done:[]}),null);
});

test('every needsCode goal maps to a requires flag, and stays hidden while it is off', () => {
  const gated=firstWeekArcs.flatMap(a=>a.days.flatMap(d=>d.goals)).filter(g=>g.needsCode);
  assert.deepEqual(gated.map(g=>g.id).sort(),Object.keys(firstWeekGoalRequires).sort());
  assert.ok(Object.values(firstWeekFeatures).every(v=>v===false),'no unbuilt feature is switched on');
  for (const g of gated) assert.equal(goalAvailable(g),false,g.id);
  assert.equal(goalAvailable({id:'new-x',screen:'nation',text:'x',signal:'x',needsCode:'?'},{petitions:true,civicRank:true,meritBadges:true,notables:true,claimantPledges:true,royalFavor:true}),false,'unknown gated goal fails closed');
  assert.deepEqual(at(5).goals.map(e=>e.goal.id),['kindle-5-ballot']);
  assert.deepEqual(at(5,'kindle',[],{petitions:true}).goals.map(e=>e.goal.id),['kindle-5-ballot','kindle-5-petition']);
  assert.deepEqual(at(7,'aurelle').goals.map(e=>e.goal.id),['aurelle-7-review']);
});

test('done state counts only visible goals', () => {
  const t=at(2,'korund',['korund-2-quota','korund-6-medal']);
  assert.equal(t.doneCount,1); assert.deepEqual(t.goals.map(e=>e.done),[true,false]);
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
  assert.match(page,/!firstLoop && weekKey/);
  const ui=await readFile(new URL('../app/first-week-tracker.tsx',import.meta.url),'utf8');
  assert.match(ui,/<details/); assert.match(ui,/type="checkbox"/); assert.match(ui,/this browser only/);
  const lib=await readFile(new URL('../lib/first-week-progress.ts',import.meta.url),'utf8');
  assert.match(lib,/STUB[^\n]*#135/);
});

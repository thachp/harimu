import test from 'node:test';
import assert from 'node:assert/strict';
import { firstWeekScripts, firstWeekScript, kindleFirstWeek, tutorialDayFor, korundFirstWeek, aurelleFirstWeek, TUTORIAL_DAYS, TUTORIAL_TITLE_MAX, TUTORIAL_LINE_MAX, TUTORIAL_BRIEFING_MIN, TUTORIAL_BRIEFING_MAX, GUIDED_DAYS } from '../lib/first-week-scripts.ts';
import { nationalServiceDays } from '../lib/varkand-national-service.ts';
import { citizenNameLists } from '../lib/citizen-names.ts';

const scripts=Object.values(firstWeekScripts);
const lines=day=>[day.title,day.objective,...day.briefing,day.completion];

// Shape checks apply to every nation script, so #228 and #230 reuse them by adding to firstWeekScripts.
test('every script: nation id, exactly 7 days, proposal', () => {
  assert.ok(scripts.length>=1);
  for (const [id,s] of Object.entries(firstWeekScripts)) { assert.equal(s.nationId,id); assert.equal(firstWeekScript(id),s);
    assert.equal(s.days.length,TUTORIAL_DAYS); assert.deepEqual(s.days.map(x=>x.day),[1,2,3,4,5,6,7]);
    for (const x of s.days) { assert.equal(x.proposal,true); assert.ok(x.briefing.length>=TUTORIAL_BRIEFING_MIN&&x.briefing.length<=TUTORIAL_BRIEFING_MAX, `${id} day ${x.day}`); } }
  assert.equal(firstWeekScript('varkand'),undefined);
});
test('length limits', () => {
  for (const s of scripts) for (const x of s.days) { assert.ok(x.title.length<=TUTORIAL_TITLE_MAX, x.title);
    for (const l of lines(x).slice(1)) assert.ok(l.length<=TUTORIAL_LINE_MAX, `${l.length}: ${l}`); }
});
test('no Notable, no real-world places, no citizen names, not a rename of Varkand', () => {
  const real=['earth','europe','america','united states','usa','washington','us congress','senate','dollar','euro','london','paris'];
  const names=new Set(Object.values(citizenNameLists).flatMap(l=>[...l.given,...l.family]));
  const varkand=new Set(nationalServiceDays.flatMap(lines));
  for (const s of scripts) for (const x of s.days) for (const l of lines(x)) {
    assert.ok(!/\bNotable\b/i.test(l), l); assert.ok(!varkand.has(l), `copied from Varkand: ${l}`);
    for (const r of real) assert.ok(!new RegExp(`\\b${r}\\b`,'i').test(l), `${r} in ${l}`);
    for (const w of l.match(/\b[A-Z][a-z]+\b/g)??[]) assert.ok(!names.has(w), `citizen name ${w}`); }
});
test('Kindle beats from the issue and canon', () => {
  const text=kindleFirstWeek.days.flatMap(lines).join(' ');
  for (const t of [/Assembly/,/Spark/,/Ballot Night/,/Work Capacity/,/city square/,/Forgehaven/,/Reserve Board/,/Resident, then Citizen, then Emberwarden/]) assert.match(text,t);
  // Humans are citizens, not officeholders; AI holds office.
  assert.match(text,/officeholders are AI/); assert.match(text,/citizen, not a candidate/);
  assert.doesNotMatch(text,/run for (office|mayor|president|assembly)|become (mayor|president)/i);
  // No penalty for missing a day (vision: gentle pulls); costs named (inequality, instability).
  assert.match(text,/missing a day costs you nothing/); assert.match(text,/Inequality/); assert.match(text,/instability/);
});
test('days 1-3 guided, days 4-7 optional tips', () => {
  assert.equal(GUIDED_DAYS,3);
  for (const s of scripts) for (const x of s.days) assert.equal(x.kind, x.day<=3?'guided':'optional-tip', `${s.nationId} day ${x.day}`);
});
test('fallback lines are within limits; Kindle day 3 uses the player market with a stall fallback', () => {
  for (const s of scripts) for (const x of s.days) if (x.fallback) assert.ok(x.fallback.length<=TUTORIAL_LINE_MAX, x.fallback);
  const d3=kindleFirstWeek.days[2]; assert.match(d3.objective,/player market/); assert.match(d3.briefing.join(' '),/order book/); assert.match(d3.fallback,/stall/);
});
test('Korund beats from the issue and canon; no glorified coercion, no faith, no gray market', () => {
  const text=korundFirstWeek.days.flatMap(x=>[...lines(x),x.fallback??'']).join(' ');
  for (const t of [/quota/,/ration coupon/i,/Labor Notes/,/State Media/,/Stonehearth/,/Labor Bureau/,/Five-Year Plan/,/People's Congress/,/Worker/]) assert.match(text,t);
  assert.match(text,/All of them are AI/); assert.match(text,/approve, not to choose/);
  assert.match(text,/Shortages/); assert.match(text,/choice is narrow/); assert.match(text,/List up to three job preferences/); assert.match(text,/AI Labor Bureau then assigns/); assert.match(text,/Foreign reports are not carried/);
  assert.doesNotMatch(korundFirstWeek.days[3].briefing.join(' '),/notice|leave out|hidden/i);
  assert.doesNotMatch(text,/glori|heroic|traitor|enemy|obey|informer|purge|gray market|black market|faith|shrine|pray|worship/i);
  assert.match(korundFirstWeek.days[2].fallback,/Shortages/);
});
test('Aurelle beats from the issue and canon; no noble house named, no claimant content', () => {
  const text=aurelleFirstWeek.days.flatMap(x=>[...lines(x),x.fallback??'']).join(' ');
  for (const t of [/oath/,/Royal Favor/,/Crown/,/Sky Throne/,/Kinward Rite/,/Highspire/,/Commoner/,/chartered market/,/court gazette/]) assert.match(text,t);
  assert.match(text,/Monarch and the lords are AI/); assert.match(text,/no jurisdiction/);
  assert.match(text,/debase/); assert.match(text,/lèse-majesté/); assert.match(text,/dissenters pay a levy/); assert.match(text,/Birth and favor/);
  const [d1,,d3,d4]=aurelleFirstWeek.days;
  assert.match(lines(d1).join(' '),/register/); assert.match(lines(d1).join(' '),/Immigrants .* take an oath/); assert.doesNotMatch(d1.objective,/oath/i);
  assert.doesNotMatch(lines(d3).join(' '),/debase/); assert.match(lines(d3).join(' '),/chartered market/); assert.match(lines(d3).join(' '),/Crown/);
  assert.equal(d4.kind,'optional-tip'); assert.match(d4.briefing.join(' '),/debases/);
  assert.doesNotMatch(text,/\bHouse of\b|of the \w+ House\b/); assert.doesNotMatch(text,/claimant|pretender|pledge|\bcoups?\b|usurp/i);
});

// #365: flag-off variants. With the market flag off, no Kindle first-week line mentions the Market.
test('market open or no variant: tutorialDayFor returns the day unchanged', () => {
  for (const s of scripts) for (const x of s.days) { assert.equal(tutorialDayFor(x,true),x); if (!x.marketOff) assert.equal(tutorialDayFor(x,false),x); }
});
test('flag off: no Kindle first-week line mentions the Market, and day 3 buys from the starter merchant', () => {
  const days=kindleFirstWeek.days.map(x=>tutorialDayFor(x,false));
  for (const x of days) { assert.doesNotMatch([x.title,x.objective,...x.briefing,x.completion,x.fallback??''].join(' '),/market|order book|order\b|stall/i, `day ${x.day}`); assert.equal(x.marketOff,undefined); assert.equal(x.proposal,true); }
  const d3=days[2]; assert.match(d3.objective,/starter merchant/); assert.match(d3.fallback,/merchant/); assert.equal(d3.title,'Read the Price Board'); assert.equal(d3.kind,'guided');
  // Same shape and limits as the live day.
  for (const [i,x] of days.entries()) { const live=kindleFirstWeek.days[i]; assert.equal(x.day,live.day); assert.equal(x.kind,live.kind); assert.equal(x.title,live.title);
    assert.ok(x.briefing.length>=TUTORIAL_BRIEFING_MIN&&x.briefing.length<=TUTORIAL_BRIEFING_MAX); for (const l of [x.objective,x.completion,x.fallback??'',...x.briefing]) assert.ok(l.length<=TUTORIAL_LINE_MAX, l); }
  // Days with no Market line keep the live text.
  for (const i of [0,1,3,4,5]) assert.equal(days[i],kindleFirstWeek.days[i]);
  assert.match(days[6].briefing.join(' '),/free economy/); assert.match(days[6].briefing.join(' '),/Inequality/);
});
test('flag on: Kindle day 3 still uses the player market with a stall fallback; Korund and Aurelle have no variants', () => {
  const d3=tutorialDayFor(kindleFirstWeek.days[2],true); assert.match(d3.objective,/player market/); assert.match(d3.fallback,/stall/);
  for (const s of [korundFirstWeek,aurelleFirstWeek]) for (const x of s.days) assert.equal(x.marketOff,undefined);
});

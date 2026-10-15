import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { confluenceFirstWeek, CONFLUENCE_CANON_TERMS } from '../lib/confluence-tutorial.ts';
import { hoarvaleFirstWeek, HOARVALE_CANON_TERMS } from '../lib/hoarvale-tutorial.ts';
import { firstWeekScripts, TUTORIAL_DAYS, TUTORIAL_TITLE_MAX, TUTORIAL_LINE_MAX, TUTORIAL_BRIEFING_MIN, TUTORIAL_BRIEFING_MAX, GUIDED_DAYS } from '../lib/first-week-scripts.ts';
import { nationalServiceDays } from '../lib/varkand-national-service.ts';
import { citizenNameLists } from '../lib/citizen-names.ts';

const scripts=[[confluenceFirstWeek,'confluence',CONFLUENCE_CANON_TERMS],[hoarvaleFirstWeek,'hoarvale',HOARVALE_CANON_TERMS]];
const lines=day=>[day.title,day.objective,...day.briefing,day.completion,...(day.fallback?[day.fallback]:[])];
const text=s=>s.days.flatMap(lines).join(' ');
const sentenceStart=(l,i)=>i===0||/(^|[.!?:"]\s+)$/.test(l.slice(0,i));

test('shape: nation id, exactly 7 days numbered 1-7, briefing 2-4 lines, every day proposal', () => {
  for (const [s,id] of scripts) {
    assert.equal(s.nationId,id); assert.ok(s.voice.length>0); assert.equal(s.days.length,TUTORIAL_DAYS); assert.deepEqual(s.days.map(x=>x.day),[1,2,3,4,5,6,7]);
    for (const x of s.days) { assert.equal(x.proposal,true); assert.ok(x.briefing.length>=TUTORIAL_BRIEFING_MIN&&x.briefing.length<=TUTORIAL_BRIEFING_MAX, `${id} day ${x.day}`); }
    assert.equal(firstWeekScripts[id],undefined, 'the MVP script table is not changed');
  }
});
test('length limits: titles 40, lines 140, fallbacks 140', () => {
  for (const [s] of scripts) for (const x of s.days) { assert.ok(x.title.length<=TUTORIAL_TITLE_MAX, x.title);
    for (const l of lines(x).slice(1)) assert.ok(l.length<=TUTORIAL_LINE_MAX, `${l.length}: ${l}`); }
});
test('days 1-3 guided, days 4-7 optional tips', () => {
  assert.equal(GUIDED_DAYS,3);
  for (const [s,id] of scripts) for (const x of s.days) assert.equal(x.kind, x.day<=3?'guided':'optional-tip', `${id} day ${x.day}`);
});
test('no Notable, no real-world places, no citizen names, no personal names, not copied from another nation script', () => {
  const real=['earth','europe','america','united states','usa','washington','us congress','senate','dollar','euro','london','paris','vietnam','japan','thailand','uk','britain'];
  const names=new Set(Object.values(citizenNameLists).flatMap(l=>[...l.given,...l.family]));
  const SHARED=['A shift costs Work Capacity. It refills once a day while you are away.']; // the one mechanic line every nation script repeats
  const others=new Set([...nationalServiceDays.flatMap(lines),...Object.values(firstWeekScripts).flatMap(s=>s.days.flatMap(lines))].filter(l=>!SHARED.includes(l)));
  for (const [s,id] of scripts) for (const x of s.days) for (const l of lines(x)) {
    assert.ok(!/\bNotable\b/i.test(l), l); assert.ok(!others.has(l), `copied: ${l}`);
    for (const r of real) assert.ok(!new RegExp(`\\b${r}\\b`,'i').test(l), `${r} in ${l}`);
    for (const w of l.match(/\b[A-Z][a-z]+\b/g)??[]) assert.ok(!names.has(w), `citizen name ${w} in ${id}`); }
  assert.ok(!scripts.some(([s])=>text(s)===text(confluenceFirstWeek)&&s===hoarvaleFirstWeek));
});
test('canon names only: every capitalized term inside a sentence is on the nation\'s canon list or a plain sentence word', () => {
  const plain=new Set(['AI','Nothing','No','Welcome','Members','Missed','Speech','Speak','Staples','Shop','Waste','Keep','Dry','Insulting','Bragging','Look','Read','Put','Question','Prices','Coalitions','Governments','Seniority','Switching','Think','Waiting','Good','Breakfast','Take','Shift','Both','Plan','Papers','Moot','Registered','Contract','Meeting','Assembly','Price','Dismissal','Tenure','Trading','Humans','Citizens','Every','Faiths','Five','Party','Your','Honors','Prime','Hoarvale','The','No','You','Enter','Start','Sit','Enter','Many','Hoarvale']);
  for (const [s,id,canon] of scripts) {
    const allowed=new Set(canon.flatMap(c=>c.split(/\s+/).map(w=>w.replace(/'s$/,''))));
    for (const x of s.days) for (const l of lines(x).slice(1)) for (const m of l.matchAll(/\b[A-Z][A-Za-z]+\b/g)) {
      if (sentenceStart(l,m.index)) continue;
      assert.ok(allowed.has(m[0])||plain.has(m[0]), `${id}: unlisted capitalized term "${m[0]}" in: ${l}`);
    }
  }
});
test('Confluence beats from the issue and canon: Guidance Plan, cooperative, the Current, Four Pillars; all offices AI', () => {
  const t=text(confluenceFirstWeek);
  for (const r of [/Guidance Plan/,/cooperative/,/Current/,/Four Pillars/,/Meetwater/,/People's Assembly/,/Party of the Confluence/,/banded|band/,/Bureau of Faith Affairs/,/Honored Delegate/,/Many streams|Many Voices|stream/]) assert.match(t,r);
  assert.match(t,/every one of them is AI/); assert.match(t,/Every office above it is AI/); assert.match(t,/The managers are AI/);
  assert.match(t,/targets, not quotas/); assert.match(t,/does not have to heed/); assert.match(t,/missing a day costs you nothing/);
  assert.doesNotMatch(t,/run for (office|president|assembly)|become (a )?(pillar|president|premier)|Politburo vote/i);
  assert.doesNotMatch(t,/\b(Heartland|Wildlands)\b/);
});
test('Hoarvale beats from the issue and canon: Moot, Sovereign and Prime Minister, Trading Houses, Rime; AI holds office', () => {
  const t=text(hoarvaleFirstWeek);
  for (const r of [/Moot/,/Sovereign/,/Prime Minister/,/Trading House/,/Rime\b/,/Rimehall/,/Coalition Agreement/,/Question Time/,/Kinward Rite/,/seniority/i,/Honors/,/tenure/i]) assert.match(t,r);
  assert.match(t,/The Sovereign is an AI/); assert.match(t,/Criticizing the government is completely free/); assert.match(t,/fine-level offense/);
  assert.match(t,/Every faith is free/); assert.match(t,/Switching Houses resets/); assert.match(t,/missing a day costs you nothing/);
  assert.doesNotMatch(t,/run for (office|president|moot)|become (a )?(prime minister|sovereign)/i);
  assert.doesNotMatch(t,/lèse-majesté|Royal Favor|\bclaimant\b|\bdecree\b/i);
});
test('each script keeps its own voice: Hoarvale is not a rename of Aurelle, Confluence not of Korund or Kindle', () => {
  assert.doesNotMatch(text(hoarvaleFirstWeek),/Sky Throne|Highspire|Commoner|chartered market|court gazette|Monarch/);
  assert.doesNotMatch(text(confluenceFirstWeek),/Stonehearth|Labor Bureau|ration coupon|Labor Notes|Forgehaven|Spark|Reserve Board|Emberwarden|State Media/);
  assert.notEqual(confluenceFirstWeek.voice,hoarvaleFirstWeek.voice);
  assert.match(confluenceFirstWeek.voice,/Many streams, one current/); assert.match(hoarvaleFirstWeek.voice,/Keep the hearth, share the warmth/);
});
test('no figures: no digits or percentages written in prose (docs numbers are assumptions)', () => {
  for (const [s,id] of scripts) for (const x of s.days) for (const l of lines(x)) assert.doesNotMatch(l,/\d|%|percent/i, `${id}: ${l}`);
});
test('humans are citizens, not officeholders; no pressure, no punishment for missing a day', () => {
  for (const [s,id] of scripts) {
    const t=text(s);
    assert.doesNotMatch(t,/\b(must|forced?|required|obey|hurry up|last chance|act now)\b/i, id);
    assert.doesNotMatch(t,/you (will|can) (rule|govern|be elected|become (the )?(leader|premier|minister))/i, id);
  }
});
test('unwired: nothing in app/ or components/ imports either module', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components')]) if (/\.(t|j)sx?$/.test(f)) assert.doesNotMatch(readFileSync(f,'utf8'),/confluence-tutorial|hoarvale-tutorial/, f);
});

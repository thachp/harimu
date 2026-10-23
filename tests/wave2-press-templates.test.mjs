import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { wave2PressPacks, wave2PressPack, confluencePress, hoarvalePress, WAVE2_PRESS_HEADLINE_MAX, WAVE2_PRESS_PARAGRAPH_MAX, WAVE2_PRESS_TEMPLATES_MIN, WAVE2_PRESS_TEMPLATES_MAX } from '../lib/wave2-press-templates.ts';
import { pressPacks } from '../lib/press-templates.ts';
import { citizenNameLists } from '../lib/citizen-names.ts';

const packs=Object.values(wave2PressPacks);
const lines=x=>[x.headline,...x.body];
const packText=p=>p.templates.flatMap(lines).join(' ');
const outletOf={confluence:'official-paper',hoarvale:'free-press'};

test('every pack: nation id, outlet, 8-12 templates, unique ids, 1-2 paragraphs, proposal', () => {
  assert.deepEqual(Object.keys(wave2PressPacks),['confluence','hoarvale']);
  for (const [id,p] of Object.entries(wave2PressPacks)) { assert.equal(p.nationId,id); assert.equal(wave2PressPack(id),p); assert.equal(p.outlet,outletOf[id]); assert.ok(p.voice.length>0);
    assert.ok(p.templates.length>=WAVE2_PRESS_TEMPLATES_MIN&&p.templates.length<=WAVE2_PRESS_TEMPLATES_MAX, `${id}: ${p.templates.length}`);
    assert.equal(new Set(p.templates.map(x=>x.id)).size,p.templates.length);
    for (const x of p.templates) { assert.equal(x.proposal,true); assert.ok(x.id.startsWith(`${id}-`)); assert.ok(x.body.length>=1&&x.body.length<=2, x.id); } }
  assert.equal(wave2PressPack('kindle'),undefined); assert.equal(wave2PressPack('varkand'),undefined);
});
test('bylines are the culture bible working names, marked as proposals; the MVP bylines are not reused', () => {
  assert.deepEqual(confluencePress.byline,{name:'The Current Daily',proposal:true}); assert.deepEqual(hoarvalePress.byline,{name:'The Rimehall Ledger',proposal:true});
  const mvp=Object.values(pressPacks).map(p=>p.byline.name);
  for (const p of packs) { assert.ok(p.byline.name.length<=WAVE2_PRESS_HEADLINE_MAX); assert.ok(!mvp.includes(p.byline.name)); assert.doesNotMatch(p.byline.name,/sample|template|filler|demo/i); }
  assert.deepEqual(mvp.sort(),['Court Gazette','Kindle Press','Korund State Media']);
});
test('length limits: headlines 40, paragraphs 140', () => {
  for (const p of packs) for (const x of p.templates) { assert.ok(x.headline.length<=WAVE2_PRESS_HEADLINE_MAX, `${x.headline.length}: ${x.headline}`);
    for (const b of x.body) assert.ok(b.length<=WAVE2_PRESS_PARAGRAPH_MAX, `${b.length}: ${b}`); }
});
test('no figures, no Notable, no real-world places, no citizen names, no named people', () => {
  const real=['earth','europe','america','united states','usa','washington','us congress','senate','dollar','euro','london','paris','new york','wall street','vietnam','japan','thailand','britain','uk'];
  const names=new Set(Object.values(citizenNameLists).flatMap(l=>[...l.given,...l.family]));
  for (const p of packs) for (const x of p.templates) for (const l of lines(x)) {
    assert.doesNotMatch(l,/\d|%|percent/i, `figure in ${x.id}`); assert.ok(!/\bNotable\b/i.test(l), l);
    for (const r of real) assert.ok(!new RegExp(`\\b${r}\\b`,'i').test(l), `${r} in ${l}`);
    // 'Aurora Night' is a canon Hoarvale festival (nation page, Holidays); its first word also appears in a citizen name list.
    for (const w of l.replaceAll('Aurora Night','').match(/\b[A-Z][a-z]+\b/g)??[]) assert.ok(!names.has(w), `citizen name ${w}`); }
});
test('Confluence reads as the one official paper, covers the culture bible topics, and never mocks the Four Pillars', () => {
  const topics=new Set(confluencePress.templates.map(x=>x.topic));
  for (const k of ['guidance-plan','cooperatives','markets','festivals','faiths','assembly','civic-life']) assert.ok(topics.has(k), k);
  const text=packText(confluencePress);
  for (const r of [/Guidance Plan/,/cooperative/i,/targets, not quotas/,/Current/,/Quota Day/,/Canal Festival/,/Congress Lanterns|lantern/i,/Bureau of Faith Affairs/,/People's Assembly/,/Meetwater/]) assert.match(text,r);
  assert.doesNotMatch(text,/Four Pillars|General Secretary|Premier|Politburo|President/);
  assert.doesNotMatch(text,/mock|fool|puppet|useless|ridicul|corrupt|rigged/i);
  assert.doesNotMatch(text,/Moot|Sovereign|Prime Minister|Rime\b|Trading House|Honors|Kinward/);
  assert.doesNotMatch(text,/State Media|Court Gazette|Kindle Press|Be it known|the plan advances|Foreign reports/i);
});
test('Hoarvale reads as free press, covers the culture bible topics, and never insults the Sovereign', () => {
  const topics=new Set(hoarvalePress.templates.map(x=>x.topic));
  for (const k of ['moot','question-time','trading-houses','markets','festivals','civic-life']) assert.ok(topics.has(k), k);
  const text=packText(hoarvalePress);
  for (const r of [/Moot/,/Sovereign/,/Prime Minister/,/Question Time/,/Trading House/,/Rime\b/,/Aurora Night/,/Honors/,/tenure/i,/coalition/i,/bathhouse/i,/Kinward Rite/]) assert.match(text,r);
  for (const x of hoarvalePress.templates) if (/Sovereign/.test(lines(x).join(' '))) assert.doesNotMatch(lines(x).join(' '),/mock|fool|puppet|useless|ridicul|insult|idle|figurehead|spend/i, x.id);
  assert.doesNotMatch(text,/Guidance Plan|cooperative|Party|Four Pillars|Congress|Current\b|Meetwater|Bureau/);
  assert.doesNotMatch(text,/State Media|Court Gazette|Kindle Press|Be it known|royal decree|the plan advances/i);
});
test('voices stay distinct and none is a copy of an MVP template', () => {
  const mvp=new Set(Object.values(pressPacks).flatMap(p=>p.templates.flatMap(lines)));
  for (const p of packs) for (const x of p.templates) for (const l of lines(x)) assert.ok(!mvp.has(l), `copied from an MVP pack: ${l}`);
  assert.notEqual(confluencePress.voice,hoarvalePress.voice);
  assert.match(confluencePress.voice,/Many streams, one current/); assert.match(hoarvalePress.voice,/Keep the hearth, share the warmth/);
});
test('unwired: nothing in app/ or components/ imports wave2-press-templates', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components')]) if (/\.(t|j)sx?$/.test(f)) assert.doesNotMatch(readFileSync(f,'utf8'),/wave2-press-templates/, f);
});

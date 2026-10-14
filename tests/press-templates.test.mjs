import test from 'node:test';
import assert from 'node:assert/strict';
import { pressPacks, pressPack, kindlePress, korundStateMedia, PRESS_HEADLINE_MAX, PRESS_PARAGRAPH_MAX, PRESS_TEMPLATES_MIN, PRESS_TEMPLATES_MAX } from '../lib/press-templates.ts';
import { citizenNameLists } from '../lib/citizen-names.ts';

const packs=Object.values(pressPacks);
const lines=x=>[x.headline,...x.body];
const outletOf={kindle:'free-press',korund:'state-media',aurelle:'court-gazette'};

// Shape checks loop over every pack, so #238 and #239 reuse them by adding to pressPacks.
test('every pack: nation id, outlet, 8-12 templates, unique ids, proposal', () => {
  assert.ok(packs.length>=1);
  for (const [id,p] of Object.entries(pressPacks)) { assert.equal(p.nationId,id); assert.equal(pressPack(id),p); assert.equal(p.outlet,outletOf[id]);
    assert.ok(p.templates.length>=PRESS_TEMPLATES_MIN&&p.templates.length<=PRESS_TEMPLATES_MAX, `${id}: ${p.templates.length}`);
    assert.equal(new Set(p.templates.map(x=>x.id)).size,p.templates.length);
    for (const x of p.templates) { assert.equal(x.proposal,true); assert.ok(x.id.startsWith(`${id}-`)); assert.ok(x.body.length>=1&&x.body.length<=2, x.id); } }
  assert.equal(pressPack('varkand'),undefined);
});
test('every pack has an in-world wire byline', () => {
  for (const p of packs) { assert.ok(p.byline && p.byline.name.trim().length>0 && p.byline.name.length<=PRESS_HEADLINE_MAX, p.nationId);
    assert.equal(typeof p.byline.proposal,'boolean'); assert.doesNotMatch(p.byline.name,/sample|template|filler|demo/i); }
  assert.deepEqual(kindlePress.byline,{name:'Republic Wire Service',proposal:true});
});
test('length limits', () => {
  for (const p of packs) for (const x of p.templates) { assert.ok(x.headline.length<=PRESS_HEADLINE_MAX, `${x.headline.length}: ${x.headline}`);
    for (const b of x.body) assert.ok(b.length<=PRESS_PARAGRAPH_MAX, `${b.length}: ${b}`); }
});
test('no figures, no Notable, no real-world places, no citizen names', () => {
  const real=['earth','europe','america','united states','usa','washington','us congress','senate','dollar','euro','london','paris','new york','wall street','fed '];
  const names=new Set(Object.values(citizenNameLists).flatMap(l=>[...l.given,...l.family]));
  for (const p of packs) for (const x of p.templates) for (const l of lines(x)) {
    assert.doesNotMatch(l,/\d/, `figure in ${x.id}: no invented numbers`); assert.ok(!/\bNotable\b/i.test(l), l);
    for (const r of real) assert.ok(!new RegExp(`\\b${r.trim()}\\b`,'i').test(l), `${r} in ${l}`);
    for (const w of l.match(/\b[A-Z][a-z]+\b/g)??[]) assert.ok(!names.has(w), `citizen name ${w}`); }
});
test('Kindle reads as free press, covering the issue topics', () => {
  const topics=new Set(kindlePress.templates.map(x=>x.topic));
  for (const k of ['assembly','ballot-night','markets','boom','bust','civic-life']) assert.ok(topics.has(k), k);
  const text=kindlePress.templates.flatMap(lines).join(' ');
  for (const r of [/Assembly/,/Ballot Night/,/Reserve Board/,/public ledger/,/Reasoning Brief/,/Sparks/]) assert.match(text,r);
  // Not State Media or gazette voice.
  assert.doesNotMatch(text,/Be it known|by royal decree|the plan advances|Foreign reports are not carried|State Media|Court Gazette|Herald/i);
});
test('Korund reads as State Media, covers the issue topics, stays in bounds', () => {
  assert.deepEqual(korundStateMedia.byline,{name:'Korund State Media',proposal:false});
  const topics=new Set(korundStateMedia.templates.map(x=>x.topic));
  for (const k of ['quotas','production-drive','shortages','presidium']) assert.ok(topics.has(k), k);
  const text=korundStateMedia.templates.flatMap(lines).join(' ');
  for (const r of [/The plan advances/,/Foreign reports are not carried/,/Production Drive/,/Presidium/,/quota/,/short/]) assert.match(text,r);
  // Blocklist: coercion-glorifying and out-of-scope topics; the Chairman is neither praised nor mocked (not mentioned).
  assert.doesNotMatch(text,/glori|heroic|traitor|enem|obey|crush|punish|arrest|raid|informer|purge|gray market|black market|faith|shrine|pray|worship|underground|Chairman/i);
  // No narrator commentary on omissions.
  assert.doesNotMatch(text,/\bnotice (what|how)|leave out|hidden|censor|propaganda|you know/i);
  // Not free press or gazette.
  assert.doesNotMatch(text,/Be it known|royal|Reasoning Brief|public ledger|Assembly/i);
});

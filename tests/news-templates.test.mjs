import test from 'node:test';
import assert from 'node:assert/strict';
import { kindleTemplates, aurelleTemplates, templateHeadlines, kindleTemplateLabel, aurelleTemplateLabel } from '../lib/news-templates.ts';

const rows=[{shifts:0,food:0,trades:0,quantity:0,citizens:0},{shifts:1,food:1,trades:1,quantity:1,citizens:1},{shifts:7,food:23,trades:4,quantity:19,citizens:2},{shifts:12,food:40,trades:15,quantity:88,citizens:9}];
test('at least eight templates per edition with unique ids', () => {
  for (const list of [kindleTemplates, aurelleTemplates]) { assert.ok(list.length>=8); assert.equal(new Set(list.map(t=>t.id)).size, list.length); }
});
test('every number in output comes from the ledger row; output is labeled', () => {
  for (const [nation,label] of [['kindle',kindleTemplateLabel],['aurelle',aurelleTemplateLabel]]) for (const row of rows) {
    const allowed=new Set(Object.values(row).map(String));
    const out=templateHeadlines(nation,row); assert.ok(out.length>=1);
    for (const h of out) {
      assert.ok(h.text.endsWith(label));
      for (const n of `${h.title} ${h.text}`.match(/\d+/g)??[]) assert.ok(allowed.has(n), `${nation}: ${n} not from ledger in "${h.text}"`);
    }
  }
});
test('every template is reachable and pluralizes correctly', () => {
  for (const [nation,list] of [['kindle',kindleTemplates],['aurelle',aurelleTemplates]]) {
    const hit=new Set(); for (const row of rows) for (const t of list) if (t.when(row)) hit.add(t.id);
    assert.equal(hit.size, list.length, nation);
  }
  assert.match(templateHeadlines('kindle',rows[1]).map(h=>h.text).join(' '), /1 shift settled/);
  assert.doesNotMatch(templateHeadlines('kindle',rows[1]).map(h=>h.text).join(' '), /1 shifts/);
});
test('invalid ledger values publish nothing; no AI or reward wording', () => {
  assert.deepEqual(templateHeadlines('kindle',{...rows[1],food:-1}), []);
  assert.deepEqual(templateHeadlines('aurelle',{...rows[1],shifts:1.5}), []);
  const all=JSON.stringify(rows.flatMap(r=>[...templateHeadlines('kindle',r),...templateHeadlines('aurelle',r)]));
  assert.doesNotMatch(all, /AI-generated|reward|bonus|grant/i);
});

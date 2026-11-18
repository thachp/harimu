import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newsEditions, editionHeadlines, editionMasthead } from '../lib/news-editions.ts';

const ids=['confluence','meridian','ilmar','hoarvale','varkand','veldwood','fulmara'];
const rows=[{shifts:0,food:0,trades:0,quantity:0,citizens:0},{shifts:1,food:1,trades:1,quantity:1,citizens:1},{shifts:7,food:23,trades:4,quantity:19,citizens:2},{shifts:12,food:40,trades:15,quantity:88,citizens:9}];

test('one edition per non-MVP nation with outlet, masthead, record titles and press freedom', () => {
  assert.deepEqual(Object.keys(newsEditions).sort(), [...ids].sort());
  for (const id of ids) { const e=newsEditions[id];
    for (const k of ['outlet','masthead','freedomsRow','label']) assert.ok(e[k].length>0, `${id}.${k}`);
    for (const k of ['work','register','market']) assert.ok(e.recordTitles[k].length>0);
    assert.equal(new Set(e.templates.map(t=>t.id)).size, e.templates.length); assert.ok(e.templates.length>=4);
  }
  assert.equal(newsEditions.veldwood.outlet,'The Canopy'); assert.equal(newsEditions.veldwood.canon,true);
  assert.equal(newsEditions.confluence.outlet,'The Current Daily'); assert.equal(newsEditions.confluence.canon,true);
  assert.equal(newsEditions.meridian.outlet,'Steamgate Herald'); assert.equal(newsEditions.meridian.canon,true);
  assert.equal(newsEditions.ilmar.outlet,'The Lamp'); assert.equal(newsEditions.ilmar.canon,true);
  assert.equal(newsEditions.varkand.outlet,'The Directorate Bulletin'); assert.equal(newsEditions.varkand.canon,true);
  assert.match(newsEditions.meridian.label,/Steamgate Herald/);
  assert.match(newsEditions.ilmar.label,/The Lamp/);
  assert.match(newsEditions.varkand.label,/The Directorate Bulletin/);
  assert.equal(newsEditions.fulmara.secondaryOutlet,"the Tribune's Dock Sheet");
  assert.equal(newsEditions.ilmar.templateKind,'decree');
  assert.match(newsEditions.fulmara.masthead,/Owned by/);
  assert.equal('korund' in newsEditions, false);
  assert.equal('kindle' in newsEditions, false);
});
test('press freedom tracks Freedoms rows', () => {
  assert.equal(newsEditions.veldwood.pressFreedom,'highest'); assert.equal(newsEditions.hoarvale.pressFreedom,'high');
  assert.equal(newsEditions.meridian.pressFreedom,'low-moderate'); assert.match(newsEditions.meridian.freedomsRow,/Great Filter/);
  assert.match(newsEditions.ilmar.freedomsRow,/Stilldays/); assert.match(newsEditions.hoarvale.freedomsRow,/Crown Etiquette/);
});
test('every number comes from the ledger row, output labeled, every template reachable', () => {
  for (const id of ids) { const hit=new Set();
    for (const row of rows) { const allowed=new Set(Object.values(row).map(String)); const out=editionHeadlines(id,row); assert.ok(out.length>=1, id);
      for (const h of out) { assert.ok(h.text.endsWith(newsEditions[id].label));
        for (const n of `${h.title} ${h.text}`.match(/\d+/g)??[]) assert.ok(allowed.has(n), `${id}: ${n} in "${h.text}"`); }
      for (const t of newsEditions[id].templates) if (t.when(row)) hit.add(t.id); }
    assert.equal(hit.size, newsEditions[id].templates.length, id);
    assert.doesNotMatch(editionHeadlines(id,rows[1]).map(h=>h.text).join(' '), /\b1 (shifts|trades|citizens|recruits)\b/);
  }
});
test('Varkand alert levels head the masthead and narrow the bulletin; Ilmar silent on Stilldays', () => {
  for (const [lvl,re] of [['green',/^ALERT GREEN/],['amber',/^ALERT AMBER/],['red',/^ALERT RED/]]) assert.match(editionMasthead('varkand',lvl), re);
  const green=editionHeadlines('varkand',rows[2]), red=editionHeadlines('varkand',rows[2],{alert:'red'});
  assert.ok(green.length>red.length); assert.deepEqual(red.map(h=>h.title),['Shifts logged']);
  assert.deepEqual(editionHeadlines('ilmar',rows[2],{stillday:true}),[]);
  assert.equal(editionMasthead('hoarvale','red'), newsEditions.hoarvale.masthead);
});
test('invalid rows publish nothing; no AI, reward or real-money wording', () => {
  assert.deepEqual(editionHeadlines('veldwood',{...rows[1],food:-1}),[]);
  assert.deepEqual(editionHeadlines('fulmara',{...rows[1],trades:1.5}),[]);
  const all=JSON.stringify(ids.flatMap(id=>rows.flatMap(r=>editionHeadlines(id,r))));
  assert.doesNotMatch(all,/AI-generated|reward|bonus|grant|invest|real money/i);
});

test('§18.2 official newspaper names are pinned in source; old proposal names are gone', () => {
  const editions=readFileSync('lib/news-editions.ts','utf8');
  const guide=readFileSync('docs/NEWS_STYLE_GUIDE.md','utf8');
  assert.match(editions,/meridian:\{nationId:'meridian',outlet:'Steamgate Herald',canon:true,/);
  assert.match(editions,/ilmar:\{nationId:'ilmar',outlet:'The Lamp',canon:true,/);
  assert.match(editions,/varkand:\{nationId:'varkand',outlet:'The Directorate Bulletin',canon:true,/);
  assert.match(editions,/secondaryOutlet:"the Tribune's Dock Sheet"/);
  assert.match(guide,/\*Steamgate Herald\*/);
  assert.match(guide,/\*The Lamp\*/);
  assert.match(guide,/\*The Directorate Bulletin\*/);
  assert.match(guide,/Tribune's \*Dock Sheet\*/);
  // Built in parts so this file itself does not contain the retired proposal strings.
  const retired=new RegExp(['Steamgate Meas'+'ure','The Clear Rec'+'ord','Clear Rec'+'ord','Watchfast Sig'+'nal'].join('|'));
  for (const [name,src] of [['lib/news-editions.ts',editions],['docs/NEWS_STYLE_GUIDE.md',guide]]) {
    assert.doesNotMatch(src,retired,name);
  }
});

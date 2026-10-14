import test from 'node:test';
import assert from 'node:assert/strict';
import { posterKits, posterKit, frameAccepts, korundPosterKit, aurellePosterKit, POSTER_PLACEHOLDERS, POSTER_SLOGAN_MAX, POSTER_FRAME_NAME_MAX, POSTER_CAPTION_MAX,
  POSTER_SLOGANS_MIN, POSTER_SLOGANS_MAX, POSTER_FRAMES_MIN, POSTER_FRAMES_MAX } from '../lib/poster-kits.ts';
import { citizenNameLists } from '../lib/citizen-names.ts';

const kits=Object.values(posterKits);
const texts=k=>[...k.slogans.map(s=>s.text),...k.frames.flatMap(f=>[f.name,f.caption])];

test('MVP nations only, counts in range, unique ids, proposal', () => {
  assert.deepEqual(Object.keys(posterKits).sort(),['aurelle','kindle','korund']);
  for (const [id,k] of Object.entries(posterKits)) { assert.equal(k.nationId,id); assert.equal(posterKit(id),k);
    assert.ok(k.slogans.length>=POSTER_SLOGANS_MIN&&k.slogans.length<=POSTER_SLOGANS_MAX, `${id} slogans ${k.slogans.length}`);
    assert.ok(k.frames.length>=POSTER_FRAMES_MIN&&k.frames.length<=POSTER_FRAMES_MAX, `${id} frames ${k.frames.length}`);
    const ids=[...k.slogans,...k.frames].map(x=>x.id); assert.equal(new Set(ids).size,ids.length);
    for (const x of [...k.slogans,...k.frames]) { assert.equal(x.proposal,true); assert.ok(x.id.startsWith(`${id}-`)); } }
  assert.equal(posterKit('varkand'),undefined);
});
test('length limits (48 / 32 / 100)', () => {
  assert.equal(POSTER_SLOGAN_MAX,48); assert.equal(POSTER_FRAME_NAME_MAX,32); assert.equal(POSTER_CAPTION_MAX,100);
  for (const k of kits) { for (const s of k.slogans) assert.ok(s.text.length<=POSTER_SLOGAN_MAX, s.text);
    for (const f of k.frames) { assert.ok(f.name.length<=POSTER_FRAME_NAME_MAX, f.name); assert.ok(f.caption.length<=POSTER_CAPTION_MAX, f.caption); } }
});
test('no hard-coded numbers anywhere; only known placeholders', () => {
  for (const k of kits) for (const t of texts(k)) {
    assert.doesNotMatch(t.replace(/\{[a-z_]+\}/g,''),/\d/, `figure in "${t}"`);
    for (const p of t.match(/\{[^}]*\}/g)??[]) assert.ok(POSTER_PLACEHOLDERS.includes(p), `unknown placeholder ${p}`); }
  assert.ok(korundPosterKit.slogans.some(s=>s.text.includes('{output_pct}')), 'Korund spins stats by placeholder');
  for (const k of [posterKits.kindle,aurellePosterKit]) for (const t of texts(k)) assert.doesNotMatch(t,/\{/, 'placeholders are Korund-only for now');
});
test('no real-world slogans, places, parties or people; no Notable; no citizen names', () => {
  const real=['yes we can','great again','workers of the world','god save','liberty, equality','keep calm','hope and change','america','europe','china','russia','usa','soviet','communist party','democrat','republican','labour','tory','king charles','stalin','lenin','mao','juche','reich','fatherland','motherland'];
  const names=new Set(Object.values(citizenNameLists).flatMap(l=>[...l.given,...l.family]));
  for (const k of kits) for (const t of texts(k)) { const s=t.toLowerCase();
    for (const r of real) assert.ok(!s.includes(r), `${r} in "${t}"`);
    assert.ok(!/\bNotable\b/i.test(t), t);
    for (const w of t.match(/\b[A-Z][a-z]+\b/g)??[]) assert.ok(!names.has(w), `citizen name ${w}`); }
});
test('each nation reads in its own voice', () => {
  const voice={kindle:/Ballot|Republic|Spark|plaza|Assembly|Reasoning Brief|number/i, korund:/plan|quota|brigade|coupon|Production Drive|hammer|rails/i,
    aurelle:/Crown|Favor|Hearth|rank|Throne|royal|name-stones/i};
  const foreign={kindle:/plan|quota|brigade|Crown|Favor|Hearth/i, korund:/Ballot|Spark|Crown|Favor|royal/i, aurelle:/Ballot|Spark|quota|brigade|plan/i};
  for (const k of kits) { const hits=k.slogans.filter(s=>voice[k.nationId].test(s.text)).length;
    assert.ok(hits>=Math.ceil(k.slogans.length/2), `${k.nationId}: ${hits} voiced slogans`);
    for (const t of texts(k)) assert.doesNotMatch(t,foreign[k.nationId], `${k.nationId} borrows another voice: ${t}`); }
  // Korund: no Chairman praise/mockery, no faith; Aurelle: no noble house named, no claimant content.
  for (const t of texts(korundPosterKit)) assert.doesNotMatch(t,/Chairman|faith|pray|traitor|enem|informer|purge/i);
  for (const t of texts(aurellePosterKit)) { assert.doesNotMatch(t,/\bHouse of\b|of the \w+ House\b/); assert.doesNotMatch(t,/claimant|pretender|pledge|coup/i); }
});
test('themed frames accept only matching slogans; neutral frames accept any slogan of their nation', () => {
  for (const k of kits) for (const f of k.frames) for (const s of k.slogans) {
    const ok=frameAccepts(k.nationId,f,s);
    if (f.theme) assert.equal(ok,s.theme===f.theme, `${f.id} x ${s.id}`); else assert.equal(ok,true, `${f.id} x ${s.id}`); }
  for (const k of kits) for (const f of k.frames.filter(f=>f.theme)) assert.ok(k.slogans.some(s=>s.theme===f.theme), `${f.id} has slogans`);
  assert.equal(posterKits.kindle.frames.find(f=>f.name==='Ballot Night').theme,'ballot-night');
  assert.equal(aurellePosterKit.frames.find(f=>f.name==='Hearth Night').theme,'hearth-night');
  // Cross-nation pairs are never accepted.
  assert.equal(frameAccepts('kindle',posterKits.kindle.frames[0],korundPosterKit.slogans[0]),false);
  assert.ok(aurellePosterKit.slogans.some(s=>s.text==='Long reign the Sky Throne.'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { priceBoard as PB, confluenceMarketCopy as C, MARKET_PLACEHOLDERS, MARKET_NAME_MAX, MARKET_LABEL_MAX, MARKET_LINE_MAX } from '../lib/confluence-market-copy.ts';

const labels=()=>[PB.title,PB.stapleLine,PB.postedPriceLabel,PB.postedPriceValue,PB.bandLabel,PB.bandValue];
const lineObjs=()=>[PB.explainer,PB.readOnly,PB.empty];
const all=()=>[...labels(),...lineObjs().map(l=>l.text)];
const fill=t=>MARKET_PLACEHOLDERS.reduce((a,p)=>a.replaceAll(p,'W'.repeat(MARKET_NAME_MAX)),t);

test('shape and proposal; every string distinct', () => {
  for (const o of [PB,C]) assert.equal(o.proposal,true); for (const l of lineObjs()) assert.equal(l.proposal,true);
  assert.equal(new Set(all()).size,all().length);
});
test('"posted state price" wording (ARC, #487): the price label, the read-only line and the empty state use it', () => {
  assert.equal(PB.postedPriceLabel,'Posted state price');
  assert.match(PB.readOnly.text,/posted state price/); assert.match(PB.empty.text,/posted state price/);
  assert.match(PB.explainer.text,/posts a price inside it/); assert.equal(PB.bandLabel,'State price band');
  for (const t of all()) assert.doesNotMatch(t,/market price|free price|price floats freely|kerb|black market/i,t);
});
test('limits with every placeholder filled to 24: labels 40 except the two value rows, lines 100', () => {
  assert.equal(MARKET_NAME_MAX,24);
  for (const t of [PB.title,PB.postedPriceLabel,PB.bandLabel]) assert.ok(fill(t).length<=MARKET_LABEL_MAX,t);
  for (const t of [PB.stapleLine,PB.postedPriceValue,PB.bandValue,...lineObjs().map(l=>l.text)]) assert.ok(fill(t).length<=MARKET_LINE_MAX,`${t} (${fill(t).length})`);
});
test('placeholders only from the allow-list; no figure written anywhere', () => {
  const t=all().join(' '); for (const m of t.matchAll(/\{[^}]*\}/g)) assert.ok(MARKET_PLACEHOLDERS.includes(m[0]),m[0]);
  for (const p of MARKET_PLACEHOLDERS) assert.ok(t.includes(p),p);
  for (const s of all()) assert.doesNotMatch(s.replace(/\{[^}]*\}/g,''),/\d|%|CUR\b|percent|\b(one|two|five|ten|half)\b/i,s);
});
test('plain system voice: no badge, no AI body, no reward wording, nothing on-chain, no real-world names', () => {
  for (const o of [PB,C]) assert.equal('aiBadge' in o,false);
  for (const t of all()) { assert.doesNotMatch(t,/^Be it known|State Media|Politburo says|\bI am an AI\b|reward|\bbadge|prize|\bXP\b|Tessera|token|wallet|NFT|Vietnam|Hanoi|dong/i,t); }
});
test('no string repeats another lib module; header is scanner-safe', () => {
  const others=readdirSync('lib').filter(f=>/\.ts$/.test(f)&&f!=='confluence-market-copy.ts').map(f=>readFileSync(`lib/${f}`,'utf8')).join('\n');
  for (const t of all()) assert.ok(!others.includes(`'${t}'`)&&!others.includes(`"${t}"`),t);
  assert.doesNotMatch(readFileSync('lib/confluence-market-copy.ts','utf8').split('*/')[0],/\blib\/|\.ts\b|app\/|components\//);
});
test('#688 wired: only the price board imports confluence-market-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  const users=[...walk('app'),...walk('components'),...walk('lib')].filter(f=>/\.(t|j)sx?$/.test(f)&&!f.endsWith('confluence-market-copy.ts')&&/confluence-market-copy/.test(readFileSync(f,'utf8')));
  assert.deepEqual(users,['app/confluence-price-board.tsx']);
});

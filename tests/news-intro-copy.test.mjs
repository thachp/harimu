import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { newsIntro as NI, newsIntroFor, NEWS_INTRO_LINE_MAX } from '../lib/news-intro-copy.ts';

test('AI off: the Kindle press intro does not mention AI or model-written articles', () => {
  const t=newsIntroFor('press',false); assert.equal(t,'Free press · system records.');
  assert.doesNotMatch(t,/\bAI\b|article|model|generated|machine/i);
});
test('AI on: the press intro keeps its current wording', () => {
  assert.equal(newsIntroFor('press',true),'Free press · system records and AI articles.');
});
test('State Media and court intros are unchanged and ignore the flag; none mentions AI articles', () => {
  for (const ai of [true,false]) {
    assert.equal(newsIntroFor('state',ai),'Approved by the Propaganda Directorate · State Media templates built from system figures.');
    assert.equal(newsIntroFor('court',ai),'Published by royal authority · decrees announced by the Herald.');
    for (const s of ['state','court']) assert.doesNotMatch(newsIntroFor(s,ai),/AI articles/);
  }
});
test('existing lines match the live panel and are not marked proposal; only the AI-off line is new', () => {
  const panel=readFileSync('app/national-news.tsx','utf8');
  for (const k of ['pressWithAi','state','court']) { assert.equal(NI[k].proposal,false); assert.ok(panel.includes(`'${NI[k].text}'`),k); }
  assert.equal(NI.pressNoAi.proposal,true);
  for (const v of Object.values(NI)) assert.ok(v.text.length<=NEWS_INTRO_LINE_MAX,v.text);
});
test('the header names no other lib module path', () => {
  assert.doesNotMatch(readFileSync('lib/news-intro-copy.ts','utf8').split('*/')[0],/\blib\/|\.ts\b|app\/|components\//);
});
test('unwired: nothing in app/, components/ or lib/ imports news-intro-copy', () => {
  const walk=d=>{ try { return readdirSync(d).flatMap(f=>{const p=`${d}/${f}`; return statSync(p).isDirectory()?walk(p):[p];}); } catch { return []; } };
  for (const f of [...walk('app'),...walk('components'),...walk('lib')]) if (/\.(t|j)sx?$/.test(f)&&!f.endsWith('news-intro-copy.ts')) assert.doesNotMatch(readFileSync(f,'utf8'),/news-intro-copy/,f);
});

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
test('#688 wired: the panel imports the selector instead of inlining lines', () => {
  const panel=readFileSync('app/national-news.tsx','utf8');
  assert.match(panel,/import \{ newsIntroFor \} from '\.\.\/lib\/news-intro-copy'/);
  assert.match(panel,/newsIntroFor\(news\.style,news\.items\.some\(item=>item\.source==='model'\)\)/);
  for (const k of ['pressWithAi','state','court']) assert.equal(NI[k].proposal,false,k);
  assert.equal(NI.pressNoAi.proposal,true,'QA1 nit: the AI-off line stays a proposal');
  for (const v of Object.values(NI)) { assert.ok(!panel.includes(`'${v.text}'`),v.text); assert.ok(v.text.length<=NEWS_INTRO_LINE_MAX,v.text); }
});
test('the header names no other lib module path', () => {
  assert.doesNotMatch(readFileSync('lib/news-intro-copy.ts','utf8').split('*/')[0],/\blib\/|\.ts\b|app\/|components\//);
});

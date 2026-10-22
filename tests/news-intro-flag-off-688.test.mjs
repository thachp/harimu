/** #688 flag-off: with HARIMU_AI_NEWS_ENABLED off, GET /api/news carries no model-written item, so the Kindle intro the panel derives from it is the AI-off form. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';
import { newsIntroFor } from '../lib/news-intro-copy.ts';

test('AI news off: the Kindle edition has no model item and the derived intro is "Free press · system records."', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_AI_NEWS_ENABLED', 'false');
  await r.call('world', null);
  await r.db.prepare("UPDATE citizens SET nation_id='kindle' WHERE clerk_user_id='alice'").run();
  const res = await r.call('news', 'alice');
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const news = res.data.news ?? res.data;
  assert.equal(news.style, 'press');
  const aiArticles = news.items.some(item => item.source === 'model');
  assert.equal(aiArticles, false, 'flag off: no model-written item in the edition');
  assert.equal(newsIntroFor(news.style, aiArticles), 'Free press · system records.');
  assert.doesNotMatch(newsIntroFor(news.style, aiArticles), /AI/);
});

test('selector: true and false forms', () => {
  assert.equal(newsIntroFor('press', true), 'Free press · system records and AI articles.');
  assert.equal(newsIntroFor('press', false), 'Free press · system records.');
  for (const style of ['state', 'court']) assert.equal(newsIntroFor(style, true), newsIntroFor(style, false), style);
});

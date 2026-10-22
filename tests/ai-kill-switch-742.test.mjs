import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {localRuntime} from './helpers/local-runtime.mjs';
import {aiTemplatesOnly,aiTemplatesOnlyMode,logAiTemplatesOnly} from '../lib/ai-kill-switch.ts';
const budget={dailyBudgetMicro:970000,gatewayId:'harimu-test'};
const all={HARIMU_AI_TEMPLATES_ONLY:'all'},korund={HARIMU_AI_TEMPLATES_ONLY:'korund'};
const draft={title:'National ledger record',summary:'Recorded work contributes to household food.',claims:['citizens','completedShifts','food']};
const counting=()=>{const calls=[];return {calls,async run(model,input){calls.push({model,input});return {response:[JSON.stringify(draft),'supported','safe'][(calls.length-1)%3]};}};};
// A database that must not be touched: the switch returns before any read, reservation or model call.
const untouchable={prepare(){throw Error('database touched');},batch(){throw Error('database touched');}};
const reservations=async db=>(await db.prepare('SELECT COUNT(*) AS n FROM harimu_ai_reservations').first()).n;
const quiet=fn=>async t=>{t.mock.method(console,'info',()=>{});await fn(t);};

test('aiTemplatesOnly: empty is off, "all" covers every nation, a list matches only its nations, garbage fails closed', () => {
  for (const raw of [undefined, null, '', '  ']) { assert.equal(aiTemplatesOnlyMode(raw), 'off'); assert.equal(aiTemplatesOnly({HARIMU_AI_TEMPLATES_ONLY: raw}, 'kindle'), false); }
  assert.equal(aiTemplatesOnly({}, 'kindle'), false); assert.equal(aiTemplatesOnly(undefined, 'kindle'), false);
  for (const nation of ['kindle', 'korund', 'aurelle']) { assert.equal(aiTemplatesOnly(all, nation), true); assert.equal(aiTemplatesOnly({HARIMU_AI_TEMPLATES_ONLY: ' ALL '}, nation), true); }
  assert.equal(aiTemplatesOnly(korund, 'korund'), true); assert.equal(aiTemplatesOnly(korund, 'kindle'), false); assert.equal(aiTemplatesOnly(korund, 'aurelle'), false);
  const two = {HARIMU_AI_TEMPLATES_ONLY: 'korund, aurelle'}; assert.equal(aiTemplatesOnly(two, 'aurelle'), true); assert.equal(aiTemplatesOnly(two, 'kindle'), false);
  for (const raw of ['yes', 'true', 'korund,', 'korund,atlantis', ',', 'kindle;korund', '__proto__', 1, true, {}]) {
    assert.equal(aiTemplatesOnlyMode(raw), 'all', String(raw));
    for (const nation of ['kindle', 'korund', 'aurelle']) assert.equal(aiTemplatesOnly({HARIMU_AI_TEMPLATES_ONLY: raw}, nation), true, `${String(raw)} fails closed`);
  }
});

test('the skip is logged once per path and nation per minute, with no user data', t => {
  const lines = []; t.mock.method(console, 'info', line => lines.push(line));
  const now = 1_900_000_020;
  assert.equal(logAiTemplatesOnly('debate', 'kindle', all, now), true); assert.equal(logAiTemplatesOnly('debate', 'kindle', all, now + 5), false);
  assert.equal(logAiTemplatesOnly('debate', 'korund', korund, now), true); assert.equal(logAiTemplatesOnly('debate', 'kindle', all, now + 60), true);
  assert.deepEqual(lines, ['[ai-kill-switch] templates only: path=debate nation=kindle mode=all', '[ai-kill-switch] templates only: path=debate nation=korund mode=nations', '[ai-kill-switch] templates only: path=debate nation=kindle mode=all']);
});

test('with "all", cabinet, town hall and debate make no model call and no reservation', quiet(async t => {
  const r = await localRuntime(); t.after(() => r.close()); const now = Math.floor(r.now / 1000);
  const cabinet = await r.importModule('lib/cabinet-response-ai.ts'), townHall = await r.importModule('lib/town-hall-ai.ts'), debate = await r.importModule('lib/debate-ai.ts');
  const ai = counting();
  assert.deepEqual(await cabinet.prepareAiCabinetResponse(untouchable, now, ai, {enabled: true, budget, killSwitch: all}), {status: 'templates-only'});
  assert.deepEqual(await townHall.prepareTownHallAnswer(untouchable, now, ai, {enabled: true, budget, killSwitch: all}), {status: 'templates-only'});
  assert.deepEqual(await debate.prepareDebateAnswer(untouchable, now, ai, {enabled: true, budget, killSwitch: all}), {status: 'templates-only'});
  const on = {AI: ai, HARIMU_AI_DAILY_BUDGET_MICRO: '970000', HARIMU_AI_GATEWAY_ID: 'harimu-test', HARIMU_AI_TEMPLATES_ONLY: 'all'};
  assert.deepEqual(await townHall.runTownHallCron(untouchable, now, {...on, HARIMU_TOWN_HALLS_ENABLED: 'true', HARIMU_AI_TOWN_HALL_ANSWERS_ENABLED: 'true'}), {status: 'ran', results: ['templates-only']});
  assert.deepEqual(await debate.runDebateCron(untouchable, now, {...on, HARIMU_DEBATE_ENABLED: 'true', HARIMU_AI_DEBATE_ANSWERS_ENABLED: 'true'}), {status: 'ran', results: ['templates-only']});
  assert.deepEqual(await (await r.importModule('lib/cabinet-cron.ts')).runCabinetCron(untouchable, now, {...on, HARIMU_AI_CABINET_RESPONSES_ENABLED: 'true'}), {status: 'ran', results: ['templates-only']});
  // "korund" leaves Kindle's cabinet on the model path (it reaches the database to look for a petition).
  await assert.rejects(cabinet.prepareAiCabinetResponse(untouchable, now, ai, {enabled: true, budget, killSwitch: korund}), /database touched/);
  assert.equal(ai.calls.length, 0); assert.equal(await reservations(r.db), 0);
}));

test('news: "all" and "korund" skip only the covered editions; Kindle and Aurelle still call the model', quiet(async t => {
  const r = await localRuntime(); t.after(() => r.close()); const now = Math.floor(r.now / 1000);
  const {prepareAiNews, withAiNews} = await r.importModule('lib/ai-news.ts');
  const edition = nationId => ({nationId, title: 'News', style: 'press', fetchedAt: now * 1000, statistics: {citizens: 2, completedShifts: 3, food: 12}, items: []});
  const ai = counting();
  for (const nation of ['kindle', 'korund', 'aurelle']) await prepareAiNews(r.db, edition(nation), now, ai, {enabled: true, budget, killSwitch: all});
  assert.equal(ai.calls.length, 0); assert.equal(await reservations(r.db), 0);
  await prepareAiNews(r.db, edition('korund'), now, ai, {enabled: true, budget, killSwitch: korund}); assert.equal(ai.calls.length, 0); assert.equal(await reservations(r.db), 0);
  await prepareAiNews(r.db, edition('kindle'), now, ai, {enabled: true, budget, killSwitch: korund}); assert.equal(ai.calls.length, 3);
  await prepareAiNews(r.db, edition('aurelle'), now, ai, {enabled: true, budget, killSwitch: korund}); assert.equal(ai.calls.length, 6);
  assert.equal(await reservations(r.db), 2);
  const base = {...edition('korund'), items: [{id: 'a', title: 'T', text: 'x', occurredAt: 1, source: 'deterministic', kind: 'template'}, {id: 'm', title: 'M', text: 'y', occurredAt: 2, source: 'model'}]};
  const templated = withAiNews(base, [{id: 'model:z', title: 'Z', text: 'z', occurredAt: 3, source: 'model'}], true);
  assert.equal(templated.templatesOnly, true); assert.deepEqual(templated.items.map(i => i.id), ['a']);
  const live = withAiNews(base, [{id: 'model:z', title: 'Z', text: 'z', occurredAt: 3, source: 'model'}], false);
  assert.equal(live.templatesOnly, undefined); assert.deepEqual(live.items.map(i => i.id), ['model:z', 'm', 'a']);
}));

test('the news route in templates-only mode calls no model, reserves nothing and marks the edition for the footer', quiet(async t => {
  const r = await localRuntime(); t.after(() => r.close()); const ai = counting(); r.setFixtureAiBinding(ai); r.setFixtureAiFlags({news: true});
  r.setFixtureEnv('HARIMU_AI_TEMPLATES_ONLY', 'all');
  const news = await r.call('news', 'alice'); assert.equal(news.status, 200); assert.equal(news.data.templatesOnly, true);
  assert.equal(news.data.items.some(item => item.source === 'model'), false); assert.equal(ai.calls.length, 0); assert.equal(await reservations(r.db), 0);
  r.setFixtureEnv('HARIMU_AI_TEMPLATES_ONLY', 'korund');
  const live = await r.call('news', 'alice'); assert.equal(live.status, 200); assert.equal(live.data.templatesOnly, undefined); assert.equal(ai.calls.length, 3);
}));

test('notables: templates-only answers with the authored example, with no model call and nothing reserved', quiet(async t => {
  const r = await localRuntime(); t.after(() => r.close()); const ai = counting();
  const command = {requestId: randomUUID(), notableId: 'kindle-journalist', topic: 'news'};
  const result = await r.answerNotable('alice', command, ai, {enabled: true, budget, killSwitch: all});
  assert.equal(result.status, 200); assert.equal(result.source, 'authored'); assert.equal(result.templatesOnly, true); assert.ok(result.reply.length > 0);
  assert.equal(ai.calls.length, 0); assert.equal(await reservations(r.db), 0);
  const live = await r.answerNotable('alice', {...command, requestId: randomUUID()}, ai, {enabled: true, budget, killSwitch: korund});
  assert.equal(live.status, 200); assert.ok(ai.calls.length > 0); assert.equal(await reservations(r.db), 1);
}));
// The rendered footer is tested in tests/national-news-ui.test.mjs.

test('POST /api/notables passes the switch: "all" answers authored with no model call; "korund" leaves a Kindle citizen on the model', quiet(async t => {
  const r = await localRuntime(); t.after(() => r.close()); const ai = counting(); r.setFixtureAiBinding(ai); r.setFixtureAiFlags({notables: true});
  const command = () => ({requestId: randomUUID(), notableId: 'kindle-journalist', topic: 'news'});
  r.setFixtureEnv('HARIMU_AI_TEMPLATES_ONLY', 'all');
  const off = await r.call('notables', 'alice', command());
  assert.equal(off.status, 200); assert.equal(off.data.source, 'authored'); assert.equal(off.data.templatesOnly, true); assert.ok(off.data.reply.length > 0);
  assert.equal(ai.calls.length, 0); assert.equal(await reservations(r.db), 0);
  r.setFixtureEnv('HARIMU_AI_TEMPLATES_ONLY', 'korund');
  const live = await r.call('notables', 'alice', command());
  assert.equal(live.status, 200); assert.equal(live.data.templatesOnly, undefined); assert.ok(ai.calls.length > 0); assert.equal(await reservations(r.db), 1);
}));

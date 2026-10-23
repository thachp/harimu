import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {localRuntime} from './helpers/local-runtime.mjs';
import {readFileSync} from 'node:fs';
import {aiMutedPersonasMode,aiPersonaMuted,aiMutablePersonas,aiNotablePersonas} from '../lib/ai-kill-switch.ts';
import {personaMuted} from '../lib/kill-switch-copy.ts';
// #764 slice 1: per-persona mute as an operator var. A muted persona makes no model call and no reservation.
const budget={dailyBudgetMicro:970000,gatewayId:'harimu-test'};
const counting=()=>{const calls=[];return {calls,async run(model,input){calls.push({model,input});throw Error('model must not be called');}};};
const untouchable={prepare(){throw Error('database touched');},batch(){throw Error('database touched');}};
const quiet=fn=>async t=>{t.mock.method(console,'info',()=>{});await fn(t);};
const mute=v=>({HARIMU_AI_MUTED_PERSONAS:v});

test('aiPersonaMuted: empty is off, "all" mutes every persona, a list mutes only its ids, unknown ids fail closed', () => {
  for (const raw of [undefined, null, '', '  ']) { assert.equal(aiMutedPersonasMode(raw), 'off'); assert.equal(aiPersonaMuted(mute(raw), 'kindle-journalist'), false); }
  assert.equal(aiPersonaMuted({}, 'kindle-journalist'), false);
  for (const id of aiMutablePersonas) assert.equal(aiPersonaMuted(mute('all'), id), true, id);
  assert.equal(aiPersonaMuted(mute('kindle-journalist'), 'kindle-journalist'), true); assert.equal(aiPersonaMuted(mute('kindle-journalist'), 'korund-chronicler'), false);
  for (const id of ['kindle-news-desk', 'kindle-cabinet', 'kindle-town-hall', 'kindle-debate', 'kindle-cartoonist']) assert.ok(aiMutablePersonas.includes(id), id);
  for (const raw of ['yes', 'kindle-journalist,', 'atlantis', 1, {}]) for (const id of ['kindle-journalist', 'kindle-cabinet']) assert.equal(aiPersonaMuted(mute(raw), id), true, `${String(raw)} fails closed`);
});

test('cron paths: a muted persona returns persona-muted before any database read or model call', quiet(async t => {
  const r = await localRuntime(); t.after(() => r.close()); const ai = counting();
  const {prepareDebateAnswer} = await r.importModule('lib/debate-ai.ts'), {prepareTownHallAnswer} = await r.importModule('lib/town-hall-ai.ts'), {prepareAiCabinetResponse} = await r.importModule('lib/cabinet-response-ai.ts');
  for (const [prepare, persona] of [[prepareDebateAnswer, 'kindle-debate'], [prepareTownHallAnswer, 'kindle-town-hall'], [prepareAiCabinetResponse, 'kindle-cabinet']]) {
    const out = await prepare(untouchable, 1_900_000_000, ai, {enabled: true, budget, killSwitch: mute(persona)});
    assert.equal(out.status, 'persona-muted', prepare.name);
  }
  assert.equal(ai.calls.length, 0);
}));

test('ai-news: a muted news desk skips the model and the reservation; another nation\'s desk is not muted', quiet(async t => {
  const r = await localRuntime(); t.after(() => r.close()); const ai = counting(); const {prepareAiNews} = await r.importModule('lib/ai-news.ts');
  const edition = {nationId: 'kindle', title: 'K', style: 'press', fetchedAt: 1, statistics: {citizens: 0, completedShifts: 0, food: 0}, items: []};
  await prepareAiNews(untouchable, edition, 1_900_000_000, ai, {enabled: true, budget, killSwitch: mute('kindle-news-desk')});
  assert.equal(ai.calls.length, 0);
  // Korund's desk is not muted, so Korund's edition goes on to the database.
  await assert.rejects(prepareAiNews(untouchable, {...edition, nationId: 'korund'}, 1_900_000_000, ai, {enabled: true, budget, killSwitch: mute('kindle-news-desk')}), /database touched/);
}));

test('notables: a muted Notable answers with the persona-muted notice, no model call and nothing reserved; others still reach the model', quiet(async t => {
  const r = await localRuntime(); t.after(() => r.close()); const ai = counting();
  const command = () => ({requestId: randomUUID(), notableId: 'kindle-journalist', topic: 'news'});
  const out = await r.answerNotable('alice', command(), ai, {enabled: true, budget, killSwitch: mute('kindle-journalist')});
  assert.equal(out.status, 200); assert.equal(out.source, 'authored'); assert.equal(out.personaMuted, true); assert.equal(out.reply, personaMuted.notablesPanel.text);
  assert.equal(ai.calls.length, 0);
  assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM harimu_ai_reservations').first()).n, 0);
  await r.answerNotable('alice', command(), ai, {enabled: true, budget, killSwitch: mute('korund-chronicler')});
  assert.ok(ai.calls.length > 0, 'an unmuted Notable reaches the model');
}));

test('POST /api/notables reads HARIMU_AI_MUTED_PERSONAS from the environment', quiet(async t => {
  const r = await localRuntime(); t.after(() => r.close()); const ai = counting(); r.setFixtureAiBinding(ai); r.setFixtureAiFlags({notables: true});
  r.setFixtureEnv('HARIMU_AI_MUTED_PERSONAS', 'kindle-journalist');
  const res = await r.call('notables', 'alice', {requestId: randomUUID(), notableId: 'kindle-journalist', topic: 'news'});
  assert.equal(res.status, 200); assert.equal(res.data.personaMuted, true); assert.equal(res.data.reply, personaMuted.notablesPanel.text); assert.equal(ai.calls.length, 0);
}));

test('the mutable Notable ids match every Notable roster', () => {
  const ids = ['lib/notable-profiles.ts', 'lib/notable-roster.ts', 'lib/wave2-notable-roster.ts'].flatMap(f => [...readFileSync(f, 'utf8').matchAll(/\{\s*id:'([a-z0-9-]+)',name:/g)].map(m => m[1]));
  assert.ok(ids.length >= 3); assert.deepEqual([...aiNotablePersonas], ids);
});

// QA3 on #783: per path, "" must still reach the model or the database, and a muted baseline in the same test must not.
const off = mute('');
for (const [label, file, fn, persona] of [['cabinet-response', 'lib/cabinet-response-ai.ts', 'prepareAiCabinetResponse', 'kindle-cabinet'], ['town-hall', 'lib/town-hall-ai.ts', 'prepareTownHallAnswer', 'kindle-town-hall'], ['debate', 'lib/debate-ai.ts', 'prepareDebateAnswer', 'kindle-debate']]) {
  test(`${label}: "" reaches the database; muting ${persona} does not`, quiet(async t => {
    const r = await localRuntime(); t.after(() => r.close()); const ai = counting(); const prepare = (await r.importModule(file))[fn];
    assert.deepEqual(await prepare(untouchable, 1_900_000_000, ai, {enabled: true, budget, killSwitch: mute(persona)}), {status: 'persona-muted'});
    await assert.rejects(prepare(untouchable, 1_900_000_000, ai, {enabled: true, budget, killSwitch: off}), /database touched/);
  }));
}
test('town hall and debate mute separately', quiet(async t => {
  const r = await localRuntime(); t.after(() => r.close()); const ai = counting();
  const {prepareTownHallAnswer} = await r.importModule('lib/town-hall-ai.ts'), {prepareDebateAnswer} = await r.importModule('lib/debate-ai.ts');
  await assert.rejects(prepareTownHallAnswer(untouchable, 1_900_000_000, ai, {enabled: true, budget, killSwitch: mute('kindle-debate')}), /database touched/);
  await assert.rejects(prepareDebateAnswer(untouchable, 1_900_000_000, ai, {enabled: true, budget, killSwitch: mute('kindle-town-hall')}), /database touched/);
}));
test('ai-news: "" reaches the database; muting kindle-news-desk does not', quiet(async t => {
  const r = await localRuntime(); t.after(() => r.close()); const ai = counting(); const {prepareAiNews} = await r.importModule('lib/ai-news.ts');
  const edition = {nationId: 'kindle', title: 'K', style: 'press', fetchedAt: 1, statistics: {citizens: 0, completedShifts: 0, food: 0}, items: []};
  await prepareAiNews(untouchable, edition, 1_900_000_000, ai, {enabled: true, budget, killSwitch: mute('kindle-news-desk')});
  await assert.rejects(prepareAiNews(untouchable, edition, 1_900_000_000, ai, {enabled: true, budget, killSwitch: off}), /database touched/);
}));
test('notables: "" reaches the model; muting kindle-journalist does not', quiet(async t => {
  const r = await localRuntime(); t.after(() => r.close()); const ai = counting();
  const command = () => ({requestId: randomUUID(), notableId: 'kindle-journalist', topic: 'news'});
  const muted = await r.answerNotable('alice', command(), ai, {enabled: true, budget, killSwitch: mute('kindle-journalist')});
  assert.equal(muted.personaMuted, true); assert.equal(ai.calls.length, 0);
  const live = await r.answerNotable('alice', command(), ai, {enabled: true, budget, killSwitch: off});
  assert.equal(live.personaMuted, undefined); assert.ok(ai.calls.length > 0, 'an unmuted Notable reaches the model');
}));

/** #615 slice 2: hostile citizen text through each AI feature's real input path (Notable question, petition demand, town hall
 *  question, debate question) to a fake model that records every request. The text must reach a drafting or checking model only
 *  as a JSON-quoted user field, never in a system prompt, and it cannot change the published answer: the fake model always returns
 *  the same legal draft, and the result must be exactly that draft. Offline: no model call, no network, no secret. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';

const hostile = JSON.parse(readFileSync(new URL('./ai-evals/injection.json', import.meta.url), 'utf8'));
const budget = { dailyBudgetMicro: 970000, gatewayId: 'harimu-test' };
const guard = '@cf/meta/llama-guard-3-8b';
const answer = 'My platform puts steady work first, and I will keep the public ledger open to every citizen.';
const draft = { title: 'On the ledger', summary: 'The public ledger records the work citizens finished.', claims: ['completedShifts'] };
/** A model that records every request and returns a fixed legal draft, a supported check and a safe verdict. */
const recorder = reply => { const seen = []; return { seen, async run(model, input) { seen.push({ model, messages: input.messages }); const k = input.messages.some(m => m.role === 'system' && /^Check/i.test(m.content)) ? 'check' : model === guard ? 'guard' : 'draft'; return { response: k === 'guard' ? 'safe' : k === 'check' ? JSON.stringify({ supported: true }) : JSON.stringify(reply) }; } }; };
const fields = value => typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(fields) : [];

/** The text reached the model, never in a system message, and every non-guard message that carries it is JSON whose field equals it exactly. */
function quotedOnly(seen, text, label) {
  assert.ok(seen.length >= 3, `${label}: the pipeline ran draft, check and guard`);
  let carried = 0;
  for (const { model, messages } of seen) for (const m of messages) {
    if (!m.content.includes(text) && !m.content.includes(JSON.stringify(text).slice(1, -1))) continue;
    assert.notEqual(m.role, 'system', `${label}: citizen text inside a system prompt`);
    if (model === guard) continue; // the safety classifier reads the text as the content it classifies
    let parsed; try { parsed = JSON.parse(m.content); } catch { assert.fail(`${label}: citizen text sent unquoted to ${model}`); }
    const holding = fields(parsed).filter(f => f.includes(text));
    assert.ok(holding.length > 0 && holding.every(f => f === text), `${label}: every field holding the citizen text is exactly it (an exact JSON field)`); carried++;
  }
  assert.ok(carried > 0, `${label}: the citizen text reached the drafting model as quoted data`);
}

test('Notable question: hostile text is quoted data and the published reply is exactly the model draft', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const notableId = (await r.call('notables', 'alice')).data.profile.id;
  for (const h of hostile) {
    await r.db.prepare("DELETE FROM harimu_ai_reservations WHERE request_id LIKE 'notable:%'").run(); // the daily quota is not under test
    const ai = recorder(draft), res = await r.answerNotable('alice', { requestId: randomUUID(), notableId, topic: 'news', question: h.text }, ai, { enabled: true, budget });
    assert.equal(res.status, 200, h.id); assert.equal(res.source, 'model', h.id);
    assert.equal(res.reply.split('\n')[0], draft.summary, `${h.id}: the reply is the draft`); assert.ok(!res.reply.includes(h.text), h.id);
    quotedOnly(ai.seen, h.text, `notables/${h.id}`);
  }
});

test('Cabinet petition demand: hostile text is quoted data and the response is exactly the model draft', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const reply = 'The Cabinet has read this petition and will review the public record before acting on it.';
  r.setVerification('alice', { userId: 'alice', emailVerified: true, phoneVerified: true, phoneUnique: true, revoked: false, checkedAt: r.now, expiresAt: r.now + 60000 });
  const cron = (await r.importModule('lib/cabinet-response-ai.ts')).prepareAiCabinetResponse;
  for (const h of hostile) {
    await r.db.prepare('DELETE FROM civic_petition_signatures').run(); await r.db.prepare('DELETE FROM civic_petitions').run(); // one petition per citizen per window is not under test
    const created = await r.call('petitions', 'alice', { action: 'create', requestId: randomUUID(), title: `Petition ${h.id}`, demand: h.text });
    assert.equal(created.status, 200, h.id);
    const ai = recorder({ response: reply }), out = await cron(r.db, Math.floor(r.now / 1000), ai, { enabled: true, budget });
    assert.equal(out.status, 'recorded', h.id);
    const row = await r.db.prepare('SELECT response_text FROM civic_petitions WHERE demand=?').bind(h.text).first();
    assert.equal(row.response_text, `AI Cabinet response (model-generated): ${reply}`, `${h.id}: the response is the draft`);
    quotedOnly(ai.seen, h.text, `cabinet/${h.id}`);
  }
});

const previewEnv = { NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW: 'true', HARIMU_ACCOUNT_ELECTION_POC_ENABLED: 'true' };
/** Submits the hostile question through the real route (`POST /api/town-hall` or `/api/debate`, action ask), closes the hall by moving
 *  the clock past it, and runs the answer job until idle. A question the route refuses at intake never reaches a model, which is reported. */
async function routeRun(t, { endpoint, flag, extra, run, table }) {
  const r = await localRuntime({ accountElectionBindings: previewEnv }); t.after(() => r.close());
  const open = Math.floor(r.now / 1000), later = open + 86400 + 60, iso = new Date(r.now).toISOString(), refused = [];
  r.setFixtureEnv(flag, 'true'); r.setFixtureEnv(`${flag.replace(/_ENABLED$/, '')}_OPEN_AT`.replace('TOWN_HALLS', 'TOWN_HALL'), String(open));
  for (const h of hostile) {
    for (const tbl of [table, 'town_hall_votes', 'town_hall_questions', 'harimu_ai_reservations']) await r.db.prepare(`DELETE FROM ${tbl}`).run(); // one question at a time
    const user = `eval-${h.id}`;
    await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,'kindle',?,18,0,'Good standing',?,?)").bind(user, 'Eval citizen', iso, iso).run();
    const asked = await r.call(endpoint, user, { action: 'ask', requestId: randomUUID(), text: h.text, ...extra });
    if (asked.status !== 200) { refused.push(h.id); continue; }
    const q = await r.db.prepare('SELECT id FROM town_hall_questions WHERE body=?').bind(h.text).first();
    const ai = recorder({ response: answer });
    for (let i = 0; i < 5 && (await run(r.db, later, ai, { enabled: true, budget })).status === 'recorded'; i++);
    const rows = (await r.db.prepare(`SELECT answer_text FROM ${table} WHERE question_id=?`).bind(q.id).all()).results;
    assert.ok(rows.length >= 1 && rows.every(x => x.answer_text === answer), `${endpoint}/${h.id}: the published answer is the draft`);
    quotedOnly(ai.seen, h.text, `${endpoint}/${h.id}`);
  }
  return refused;
}

test('Town hall question via POST /api/town-hall: hostile text is quoted data and the published answer is exactly the model draft', async t => {
  const r0 = await localRuntime(); const { prepareTownHallAnswer } = await r0.importModule('lib/town-hall-ai.ts'); await r0.close();
  const refused = await routeRun(t, { endpoint: 'town-hall', flag: 'HARIMU_TOWN_HALLS_ENABLED', extra: { candidateId: 'ines-varro' }, run: prepareTownHallAnswer, table: 'town_hall_answers' });
  assert.deepEqual(refused, ['role-tag'], 'only the tag-bearing text is refused at intake (no < or >); every other text reached the model');
});

test('Debate question via POST /api/debate: hostile text is quoted data and the published answer is exactly the model draft', async t => {
  const r0 = await localRuntime(); const { prepareDebateAnswer } = await r0.importModule('lib/debate-ai.ts'); await r0.close();
  const refused = await routeRun(t, { endpoint: 'debate', flag: 'HARIMU_DEBATE_ENABLED', extra: {}, run: prepareDebateAnswer, table: 'debate_answers' });
  assert.deepEqual(refused, ['role-tag'], 'only the tag-bearing text is refused at intake (no < or >); every other text reached the model');
});

test('the quoted-data check bites: text in a system prompt, or sent raw to a drafting model, fails it', () => {
  const text = hostile[0].text, ok = [{ model: 'm', messages: [{ role: 'system', content: 'Rules.' }, { role: 'user', content: JSON.stringify({ question: text }) }] }, { model: 'm', messages: [] }, { model: guard, messages: [{ role: 'user', content: text }] }];
  assert.doesNotThrow(() => quotedOnly(ok, text, 'ok'));
  assert.throws(() => quotedOnly([{ model: 'm', messages: [{ role: 'system', content: `Rules. ${text}` }, { role: 'user', content: '{}' }] }, ...ok.slice(1)], text, 'sys'), /system prompt/);
  assert.throws(() => quotedOnly([{ model: 'm', messages: [{ role: 'user', content: `Question: ${text}` }] }, ...ok.slice(1)], text, 'raw'), /unquoted/);
  assert.throws(() => quotedOnly([ok[1], ok[1], ok[2]], text, 'absent'), /reached the drafting model/);
  assert.throws(() => quotedOnly([{ model: 'm', messages: [{ role: 'user', content: JSON.stringify({ prompt: `Answer this: ${text}` }) }] }, ...ok.slice(1)], text, 'spliced'), /exact JSON field/);
  assert.throws(() => quotedOnly([{ model: 'm', messages: [{ role: 'user', content: JSON.stringify({ question: text, note: `Q: ${text}` }) }] }, ...ok.slice(1)], text, 'also spliced'), /exact JSON field/);
});

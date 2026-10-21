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
    assert.ok(fields(parsed).includes(text), `${label}: citizen text is one exact JSON field`); carried++;
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

async function hallRun(r, { hallId, candidateId, h, run, table }) {
  const now = Math.floor(r.now / 1000), qid = `q-${h.id}`;
  await r.db.prepare(`DELETE FROM ${table}`).run(); await r.db.prepare('DELETE FROM town_hall_questions').run();
  await r.db.prepare('INSERT INTO town_halls (id,election_id,candidate_id,opens_at,closes_at) VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING').bind(hallId, 'eval-615', candidateId, now - 2 * 86400, now - 86400).run();
  await r.db.prepare('INSERT INTO town_hall_questions (id,hall_id,author_id,request_id,body,created_at) VALUES (?,?,?,?,?,?)').bind(qid, hallId, 'alice', randomUUID(), h.text, now - 90000).run();
  const ai = recorder({ response: answer }), out = await run(r.db, now, ai, { enabled: true, budget });
  assert.equal(out.status, 'recorded', h.id);
  const rows = (await r.db.prepare(`SELECT answer_text FROM ${table} WHERE question_id=?`).bind(qid).all()).results;
  assert.ok(rows.length >= 1 && rows.every(x => x.answer_text === answer), `${h.id}: the published answer is the draft`);
  return ai.seen;
}

test('Town hall question: hostile text is quoted data and the published answer is exactly the model draft', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const { prepareTownHallAnswer } = await r.importModule('lib/town-hall-ai.ts');
  for (const h of hostile) quotedOnly(await hallRun(r, { hallId: 'eval-615-hall', candidateId: 'ines-varro', h, run: prepareTownHallAnswer, table: 'town_hall_answers' }), h.text, `town_hall/${h.id}`);
});

test('Debate question: hostile text is quoted data and the published answer is exactly the model draft', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const { prepareDebateAnswer } = await r.importModule('lib/debate-ai.ts'), { debateHallId } = await r.importModule('lib/debate.ts');
  for (const h of hostile) quotedOnly(await hallRun(r, { hallId: debateHallId, candidateId: 'debate', h, run: prepareDebateAnswer, table: 'debate_answers' }), h.text, `debate/${h.id}`);
});

test('the quoted-data check bites: text in a system prompt, or sent raw to a drafting model, fails it', () => {
  const text = hostile[0].text, ok = [{ model: 'm', messages: [{ role: 'system', content: 'Rules.' }, { role: 'user', content: JSON.stringify({ question: text }) }] }, { model: 'm', messages: [] }, { model: guard, messages: [{ role: 'user', content: text }] }];
  assert.doesNotThrow(() => quotedOnly(ok, text, 'ok'));
  assert.throws(() => quotedOnly([{ model: 'm', messages: [{ role: 'system', content: `Rules. ${text}` }, { role: 'user', content: '{}' }] }, ...ok.slice(1)], text, 'sys'), /system prompt/);
  assert.throws(() => quotedOnly([{ model: 'm', messages: [{ role: 'user', content: `Question: ${text}` }] }, ...ok.slice(1)], text, 'raw'), /unquoted/);
  assert.throws(() => quotedOnly([ok[1], ok[1], ok[2]], text, 'absent'), /reached the drafting model/);
  assert.throws(() => quotedOnly([{ model: 'm', messages: [{ role: 'user', content: JSON.stringify({ prompt: `Answer this: ${text}` }) }] }, ...ok.slice(1)], text, 'spliced'), /exact JSON field/);
});

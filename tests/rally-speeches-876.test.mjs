/** #876: model-written Kindle rally speeches. Flag off / no binding / no budget: no model call, template speech. AI path: one speech per upcoming rally through the
 *  town hall pipeline (draft, check, safety), labeled AI, idempotent, copied into the published clip. Kill switch (templates-only, muted persona) and failures fall
 *  back to the #867 template with no model call or no publish. SQLite + PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aiMutablePersonas, aiPathPersonas } from '../lib/ai-kill-switch.ts';

const reply = 'Kindle works when every Resident who wants a job has one, and I will keep our trade deals careful and open to review.';
const gateway = (text = reply) => ({ seen: [], async run(model, input, options) {
  this.seen.push({ model, input, options });
  if (model.includes('guard')) return { response: 'safe' };
  const required = input.response_format?.json_schema?.required ?? [];
  return { response: required.includes('supported') ? JSON.stringify({ supported: true }) : JSON.stringify({ response: text }) };
} });
const env = (ai, extra = {}) => ({ AI: ai, HARIMU_KINDLE_RALLIES_ENABLED: 'true', HARIMU_AI_RALLY_SPEECHES_ENABLED: 'true', HARIMU_AI_DAILY_BUDGET_MICRO: '970000', HARIMU_AI_GATEWAY_ID: 'harimu-test', ...extra });

test('kill switch: the rally path speaks as the mutable kindle-rally persona', () => {
  assert.equal(aiPathPersonas.rally(), 'kindle-rally'); assert.ok(aiMutablePersonas.includes('kindle-rally'));
});
async function setup(t, backend) {
  const { localRuntime } = await import('./helpers/local-runtime.mjs');
  const r = await localRuntime({ backend, accountElection: true }); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_KINDLE_RALLIES_ENABLED', 'true');
  const ai = await r.importModule('lib/rally-speech-ai.ts'), rallies = await r.importModule('lib/rallies.ts');
  const now = Math.floor(r.now / 1000);
  const speeches = async () => (await r.call('rallies', 'alice')).data.rallies.map(x => x.speech);
  const count = async t2 => Number((await r.db.prepare(`SELECT COUNT(*) AS n FROM ${t2}`).first()).n);
  return { r, ai, rallies, now, speeches, count };
}
for (const backend of ['sqlite', 'postgres']) {
  test(`#876 ${backend}: flag off, no binding or no budget is a no-op; the template speech is shown`, async t => {
    const { r, ai, now, speeches, count } = await setup(t, backend);
    const template = await speeches(), g = gateway();
    for (const e of [env(g, { HARIMU_AI_RALLY_SPEECHES_ENABLED: undefined }), env(g, { HARIMU_AI_RALLY_SPEECHES_ENABLED: 'TRUE' }), env(g, { HARIMU_KINDLE_RALLIES_ENABLED: 'false' }), env(undefined), env(g, { HARIMU_AI_DAILY_BUDGET_MICRO: undefined })])
      assert.equal((await ai.runRallySpeechCron(r.db, now, e)).status, 'disabled');
    assert.equal(g.seen.length, 0, 'no model call'); assert.equal(await count('rally_speeches'), 0); assert.equal(await count('harimu_ai_reservations'), 0);
    assert.deepEqual(await speeches(), template); assert.ok(template.every(s => s.ai === true && / to the crowd in /.test(s.text)));
  });

  test(`#876 ${backend}: AI path writes one labeled speech per upcoming rally through draft, check and safety; idempotent; the clip carries it`, async t => {
    const { r, ai, rallies, now, speeches, count } = await setup(t, backend);
    const g = gateway(), res = await ai.runRallySpeechCron(r.db, now, env(g));
    assert.deepEqual(res, { status: 'ran', results: ['recorded', 'recorded', 'recorded'] });
    assert.equal(g.seen.length, 9, 'draft, check and safety per speech'); for (const c of g.seen) assert.deepEqual(c.options, { gateway: { id: 'harimu-test' } });
    const drafts = g.seen.filter(s => s.input.response_format?.json_schema?.required?.includes('response'));
    assert.match(drafts[0].input.messages[1].content, /platformCards/); assert.match(drafts[0].input.messages[1].content, /Ines Varro/); assert.match(drafts[0].input.messages[0].content, /never ask anyone how to vote/);
    assert.ok((await speeches()).every(s => s.ai === true && s.text === reply));
    const reservations = (await r.db.prepare("SELECT status FROM harimu_ai_reservations WHERE request_id LIKE 'rally:%'").all()).results; assert.equal(reservations.length, 3); assert.ok(reservations.every(x => x.status === 'finished'));
    assert.deepEqual((await ai.runRallySpeechCron(r.db, now, env(g))).results, ['skipped', 'skipped', 'skipped']); await Promise.all([ai.runRallySpeechCron(r.db, now, env(g)), ai.runRallySpeechCron(r.db, now, env(g))]);
    assert.equal(g.seen.length, 9, 'never re-called'); assert.equal(await count('rally_speeches'), 3);
    const first = (await r.call('rallies', 'alice')).data.rallies[0];
    await rallies.runRallyCron(r.db, first.startsAt + 60);
    assert.equal((await r.db.prepare('SELECT speech FROM rally_clips WHERE rally_id=?').bind(first.id).first()).speech, reply, 'the published clip uses the model speech');
  });

  test(`#876 ${backend}: templates-only or a muted kindle-rally persona falls back to the template with no model call or reservation`, async t => {
    const { r, ai, now, speeches, count } = await setup(t, backend);
    const template = await speeches(), g = gateway();
    for (const [extra, status] of [[{ HARIMU_AI_TEMPLATES_ONLY: 'kindle' }, 'templates-only'], [{ HARIMU_AI_TEMPLATES_ONLY: 'all' }, 'templates-only'], [{ HARIMU_AI_MUTED_PERSONAS: 'kindle-rally' }, 'persona-muted'], [{ HARIMU_AI_MUTED_PERSONAS: 'all' }, 'persona-muted']])
      assert.equal((await ai.runRallySpeechCron(r.db, now, env(g, extra))).status, status, JSON.stringify(extra));
    assert.equal((await ai.runRallySpeechCron(r.db, now, env(g, { HARIMU_AI_TEMPLATES_ONLY: 'korund' }))).status, 'ran', 'another nation in templates-only does not stop Kindle');
    assert.equal(g.seen.length, 9);
    await r.db.prepare('DELETE FROM rally_speeches').run();
    assert.deepEqual(await speeches(), template, 'no stored speech: the template is shown');
    assert.equal(await count('rally_speeches'), 0);
  });

  test(`#876 ${backend}: a gateway failure, an unsafe or unsupported draft, or an exhausted budget leaves the template speech`, async t => {
    const { r, ai, now, speeches, count } = await setup(t, backend);
    const template = await speeches();
    const down = { seen: [], async run() { this.seen.push(1); throw new Error('gateway down'); } };
    assert.deepEqual((await ai.runRallySpeechCron(r.db, now, env(down))).results, ['failed', 'failed', 'failed']);
    assert.deepEqual((await ai.runRallySpeechCron(r.db, now, env(down))).results, ['skipped', 'skipped', 'skipped'], 'one attempt per rally per UTC day');
    const later = now + 86400;
    const unsafe = { seen: [], async run(model, input) { this.seen.push(model); if (model.includes('guard')) return { response: 'unsafe' }; return gateway().run.call({ seen: [] }, model, input); } };
    assert.deepEqual((await ai.runRallySpeechCron(r.db, later, env(unsafe))).results.filter(x => x === 'recorded'), [], 'an unsafe speech is never stored');
    const unsupported = { seen: [], async run(model, input) { this.seen.push(model); if (model.includes('guard')) return { response: 'safe' }; const req = input.response_format?.json_schema?.required ?? []; return { response: req.includes('supported') ? JSON.stringify({ supported: false }) : JSON.stringify({ response: reply }) }; } };
    assert.ok((await ai.runRallySpeechCron(r.db, later + 86400, env(unsupported))).results.every(x => x !== 'recorded'), 'a speech outside the platform is refused');
    assert.deepEqual((await ai.runRallySpeechCron(r.db, later + 2 * 86400, env(gateway(), { HARIMU_AI_DAILY_BUDGET_MICRO: '1' }))).results, ['budget-unavailable']);
    assert.equal(await count('rally_speeches'), 0); assert.deepEqual(await speeches(), template);
  });
}

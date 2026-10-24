/** #883: second LLM provider failover. Stubs only — no paid vendor and no network. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { localRuntime } from './helpers/local-runtime.mjs';
import { runAiWithFailover, secondaryMayRun, unavailableSecondary, SecondaryUnavailable } from '../lib/ai-failover.ts';
import { aiNewsSequenceReservation } from '../lib/ai-budget.ts';

const secret = 'sk-test-not-a-real-key-883';
const gateway = { gateway: { id: 'harimu-preview' } };
const input = { messages: [{ role: 'user', content: 'public ledger' }], max_tokens: 256, temperature: 0, stream: false };
const on = { HARIMU_AI_SECONDARY_PROVIDER_ENABLED: 'true', HARIMU_AI_SECONDARY_PROVIDER_SECRET: secret };
const draft = { title: 'National ledger record', summary: 'The public ledger records registered citizens, completed paid shifts and food.', claims: ['citizens', 'completedShifts', 'food'] };

function spySecondary() {
  const calls = [];
  return { id: 'stub', calls, async complete(body) { calls.push(body); return { response: 'from-stub' }; } };
}
async function noFetch(t, run) {
  const calls = [];
  const orig = globalThis.fetch;
  globalThis.fetch = async (...args) => { calls.push(args); throw Error('network'); };
  t.after(() => { globalThis.fetch = orig; });
  const warnings = [];
  t.mock.method(console, 'warn', (...args) => { warnings.push(args.map(String).join(' ')); });
  await run(warnings);
  assert.equal(calls.length, 0, 'no network');
  assert.equal(warnings.join('\n').includes(secret), false, 'secret must not be logged');
}

test('#883 flag off or secret missing never calls the secondary provider', async t => {
  const blocked = [undefined, null, {}, { HARIMU_AI_SECONDARY_PROVIDER_ENABLED: 'false', HARIMU_AI_SECONDARY_PROVIDER_SECRET: secret }, { HARIMU_AI_SECONDARY_PROVIDER_ENABLED: 'TRUE', HARIMU_AI_SECONDARY_PROVIDER_SECRET: secret }, { HARIMU_AI_SECONDARY_PROVIDER_ENABLED: '1', HARIMU_AI_SECONDARY_PROVIDER_SECRET: secret }, { HARIMU_AI_SECONDARY_PROVIDER_ENABLED: 'true' }, { HARIMU_AI_SECONDARY_PROVIDER_ENABLED: 'true', HARIMU_AI_SECONDARY_PROVIDER_SECRET: '' }, { HARIMU_AI_SECONDARY_PROVIDER_ENABLED: 'true', HARIMU_AI_SECONDARY_PROVIDER_SECRET: '   ' }, { HARIMU_AI_SECONDARY_PROVIDER_SECRET: secret }];
  assert.equal(secondaryMayRun(on), true);
  for (const env of blocked) assert.equal(secondaryMayRun(env), false, JSON.stringify(env));
  await noFetch(t, async () => {
    for (const env of blocked) {
      const secondary = spySecondary();
      const primary = Object.assign(Error('primary down'), { code: '5016' });
      await assert.rejects(runAiWithFailover({ runPrimary() { throw primary; }, model: '@cf/meta/llama-3.2-3b-instruct', input, gateway, env, secondary }), e => e === primary);
      assert.equal(secondary.calls.length, 0, JSON.stringify(env));
    }
  });
});

test('#883 flag on and secret set: primary wins, otherwise the stub answers, and a timeout does not fail over', async t => {
  await noFetch(t, async warnings => {
    const idle = spySecondary();
    const seen = [];
    const ok = await runAiWithFailover({
      runPrimary(model, body, options) { seen.push({ model, body, options }); return { response: 'safe' }; },
      model: '@cf/meta/llama-3.2-3b-instruct', input, gateway, env: on, secondary: idle,
    });
    assert.equal(ok.response, 'safe'); assert.equal(idle.calls.length, 0);
    assert.deepEqual(seen[0].options, gateway); assert.equal(seen[0].model, '@cf/meta/llama-3.2-3b-instruct');
    const secondary = spySecondary();
    const order = [];
    const leaked = { ...input, HARIMU_AI_SECONDARY_PROVIDER_SECRET: secret };
    const answered = await runAiWithFailover({
      runPrimary() { order.push('primary'); throw Error('primary down'); },
      model: 'm', input: leaked, gateway, env: on, secondary, timeoutMs: 1000,
    });
    assert.equal(answered.response, 'from-stub'); assert.deepEqual(order, ['primary']); assert.equal(secondary.calls.length, 1);
    assert.equal(JSON.stringify(secondary.calls).includes(secret), false);
    assert.deepEqual(Object.keys(secondary.calls[0]).sort(), ['max_tokens', 'messages', 'stream', 'temperature']);
    const late = spySecondary();
    await assert.rejects(runAiWithFailover({
      runPrimary() { return new Promise(() => {}); },
      model: 'm', input, gateway, env: on, secondary: late, timeoutMs: 20,
    }), /Inference timed out/);
    assert.equal(late.calls.length, 0, 'a timeout must not start the secondary provider');
    await assert.rejects(runAiWithFailover({ runPrimary() { throw Error('primary down'); }, model: 'm', input, gateway, env: on }), /primary down/);
    assert.match(warnings.join('\n'), /secondary unavailable failed closed/);
    assert.throws(() => unavailableSecondary().complete(input), err => err instanceof SecondaryUnavailable && err.code === 'secondary-unavailable');
  });
});

test('#883 prepareAiNews uses the hook: missing secret stays on Workers AI; a stub can answer; the shipped provider does not publish or fetch', async t => {
  const now = Date.UTC(2026, 9, 15, 12, 0, 0) / 1000;
  const budget = { dailyBudgetMicro: 970000, gatewayId: 'harimu-test' };
  const news = { nationId: 'kindle', title: 'Kindle Press', style: 'press', fetchedAt: now * 1000, statistics: { citizens: 2, completedShifts: 3, food: 12 }, items: [] };
  const replies = [JSON.stringify(draft), JSON.stringify({ supported: true }), 'safe'];
  const run = async (failover, secondary, dailyBudgetMicro = budget.dailyBudgetMicro) => {
    const r = await localRuntime(); t.after(() => r.close());
    const primary = { calls: [], async run(_model, _input, options) { this.calls.push(options); throw Error('primary down'); } };
    const { prepareAiNews, readAiNews } = await r.importModule('lib/ai-news.ts');
    await prepareAiNews(r.db, news, now, primary, { enabled: true, budget: { ...budget, dailyBudgetMicro }, failover, secondary });
    const rows = (await r.db.prepare('SELECT reserved_micro, status FROM harimu_ai_reservations ORDER BY request_id').all()).results.map(row => ({ reserved_micro: row.reserved_micro, status: row.status }));
    return { primary, items: await readAiNews(r.db, 'kindle'), rows };
  };
  const answering = () => { const stub = spySecondary(); stub.complete = async function (body) { this.calls.push(body); return { response: replies[this.calls.length - 1] }; }; return stub; };
  await noFetch(t, async () => {
    const offStub = spySecondary();
    const off = await run({ HARIMU_AI_SECONDARY_PROVIDER_ENABLED: 'false', HARIMU_AI_SECONDARY_PROVIDER_SECRET: secret }, offStub);
    assert.equal(off.primary.calls.length, 1); assert.equal(offStub.calls.length, 0); assert.equal(off.items.length, 0); assert.deepEqual(off.primary.calls[0], { gateway: { id: 'harimu-test' } });
    const missingStub = spySecondary();
    const missing = await run({ HARIMU_AI_SECONDARY_PROVIDER_ENABLED: 'true' }, missingStub);
    assert.equal(missing.primary.calls.length, 1); assert.equal(missingStub.calls.length, 0); assert.equal(missing.items.length, 0);
    const stub = answering();
    const failedOver = await run(on, stub);
    assert.equal(failedOver.primary.calls.length, 3); assert.equal(stub.calls.length, 3); assert.equal(failedOver.items.length, 1); assert.equal(failedOver.items[0].source, 'model');
    assert.equal(JSON.stringify(stub.calls).includes(secret), false);
    // QA3: a second reserveAiSequence on the failover path would leave two ledger rows. One finished sequence charge only.
    assert.deepEqual(failedOver.rows, [{ reserved_micro: aiNewsSequenceReservation, status: 'finished' }]);
    const tight = await run(on, answering(), aiNewsSequenceReservation); // fits one sequence, not two
    assert.equal(tight.items.length, 1); assert.equal(tight.primary.calls.length, 3);
    assert.deepEqual(tight.rows, [{ reserved_micro: aiNewsSequenceReservation, status: 'finished' }]);
    const closed = await run(on, undefined);
    assert.equal(closed.primary.calls.length, 1); assert.equal(closed.items.length, 0);
  });
});

test('#883 the flag is preview-on and production-off, and no secret is configured in wrangler', () => {
  const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(preview.vars.HARIMU_AI_SECONDARY_PROVIDER_ENABLED, 'true');
  assert.equal(prod.vars.HARIMU_AI_SECONDARY_PROVIDER_ENABLED, 'false');
  assert.equal(preview.vars.HARIMU_AI_SECONDARY_PROVIDER_SECRET, undefined);
  assert.equal(prod.vars.HARIMU_AI_SECONDARY_PROVIDER_SECRET, undefined);
  for (const file of ['lib/ai-news.ts', 'lib/notables.ts', 'lib/cabinet-response-ai.ts', 'lib/town-hall-ai.ts']) {
    const source = readFileSync(file, 'utf8');
    assert.match(source, /runAiWithFailover\(/); assert.match(source, /aiGatewayOptions\(/);
  }
  assert.match(readFileSync('lib/debate-ai.ts', 'utf8'), /failover: bindings/);
  assert.match(readFileSync('lib/rally-speech-ai.ts', 'utf8'), /failover: b/);
  const moduleSource = readFileSync('lib/ai-failover.ts', 'utf8');
  assert.doesNotMatch(moduleSource, /fetch\(|https?:\/\//);
});

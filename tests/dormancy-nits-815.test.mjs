/** #815 QA1 nits: dormantAt uses DORMANCY_DAYS.dormant; with no counted citizens the food/work copy says "No active citizens" instead of a neutral 50%. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { localRuntime } from './helpers/local-runtime.mjs';
const { stab, DORMANCY_DAYS, dormantAt } = await (async () => { const r = await localRuntime(); try { return { stab: await r.importModule('lib/stability.ts'), ...(await r.importModule('lib/dormancy-rules.ts')) }; } finally { await r.close(); } })();

test('dormantAt is DORMANCY_DAYS.dormant days before the tick, with no hard-coded 30', () => {
  const at = 1_800_000_000;
  assert.equal(dormantAt(at), new Date((at - DORMANCY_DAYS.dormant * 86400) * 1000).toISOString());
  assert.doesNotMatch(readFileSync('lib/dormancy-rules.ts', 'utf8') + readFileSync('lib/stability.ts', 'utf8'), /30\s*\*\s*(86400|DAY)/);
});

test('every citizen Dormant on the live dormancy path (activeOnly): food and work copy say "No active citizens", points stay neutral', () => {
  const zero = stab.computeStability({ citizens: 0, fed: 0, worked: 0, activeOnly: 1 });
  const detail = (s, input) => s.breakdown.stability.find(t => t.input === input).detail;
  assert.equal(detail(zero, 'food'), 'No active citizens: neutral score'); assert.equal(detail(zero, 'work'), 'No active citizens: neutral score');
  assert.equal(zero.breakdown.stability.find(t => t.input === 'food').points, 0, 'neutral');
  const one = stab.computeStability({ citizens: 1, fed: 1, worked: 0, activeOnly: 1 });
  assert.equal(detail(one, 'food'), '100% of citizens ate in the last 24 real hours'); assert.equal(detail(one, 'work'), '0% worked a shift in the last 24 real hours');
});

test('#822 (QA1): flag off, a nation with zero citizens keeps the exact previous breakdown (byte-identical to dev)', () => {
  const off = stab.computeStability({ citizens: 0, fed: 0, worked: 0, promisesKept: 0, promisesBroken: 0, petitionBacklog: 0 });
  assert.equal(JSON.stringify(off), JSON.stringify({ stability: 50, unrest: 38, breakdown: {
    stability: [{ input: 'baseline', points: 50, detail: 'Baseline' }, { input: 'food', points: 0, detail: '50% of citizens ate in the last 24 real hours' }, { input: 'work', points: 0, detail: '50% worked a shift in the last 24 real hours' }, { input: 'promises', points: 0, detail: 'No petition reviews in the last 7 real days' }, { input: 'petitions', points: 0, detail: '0 petitions awaiting review (0 per 100 citizens)' }],
    unrest: [{ input: 'baseline', points: 10, detail: 'Baseline' }, { input: 'food', points: 20, detail: '50% of citizens ate in the last 24 real hours' }, { input: 'work', points: 8, detail: '50% worked a shift in the last 24 real hours' }, { input: 'promises', points: 0, detail: 'No petition reviews in the last 7 real days' }, { input: 'petitions', points: 0, detail: '0 petitions awaiting review (0 per 100 citizens)' }] } }));
});

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

test('every citizen Dormant (0 counted): food and work copy say "No active citizens", points stay neutral; 1 citizen keeps the % copy', () => {
  const zero = stab.computeStability({ citizens: 0, fed: 0, worked: 0 });
  const detail = (s, input) => s.breakdown.stability.find(t => t.input === input).detail;
  assert.equal(detail(zero, 'food'), 'No active citizens: neutral score'); assert.equal(detail(zero, 'work'), 'No active citizens: neutral score');
  assert.equal(zero.breakdown.stability.find(t => t.input === 'food').points, 0, 'neutral');
  assert.doesNotMatch(JSON.stringify(zero.breakdown), /50% /);
  const one = stab.computeStability({ citizens: 1, fed: 1, worked: 0 });
  assert.equal(detail(one, 'food'), '100% of citizens ate in the last 24 real hours'); assert.equal(detail(one, 'work'), '0% worked a shift in the last 24 real hours');
});

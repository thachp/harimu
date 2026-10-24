/** #918: the Kindle presidential vote opens and closes on the cycle calendar (lib/election-calendars presidentialWindow: day 30 + k*120, 72 h).
 *  Fail closed: HARIMU_KINDLE_CYCLE_START_AT unset or malformed, before day 30 or between windows, the vote is held and never opens on its own.
 *  Covers both write paths that open it (election POST, citizen POST presence). SQLite + PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { localRuntime } from './helpers/local-runtime.mjs';
import { presidentialWindow } from '../lib/election-calendars.ts';

const DAY = 86400, H = 3600, start = 1_792_368_000, at = (d, h = 0) => start + d * DAY + h * H;
const win = raw => now => presidentialWindow({ HARIMU_KINDLE_CYCLE_START_AT: raw }, now);

test('#918 pure: the window is day 30 + k*120 for 72 hours, and held otherwise', () => {
  const w = win(String(start));
  assert.equal(w(at(29, 23)), null, 'before day 30'); assert.equal(w(start), null);
  assert.deepEqual(w(at(30)), { cycle: 0, opensAt: at(30), closesAt: at(33) });
  assert.deepEqual(w(at(33) - 1), { cycle: 0, opensAt: at(30), closesAt: at(33) }, 'last second open');
  assert.equal(w(at(33)), null, 'closes after exactly 72 hours'); assert.equal(w(at(100)), null, 'between windows');
  assert.deepEqual(w(at(150, 5)), { cycle: 1, opensAt: at(150), closesAt: at(153) }); assert.equal(w(at(149, 23)), null);
  for (const raw of [undefined, '', 'soon', '0', '-1', '1.5', ' 1792368000', '1234567890123']) assert.equal(win(raw)(at(30, 1)), null, String(raw));
  assert.equal(w(1.5), null, 'a bad clock is held');
  assert.equal(w(at(-90, 1)), null, 'no window before the calendar starts (cycle -1 would be day -90)');
  for (let t = 0; t <= 400 * DAY; t += 6 * H) for (const raw of [undefined, 'soon']) assert.equal(win(raw)(t), null, `held at ${t} (${raw})`);
  for (let t = at(-200); t <= at(400); t += 6 * H) assert.equal(win(undefined)(t), null);
});

for (const backend of ['sqlite', 'postgres']) {
  async function setup(t, raw) {
    const r = await localRuntime({ backend, accountElection: true }); t.after(() => r.close());
    const now = Math.floor(r.now / 1000);
    r.setFixtureEnv('HARIMU_KINDLE_CYCLE_START_AT', typeof raw === 'function' ? raw(now) : raw);
    const rows = async () => (await r.db.prepare('SELECT opens_at, closes_at FROM poc_elections').all()).results.map(x => ({ opensAt: Number(x.opens_at), closesAt: Number(x.closes_at) }));
    const vote = async () => { const id = (await r.call('election', 'alice')).data.id; return r.call('election', 'alice', { action: 'vote', electionId: id, requestId: randomUUID(), ranking: ['ines-varro', 'tobin-achterberg', 'mara-quell'] }); };
    return { r, now, rows, vote };
  }
  test(`#918 ${backend}: unset, malformed, before day 30 or between windows, neither write path opens the vote`, async t => {
    for (const raw of [undefined, 'not-a-date', '0', now => String(now - 10 * DAY), now => String(now - 40 * DAY)]) {
      const c = await setup(t, raw), label = typeof raw === 'function' ? raw.toString() : String(raw);
      assert.notEqual((await c.vote()).status, 200, label);
      assert.equal((await c.r.call('citizen', 'alice', { action: 'save-plan', horizon: 'today', note: 'x', completedIds: [] })).status, 200, label);
      assert.deepEqual(await c.rows(), [], `no election row (${label})`);
      const view = (await c.r.call('election', 'alice')).data; assert.notEqual(view.status, 'open', label); assert.equal(view.opensAt, null, label);
    }
  });
  test(`#918 ${backend}: inside the window the vote opens at the calendar open (not the request time) and closes 72 hours later`, async t => {
    const c = await setup(t, now => String(now - 30 * DAY - 5 * H)); // 5 hours into the day-30 window
    const v = await c.vote(); assert.equal(v.status, 200, JSON.stringify(v.data));
    assert.deepEqual(await c.rows(), [{ opensAt: c.now - 5 * H, closesAt: c.now + 67 * H }]);
    assert.equal(v.data.closesAt, c.now + 67 * H);
  });
  test(`#918 ${backend}: the citizen write path opens it inside the window too`, async t => {
    const c = await setup(t, now => String(now - 30 * DAY - H));
    assert.equal((await c.r.call('citizen', 'alice', { action: 'save-plan', horizon: 'today', note: 'x', completedIds: [] })).status, 200);
    assert.deepEqual(await c.rows(), [{ opensAt: c.now - H, closesAt: c.now + 71 * H }]);
  });
}

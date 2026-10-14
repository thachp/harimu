import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';
import { presidiumSeats, presidiumConfig, resolveSession, reformWeight, seedJitter, sessionReady, unrestSustainedSeconds } from '../lib/korund-presidium-rules.ts';
import { postgresMigrations, isDestructive, transactionProblem } from '../scripts/postgres-migrations.mjs';

const backend = process.env.HARIMU_TEST_STORAGE === 'postgres' ? 'postgres' : 'd1';
const H = 3600, D = 86400;

test('#70 rules: 7 days of Unrest ≥ 65; deterministic seeded outcomes; 3–5 named seats', () => {
  assert.ok(presidiumSeats.length >= 3 && presidiumSeats.length <= 5); assert.equal(presidiumSeats[0].name, 'Neral Voss');
  assert.equal(sessionReady(7 * D), true); assert.equal(sessionReady(7 * D - 1), false);
  const now = 10_000_000; const scores = u => u.map((unrest, i) => ({ scheduledAt: now - i * 2 * H, unrest }));
  assert.equal(unrestSustainedSeconds(scores([70, 65, 64, 90]), now), 2 * H); assert.equal(unrestSustainedSeconds(scores([64]), now), 0);
  assert.equal(seedJitter('presidium:1'), seedJitter('presidium:1'), 'same seed, same jitter');
  const hot = resolveSession({ unrest: 92, quotaPct: 20, sustainedDays: 9, seed: 'presidium:1', purged: [] });
  assert.deepEqual([hot.outcome, hot.successor, hot.purgedSeat], ['purged', 'morrow', 'kestrel']);
  assert.deepEqual(resolveSession({ unrest: 92, quotaPct: 20, sustainedDays: 9, seed: 'presidium:1', purged: [] }), hot, 'deterministic');
  const mild = resolveSession({ unrest: 66, quotaPct: 100, sustainedDays: 7, seed: 'presidium:1', purged: [] });
  assert.equal(mild.outcome, 'survived'); assert.match(mild.reasoning, /conceded/);
  assert.ok(reformWeight({ unrest: 80, quotaPct: 40, sustainedDays: 7 }) > reformWeight({ unrest: 80, quotaPct: 90, sustainedDays: 7 }), 'missed quota adds reform weight');
  const second = resolveSession({ unrest: 95, quotaPct: 0, sustainedDays: 10, seed: 'x', purged: ['voss', 'kestrel', 'morrow'] }); // morrow now sits as Chairman
  assert.deepEqual([second.successor, second.purgedSeat], ['holt', 'brand']);
  assert.equal(resolveSession({ unrest: 99, quotaPct: 0, sustainedDays: 30, seed: 'y', purged: ['voss', 'kestrel', 'morrow', 'brand', 'holt'] }).outcome, 'survived', 'no eligible successor');
});

async function setup(t, flag = true) {
  const r = await localRuntime(); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_KORUND_PRESIDIUM_ENABLED', flag ? 'true' : undefined);
  await r.call('citizen', 'alice'); await r.call('citizen', 'bob');
  await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='alice'").run();
  await r.db.prepare("UPDATE citizens SET nation_id='aurelle' WHERE clerk_user_id='bob'").run();
  const unrest = async (from, to, value, nation = 'korund') => {
    const rows = []; for (let s = from; s <= to; s += 2 * H) rows.push(r.db.prepare("INSERT OR REPLACE INTO nation_stability_scores (nation_id,tick,scheduled_at,computed_at,stability,unrest,inputs_json,breakdown_json) VALUES (?,?,?,?,40,?,'{}','{}')").bind(nation, 100000 + Math.floor(s / (2 * H)), s, s, value));
    for (let i = 0; i < rows.length; i += 50) await r.db.batch(rows.slice(i, i + 50));
  };
  const sessions = async () => (await r.db.prepare('SELECT * FROM korund_presidium_sessions ORDER BY opened_at').all()).results;
  return { r, unrest, sessions, now: () => Math.floor(r.now / 1000) };
}

test(`#70 ${backend}: 7 days of Unrest ≥ 65 opens exactly one session; resolves once; a purge renames the leader, address and news`, async t => {
  const { r, unrest, sessions, now } = await setup(t);
  const n = now();
  await unrest(n - 7 * D + 2 * H, n, 92);
  await r.call('world', null); assert.equal((await sessions()).length, 0, 'just under 7 days opens none');
  await unrest(n - 7 * D, n - 7 * D, 92);
  await r.call('world', null); await r.call('world', null); await r.call('citizen', 'alice', { action: 'noop' }).catch(() => {});
  assert.equal((await sessions()).length, 1, 'exactly one session');
  const s = (await sessions())[0];
  const rumor = (await r.call('news', 'alice')).data.items.find(i => i.id.endsWith(':open'));
  assert.match(rumor.title, /Rumors from Stonehearth/); assert.equal(rumor.source, 'deterministic', 'shown with the AI text tag, not as a system record');
  assert.ok(!JSON.stringify((await r.call('news', 'alice')).data).match(/vote|reform weight/i), 'citizens see rumor copy, not the vote or the decision record');
  r.setNow((Number(s.resolves_at) - 60) * 1000); await r.call('world', null);
  assert.equal((await sessions())[0].resolved_at, null, 'open until the 24h confirmation');
  r.setNow((Number(s.resolves_at) + 1) * 1000); await unrest(Number(s.resolves_at) - 2 * H, Number(s.resolves_at), 92);
  await r.call('world', null); await r.call('world', null);
  const done = (await sessions())[0];
  assert.deepEqual([done.outcome, done.successor, done.purged_seat], ['purged', 'morrow', 'kestrel']);
  const record = JSON.parse(done.decision_json); assert.equal(record.kind, 'ai-decision-record'); assert.match(record.reasoning, /Charter Limits/);
  const gov = await r.readGovernment('korund', 'alice');
  assert.equal(gov.presidium.chairman.name, 'Ilsa Morrow');
  assert.deepEqual(gov.presidium.seats.map(x => [x.name, x.status]), [['Ilsa Morrow', 'serving'], ['Neral Voss', 'purged'], ['Vera Holt', 'serving'], ['Dagan Kestrel', 'purged'], ['Oren Brand', 'serving']]);
  const address = (await r.call('addresses', 'alice', undefined, 'https://fixture.invalid', '')).data;
  assert.equal(address.addresses[0].leaderName, 'Ilsa Morrow', 'weekly address names the successor');
  const news = (await r.call('news', 'alice')).data.items;
  assert.ok(news.some(i => /Comrade Ilsa Morrow confirmed as Chairman/.test(i.title)), 'news feed names the successor');
  const aurelle = await r.readGovernment('aurelle', 'bob'); assert.equal(aurelle.presidium, undefined, 'Aurelle untouched');
});

test(`#70 ${backend}: mild Unrest survives with a concession; flag off opens nothing; Kindle/Aurelle unrest never triggers`, async t => {
  const { r, unrest, sessions, now } = await setup(t);
  const n = now();
  await unrest(n - 7 * D, n, 66);
  await r.call('world', null);
  const [s] = await sessions(); assert.ok(s);
  r.setNow((Number(s.resolves_at) + 1) * 1000);
  await r.call('world', null);
  assert.equal((await sessions())[0].outcome, 'survived');
  assert.equal((await r.readGovernment('korund', 'alice')).presidium.chairman.name, 'Neral Voss');
  assert.ok((await r.call('news', 'alice')).data.items.some(i => /thanks the Presidium/.test(i.title)));
  await r.call('world', null); assert.equal((await sessions()).length, 1, 'cool-down');

  const off = await setup(t, false); const m = off.now();
  await off.unrest(m - 8 * D, m, 99); await off.r.call('world', null);
  assert.equal((await off.sessions()).length, 0, 'flag off');
  const other = await setup(t); const k = other.now();
  await other.unrest(k - 8 * D, k, 99, 'aurelle'); await other.unrest(k - 8 * D, k, 99, 'kindle'); await other.r.call('world', null);
  assert.equal((await other.sessions()).length, 0, 'only Korund Unrest counts');
});

test('#70 migration 0024 is additive, matches runtime schema, passes the guard', async () => {
  const { presidiumSchemas } = await import('../lib/korund-presidium.ts').catch(() => ({}));
  const d1 = await readFile('drizzle/0024_korund_presidium.sql', 'utf8'); const pg = await readFile('db/postgres/0024_korund_presidium.sql', 'utf8');
  if (presidiumSchemas) for (const s of presidiumSchemas) assert.ok(d1.includes(s.replace(/\s*\n\s*/g, ' ').trim()));
  const m = postgresMigrations().find(x => x.file === '0024_korund_presidium.sql'); assert.ok(m); assert.deepEqual([...m.tables], ['korund_presidium_sessions']);
  assert.ok(!isDestructive(pg) && !isDestructive(d1)); assert.equal(transactionProblem(pg), null);
  assert.equal(presidiumConfig.unrestThreshold, 65); assert.equal(presidiumConfig.unrestSustainSeconds, 7 * D); assert.equal(presidiumConfig.confirmSeconds, 24 * H);
});

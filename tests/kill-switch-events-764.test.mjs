/** #764 slice 2: kill-switch change log. Flag off does not read or write. Flag on appends who/persona/on-off/time/reason and the admin GET lists them. No account id. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';
import { personaMuted } from '../lib/kill-switch-copy.ts';

const budget = { dailyBudgetMicro: 970000, gatewayId: 'harimu-test' };
const counting = () => ({ calls: [], async run() { this.calls.push(1); throw new Error('model must not be called'); } });
const on = (mute, templates = '') => ({ HARIMU_KILL_SWITCH_EVENTS_ENABLED: 'true', HARIMU_AI_MUTED_PERSONAS: mute, HARIMU_AI_TEMPLATES_ONLY: templates });
const shape = rows => rows.map(row => [row.actor, row.reason, row.persona, row.state, row.createdAt]);

for (const backend of ['sqlite', 'postgres']) {
  test(`#764 ${backend}: flag off writes nothing; a change appends on, a repeat does not, and off is its own row`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    const w = await r.importModule('lib/kill-switch-events.ts');
    const now = 1_900_000_000;
    const prepare = r.db.prepare.bind(r.db), seen = []; r.db.prepare = sql => { seen.push(sql); return prepare(sql); };
    assert.equal(await w.recordKillSwitchChanges(r.db, { HARIMU_AI_MUTED_PERSONAS: 'all', HARIMU_KILL_SWITCH_EVENTS_ENABLED: 'false' }, now), 0);
    assert.equal(seen.filter(sql => /ai_kill_switch_events/.test(sql)).length, 0, 'flag off: no events read or write');
    r.db.prepare = prepare;
    assert.equal(await w.recordKillSwitchChanges(r.db, on(''), now), 0, 'off from an empty log is not a change');
    assert.equal(await w.recordKillSwitchChanges(r.db, on('kindle-journalist'), now), 1);
    assert.equal(await w.recordKillSwitchChanges(r.db, on('kindle-journalist'), now + 1), 0, 'the same switch is not logged twice');
    assert.equal(await w.recordKillSwitchChanges(r.db, on('kindle-journalist,kindle-cabinet'), now + 2), 1);
    assert.equal(await w.recordKillSwitchChanges(r.db, on('all'), now + 3), 3);
    assert.equal(await w.recordKillSwitchChanges(r.db, on('', 'kindle'), now + 4), 2);
    const rows = await w.listKillSwitchEvents(r.db);
    assert.deepEqual(shape(rows.filter(row => row.createdAt === now + 4)).sort(), [['operator', 'persona-mute', 'all', 'off', now + 4], ['operator', 'templates-only', 'kindle', 'on', now + 4]].sort());
    assert.deepEqual(shape(rows.filter(row => row.createdAt === now + 3)).sort(), [
      ['operator', 'persona-mute', 'all', 'on', now + 3],
      ['operator', 'persona-mute', 'kindle-cabinet', 'off', now + 3],
      ['operator', 'persona-mute', 'kindle-journalist', 'off', now + 3],
    ].sort());
    assert.equal(rows.some(row => /user_|@|clerk/i.test(JSON.stringify(row))), false);
    await assert.rejects(() => w.insertKillSwitchEvent(r.db, { persona: 'user_abc', state: 'on', reason: 'persona-mute', createdAt: now }), /Invalid kill-switch event/);
    await assert.rejects(() => w.insertKillSwitchEvent(r.db, { persona: 'alice@example.com', state: 'on', reason: 'persona-mute', createdAt: now }), /Invalid kill-switch event/);
  });
}

test('flag off on a muted Notable does not touch the events table; flag on records the mute and still returns the persona-muted notice', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const ai = counting(), w = await r.importModule('lib/kill-switch-events.ts');
  const prepare = r.db.prepare.bind(r.db), seen = []; r.db.prepare = sql => { seen.push(sql); return prepare(sql); };
  const command = () => ({ requestId: randomUUID(), notableId: 'kindle-journalist', topic: 'news' });
  const muted = await r.answerNotable('alice', command(), ai, { enabled: true, budget, killSwitch: { HARIMU_AI_MUTED_PERSONAS: 'kindle-journalist' } });
  assert.equal(muted.personaMuted, true); assert.equal(muted.reply, personaMuted.notablesPanel.text);
  assert.equal(seen.filter(sql => /ai_kill_switch_events/.test(sql)).length, 0, 'flag off');
  r.db.prepare = prepare;
  const logged = await r.answerNotable('alice', command(), ai, { enabled: true, budget, killSwitch: on('kindle-journalist') });
  assert.equal(logged.reply, personaMuted.notablesPanel.text); assert.equal(ai.calls.length, 0);
  assert.deepEqual(shape(await w.listKillSwitchEvents(r.db)), [['operator', 'persona-mute', 'kindle-journalist', 'on', Math.floor(r.now / 1000)]]);
});

test('admin route: flag off or a short token is 404, a wrong bearer is 401, the right bearer lists newest first', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  const w = await r.importModule('lib/kill-switch-events.ts'), route = await r.importModule('app/api/admin/kill-switch-events/route.ts');
  const src = readFileSync('app/api/admin/kill-switch-events/route.ts', 'utf8');
  const handler = src.slice(src.indexOf('export async function GET'));
  assert.ok(handler.indexOf('killSwitchEventsEnabled') < handler.indexOf('getDatabase('), '404 is decided before any database access');
  const now = 1_900_000_000;
  await w.recordKillSwitchChanges(r.db, on('kindle-debate'), now);
  await w.recordKillSwitchChanges(r.db, on(''), now + 5);
  const token = 'fixture-admin-token-764';
  const get = auth => route.GET(new Request('https://fixture.invalid/api/admin/kill-switch-events', { headers: auth ? { Authorization: auth } : {} }));
  r.setFixtureEnv('HARIMU_KILL_SWITCH_EVENTS_ENABLED', 'false'); r.setFixtureEnv('HARIMU_ADMIN_TOKEN', token);
  assert.equal((await get(`Bearer ${token}`)).status, 404, 'flag off');
  r.setFixtureEnv('HARIMU_KILL_SWITCH_EVENTS_ENABLED', 'true'); r.setFixtureEnv('HARIMU_ADMIN_TOKEN', 'short');
  assert.equal((await get('Bearer short')).status, 404);
  r.setFixtureEnv('HARIMU_ADMIN_TOKEN', token);
  assert.equal((await get('Bearer wrong-token-wrong-token')).status, 401);
  const ok = await get(`Bearer ${token}`); assert.equal(ok.status, 200);
  assert.deepEqual(shape((await ok.json()).events), [['operator', 'persona-mute', 'kindle-debate', 'off', now + 5], ['operator', 'persona-mute', 'kindle-debate', 'on', now]]);
  assert.equal(ok.headers.get('Cache-Control'), 'private, no-store');
});

test('a muted news desk shows personaMuted on the edition; another desk does not', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_AI_MUTED_PERSONAS', 'kindle-news-desk');
  assert.equal((await r.call('news', 'alice')).data.personaMuted, true);
  r.setFixtureEnv('HARIMU_AI_MUTED_PERSONAS', 'korund-news-desk');
  assert.equal((await r.call('news', 'alice')).data.personaMuted, undefined);
});

test('0103 is additive, is not 0086, and the D1 bootstrap uses the same statements', () => {
  const lib = readFileSync('lib/kill-switch-events.ts', 'utf8');
  const lite = readFileSync('drizzle/0103_ai_kill_switch_events.sql', 'utf8').split('\n').filter(line => !line.startsWith('--')).join('\n').trim();
  for (const statement of lite.split(';').map(part => part.trim()).filter(Boolean)) assert.ok(lib.includes(statement), statement.slice(0, 60));
  for (const file of ['drizzle/0103_ai_kill_switch_events.sql', 'db/postgres/0103_ai_kill_switch_events.sql']) {
    const sql = readFileSync(file, 'utf8');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS ai_kill_switch_events/);
    assert.match(sql, /actor IN \('operator'\)/);
    assert.doesNotMatch(sql, /\b(DROP\s+[A-Z]|RENAME\b|TRUNCATE\b|DELETE\s+FROM\b|UPDATE\b)/i, file);
    assert.doesNotMatch(file, /0086/);
  }
  assert.match(readFileSync('lib/db.ts', 'utf8'), /killSwitchEventSchemas/);
});

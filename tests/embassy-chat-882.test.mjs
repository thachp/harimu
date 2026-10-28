/** #882: embassy chat between two live nations. Flag off = 404 before auth/DB. Pair channel, rate limits, replay, reports, 4 KB cap, same-id 409. SQLite + PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { localRuntime } from './helpers/local-runtime.mjs';

for (const backend of ['sqlite', 'postgres']) {
  async function setup(t, { flag = true } = {}) {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    r.setFixtureEnv('HARIMU_EMBASSY_CHAT_ENABLED', flag ? 'true' : 'false');
    const iso = new Date(r.now).toISOString();
    // alice/bob are kindle from the fixture; add korund + aurelle citizens
    for (const [u, nation] of [['kora', 'korund'], ['aura', 'aurelle']]) {
      await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,?,?,18,0,'Good standing',?,?)").bind(u, nation, u, iso, iso).run();
    }
    const read = (user, peerNation) => r.call('embassy-chat', user, undefined, 'https://fixture.invalid', `?peerNation=${peerNation}`);
    const post = (user, peerNation, text, extra = {}) => r.call('embassy-chat', user, { action: 'post', peerNation, id: randomUUID(), text, ...extra });
    const count = async () => Number((await r.db.prepare('SELECT COUNT(*) AS n FROM embassy_chat_messages').first()).n);
    return { r, read, post, count };
  }

  test(`#882 ${backend}: flag off is a 404 before any sign-in check or DB access`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    r.setFixtureEnv('HARIMU_EMBASSY_CHAT_ENABLED', 'false');
    const probe = [];
    const orig = r.db.prepare.bind(r.db);
    r.db.prepare = (...a) => { probe.push(a[0]); return orig(...a); };
    for (const user of [null, 'alice']) {
      const res = await r.call('embassy-chat', user, undefined, 'https://fixture.invalid', '?peerNation=korund');
      assert.equal(res.status, 404); assert.equal(res.data.reason, 'not_found');
    }
    assert.equal((await r.call('embassy-chat', 'alice', { action: 'post', peerNation: 'korund', id: randomUUID(), text: 'hi' })).status, 404);
    assert.equal(probe.length, 0, 'no DB while flag off');
    for (const value of ['false', 'TRUE', '1', '']) { r.setFixtureEnv('HARIMU_EMBASSY_CHAT_ENABLED', value); assert.equal((await r.call('embassy-chat', 'alice', undefined, 'https://fixture.invalid', '?peerNation=korund')).status, 404, value); }
  });

  test(`#882 ${backend}: channel between two live nations; self/unknown/third-nation refused`, async t => {
    const c = await setup(t);
    assert.equal((await c.r.call('embassy-chat', null, undefined, 'https://fixture.invalid', '?peerNation=korund')).status, 401);
    assert.equal((await c.read('alice', 'kindle')).status, 400, 'own nation');
    assert.equal((await c.read('alice', 'confluence')).status, 400, 'not a live embassy nation');
    const empty = await c.read('alice', 'korund'); assert.equal(empty.status, 200); assert.deepEqual(empty.data.messages, []); assert.equal(empty.data.channelId, 'kindle|korund');
    assert.equal((await c.post('alice', 'korund', 'hello korund')).status, 200);
    c.r.setNow(c.r.now + 11_000);
    assert.equal((await c.post('kora', 'kindle', 'hello kindle')).status, 200);
    const a = await c.read('alice', 'korund'), b = await c.read('kora', 'kindle');
    assert.equal(a.data.messages.length, 2); assert.equal(b.data.messages.length, 2);
    assert.deepEqual(a.data.messages.map(m => [m.body, m.nationId, m.mine]), [['hello korund', 'kindle', true], ['hello kindle', 'korund', false]]);
    // aurelle reading kindle peers into aurelle|kindle, not kindle|korund
    assert.equal((await c.read('aura', 'kindle')).data.messages.length, 0);
    c.r.setNow(c.r.now + 11_000);
    assert.equal((await c.post('alice', 'aurelle', 'other pair')).status, 200);
    assert.equal((await c.read('alice', 'korund')).data.messages.length, 2, 'other pair is a different channel');
  });

  test(`#882 ${backend}: validation, gap, hourly cap, idempotent replay, cross-user id 409, 4 KB body cap, delete`, async t => {
    const c = await setup(t);
    assert.equal((await c.post('alice', 'korund', '')).status, 400);
    assert.equal((await c.post('alice', 'korund', 'x'.repeat(281))).status, 400);
    assert.equal((await c.r.call('embassy-chat', 'alice', { action: 'post', peerNation: 'korund', id: randomUUID(), text: 'hi' }, 'https://evil.invalid')).status, 403);
    const fat = await c.r.call('embassy-chat', 'alice', { action: 'post', peerNation: 'korund', id: randomUUID(), text: 'hi' }, 'https://fixture.invalid', '', { 'Content-Length': '5000' });
    assert.equal(fat.status, 413, '4 KB cap'); assert.equal(fat.data.error, 'Request too large.');
    const id = randomUUID();
    assert.equal((await c.post('alice', 'korund', 'one', { id })).status, 200);
    assert.equal((await c.post('alice', 'korund', 'one', { id })).status, 200, 'idempotent');
    assert.equal((await c.post('alice', 'korund', 'other', { id })).status, 409);
    assert.equal((await c.post('kora', 'kindle', 'one', { id })).status, 409, 'cross-user prior 409');
    c.r.setNow(c.r.now + 11_000);
    const raceId = randomUUID();
    const [ra, rb] = await Promise.all([
      c.post('alice', 'korund', 'race-a', { id: raceId }),
      c.post('kora', 'kindle', 'race-b', { id: raceId }),
    ]);
    assert.deepEqual([ra.status, rb.status].sort(), [200, 409], `race ${ra.status},${rb.status}`);
    assert.equal(await c.count(), 2, 'prior one + race winner');
    assert.equal((await c.post('alice', 'korund', 'too-soon')).status, 429);
    c.r.setNow(c.r.now + 11_000);
    const gone = randomUUID();
    assert.equal((await c.post('alice', 'korund', 'bye', { id: gone })).status, 200);
    assert.equal((await c.r.call('embassy-chat', 'kora', { action: 'delete', peerNation: 'kindle', id: gone })).status, 404, "not kora's");
    assert.equal((await c.r.call('embassy-chat', 'alice', { action: 'delete', peerNation: 'korund', id: gone })).status, 200);
    assert.equal((await c.read('kora', 'kindle')).data.messages.filter(m => m.id === gone).length, 0);
  });

  test(`#882 ${backend}: peer-nation citizen can report a live embassy message; author and outsiders cannot`, async t => {
    const c = await setup(t);
    c.r.setFixtureEnv('HARIMU_REPORTS_ENABLED', 'true');
    const id = randomUUID();
    assert.equal((await c.post('alice', 'korund', 'report-me', { id })).status, 200);
    const ok = await c.r.call('reports', 'kora', { requestId: randomUUID(), targetKind: 'citizen-message', targetId: id, reasonId: 'hate-harassment' });
    assert.equal(ok.status, 201, JSON.stringify(ok.data));
    assert.equal((await c.r.call('reports', 'alice', { requestId: randomUUID(), targetKind: 'citizen-message', targetId: id, reasonId: 'hate-harassment' })).status, 404, 'author');
    assert.equal((await c.r.call('reports', 'aura', { requestId: randomUUID(), targetKind: 'citizen-message', targetId: id, reasonId: 'hate-harassment' })).status, 404, 'other embassy');
  });
}

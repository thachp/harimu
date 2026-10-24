/** #881 part 3: direct-message chat. Flag off = 404 before auth/DB. Pair of enrolled citizens, rate limits, replay, reports, 4 KB body cap, two-citizen same-id 409. SQLite + PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { localRuntime } from './helpers/local-runtime.mjs';

for (const backend of ['sqlite', 'postgres']) {
  async function setup(t, { flag = true } = {}) {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    if (!flag) r.setFixtureEnv('HARIMU_DM_CHAT_ENABLED', 'false');
    else r.setFixtureEnv('HARIMU_DM_CHAT_ENABLED', 'true');
    const iso = new Date(r.now).toISOString();
    for (const [u, nation] of [['carol', 'kindle'], ['dave', 'korund']]) {
      await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,?,?,18,0,'Good standing',?,?)").bind(u, nation, u, iso, iso).run();
    }
    const read = (user, peer) => r.call('dm-chat', user, undefined, 'https://fixture.invalid', `?peer=${peer}`);
    const post = (user, peer, text, extra = {}) => r.call('dm-chat', user, { action: 'post', peer, id: randomUUID(), text, ...extra });
    const count = async () => Number((await r.db.prepare('SELECT COUNT(*) AS n FROM dm_chat_messages').first()).n);
    return { r, read, post, count };
  }

  test(`#881dm ${backend}: flag off is a 404 before any sign-in check or DB access`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    r.setFixtureEnv('HARIMU_DM_CHAT_ENABLED', 'false');
    const probe = [];
    const orig = r.db.prepare.bind(r.db);
    r.db.prepare = (...a) => { probe.push(a[0]); return orig(...a); };
    for (const user of [null, 'alice']) {
      const res = await r.call('dm-chat', user, undefined, 'https://fixture.invalid', '?peer=bob');
      assert.equal(res.status, 404); assert.equal(res.data.reason, 'not_found');
    }
    assert.equal((await r.call('dm-chat', 'alice', { action: 'post', peer: 'bob', id: randomUUID(), text: 'hi' })).status, 404);
    assert.equal(probe.length, 0, 'no DB while flag off');
    for (const value of ['false', 'TRUE', '1', '']) { r.setFixtureEnv('HARIMU_DM_CHAT_ENABLED', value); assert.equal((await r.call('dm-chat', 'alice', undefined, 'https://fixture.invalid', '?peer=bob')).status, 404, value); }
  });

  test(`#881dm ${backend}: thread between two enrolled citizens; self/unenrolled/anonymous refused`, async t => {
    const c = await setup(t);
    assert.equal((await c.r.call('dm-chat', null, undefined, 'https://fixture.invalid', '?peer=bob')).status, 401);
    assert.equal((await c.read('alice', 'alice')).status, 400, 'self');
    assert.equal((await c.read('alice', 'nobody')).status, 404);
    const empty = await c.read('alice', 'bob'); assert.equal(empty.status, 200); assert.deepEqual(empty.data.messages, []);
    assert.equal((await c.post('alice', 'bob', 'hello bob')).status, 200);
    assert.equal((await c.post('bob', 'alice', 'hello alice')).status, 200);
    const a = await c.read('alice', 'bob'), b = await c.read('bob', 'alice');
    assert.equal(a.data.messages.length, 2); assert.equal(b.data.messages.length, 2);
    assert.equal(a.data.messages[0].mine, true); assert.equal(a.data.messages[1].mine, false);
    assert.equal((await c.post('alice', 'nomad', 'x')).status, 404, 'unenrolled peer');
    // carol (kindle) <-> dave (korund) cross-nation
    assert.equal((await c.post('carol', 'dave', 'across')).status, 200);
  });

  test(`#881dm ${backend}: validation, gap, hourly cap, idempotent replay, cross-user id 409, 4 KB body cap, delete`, async t => {
    const c = await setup(t);
    assert.equal((await c.post('alice', 'bob', '')).status, 400);
    assert.equal((await c.post('alice', 'bob', 'x'.repeat(281))).status, 400);
    assert.equal((await c.r.call('dm-chat', 'alice', { action: 'post', peer: 'bob', id: randomUUID(), text: 'hi' }, 'https://evil.invalid')).status, 403);
    // 4 KB body cap (QA3 #929 gap): Content-Length over 4096 → 413 before auth work matters
    const fat = await c.r.call('dm-chat', 'alice', { action: 'post', peer: 'bob', id: randomUUID(), text: 'hi' }, 'https://fixture.invalid', '', { 'Content-Length': '5000' });
    assert.equal(fat.status, 413, '4 KB cap'); assert.equal(fat.data.error, 'Request too large.');
    const id = randomUUID();
    assert.equal((await c.post('alice', 'bob', 'one', { id })).status, 200);
    assert.equal((await c.post('alice', 'bob', 'one', { id })).status, 200, 'idempotent');
    assert.equal((await c.post('alice', 'bob', 'other', { id })).status, 409);
    assert.equal((await c.post('bob', 'alice', 'one', { id })).status, 409, 'cross-user prior 409');
    // two-citizen same-id race (QA3 #929 gap): both post the same new id concurrently; one wins, the other 409
    c.r.setNow(c.r.now + 11_000);
    const raceId = randomUUID();
    const [ra, rb] = await Promise.all([
      c.post('alice', 'bob', 'race-a', { id: raceId }),
      c.post('bob', 'alice', 'race-b', { id: raceId }),
    ]);
    assert.deepEqual([ra.status, rb.status].sort(), [200, 409], `race ${ra.status},${rb.status}`);
    assert.equal(await c.count(), 2, 'prior one + race winner');
    assert.equal((await c.post('alice', 'bob', 'too-soon')).status, 429);
    c.r.setNow(c.r.now + 11_000);
    const gone = randomUUID();
    assert.equal((await c.post('alice', 'bob', 'bye', { id: gone })).status, 200);
    assert.equal((await c.r.call('dm-chat', 'bob', { action: 'delete', peer: 'alice', id: gone })).status, 404, "not bob's");
    assert.equal((await c.r.call('dm-chat', 'alice', { action: 'delete', peer: 'bob', id: gone })).status, 200);
    assert.equal((await c.read('bob', 'alice')).data.messages.filter(m => m.id === gone).length, 0);
  });

  test(`#881dm ${backend}: peer can report a live DM; author and strangers cannot`, async t => {
    const c = await setup(t);
    c.r.setFixtureEnv('HARIMU_REPORTS_ENABLED', 'true');
    const id = randomUUID();
    assert.equal((await c.post('alice', 'bob', 'report-me', { id })).status, 200);
    const ok = await c.r.call('reports', 'bob', { requestId: randomUUID(), targetKind: 'citizen-message', targetId: id, reasonId: 'hate-harassment' });
    assert.equal(ok.status, 201, JSON.stringify(ok.data));
    assert.equal((await c.r.call('reports', 'alice', { requestId: randomUUID(), targetKind: 'citizen-message', targetId: id, reasonId: 'hate-harassment' })).status, 404, 'author');
    assert.equal((await c.r.call('reports', 'carol', { requestId: randomUUID(), targetKind: 'citizen-message', targetId: id, reasonId: 'hate-harassment' })).status, 404, 'stranger');
  });
}

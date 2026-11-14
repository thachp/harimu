/** #882: embassy chat between two live nations. Flag off = 404 before auth/DB. Pair channel, rate limits, replay, reports, 4 KB cap, same-id 409.
 *  #1396: Korund is closed (docs §18.1); the only open pair is kindle|aurelle. SQLite + PGlite. */
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
      const res = await r.call('embassy-chat', user, undefined, 'https://fixture.invalid', '?peerNation=aurelle');
      assert.equal(res.status, 404); assert.equal(res.data.reason, 'not_found');
    }
    assert.equal((await r.call('embassy-chat', 'alice', { action: 'post', peerNation: 'aurelle', id: randomUUID(), text: 'hi' })).status, 404);
    assert.equal(probe.length, 0, 'no DB while flag off');
    for (const value of ['false', 'TRUE', '1', '']) { r.setFixtureEnv('HARIMU_EMBASSY_CHAT_ENABLED', value); assert.equal((await r.call('embassy-chat', 'alice', undefined, 'https://fixture.invalid', '?peerNation=aurelle')).status, 404, value); }
  });

  test(`#882 ${backend}: channel between Kindle and Aurelle; self/unknown/third-nation refused`, async t => {
    const c = await setup(t);
    assert.equal((await c.r.call('embassy-chat', null, undefined, 'https://fixture.invalid', '?peerNation=aurelle')).status, 401);
    assert.equal((await c.read('alice', 'kindle')).status, 400, 'own nation');
    assert.equal((await c.read('alice', 'confluence')).status, 400, 'not a live embassy nation');
    const empty = await c.read('alice', 'aurelle'); assert.equal(empty.status, 200); assert.deepEqual(empty.data.messages, []); assert.equal(empty.data.channelId, 'aurelle|kindle');
    assert.equal((await c.post('alice', 'aurelle', 'hello aurelle')).status, 200);
    c.r.setNow(c.r.now + 11_000);
    assert.equal((await c.post('aura', 'kindle', 'hello kindle')).status, 200);
    const a = await c.read('alice', 'aurelle'), b = await c.read('aura', 'kindle');
    assert.equal(a.data.messages.length, 2); assert.equal(b.data.messages.length, 2);
    assert.deepEqual(a.data.messages.map(m => [m.body, m.nationId, m.mine]), [['hello aurelle', 'kindle', true], ['hello kindle', 'aurelle', false]]);
  });

  test(`#1396 ${backend}: Korund cannot use embassy chat, and Kindle/Aurelle cannot open a Korund embassy`, async t => {
    const c = await setup(t);
    const m = await c.r.importModule('lib/embassy-chat.ts');
    assert.equal(m.embassyPairOpen('kindle', 'aurelle'), true);
    assert.equal(m.embassyPairOpen('aurelle', 'kindle'), true);
    assert.equal(m.embassyPairOpen('kindle', 'korund'), false);
    assert.equal(m.embassyPairOpen('korund', 'kindle'), false);
    for (const [user, peer] of [['kora', 'kindle'], ['kora', 'aurelle']]) {
      const get = await c.read(user, peer);
      assert.equal(get.status, 403, `${user} GET ${peer}`);
      assert.equal(get.data.reason, 'nation_closed');
      assert.equal(get.data.error, 'Embassy chat is closed to your nation.');
      const posted = await c.post(user, peer, 'should not land');
      assert.equal(posted.status, 403);
      assert.equal(posted.data.reason, 'nation_closed');
    }
    for (const [user, peer] of [['alice', 'korund'], ['aura', 'korund']]) {
      const get = await c.read(user, peer);
      assert.equal(get.status, 403, `${user} GET ${peer}`);
      assert.equal(get.data.reason, 'peer_closed');
      assert.equal(get.data.error, 'Embassy chat with that nation is not open.');
      assert.equal((await c.post(user, peer, 'should not land')).data.reason, 'peer_closed');
    }
    assert.equal(await c.count(), 0, 'closed requests write nothing');
    assert.equal((await c.post('alice', 'aurelle', 'open pair still works')).status, 200);
    assert.equal(await c.count(), 1);
  });

  test(`#1396 ${backend}: postEmbassyChatSql writes 0 rows for a Korund citizen`, async t => {
    const c = await setup(t);
    const m = await c.r.importModule('lib/embassy-chat.ts');
    const channelId = m.embassyChannelId('kindle', 'aurelle');
    const closed = await c.r.db.prepare(m.postEmbassyChatSql).bind(...m.postEmbassyChatBinds(randomUUID(), channelId, 'should not land', c.r.now, 'kora', 'korund')).run();
    assert.equal(closed.meta.changes, 0, 'nation_id<>korund guard');
    assert.equal(await c.count(), 0);
    const open = await c.r.db.prepare(m.postEmbassyChatSql).bind(...m.postEmbassyChatBinds(randomUUID(), channelId, 'open pair still writes', c.r.now, 'alice', 'kindle')).run();
    assert.equal(open.meta.changes, 1);
    assert.equal(await c.count(), 1);
  });

  test(`#882 ${backend}: validation, gap, hourly cap, idempotent replay, cross-user id 409, 4 KB body cap, delete`, async t => {
    const c = await setup(t);
    assert.equal((await c.post('alice', 'aurelle', '')).status, 400);
    assert.equal((await c.post('alice', 'aurelle', 'x'.repeat(281))).status, 400);
    assert.equal((await c.r.call('embassy-chat', 'alice', { action: 'post', peerNation: 'aurelle', id: randomUUID(), text: 'hi' }, 'https://evil.invalid')).status, 403);
    const fat = await c.r.call('embassy-chat', 'alice', { action: 'post', peerNation: 'aurelle', id: randomUUID(), text: 'hi' }, 'https://fixture.invalid', '', { 'Content-Length': '5000' });
    assert.equal(fat.status, 413, '4 KB cap'); assert.equal(fat.data.error, 'Request too large.');
    const id = randomUUID();
    assert.equal((await c.post('alice', 'aurelle', 'one', { id })).status, 200);
    assert.equal((await c.post('alice', 'aurelle', 'one', { id })).status, 200, 'idempotent');
    assert.equal((await c.post('alice', 'aurelle', 'other', { id })).status, 409);
    assert.equal((await c.post('aura', 'kindle', 'one', { id })).status, 409, 'cross-user prior 409');
    c.r.setNow(c.r.now + 11_000);
    const raceId = randomUUID();
    const [ra, rb] = await Promise.all([
      c.post('alice', 'aurelle', 'race-a', { id: raceId }),
      c.post('aura', 'kindle', 'race-b', { id: raceId }),
    ]);
    assert.deepEqual([ra.status, rb.status].sort(), [200, 409], `race ${ra.status},${rb.status}`);
    assert.equal(await c.count(), 2, 'prior one + race winner');
    assert.equal((await c.post('alice', 'aurelle', 'too-soon')).status, 429);
    c.r.setNow(c.r.now + 11_000);
    const gone = randomUUID();
    assert.equal((await c.post('alice', 'aurelle', 'bye', { id: gone })).status, 200);
    assert.equal((await c.r.call('embassy-chat', 'aura', { action: 'delete', peerNation: 'kindle', id: gone })).status, 404, "not aura's");
    assert.equal((await c.r.call('embassy-chat', 'alice', { action: 'delete', peerNation: 'aurelle', id: gone })).status, 200);
    assert.equal((await c.read('aura', 'kindle')).data.messages.filter(m => m.id === gone).length, 0);
  });

  test(`#882 ${backend}: peer-nation citizen can report a live embassy message; author and outsiders cannot`, async t => {
    const c = await setup(t);
    c.r.setFixtureEnv('HARIMU_REPORTS_ENABLED', 'true');
    const id = randomUUID();
    assert.equal((await c.post('alice', 'aurelle', 'report-me', { id })).status, 200);
    const ok = await c.r.call('reports', 'aura', { requestId: randomUUID(), targetKind: 'citizen-message', targetId: id, reasonId: 'hate-harassment' });
    assert.equal(ok.status, 201, JSON.stringify(ok.data));
    assert.equal((await c.r.call('reports', 'alice', { requestId: randomUUID(), targetKind: 'citizen-message', targetId: id, reasonId: 'hate-harassment' })).status, 404, 'author');
    assert.equal((await c.r.call('reports', 'kora', { requestId: randomUUID(), targetKind: 'citizen-message', targetId: id, reasonId: 'hate-harassment' })).status, 404, 'other embassy');
  });
}

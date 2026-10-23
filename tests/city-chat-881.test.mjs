/** #881 (part 1): the city chat channel. Flag off: 404 before auth or DB. On: a citizen reads and posts only in their current city (server-derived), the
 *  feed is scoped per nation and city, rate limits and replay match the square, own-post delete, 7-day retention, #790 shadow-mute. SQLite + PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { localRuntime } from './helpers/local-runtime.mjs';

async function setup(t, backend, on = true) {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  if (on) r.setFixtureEnv('HARIMU_CITY_CHAT_ENABLED', 'true');
  const now = () => Math.floor(r.now / 1000), iso = new Date(r.now).toISOString();
  const citizen = (user, nation) => r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,?,?,18,0,'Good standing',?,?)").bind(user, nation, `Private ${user}`, iso, iso).run();
  const read = async user => (await r.call('city-chat', user)).data;
  const post = async (user, text, extra = {}) => { const city = (await read(user)).cityId; return r.call('city-chat', user, { action: 'post', id: randomUUID(), text, expectedCityId: city, ...extra }); };
  const moveTo = (user, city) => r.db.prepare('UPDATE citizen_city_locations SET current_city_id=? WHERE user_id=?').bind(city, user).run();
  const later = s => r.setNow(r.now + s * 1000);
  return { r, now, citizen, read, post, moveTo, later };
}
for (const backend of ['sqlite', 'postgres']) {
  test(`#881 ${backend}: flag off is a 404 before auth or any DB access`, async t => {
    const { r } = await setup(t, backend, false);
    const prepare = r.db.prepare.bind(r.db); let touched = 0; r.db.prepare = sql => { touched++; return prepare(sql); };
    for (const [user, body] of [[null, undefined], ['alice', undefined], ['alice', { action: 'post', id: randomUUID(), text: 'hi', expectedCityId: 'forgehaven' }]]) {
      const res = await r.call('city-chat', user, body); assert.equal(res.status, 404); assert.equal(res.data.reason, 'not_found');
    }
    r.db.prepare = prepare; assert.equal(touched, 0, 'no DB access');
    for (const value of ['false', 'TRUE', '1', '']) { r.setFixtureEnv('HARIMU_CITY_CHAT_ENABLED', value); assert.equal((await r.call('city-chat', 'alice')).status, 404, value); }
  });

  test(`#881 ${backend}: posts are scoped to the poster's current city and nation; others never see them`, async t => {
    const c = await setup(t, backend);
    assert.equal((await c.r.call('city-chat', null)).status, 401);
    await c.citizen('kora', 'korund'); await c.citizen('nomad', null);
    assert.equal((await c.r.call('city-chat', 'nomad')).status, 403);
    const a = await c.read('alice'); assert.equal(a.nationId, 'kindle'); assert.equal(a.cityId, 'forgehaven'); assert.deepEqual(a.messages, []);
    await c.read('bob'); await c.read('kora');
    const first = await c.post('alice', '  Forgehaven market opens at dawn  ');
    assert.equal(first.status, 200); assert.equal(first.cache, 'private, no-store'); assert.equal(first.data.messages.length, 1);
    assert.equal(first.data.messages[0].body, 'Forgehaven market opens at dawn'); assert.equal(first.data.messages[0].mine, true); assert.match(first.data.messages[0].handle, /^Citizen-[0-9a-f]{16}$/);
    const bob = await c.read('bob'); assert.equal(bob.messages.length, 1); assert.equal(bob.messages[0].mine, false);
    assert.deepEqual((await c.read('kora')).messages, [], 'another nation never sees it');
    await c.moveTo('bob', 'tarrek-foundry');
    const moved = await c.read('bob'); assert.equal(moved.cityId, 'tarrek-foundry'); assert.deepEqual(moved.messages, [], 'another city never sees it');
    c.later(11); assert.equal((await c.post('bob', 'Tarrek here')).status, 200);
    assert.deepEqual((await c.read('alice')).messages.map(m => m.body), ['Forgehaven market opens at dawn']);
    assert.equal(Number((await c.r.db.prepare("SELECT COUNT(*) AS n FROM square_messages").first()).n), 0, 'the national square is untouched');
  });

  test(`#881 ${backend}: the client's city is checked against the server; a stale or forged city is refused`, async t => {
    const c = await setup(t, backend); await c.read('alice');
    for (const expectedCityId of ['tarrek-foundry', 'kolt-savanna', 'highspire']) {
      const res = await c.r.call('city-chat', 'alice', { action: 'post', id: randomUUID(), text: 'forged', expectedCityId });
      assert.equal(res.status, 409); assert.equal(res.data.reason, 'city_changed');
    }
    assert.equal((await c.r.call('city-chat', 'alice', { action: 'post', id: randomUUID(), text: 'no city' })).status, 400);
    assert.equal((await c.r.call('city-chat', 'alice', { action: 'post', id: randomUUID(), text: 'hi', expectedCityId: 'forgehaven' }, 'https://evil.invalid')).status, 403);
    for (const text of ['', '   ', 'x'.repeat(281), 'bell\u0007', 42]) assert.equal((await c.post('alice', text)).status, 400, JSON.stringify(text));
    assert.equal((await c.post('alice', 'ok', { id: 'not-a-uuid' })).status, 400);
    assert.equal((await c.post('alice', 'ok', { action: 'shout' })).status, 400);
    assert.deepEqual((await c.read('alice')).messages, []);
  });

  test(`#881 ${backend}: 10 seconds between posts, 20 per hour, idempotent replay, a reused id is refused`, async t => {
    const c = await setup(t, backend); const city = (await c.read('alice')).cityId, id = randomUUID();
    const send = (text, rid = randomUUID()) => c.r.call('city-chat', 'alice', { action: 'post', id: rid, text, expectedCityId: city });
    assert.equal((await send('one', id)).status, 200);
    assert.equal((await send('one', id)).status, 200, 'replay of the same request is fine'); assert.equal((await c.read('alice')).messages.length, 1);
    assert.equal((await send('different', id)).status, 409, 'a reused id with other text');
    const fast = await send('too soon'); assert.equal(fast.status, 429); assert.equal(fast.data.reason, 'rate_limited');
    for (let i = 2; i <= 20; i++) { c.later(11); assert.equal((await send(`m${i}`)).status, 200, `post ${i}`); }
    c.later(11); assert.equal((await send('twenty-one')).status, 429, 'hourly cap');
    c.later(3600); assert.equal((await send('next hour')).status, 200);
    const all = (await c.read('alice')).messages; assert.equal(all.length, 21); assert.equal(all.at(-1).body, 'next hour', 'oldest first');
  });

  test(`#881 ${backend}: own-post delete, 7-day retention, and the #790 shadow-mute shows a muted post only to its author`, async t => {
    const c = await setup(t, backend); await c.read('alice'); await c.read('bob');
    const kept = await c.post('alice', 'keep me'); c.later(11); const gone = await c.post('alice', 'delete me');
    const goneId = gone.data.messages.at(-1).id;
    assert.equal((await c.r.call('city-chat', 'bob', { action: 'delete', id: goneId, expectedCityId: 'forgehaven' })).status, 404, "not bob's");
    const del = await c.r.call('city-chat', 'alice', { action: 'delete', id: goneId, expectedCityId: 'forgehaven' });
    assert.equal(del.status, 200); assert.deepEqual(del.data.messages.map(m => m.body), ['keep me']);
    assert.equal((await c.r.call('city-chat', 'alice', { action: 'delete', id: goneId, expectedCityId: 'forgehaven' })).status, 404, 'once');
    c.r.setFixtureEnv('HARIMU_CHAT_SHADOW_MUTE', `bob@${new Date(c.r.now).toISOString().replace(/\.\d{3}Z$/, 'Z')}`);
    c.later(11); assert.equal((await c.post('bob', 'muted words')).status, 200);
    assert.deepEqual((await c.read('bob')).messages.map(m => m.body), ['keep me', 'muted words'], 'the author still sees it');
    assert.deepEqual((await c.read('alice')).messages.map(m => m.body), ['keep me'], 'nobody else does');
    c.r.setFixtureEnv('HARIMU_CHAT_SHADOW_MUTE', undefined);
    c.later(7 * 86400 + 60); assert.deepEqual((await c.read('alice')).messages, [], 'gone after 7 days');
    assert.equal(Number((await c.r.db.prepare('SELECT COUNT(*) AS n FROM city_chat_messages').first()).n), 0, 'and deleted from the table');
    assert.ok(kept.status === 200);
  });

  test(`#881 ${backend}: QA3 mutants: travel block, a reused id from another citizen, the exact 10 s gap, the nation filter on the read`, async t => {
    const c = await setup(t, backend); await c.read('alice'); await c.read('bob');
    c.r.setFixtureEnv('HARIMU_TRAVEL_ENABLED', 'true'); const t0 = c.now();
    await c.r.db.prepare("INSERT INTO citizen_travel (user_id,nation_id,from_x,from_y,to_x,to_y,departed_at,traveling_until,request_id) VALUES ('alice','kindle',0,0,1,1,?,?,?)").bind(t0, t0 + 600, randomUUID()).run();
    const away = await c.post('alice', 'from the road'); assert.equal(away.status, 409); assert.equal(away.data.reason, 'traveling');
    c.later(601); const id = randomUUID();
    assert.equal((await c.r.call('city-chat', 'alice', { action: 'post', id, text: 'arrived', expectedCityId: 'forgehaven' })).status, 200);
    const stolen = await c.r.call('city-chat', 'bob', { action: 'post', id, text: 'arrived', expectedCityId: 'forgehaven' });
    assert.equal(stolen.status, 409, 'same id and text from another citizen'); assert.equal(stolen.data.error, 'Request already used.');
    c.later(9); assert.equal((await c.post('alice', 'nine seconds')).status, 429, '9 s is too soon');
    c.later(1); assert.equal((await c.post('alice', 'ten seconds')).status, 200, 'exactly 10 s is allowed');
    await c.citizen('kora', 'korund'); await c.r.db.prepare('INSERT OR IGNORE INTO square_handles(user_id,handle) VALUES (?,?)').bind('kora', 'Citizen-kora0000000000000').run();
    await c.r.db.prepare("INSERT INTO city_chat_messages (id,user_id,nation_id,city_id,body,posted_at) VALUES (?,'kora','korund','forgehaven','same city id, other nation',?)").bind(randomUUID(), c.now()).run();
    assert.deepEqual((await c.read('alice')).messages.map(m => m.body), ['arrived', 'ten seconds'], 'the read is filtered by nation too');
  });

  test(`#881 ${backend}: the INSERT re-checks the city, so a citizen who moves between the check and the write is refused`, async t => {
    const c = await setup(t, backend); await c.read('alice');
    const prepare = c.r.db.prepare.bind(c.r.db);
    c.r.db.prepare = sql => { if (/^INSERT INTO city_chat_messages/.test(sql)) { c.r.db.prepare = prepare; return { bind: (...a) => ({ run: async () => { await c.moveTo('alice', 'tarrek-foundry'); return prepare(sql).bind(...a).run(); } }) }; } return prepare(sql); };
    const res = await c.r.call('city-chat', 'alice', { action: 'post', id: randomUUID(), text: 'mid-move', expectedCityId: 'forgehaven' });
    c.r.db.prepare = prepare;
    assert.equal(res.status, 409); assert.equal(res.data.reason, 'city_changed');
    assert.equal(Number((await c.r.db.prepare('SELECT COUNT(*) AS n FROM city_chat_messages').first()).n), 0);
  });

  test(`#881 ${backend}: reports accept a live city message only in the reporter's own nation and current city; an author can delete an old post after moving`, async t => {
    const c = await setup(t, backend); c.r.setFixtureEnv('HARIMU_REPORTS_ENABLED', 'true');
    await c.read('alice'); await c.read('bob'); await c.citizen('kora', 'korund'); await c.read('kora');
    const res = await c.post('bob', 'report me'); assert.equal(res.data.reportsEnabled, true); const msg = res.data.messages[0].id;
    const report = user => c.r.call('reports', user, { requestId: randomUUID(), targetKind: 'citizen-message', targetId: msg, reasonId: 'spam-other' });
    assert.equal((await report('bob')).status, 404, 'not by its author');
    assert.equal((await report('kora')).status, 404, 'not from another nation');
    await c.moveTo('alice', 'tarrek-foundry'); assert.equal((await report('alice')).status, 404, 'not from another city');
    await c.moveTo('alice', 'forgehaven'); assert.equal((await report('alice')).status, 201, 'same nation and city');
    await c.moveTo('bob', 'kolt-savanna');
    assert.equal((await c.r.call('city-chat', 'bob', { action: 'delete', id: msg })).status, 200, 'the author deletes it from another city');
    assert.deepEqual((await c.read('alice')).messages, []);
    await c.citizen('carl', 'kindle'); await c.read('carl'); assert.equal((await report('carl')).status, 404, 'a deleted message is not reportable');
  });
}


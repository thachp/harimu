/** #881 part 2: the global chat channel. Flag off: 404 before auth or DB. On: every enrolled citizen of every nation reads and posts in one feed, each
 *  post labeled with its author's server-side nation; rate limits and replay match city chat; own-post delete; 7-day retention; #790 shadow-mute;
 *  reports accept a live global message from anyone but its author. SQLite + PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { localRuntime } from './helpers/local-runtime.mjs';

async function setup(t, backend, on = true) {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  if (on) r.setFixtureEnv('HARIMU_GLOBAL_CHAT_ENABLED', 'true');
  const now = () => Math.floor(r.now / 1000), iso = new Date(r.now).toISOString();
  const citizen = (user, nation) => r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,?,?,18,0,'Good standing',?,?)").bind(user, nation, `Private ${user}`, iso, iso).run();
  const read = async user => (await r.call('global-chat', user)).data;
  const post = (user, text, extra = {}) => r.call('global-chat', user, { action: 'post', id: randomUUID(), text, ...extra });
  const later = s => r.setNow(r.now + s * 1000);
  const count = async () => Number((await r.db.prepare('SELECT COUNT(*) AS n FROM global_chat_messages').first()).n);
  return { r, now, citizen, read, post, later, count };
}
for (const backend of ['sqlite', 'postgres']) {
  test(`#881g ${backend}: flag off is a 404 before any sign-in check or DB access`, async t => {
    const { r } = await setup(t, backend, false);
    const prepare = r.db.prepare.bind(r.db); let touched = 0; r.db.prepare = sql => { touched++; return prepare(sql); };
    for (const [user, body] of [[null, undefined], [null, { action: 'post', id: randomUUID(), text: 'hi' }], ['alice', undefined], ['alice', { action: 'post', id: randomUUID(), text: 'hi' }]]) {
      const res = await r.call('global-chat', user, body); assert.equal(res.status, 404); assert.equal(res.data.reason, 'not_found');
    }
    r.db.prepare = prepare; assert.equal(touched, 0, 'no DB access');
    for (const value of ['false', 'TRUE', '1', '']) { r.setFixtureEnv('HARIMU_GLOBAL_CHAT_ENABLED', value); assert.equal((await r.call('global-chat', null)).status, 404, value); }
  });

  test(`#881g ${backend}: one feed across nations, labeled with each author's server-side nation; unenrolled and anonymous are refused`, async t => {
    const c = await setup(t, backend);
    assert.equal((await c.r.call('global-chat', null)).status, 401);
    await c.citizen('kora', 'korund'); await c.citizen('aure', 'aurelle'); await c.citizen('nomad', null);
    assert.equal((await c.r.call('global-chat', 'nomad')).status, 403); assert.equal((await c.post('nomad', 'let me in')).status, 403);
    const a = await c.post('alice', '  hello world  ', { nationId: 'korund' }); assert.equal(a.status, 200); assert.equal(a.cache, 'private, no-store');
    c.later(1); assert.equal((await c.post('kora', 'greetings from Korund')).status, 200);
    c.later(1); assert.equal((await c.post('aure', 'and Aurelle')).status, 200);
    for (const viewer of ['alice', 'bob', 'kora', 'aure']) {
      const feed = (await c.read(viewer)).messages;
      assert.deepEqual(feed.map(m => [m.body, m.nationId]), [['hello world', 'kindle'], ['greetings from Korund', 'korund'], ['and Aurelle', 'aurelle']], viewer);
      assert.deepEqual(feed.map(m => m.mine), feed.map((_, i) => ({ alice: 0, kora: 1, aure: 2 })[viewer] === i));
      assert.ok(feed.every(m => /^Citizen-[0-9a-f]{16}$/.test(m.handle)));
    }
    assert.equal(Number((await c.r.db.prepare('SELECT COUNT(*) AS n FROM square_messages').first()).n) + Number((await c.r.db.prepare('SELECT COUNT(*) AS n FROM city_chat_messages').first()).n), 0, 'square and city chat untouched');
  });

  test(`#881g ${backend}: validation, the exact 10 s gap, 20 per hour, idempotent replay, an id reused by anyone else gets 409, travel does not block`, async t => {
    const c = await setup(t, backend);
    assert.equal((await c.r.call('global-chat', 'alice', { action: 'post', id: randomUUID(), text: 'hi' }, 'https://evil.invalid')).status, 403);
    for (const text of ['', '   ', 'x'.repeat(281), 'bell\u0007', 42]) assert.equal((await c.post('alice', text)).status, 400, JSON.stringify(text));
    assert.equal((await c.post('alice', 'ok', { id: 'nope' })).status, 400); assert.equal((await c.post('alice', 'ok', { action: 'shout' })).status, 400);
    c.r.setFixtureEnv('HARIMU_TRAVEL_ENABLED', 'true'); const t0 = c.now();
    await c.r.db.prepare("INSERT INTO citizen_travel (user_id,nation_id,from_x,from_y,to_x,to_y,departed_at,traveling_until,request_id) VALUES ('alice','kindle',0,0,1,1,?,?,?)").bind(t0, t0 + 600, randomUUID()).run();
    const id = randomUUID();
    assert.equal((await c.post('alice', 'one', { id })).status, 200, 'travel does not block global chat');
    assert.equal((await c.post('alice', 'one', { id })).status, 200, 'replay'); assert.equal(await c.count(), 1);
    assert.equal((await c.post('alice', 'other', { id })).status, 409);
    const stolen = await c.post('bob', 'one', { id }); assert.equal(stolen.status, 409); assert.equal(stolen.data.error, 'Request already used.');
    c.later(9); const fast = await c.post('alice', 'nine'); assert.equal(fast.status, 429); assert.equal(fast.data.reason, 'rate_limited');
    c.later(1); assert.equal((await c.post('alice', 'ten')).status, 200, 'exactly 10 s');
    for (let i = 3; i <= 20; i++) { c.later(11); assert.equal((await c.post('alice', `m${i}`)).status, 200, `post ${i}`); }
    c.later(11); assert.equal((await c.post('alice', 'twenty-one')).status, 429, 'hourly cap');
    assert.equal((await c.post('bob', 'bob is not capped')).status, 200, 'limits are per citizen');
    c.later(3600); assert.equal((await c.post('alice', 'next hour')).status, 200);
    assert.equal((await c.read('bob')).messages.at(-1).body, 'next hour', 'oldest first');
  });

  test(`#881g ${backend}: own-post delete, 7-day retention, shadow-mute, and reports from anyone but the author`, async t => {
    const c = await setup(t, backend); c.r.setFixtureEnv('HARIMU_REPORTS_ENABLED', 'true'); await c.citizen('kora', 'korund'); await c.citizen('nomad', null);
    const res = await c.post('bob', 'report me'); assert.equal(res.data.reportsEnabled, true); const msg = res.data.messages[0].id;
    const report = user => c.r.call('reports', user, { requestId: randomUUID(), targetKind: 'citizen-message', targetId: msg, reasonId: 'spam-other' });
    assert.equal((await report('bob')).status, 404, 'not by its author');
    assert.equal((await report('kora')).status, 201, 'another nation can report a global message');
    assert.equal((await report('alice')).status, 201);
    assert.equal((await c.r.call('global-chat', 'alice', { action: 'delete', id: msg })).status, 404, "not alice's");
    const del = await c.r.call('global-chat', 'bob', { action: 'delete', id: msg }); assert.equal(del.status, 200); assert.deepEqual(del.data.messages, []);
    assert.equal((await c.r.call('global-chat', 'bob', { action: 'delete', id: msg })).status, 404, 'once');
    await c.citizen('carl', 'kindle'); assert.equal((await report('carl')).status, 404, 'a deleted message is not reportable');
    c.later(11); assert.equal((await c.post('alice', 'keep me')).status, 200);
    c.r.setFixtureEnv('HARIMU_CHAT_SHADOW_MUTE', `kora@${new Date(c.r.now).toISOString().replace(/\.\d{3}Z$/, 'Z')}`);
    c.later(1); assert.equal((await c.post('kora', 'muted words')).status, 200);
    assert.deepEqual((await c.read('kora')).messages.map(m => m.body), ['keep me', 'muted words'], 'the author still sees it');
    assert.deepEqual((await c.read('alice')).messages.map(m => m.body), ['keep me'], 'nobody else does');
    c.r.setFixtureEnv('HARIMU_CHAT_SHADOW_MUTE', undefined);
    c.later(7 * 86400 + 60); assert.deepEqual((await c.read('alice')).messages, []); assert.equal(await c.count(), 0, 'purged after 7 days');
  });

  test(`#881g ${backend}: the INSERT re-checks enrollment, so a citizen who leaves their nation between the check and the write is refused`, async t => {
    const c = await setup(t, backend); await c.citizen('leaver', 'kindle');
    const prepare = c.r.db.prepare.bind(c.r.db);
    c.r.db.prepare = sql => { if (/^INSERT INTO global_chat_messages/.test(sql)) { c.r.db.prepare = prepare; return { bind: (...a) => ({ run: async () => { await prepare("UPDATE citizens SET nation_id=NULL WHERE clerk_user_id='leaver'").run(); return prepare(sql).bind(...a).run(); } }) }; } return prepare(sql); };
    const res = await c.post('leaver', 'mid-leave'); c.r.db.prepare = prepare;
    assert.equal(res.status, 403); assert.equal(await c.count(), 0);
  });
}


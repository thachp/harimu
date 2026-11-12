/** #1342: the congregation channel. Flag off: 404 before auth or DB. On: only a current member of that congregation reads and posts (non-members 403),
 *  Korund public congregations have no channel, city-chat limits (280 chars, 10 s, 20 per hour, replay), own-post delete, 7-day retention, #790. SQLite + PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { localRuntime } from './helpers/local-runtime.mjs';
import { FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';

test('#1342: the flag is packed last after posters in the gray pack, preview on and production off, a direct string wins', () => {
  const F = 'HARIMU_CONGREGATION_CHAT_ENABLED', strip = t => JSON.parse(t.replace(/^\s*\/\/.*$/gm, ''));
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf(F), 84);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.at(-1), F);
  assert.equal(preview.vars[F], undefined); assert.equal(prod.vars[F], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[F], 'true'); assert.equal(prod.vars.HARIMU_GRAY_PACK[F], 'false');
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, F), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, F), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [F]: 'false' }, F), false);
});

async function setup(t, backend, on = true) {
  const r = await localRuntime({ backend }); t.after(() => r.close()); r.setFaith(true);
  if (on) r.setFixtureEnv('HARIMU_CONGREGATION_CHAT_ENABLED', 'true');
  const iso = new Date(r.now).toISOString(), now = () => Math.floor(r.now / 1000);
  const citizen = (user, nation) => r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,?,?,18,0,'Good standing',?,?)").bind(user, nation, `Private ${user}`, iso, iso).run();
  const join = async (user, faithId) => {
    assert.equal((await r.call('faith', user, { action: 'choose-faith', faithId, requestId: randomUUID() })).status, 200);
    const res = await r.call('congregations', user, { action: 'join-congregation', requestId: randomUUID() }); assert.equal(res.status, 200, JSON.stringify(res.data));
    return res.data.state.you.congregationId;
  };
  const read = (user, id) => r.call('congregation-chat', user, undefined, 'https://fixture.invalid', id ? `?congregationId=${encodeURIComponent(id)}` : '');
  const post = (user, congregationId, text, extra = {}) => r.call('congregation-chat', user, { action: 'post', id: randomUUID(), congregationId, text, ...extra });
  const later = s => r.setNow(r.now + s * 1000);
  return { r, now, citizen, join, read, post, later };
}
for (const backend of ['sqlite', 'postgres']) {
  test(`#1342 ${backend}: flag off is a 404 before auth or any DB access, and lists nothing`, async t => {
    const { r } = await setup(t, backend, false);
    const prepare = r.db.prepare.bind(r.db); let touched = 0; r.db.prepare = sql => { touched++; return prepare(sql); };
    for (const [user, body] of [[null, undefined], ['alice', undefined], ['alice', { action: 'post', id: randomUUID(), congregationId: 'kinward-rite:forgehaven', text: 'hi' }]]) {
      const res = await r.call('congregation-chat', user, body); assert.equal(res.status, 404); assert.equal(res.data.reason, 'not_found'); assert.equal(res.data.messages, undefined);
    }
    r.db.prepare = prepare; assert.equal(touched, 0, 'no DB access');
    for (const value of ['false', 'TRUE', '1', '']) { r.setFixtureEnv('HARIMU_CONGREGATION_CHAT_ENABLED', value); assert.equal((await r.call('congregation-chat', 'alice')).status, 404, value); }
  });

  test(`#1342 ${backend}: only current members of that congregation read and post; non-members 403; Korund public congregations have no channel`, async t => {
    const c = await setup(t, backend);
    assert.equal((await c.read(null)).status, 401);
    await c.citizen('nomad', null); assert.equal((await c.read('nomad')).status, 403);
    const outsider = await c.read('alice'); assert.equal(outsider.status, 403); assert.equal(outsider.data.reason, 'not_member'); assert.equal(outsider.data.messages, undefined);
    const kinward = await c.join('alice', 'kinward-rite'); assert.equal(await c.join('bob', 'kinward-rite'), kinward);
    await c.citizen('carl', 'kindle'); const openHand = await c.join('carl', 'open-hand'); assert.notEqual(openHand, kinward);
    const first = await c.post('alice', kinward, '  Vespers at dusk  ');
    assert.equal(first.status, 200); assert.equal(first.cache, 'private, no-store'); assert.equal(first.data.congregationId, kinward);
    assert.equal(first.data.messages[0].body, 'Vespers at dusk'); assert.equal(first.data.messages[0].mine, true); assert.match(first.data.messages[0].handle, /^Citizen-[0-9a-f]{16}$/);
    const bob = await c.read('bob', kinward); assert.equal(bob.status, 200); assert.deepEqual(bob.data.messages.map(m => [m.body, m.mine]), [['Vespers at dusk', false]]);
    assert.deepEqual((await c.read('carl')).data.messages, [], 'another congregation never sees it');
    for (const [res, why] of [[await c.read('carl', kinward), 'read'], [await c.post('carl', kinward, 'let me in'), 'post']]) { assert.equal(res.status, 403, why); assert.equal(res.data.reason, 'not_member'); }
    const korund = 'kinward-rite:' + (await c.r.call('congregations', null)).data.congregations.find(x => x.nationId === 'korund').cityId;
    for (const id of [korund, 'nope:nowhere']) { const res = await c.read('alice', id); assert.equal(res.status, 404, id); assert.equal(res.data.reason, 'no_channel'); }
    await c.citizen('kora', 'korund'); await c.r.db.prepare("INSERT INTO congregation_members (user_id,congregation_id,faith_id,city_id,officiant_opt_in,joined_at) VALUES ('kora',?,'kinward-rite',?,0,?)").bind(korund, korund.split(':')[1], c.now()).run();
    assert.equal((await c.read('kora')).status, 403, 'a Korund public membership row opens no channel');
    await c.r.db.prepare("DELETE FROM congregation_members WHERE user_id='bob'").run();
    assert.equal((await c.read('bob', kinward)).status, 403, 'a former member loses the channel'); c.later(11); assert.equal((await c.post('bob', kinward, 'still here?')).status, 403);
    assert.equal(Number((await c.r.db.prepare('SELECT COUNT(*) AS n FROM city_chat_messages').first()).n), 0, 'city chat untouched');
  });

  test(`#1342 ${backend}: validation, 10 seconds between posts, 20 per hour, idempotent replay, a reused id is refused`, async t => {
    const c = await setup(t, backend); const cong = await c.join('alice', 'kinward-rite'); await c.join('bob', 'kinward-rite'); const id = randomUUID();
    for (const text of ['', '   ', 'x'.repeat(281), 'bell\u0007', 42]) assert.equal((await c.post('alice', cong, text)).status, 400, JSON.stringify(text));
    assert.equal((await c.post('alice', cong, 'ok', { id: 'not-a-uuid' })).status, 400); assert.equal((await c.post('alice', cong, 'ok', { action: 'shout' })).status, 400);
    assert.equal((await c.post('alice', undefined, 'no channel')).status, 400);
    assert.equal((await c.r.call('congregation-chat', 'alice', { action: 'post', id: randomUUID(), congregationId: cong, text: 'hi' }, 'https://evil.invalid')).status, 403);
    const send = (text, rid = randomUUID()) => c.post('alice', cong, text, { id: rid });
    assert.equal((await send('one', id)).status, 200); assert.equal((await send('one', id)).status, 200, 'replay is fine');
    assert.equal((await send('different', id)).status, 409, 'a reused id with other text');
    const stolen = await c.post('bob', cong, 'one', { id }); assert.equal(stolen.status, 409, 'same id and text from another member');
    const fast = await send('too soon'); assert.equal(fast.status, 429); assert.equal(fast.data.reason, 'rate_limited');
    c.later(9); assert.equal((await send('nine seconds')).status, 429); c.later(1); assert.equal((await send('m2')).status, 200, 'exactly 10 s');
    for (let i = 3; i <= 20; i++) { c.later(11); assert.equal((await send(`m${i}`)).status, 200, `post ${i}`); }
    c.later(11); assert.equal((await send('twenty-one')).status, 429, 'hourly cap');
    c.later(3600); assert.equal((await send('next hour')).status, 200);
    const all = (await c.read('alice')).data.messages; assert.equal(all.length, 21); assert.equal(all.at(-1).body, 'next hour', 'oldest first');
  });

  test(`#1342 ${backend}: own-post delete (even after leaving), 7-day retention, and the #790 shadow-mute shows a muted post only to its author`, async t => {
    const c = await setup(t, backend); const cong = await c.join('alice', 'kinward-rite'); await c.join('bob', 'kinward-rite');
    await c.post('alice', cong, 'keep me'); c.later(11); const goneId = (await c.post('alice', cong, 'delete me')).data.messages.at(-1).id;
    assert.equal((await c.r.call('congregation-chat', 'bob', { action: 'delete', id: goneId })).status, 404, "not bob's");
    const del = await c.r.call('congregation-chat', 'alice', { action: 'delete', id: goneId }); assert.equal(del.status, 200); assert.deepEqual(del.data.messages.map(m => m.body), ['keep me']);
    assert.equal((await c.r.call('congregation-chat', 'alice', { action: 'delete', id: goneId })).status, 404, 'once');
    c.r.setFixtureEnv('HARIMU_CHAT_SHADOW_MUTE', `bob@${new Date(c.r.now).toISOString().replace(/\.\d{3}Z$/, 'Z')}`);
    c.later(11); const muted = await c.post('bob', cong, 'muted words'); assert.equal(muted.status, 200);
    assert.deepEqual((await c.read('bob')).data.messages.map(m => m.body), ['keep me', 'muted words'], 'the author still sees it');
    assert.deepEqual((await c.read('alice')).data.messages.map(m => m.body), ['keep me'], 'nobody else does');
    c.r.setFixtureEnv('HARIMU_CHAT_SHADOW_MUTE', undefined);
    await c.r.db.prepare("DELETE FROM congregation_members WHERE user_id='bob'").run();
    const left = await c.r.call('congregation-chat', 'bob', { action: 'delete', id: muted.data.messages.at(-1).id }); assert.equal(left.status, 200); assert.deepEqual(left.data.messages, [], 'a former member sees nothing back');
    c.later(7 * 86400 + 60); assert.deepEqual((await c.read('alice')).data.messages, [], 'gone after 7 days');
    assert.equal(Number((await c.r.db.prepare('SELECT COUNT(*) AS n FROM congregation_messages').first()).n), 0, 'and deleted from the table');
  });

  test(`#1342 ${backend}: the INSERT re-checks membership, so a member who leaves between the check and the write is refused`, async t => {
    const c = await setup(t, backend); const cong = await c.join('alice', 'kinward-rite');
    const prepare = c.r.db.prepare.bind(c.r.db);
    c.r.db.prepare = sql => { if (/^INSERT INTO congregation_messages/.test(sql)) { c.r.db.prepare = prepare; return { bind: (...a) => ({ run: async () => { await prepare("DELETE FROM congregation_members WHERE user_id='alice'").run(); return prepare(sql).bind(...a).run(); } }) }; } return prepare(sql); };
    const res = await c.post('alice', cong, 'mid-leave'); c.r.db.prepare = prepare;
    assert.equal(res.status, 403); assert.equal(res.data.reason, 'not_member');
    assert.equal(Number((await c.r.db.prepare('SELECT COUNT(*) AS n FROM congregation_messages').first()).n), 0);
  });
}

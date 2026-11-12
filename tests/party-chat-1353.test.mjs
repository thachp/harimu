/** #1353: the Kindle party channel. Flag off: 404 before auth or DB. On: only a current party_members row for that party reads and posts (non-members 403,
 *  unknown party 404), city-chat limits (280 chars, 10 s, 20 per hour, replay), own-post delete (even after leaving), 7-day retention, #790. SQLite + PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { localRuntime } from './helpers/local-runtime.mjs';
import { FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';

test('#1353: the flag is packed last in the gray pack (indexOf 88), after grace and anti-snowball, preview on and production off, a direct string wins', () => {
  const F = 'HARIMU_PARTY_CHAT_ENABLED', strip = t => JSON.parse(t.replace(/^\s*\/\/.*$/gm, ''));
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.deepEqual(['HARIMU_WORLD_ID_ENABLED', 'HARIMU_SQUARE_POSTERS_ENABLED', 'HARIMU_CONGREGATION_DONATIONS_ENABLED', 'HARIMU_CONGREGATION_CHAT_ENABLED', 'HARIMU_GRACE_ALL_POLITICAL_ACTIONS_ENABLED', 'HARIMU_SQUARE_PRICE_ANTI_SNOWBALL_ENABLED', F].map(k => FLAG_PACKS.HARIMU_GRAY_PACK.indexOf(k)), [82, 83, 84, 85, 86, 87, 88]); // indexOf pins only
  assert.deepEqual([Object.keys(preview.vars.HARIMU_GRAY_PACK).indexOf(F), Object.keys(prod.vars.HARIMU_GRAY_PACK).indexOf(F)], [88, 88]);
  assert.equal(preview.vars[F], undefined); assert.equal(prod.vars[F], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[F], 'true'); assert.equal(prod.vars.HARIMU_GRAY_PACK[F], 'false');
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK }, F), true);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: prod.vars.HARIMU_GRAY_PACK }, F), false);
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [F]: 'false' }, F), false);
});

async function setup(t, backend, on = true) {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  if (on) r.setFixtureEnv('HARIMU_PARTY_CHAT_ENABLED', 'true');
  const iso = new Date(r.now).toISOString(), now = () => Math.floor(r.now / 1000);
  const citizen = (user, nation = 'kindle') => r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,?,?,18,0,'Good standing',?,?) ON CONFLICT(clerk_user_id) DO NOTHING").bind(user, nation, `Private ${user}`, iso, iso).run();
  const join = async (user, party) => { await citizen(user); await r.db.prepare('INSERT INTO party_members (clerk_user_id,party_id,joined_at) VALUES (?,?,?) ON CONFLICT(clerk_user_id) DO UPDATE SET party_id=excluded.party_id').bind(user, party, now()).run(); return party; };
  const leave = user => r.db.prepare('DELETE FROM party_members WHERE clerk_user_id=?').bind(user).run();
  const read = (user, id) => r.call('party-chat', user, undefined, 'https://fixture.invalid', id ? `?partyId=${encodeURIComponent(id)}` : '');
  const post = (user, partyId, text, extra = {}) => r.call('party-chat', user, { action: 'post', id: randomUUID(), partyId, text, ...extra });
  const later = s => r.setNow(r.now + s * 1000);
  const count = async () => Number((await r.db.prepare('SELECT COUNT(*) AS n FROM party_messages').first()).n);
  return { r, now, citizen, join, leave, read, post, later, count };
}
for (const backend of ['sqlite', 'postgres']) {
  test(`#1353 ${backend}: flag off is a 404 before auth or any DB access, and lists nothing`, async t => {
    const { r } = await setup(t, backend, false);
    const prepare = r.db.prepare.bind(r.db); let touched = 0; r.db.prepare = sql => { touched++; return prepare(sql); };
    for (const [user, body] of [[null, undefined], ['alice', undefined], ['alice', { action: 'post', id: randomUUID(), partyId: 'open-ledger', text: 'hi' }], ['alice', { action: 'delete', id: randomUUID() }]]) {
      const res = await r.call('party-chat', user, body); assert.equal(res.status, 404); assert.equal(res.data.reason, 'not_found'); assert.equal(res.data.messages, undefined);
    }
    for (const value of ['false', 'TRUE', '1', '']) { r.setFixtureEnv('HARIMU_PARTY_CHAT_ENABLED', value); assert.equal((await r.call('party-chat', 'alice')).status, 404, value); }
    r.db.prepare = prepare; assert.equal(touched, 0, 'no DB access');
  });

  test(`#1353 ${backend}: only current members of that party read and post; non-members 403; unknown party 404; primaries flag not needed`, async t => {
    const c = await setup(t, backend);
    c.r.setFixtureEnv('HARIMU_PRIMARIES_ENABLED', undefined);
    assert.equal((await c.read(null)).status, 401);
    await c.citizen('nomad', null); assert.equal((await c.read('nomad')).status, 403);
    await c.citizen('alice'); const outsider = await c.read('alice'); assert.equal(outsider.status, 403); assert.equal(outsider.data.reason, 'not_member'); assert.equal(outsider.data.messages, undefined);
    const ledger = await c.join('alice', 'open-ledger'); await c.join('bob', 'open-ledger'); const steady = await c.join('carl', 'steady-hand');
    const first = await c.post('alice', ledger, '  Canvass at the docks  ');
    assert.equal(first.status, 200); assert.equal(first.cache, 'private, no-store'); assert.equal(first.data.partyId, ledger);
    assert.equal(first.data.messages[0].body, 'Canvass at the docks'); assert.equal(first.data.messages[0].mine, true); assert.match(first.data.messages[0].handle, /^Citizen-[0-9a-f]{16}$/);
    const bob = await c.read('bob', ledger); assert.equal(bob.status, 200); assert.deepEqual(bob.data.messages.map(m => [m.body, m.mine]), [['Canvass at the docks', false]]);
    const carl = await c.read('carl'); assert.equal(carl.data.partyId, steady); assert.deepEqual(carl.data.messages, [], 'another party never sees it');
    for (const [res, why] of [[await c.read('carl', ledger), 'read'], [await c.post('carl', ledger, 'let me in'), 'post']]) { assert.equal(res.status, 403, why); assert.equal(res.data.reason, 'not_member'); }
    for (const id of ['nope', 'kinward-rite:forgehaven', 'Open-Ledger']) { const res = await c.read('alice', id); assert.equal(res.status, 404, id); assert.equal(res.data.reason, 'no_channel'); }
    const unknownPost = await c.post('alice', 'nope', 'hi'); assert.equal(unknownPost.status, 404); assert.equal(unknownPost.data.reason, 'no_channel');
    await c.leave('bob');
    assert.equal((await c.read('bob', ledger)).status, 403, 'a former member loses the channel'); c.later(11); assert.equal((await c.post('bob', ledger, 'still here?')).status, 403);
    await c.join('bob', 'steady-hand'); assert.deepEqual((await c.read('bob')).data.messages, [], 'switching party switches channel'); assert.equal((await c.read('bob', ledger)).status, 403);
    assert.equal(await c.count(), 1);
    assert.equal(Number((await c.r.db.prepare('SELECT COUNT(*) AS n FROM city_chat_messages').first()).n), 0, 'city chat untouched');
  });

  test(`#1353 ${backend}: validation, 10 seconds between posts, 20 per hour, idempotent replay, a reused id is refused`, async t => {
    const c = await setup(t, backend); const party = await c.join('alice', 'dockside-builders'); await c.join('bob', 'dockside-builders'); const id = randomUUID();
    for (const text of ['', '   ', 'x'.repeat(281), 'bell\u0007', 42]) assert.equal((await c.post('alice', party, text)).status, 400, JSON.stringify(text));
    assert.equal((await c.post('alice', party, 'ok', { id: 'not-a-uuid' })).status, 400); assert.equal((await c.post('alice', party, 'ok', { action: 'shout' })).status, 400);
    assert.equal((await c.post('alice', undefined, 'no channel')).status, 400);
    assert.equal((await c.r.call('party-chat', 'alice', { action: 'post', id: randomUUID(), partyId: party, text: 'hi' }, 'https://evil.invalid')).status, 403);
    const send = (text, rid = randomUUID()) => c.post('alice', party, text, { id: rid });
    assert.equal((await send('x'.repeat(280), id)).status, 200, '280 is fine'); assert.equal((await send('x'.repeat(280), id)).status, 200, 'replay is fine');
    assert.equal((await send('different', id)).status, 409, 'a reused id with other text');
    const stolen = await c.post('bob', party, 'x'.repeat(280), { id }); assert.equal(stolen.status, 409, 'same id and text from another member');
    const fast = await send('too soon'); assert.equal(fast.status, 429); assert.equal(fast.data.reason, 'rate_limited');
    c.later(9); assert.equal((await send('nine seconds')).status, 429); c.later(1); assert.equal((await send('m2')).status, 200, 'exactly 10 s');
    for (let i = 3; i <= 20; i++) { c.later(11); assert.equal((await send(`m${i}`)).status, 200, `post ${i}`); }
    c.later(11); assert.equal((await send('twenty-one')).status, 429, 'hourly cap');
    c.later(3600); assert.equal((await send('next hour')).status, 200);
    const all = (await c.read('alice')).data.messages; assert.equal(all.length, 21); assert.equal(all.at(-1).body, 'next hour', 'oldest first');
  });

  test(`#1353 ${backend}: own-post delete (even after leaving), 7-day retention, and the #790 shadow-mute shows a muted post only to its author`, async t => {
    const c = await setup(t, backend); const party = await c.join('alice', 'open-ledger'); await c.join('bob', 'open-ledger');
    await c.post('alice', party, 'keep me'); c.later(11); const goneId = (await c.post('alice', party, 'delete me')).data.messages.at(-1).id;
    assert.equal((await c.r.call('party-chat', 'bob', { action: 'delete', id: goneId })).status, 404, "not bob's");
    const del = await c.r.call('party-chat', 'alice', { action: 'delete', id: goneId }); assert.equal(del.status, 200); assert.deepEqual(del.data.messages.map(m => m.body), ['keep me']);
    assert.equal((await c.r.call('party-chat', 'alice', { action: 'delete', id: goneId })).status, 404, 'once');
    c.r.setFixtureEnv('HARIMU_CHAT_SHADOW_MUTE', `bob@${new Date(c.r.now).toISOString().replace(/\.\d{3}Z$/, 'Z')}`);
    c.later(11); const muted = await c.post('bob', party, 'muted words'); assert.equal(muted.status, 200);
    assert.deepEqual((await c.read('bob')).data.messages.map(m => m.body), ['keep me', 'muted words'], 'the author still sees it');
    assert.deepEqual((await c.read('alice')).data.messages.map(m => m.body), ['keep me'], 'nobody else does');
    c.r.setFixtureEnv('HARIMU_CHAT_SHADOW_MUTE', undefined);
    await c.leave('bob');
    const left = await c.r.call('party-chat', 'bob', { action: 'delete', id: muted.data.messages.at(-1).id }); assert.equal(left.status, 200); assert.deepEqual(left.data, { partyId: null, messages: [] }, 'a former member sees nothing back');
    c.later(7 * 86400 + 60); assert.deepEqual((await c.read('alice')).data.messages, [], 'gone after 7 days');
    assert.equal(await c.count(), 0, 'and deleted from the table');
  });

  test(`#1353 ${backend}: the INSERT re-checks membership, so a member who leaves between the check and the write is refused`, async t => {
    const c = await setup(t, backend); const party = await c.join('alice', 'steady-hand');
    const prepare = c.r.db.prepare.bind(c.r.db);
    c.r.db.prepare = sql => { if (/^INSERT INTO party_messages/.test(sql)) { c.r.db.prepare = prepare; return { bind: (...a) => ({ run: async () => { await prepare("DELETE FROM party_members WHERE clerk_user_id='alice'").run(); return prepare(sql).bind(...a).run(); } }) }; } return prepare(sql); };
    const res = await c.post('alice', party, 'mid-leave'); c.r.db.prepare = prepare;
    assert.equal(res.status, 403); assert.equal(res.data.reason, 'not_member');
    assert.equal(await c.count(), 0);
  });
}

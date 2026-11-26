/** #1517: temporary chat bans via the operator var HARIMU_CHAT_BAN (docs 21.3; follow-up to #790), entries `citizenId@startISO..endISO`.
 *  Parser rules (fail safe, one warning) and all seven chat POST routes: a banned `post` is a 403 chat_banned with no row and one log line;
 *  own-post delete and reads still work; other citizens are unaffected; posting works again at the window's end. SQLite + PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { localRuntime } from './helpers/local-runtime.mjs';
import { chatBanListProblem, parseChatBan, chatBanUntil, chatBanRefusal, CHAT_BAN_MAX_IDS, CHAT_BAN_MAX_SECONDS } from '../lib/chat-ban.ts';

const iso = seconds => new Date(seconds * 1000).toISOString().replace('.000Z', 'Z');
const T = (d, h) => `2026-11-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00Z`, S = (d, h) => Date.parse(T(d, h)) / 1000;
const entries = n => Array.from({ length: n }, (_, i) => `u${i}@${T(1, 0)}..${T(2, 0)}`).join(',');

test('#1517 parse: id@start..end windows; end required, <= 30 days, no overlap per id; malformed bans nobody with exactly one warning', () => {
  const warned = []; const w = m => warned.push(m);
  for (const empty of [undefined, null, '', '  ', ',', ' , ,']) assert.equal(parseChatBan(empty, w).size, 0);
  assert.deepEqual(parseChatBan(`alice@${T(1, 9)}..${T(1, 10)}`, w).get('alice'), [{ from: S(1, 9), to: S(1, 10) }], 'single window');
  const m = parseChatBan(` alice@${T(2, 9)}..${T(3, 9)} , bob@2026-11-01T09:30:00+02:00..${T(1, 12)},alice@${T(1, 9)}..${T(2, 9)},, `, w);
  assert.deepEqual(m.get('alice'), [{ from: S(1, 9), to: S(2, 9) }, { from: S(2, 9), to: S(3, 9) }], 'sorted; touching windows are fine; empty entries ignored');
  assert.deepEqual(m.get('bob'), [{ from: S(1, 7) + 1800, to: S(1, 12) }]);
  assert.equal(parseChatBan(`alice@${T(1, 0)}..${iso(S(1, 0) + CHAT_BAN_MAX_SECONDS)}`, w).size, 1, 'exactly 30 days is allowed');
  assert.equal(parseChatBan(entries(CHAT_BAN_MAX_IDS), w).size, 90, '90 entries is the cap');
  assert.equal(warned.length, 0);
  const bads = [`alice@${T(1, 9)}`, `alice@${T(1, 9)}..`, `alice@${T(1, 10)}..${T(1, 9)}`, `alice@${T(1, 9)}..${T(1, 9)}`, `alice@${T(1, 0)}..${iso(S(1, 0) + CHAT_BAN_MAX_SECONDS + 1)}`,
    `alice@${T(1, 9)}..${T(1, 11)},alice@${T(1, 10)}..${T(1, 12)}`, 'alice', 'alice,bob', 'all', 'ALL', 'true', 'False', `all@${T(1, 9)}..${T(1, 10)}`, `a b@${T(1, 9)}..${T(1, 10)}`,
    `alice@2026-11-01T09:00:00..${T(1, 10)}`, `alice@${T(1, 9)}..2026-11-01T10:00:00`, `alice@${T(1, 9)}..2026-11-01T10:00:00.5Z`, `alice@${T(1, 9)}..${T(1, 10)}..${T(1, 11)}`, 'alice@yesterday..tomorrow', 42, entries(91)];
  for (const bad of bads) {
    const before = warned.length;
    assert.equal(parseChatBan(bad, w).size, 0, String(bad).slice(0, 48)); assert.equal(warned.length, before + 1, `one warning: ${String(bad).slice(0, 48)}`);
    assert.equal(typeof chatBanListProblem(bad), 'string');
  }
  assert.match(warned[0], /HARIMU_CHAT_BAN is malformed \(must give every ban an end time.*bans nobody/);
  assert.equal(chatBanListProblem(''), null); assert.equal(chatBanListProblem(undefined), null);
});

test('#1517 chatBanUntil: the end for start <= now < end; null at exactly end, before start and for unlisted ids', () => {
  const bans = parseChatBan(`alice@${T(1, 9)}..${T(1, 10)},alice@${T(2, 9)}..${T(2, 10)}`);
  for (const [now, want] of [[S(1, 9) - 1, null], [S(1, 9), S(1, 10)], [S(1, 10) - 1, S(1, 10)], [S(1, 10), null], [S(2, 9) + 5, S(2, 10)], [S(2, 10), null]]) assert.equal(chatBanUntil(bans, 'alice', now), want, String(now));
  assert.equal(chatBanUntil(bans, 'bob', S(1, 9)), null);
  const lines = [];
  assert.deepEqual(chatBanRefusal(`alice@${T(1, 9)}..${T(1, 10)}`, 'alice', S(1, 9), 'global', l => lines.push(l)), { reason: 'chat_banned', error: `You can't post in chat until ${T(1, 10)}.` });
  assert.deepEqual(lines.map(l => JSON.parse(l)), [{ event: 'chat_ban_refused', citizenId: 'alice', channel: 'global', reason: 'operator_chat_ban' }]);
  for (const raw of [undefined, '', `alice@${T(1, 9)}..${T(1, 10)}`]) assert.equal(chatBanRefusal(raw, 'bob', S(1, 9), 'global', l => lines.push(l)), null);
  assert.equal(lines.length, 1);
});

// Per channel: enable it, return post/delete bodies for (user, id), and the table holding its rows.
const channels = {
  square: { table: 'square_messages', async setup(r) { await r.db.prepare("UPDATE citizens SET nation_id='kindle'").run(); return { post: (u, id, text) => ({ action: 'post', id, text, expectedNationId: 'kindle' }), del: (u, id) => ({ action: 'delete', id, expectedNationId: 'kindle' }) }; } },
  'city-chat': { table: 'city_chat_messages', log: 'city', async setup(r) {
    r.setFixtureEnv('HARIMU_CITY_CHAT_ENABLED', 'true'); const city = {};
    for (const u of ['alice', 'bob']) city[u] = (await r.call('city-chat', u)).data.cityId;
    return { post: (u, id, text) => ({ action: 'post', id, text, expectedCityId: city[u] }), del: (u, id) => ({ action: 'delete', id }) };
  } },
  'global-chat': { table: 'global_chat_messages', log: 'global', async setup(r) { r.setFixtureEnv('HARIMU_GLOBAL_CHAT_ENABLED', 'true'); return { post: (u, id, text) => ({ action: 'post', id, text }), del: (u, id) => ({ action: 'delete', id }) }; } },
  'dm-chat': { table: 'dm_chat_messages', log: 'dm', async setup(r) { r.setFixtureEnv('HARIMU_DM_CHAT_ENABLED', 'true'); const peer = u => (u === 'alice' ? 'bob' : 'alice'); return { post: (u, id, text) => ({ action: 'post', peer: peer(u), id, text }), del: (u, id) => ({ action: 'delete', peer: peer(u), id }) }; } },
  'embassy-chat': { table: 'embassy_chat_messages', log: 'embassy', async setup(r) { r.setFixtureEnv('HARIMU_EMBASSY_CHAT_ENABLED', 'true'); return { post: (u, id, text) => ({ action: 'post', peerNation: 'aurelle', id, text }), del: (u, id) => ({ action: 'delete', peerNation: 'aurelle', id }) }; } },
  'party-chat': { table: 'party_messages', log: 'party', async setup(r) {
    r.setFixtureEnv('HARIMU_PARTY_CHAT_ENABLED', 'true');
    for (const u of ['alice', 'bob']) await r.db.prepare('INSERT INTO party_members (clerk_user_id,party_id,joined_at) VALUES (?,?,?)').bind(u, 'open-ledger', Math.floor(r.now / 1000)).run();
    return { post: (u, id, text) => ({ action: 'post', id, partyId: 'open-ledger', text }), del: (u, id) => ({ action: 'delete', id }) };
  } },
  'congregation-chat': { table: 'congregation_messages', log: 'congregation', async setup(r) {
    r.setFaith(true); r.setFixtureEnv('HARIMU_CONGREGATION_CHAT_ENABLED', 'true'); let congregationId;
    for (const u of ['alice', 'bob']) {
      assert.equal((await r.call('faith', u, { action: 'choose-faith', faithId: 'kinward-rite', requestId: randomUUID() })).status, 200);
      const res = await r.call('congregations', u, { action: 'join-congregation', requestId: randomUUID() }); assert.equal(res.status, 200, JSON.stringify(res.data)); congregationId = res.data.state.you.congregationId;
    }
    return { post: (u, id, text) => ({ action: 'post', id, congregationId, text }), del: (u, id) => ({ action: 'delete', id }) };
  } },
};
for (const backend of ['sqlite', 'postgres']) for (const [endpoint, spec] of Object.entries(channels)) {
  test(`#1517 ${backend} ${endpoint}: a banned post is 403 chat_banned with no row and one log line; delete, reads and other citizens unaffected; posting resumes at the end`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    const logged = [], info = console.info; console.info = (...a) => { const l = a.join(' '); if (l.includes('chat_ban_refused')) logged.push(l); else info(...a); }; t.after(() => { console.info = info; });
    const c = await spec.setup(r), sec = () => Math.floor(r.now / 1000), later = s => r.setNow(r.now + s * 1000);
    const count = async () => Number((await r.db.prepare(`SELECT COUNT(*) AS n FROM ${spec.table}`).first()).n);
    const post = async (u, text, id = randomUUID()) => ({ id, res: await r.call(endpoint, u, c.post(u, id, text)) });
    for (const value of [undefined, '']) { r.setFixtureEnv('HARIMU_CHAT_BAN', value); const { res } = await post('alice', `Fixture open ${value}`); assert.equal(res.status, 200, JSON.stringify(res.data)); later(11); }
    const { id: mine } = await post('alice', 'Fixture before ban'); later(11);
    const end = sec() + 3600; r.setFixtureEnv('HARIMU_CHAT_BAN', `alice@${iso(sec() - 60)}..${iso(end)}`);
    const rows = await count(), refused = await post('alice', 'Fixture secret words');
    assert.equal(refused.res.status, 403); assert.deepEqual(refused.res.data, { reason: 'chat_banned', error: `You can't post in chat until ${iso(end)}.` });
    assert.equal((await post('alice', 'Fixture before ban', mine)).res.status, 403, 'a replay during the ban is refused too');
    assert.equal(await count(), rows, 'no row written');
    assert.deepEqual(logged.map(l => JSON.parse(l)), [1, 2].map(() => ({ event: 'chat_ban_refused', citizenId: 'alice', channel: spec.log ?? 'square', reason: 'operator_chat_ban' })));
    assert.equal(logged.some(l => l.includes('Fixture')), false, 'never the message text');
    assert.equal((await post('bob', 'Fixture bob speaks')).res.status, 200, 'other citizens unaffected');
    assert.equal((await r.call(endpoint, 'alice', c.del('alice', mine))).status, 200, 'own-post delete still works');
    later(3600); assert.equal(sec() >= end, true);
    const after = await post('alice', 'Fixture after ban'); assert.equal(after.res.status, 200, JSON.stringify(after.res.data)); assert.equal(await count(), rows + 2);
  });
}

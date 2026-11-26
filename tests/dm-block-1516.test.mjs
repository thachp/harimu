/** #1516: citizen-to-citizen DM block. Idempotent block/unblock, either-way 403 dm_blocked with one neutral line, blockedByMe only for the
 *  blocker, history kept, replay path unchanged, flag off = 404 with no dm_blocks read, migration 0136 matches the bootstrap. SQLite + PGlite. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { localRuntime } from './helpers/local-runtime.mjs';
import { mutantTree } from './helpers/mutant-tree.mjs';

test('#1516 migration 0136 is additive, identical on D1 and Postgres, and matches dmChatSchemas', () => {
  const d1 = readFileSync('drizzle/0136_dm_blocks.sql', 'utf8'), pg = readFileSync('db/postgres/0136_dm_blocks.sql', 'utf8');
  assert.equal(pg, d1);
  assert.doesNotMatch(d1, /\b(DROP|DELETE|UPDATE|ALTER)\b/i);
  const lib = readFileSync('lib/dm-chat.ts', 'utf8');
  const bootstrap = [...lib.matchAll(/`(CREATE (?:TABLE|INDEX) IF NOT EXISTS dm_blocks[^`]*)`/g)].map(m => m[1]);
  assert.equal(bootstrap.length, 2);
  for (const sql of bootstrap) assert.ok(d1.includes(`${sql};`), sql);
  assert.match(lib, /dmBlockCopy = \{ block: 'Block', unblock: 'Unblock', refusal: "You can't message this citizen\." \}/);
});

for (const backend of ['sqlite', 'postgres']) {
  async function setup(t) {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    r.setFixtureEnv('HARIMU_DM_CHAT_ENABLED', 'true');
    const iso = new Date(r.now).toISOString();
    for (const [u, nation] of [['carol', 'kindle'], ['dave', 'korund']])
      await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,?,?,18,0,'Good standing',?,?)").bind(u, nation, u, iso, iso).run();
    const read = (user, peer) => r.call('dm-chat', user, undefined, 'https://fixture.invalid', `?peer=${peer}`);
    const act = (user, peer, action, extra = {}) => r.call('dm-chat', user, { action, peer, ...extra });
    const post = (user, peer, text, extra = {}) => act(user, peer, 'post', { id: randomUUID(), text, ...extra });
    const n = async table => Number((await r.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n);
    const later = () => r.setNow(r.now + 11_000);
    return { r, read, act, post, n, later };
  }

  test(`#1516 ${backend}: block/unblock are idempotent; self, unenrolled and bad peers change nothing`, async t => {
    const c = await setup(t);
    assert.equal((await c.act('alice', 'alice', 'block')).status, 400, 'self');
    assert.equal((await c.act('alice', 'nobody', 'block')).status, 404, 'unknown');
    const iso = new Date(c.r.now).toISOString(); // QA1 nit: an existing citizen with no nation is unenrolled
    await c.r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES ('nomad',NULL,'nomad',18,0,'Good standing',?,?)").bind(iso, iso).run();
    const nomad = await c.act('alice', 'nomad', 'block');
    assert.equal(nomad.status, 404, 'unenrolled'); assert.equal(nomad.data.error, 'That citizen is not available.');
    for (const peer of [undefined, '', 42, 'x'.repeat(129)]) assert.equal((await c.act('alice', peer, 'block')).status, 400, String(peer));
    assert.equal((await c.r.call('dm-chat', 'alice', { action: 'block', peer: 'bob' }, 'https://evil.invalid')).status, 403, 'cross-origin');
    assert.equal(await c.n('dm_blocks'), 0, 'refusals wrote nothing');
    const once = await c.act('alice', 'bob', 'block'), twice = await c.act('alice', 'bob', 'block');
    assert.equal(once.status, 200); assert.deepEqual(twice.data, once.data, 'second block is a no-op with the same view');
    assert.equal(once.data.blockedByMe, true); assert.equal(await c.n('dm_blocks'), 1);
    const off = await c.act('alice', 'bob', 'unblock'), again = await c.act('alice', 'bob', 'unblock');
    assert.equal(off.status, 200); assert.equal(off.data.blockedByMe, false); assert.deepEqual(again.data, off.data);
    assert.equal(await c.n('dm_blocks'), 0);
    assert.equal((await c.act('alice', 'alice', 'unblock')).status, 400, 'self unblock');
  });

  test(`#1516 ${backend}: a block stops posts both ways with one neutral 403; unblock restores; replay and history unchanged`, async t => {
    const c = await setup(t);
    const early = randomUUID();
    assert.equal((await c.post('alice', 'bob', 'before', { id: early })).status, 200);
    c.later(); assert.equal((await c.post('bob', 'alice', 'reply')).status, 200);
    c.later(); await c.act('alice', 'bob', 'block');
    const rows = await c.n('dm_chat_messages');
    const fromB = await c.post('bob', 'alice', 'still here?'), fromA = await c.post('alice', 'bob', 'from blocker');
    for (const res of [fromB, fromA]) { assert.equal(res.status, 403); assert.deepEqual(res.data, { error: "You can't message this citizen.", reason: 'dm_blocked' }); }
    assert.equal(await c.n('dm_chat_messages'), rows, 'no row written');
    assert.equal((await c.post('alice', 'bob', 'before', { id: early })).status, 200, 'replay of a pre-block post still returns the view');
    const a = await c.read('alice', 'bob'), b = await c.read('bob', 'alice');
    assert.equal(a.data.blockedByMe, true); assert.equal(b.data.blockedByMe, false, 'the blocked side is never told');
    assert.ok(!('blockedMe' in b.data) && !('blockedMe' in a.data));
    assert.deepEqual(a.data.messages.map(m => m.body), ['before', 'reply']); assert.deepEqual(b.data.messages.map(m => m.body), ['before', 'reply']);
    assert.equal((await c.post('carol', 'dave', 'others unaffected')).status, 200);
    await c.act('alice', 'bob', 'unblock');
    assert.equal((await c.post('bob', 'alice', 'thanks')).status, 200);
    assert.equal((await c.post('bob', 'alice', 'too soon')).status, 429, 'gap unchanged');
    assert.equal((await c.post('alice', 'bob', 'ok')).status, 200);
  });

  test(`#1516 ${backend}: GET writes nothing new; flag off is 404 and never touches dm_blocks`, async t => {
    const c = await setup(t);
    await c.act('alice', 'bob', 'block');
    const seen = [], orig = c.r.db.prepare.bind(c.r.db);
    c.r.db.prepare = (...a) => { seen.push(a[0]); return orig(...a); };
    await c.read('alice', 'bob'); await c.read('bob', 'alice');
    assert.deepEqual(seen.filter(sql => /^\s*(INSERT|UPDATE|DELETE)/i.test(sql) && !/DELETE FROM dm_chat_messages WHERE posted_at<=\?/.test(sql)), [], 'only the retention delete');
    seen.length = 0;
    for (const value of ['false', '']) {
      c.r.setFixtureEnv('HARIMU_DM_CHAT_ENABLED', value);
      for (const action of ['block', 'unblock']) assert.equal((await c.act('alice', 'bob', action, { id: randomUUID() })).status, 404, `${action} ${value}`);
      assert.equal((await c.read('alice', 'bob')).status, 404);
    }
    assert.equal(seen.length, 0, 'flag off: no DB and no dm_blocks read');
  });
}

test('#1516 mutants: dropping the post gate (or one direction), the 403 line or the blocker direction fails the SQLite tests', { timeout: 600_000 }, () => {
  const cases = [
    { file: 'lib/dm-chat.ts', find: /AND NOT EXISTS \(SELECT 1 FROM dm_blocks WHERE .*\n/, replace: '' },
    { file: 'lib/dm-chat.ts', find: 'AND NOT EXISTS (SELECT 1 FROM dm_blocks WHERE (', replace: 'AND NOT EXISTS (SELECT 1 FROM dm_blocks WHERE 0=1 AND (' },
    { file: 'app/api/dm-chat/route.ts', find: "reason: 'dm_blocked' }, 403)", replace: "reason: 'rate_limited' }, 429)" },
    { file: 'lib/dm-chat.ts', find: "WHERE blocker_id=? AND blocked_id=?').bind(userId, peerId).first())", replace: "WHERE blocked_id=? AND blocker_id=?').bind(userId, peerId).first())" },
  ];
  const tree = mutantTree();
  try {
    for (const c of cases) {
      const restore = tree.mutate(c.file, c.find, c.replace);
      try { assert.notEqual(tree.run(['tests/dm-block-1516.test.mjs'], '#1516 sqlite').status, 0, `mutant survived: ${c.find}`); } finally { restore(); }
    }
  } finally { tree.close(); }
});

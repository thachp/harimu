/** #599 slice 1: the Diplomatic Hall server (one channel for Kindle and Aurelle citizens, closed to Korund, flag off). HARIMU_TEST_BACKEND-style loop: SQLite and PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { localRuntime } from './helpers/local-runtime.mjs';

const read = rel => readFile(new URL(`../${rel}`, import.meta.url), 'utf8');
const post = (r, user, text, id = randomUUID()) => r.call('diplomatic-hall', user, { action: 'post', id, text });
const hall = (r, user) => r.call('diplomatic-hall', user);
async function scene(t, backend, on = true) {
  const r = await localRuntime(backend ? { backend } : {}); t.after(() => r.close()); r.setDiplomaticHall(on);
  const at = new Date(r.now).toISOString();
  for (const [id, nation] of [['kay', 'kindle'], ['ava', 'aurelle'], ['kor', 'korund'], ['con', 'confluence']]) {
    await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,?,?,18,0,'Good standing',?,?)").bind(id, nation, id, at, at).run();
  }
  await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES ('new',NULL,'new',18,0,'Good standing',?,?)").bind(at, at).run();
  return r;
}
const rows = async r => (await r.db.prepare('SELECT id,user_id,nation_id,body,deleted FROM diplomatic_hall_messages ORDER BY posted_at,id').all()).results.map(x => ({ ...x }));

test('wrangler.jsonc ships the Diplomatic Hall on in preview, and the module and route stay import-light', async () => {
  assert.deepEqual([...(await read('wrangler.jsonc')).matchAll(/"HARIMU_DIPLOMATIC_HALL_ENABLED"\s*:\s*"([^"]*)"/g)].map(m => m[1]), ['true']);
  assert.doesNotMatch(await read('lib/diplomatic-hall.ts'), /^import (?!type )/m, 'lib/diplomatic-hall.ts imports only types');
});

test('migration 0052 is additive in both dialects and matches the inline schema', async () => {
  const [sqlite, pg, inline] = [await read('drizzle/0052_diplomatic_hall.sql'), await read('db/postgres/0052_diplomatic_hall.sql'), await import('../lib/diplomatic-hall.ts')];
  for (const sql of [sqlite, pg]) {
    assert.doesNotMatch(sql.replace(/^--.*$/gm, ''), /\b(DROP|ALTER|DELETE|UPDATE|INSERT)\b/i);
    assert.deepEqual([...sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(m => m[1]), ['diplomatic_hall_messages']);
    assert.equal([...sql.matchAll(/CREATE INDEX IF NOT EXISTS/g)].length, 2);
  }
  const names = sql => [...sql.matchAll(/CREATE (?:TABLE|INDEX) IF NOT EXISTS (\w+)/g)].map(m => m[1]);
  assert.deepEqual(names(inline.hallSchema.join(';')), names(sqlite));
});

for (const backend of ['sqlite', 'postgres']) {
  test(`flag off: no route, and nothing is written (${backend})`, async t => {
    const r = await scene(t, backend, false);
    for (const res of [await hall(r, 'kay'), await post(r, 'kay', 'hello'), await hall(r), await hall(r, 'kor')]) { assert.equal(res.status, 404); assert.equal(res.data.reason, 'not_found'); }
    assert.deepEqual(await rows(r), []);
    r.setFixtureEnv('HARIMU_DIPLOMATIC_HALL_ENABLED', undefined);
    assert.equal((await hall(r, 'kay')).status, 404, 'unset means off');
  });

  test(`square responses are unchanged by the hall, flag off or on (${backend})`, async t => {
    const r = await scene(t, backend, false);
    const before = JSON.stringify([await r.call('square', 'kay'), await r.call('square', 'ava')]);
    r.setDiplomaticHall(true);
    assert.equal((await post(r, 'kay', 'to the hall')).status, 200); assert.equal((await post(r, 'ava', 'from the hall')).status, 200);
    assert.equal(JSON.stringify([await r.call('square', 'kay'), await r.call('square', 'ava')]), before);
    assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM square_messages').first()).n, 0, 'hall posts never land in the nation squares');
  });

  test(`Kindle and Aurelle citizens read each other with the right nation (${backend})`, async t => {
    const r = await scene(t, backend);
    const a = await post(r, 'kay', 'Greetings from Kindle'); assert.equal(a.status, 200);
    r.setNow(r.now + 11000);
    const b = await post(r, 'ava', 'Greetings from Aurelle'); assert.equal(b.status, 200);
    const asAurelle = (await hall(r, 'ava')).data.messages, asKindle = (await hall(r, 'kay')).data.messages;
    assert.deepEqual(asAurelle.map(m => [m.body, m.nationId, m.mine]), [['Greetings from Kindle', 'kindle', false], ['Greetings from Aurelle', 'aurelle', true]]);
    assert.deepEqual(asKindle.map(m => [m.body, m.nationId, m.mine]), [['Greetings from Kindle', 'kindle', true], ['Greetings from Aurelle', 'aurelle', false]]);
    assert.match(asKindle[0].handle, /^Citizen-[0-9a-f]{16}$/);
    assert.equal((await hall(r, 'kay')).cache, 'private, no-store');
    assert.deepEqual((await rows(r)).map(x => x.nation_id), ['kindle', 'aurelle']);
  });

  test(`Korund, other nations, visitors and citizens with no nation are refused with stable codes (${backend})`, async t => {
    const r = await scene(t, backend);
    const { hallRefusalFor } = await r.importModule('lib/diplomatic-hall-copy.ts');
    for (const user of ['kor', 'con']) for (const res of [await hall(r, user), await post(r, user, 'let me in')]) {
      assert.equal(res.status, 403, user); assert.equal(res.data.reason, 'nation_closed'); assert.equal(res.data.error, hallRefusalFor('nation_closed').line.text);
    }
    for (const res of [await hall(r), await post(r, undefined, 'hi')]) { assert.equal(res.status, 401); assert.equal(res.data.reason, 'signed_out'); assert.equal(res.data.error, hallRefusalFor('signed_out').line.text); }
    for (const res of [await hall(r, 'new'), await post(r, 'new', 'hi')]) { assert.equal(res.status, 403); assert.equal(res.data.reason, 'no_nation'); }
    assert.deepEqual(await rows(r), []);
    // a Kindle citizen who becomes Korund can neither read nor delete what they posted
    const mine = await post(r, 'kay', 'before the move'); assert.equal(mine.status, 200); const id = mine.data.messages[0].id;
    await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='kay'").run();
    assert.equal((await hall(r, 'kay')).data.reason, 'nation_closed');
    assert.equal((await r.call('diplomatic-hall', 'kay', { action: 'delete', id })).data.reason, 'nation_closed');
  });

  test(`length, plain text, rate limits and expiry match the square (${backend})`, async t => {
    const r = await scene(t, backend);
    const { hallRefusalFor } = await r.importModule('lib/diplomatic-hall-copy.ts');
    const long = await post(r, 'kay', 'x'.repeat(281)); assert.equal(long.status, 400); assert.equal(long.data.reason, 'too_long'); assert.equal(long.data.error, hallRefusalFor('too_long').line.text.replace('{max}', '280'));
    for (const text of ['', '   ', 'bad\u0007bell', 42, null]) assert.equal((await post(r, 'kay', text)).data.reason, 'bad_request');
    assert.equal((await r.call('diplomatic-hall', 'kay', { action: 'post', id: 'not-a-uuid', text: 'hi' })).data.reason, 'bad_request');
    assert.equal((await post(r, 'kay', 'x'.repeat(280))).status, 200, '280 is allowed');
    const quick = await post(r, 'kay', 'too soon'); assert.equal(quick.status, 429); assert.equal(quick.data.reason, 'rate_limit'); assert.equal(quick.data.error, hallRefusalFor('rate_limit').line.text);
    for (let n = 0; n < 19; n++) { r.setNow(r.now + 11000); assert.equal((await post(r, 'kay', `post ${n}`)).status, 200, `post ${n}`); }
    r.setNow(r.now + 11000);
    assert.equal((await post(r, 'kay', 'the twenty-first')).status, 429, '20 per hour');
    assert.equal((await post(r, 'ava', 'another citizen is not limited')).status, 200);
    // expiry: seven days later nothing is shown, GET writes nothing, and the next post purges the old rows
    r.setNow(r.now + 7 * 86400 * 1000 + 1000);
    const writes = [], prepare = r.db.prepare.bind(r.db), batch = r.db.batch.bind(r.db);
    r.db.prepare = sql => { if (/^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i.test(sql)) writes.push(sql.slice(0, 40)); return prepare(sql); }; r.db.batch = x => { writes.push('batch'); return batch(x); };
    const after = await hall(r, 'kay'); r.db.prepare = prepare; r.db.batch = batch;
    assert.deepEqual(after.data.messages, []); assert.deepEqual(writes, [], 'GET stays read-only');
    assert.ok((await rows(r)).length > 0, 'expired rows are still stored until a write');
    assert.equal((await post(r, 'kay', 'fresh')).status, 200);
    assert.deepEqual((await rows(r)).map(x => x.body), ['fresh']);
  });

  test(`same request id replays once, a reused id is refused, and delete only removes your own post (${backend})`, async t => {
    const r = await scene(t, backend);
    const id = randomUUID();
    const both = await Promise.all([post(r, 'kay', 'once', id), post(r, 'kay', 'once', id)]);
    assert.deepEqual(both.map(x => x.status), [200, 200], JSON.stringify(both.map(x => x.data)));
    assert.equal((await rows(r)).length, 1);
    assert.equal((await post(r, 'kay', 'once', id)).status, 200, 'a later replay of the same id and text');
    assert.equal((await post(r, 'kay', 'different text', id)).data.reason, 'request_reused');
    assert.equal((await post(r, 'ava', 'once', id)).data.reason, 'request_reused', 'another citizen cannot take the id');
    assert.equal((await r.call('diplomatic-hall', 'ava', { action: 'delete', id })).status, 404, 'not your post');
    const removed = await r.call('diplomatic-hall', 'kay', { action: 'delete', id }); assert.equal(removed.status, 200); assert.deepEqual(removed.data.messages, []);
    assert.deepEqual((await rows(r)).map(x => [x.body, Number(x.deleted)]), [['[removed]', 1]]);
    assert.equal((await post(r, 'kay', 'once', id)).data.reason, 'request_reused', 'a removed post keeps its id');
  });

  test(`the table itself only takes Kindle or Aurelle posts (${backend})`, async t => {
    const r = await scene(t, backend);
    await assert.rejects(() => r.db.prepare("INSERT INTO diplomatic_hall_messages(id,user_id,nation_id,body,posted_at) VALUES (?,?,?,?,?)").bind(randomUUID(), 'kor', 'korund', 'x', 1).run());
    await assert.rejects(() => r.db.prepare("INSERT INTO diplomatic_hall_messages(id,user_id,nation_id,body,posted_at) VALUES (?,?,?,?,?)").bind(randomUUID(), 'kay', 'kindle', '', 1).run());
  });
}

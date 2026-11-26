/** #1517 follow-up (QA1 nit on #1520): POST /api/square action=presence with active:true is refused
 *  while the citizen is chat-banned; clear (active:false), GET, and other citizens still work. SQLite + PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localRuntime } from './helpers/local-runtime.mjs';
import { mutantTree } from './helpers/mutant-tree.mjs';

const iso = seconds => new Date(seconds * 1000).toISOString().replace('.000Z', 'Z');

for (const backend of ['sqlite', 'postgres']) {
  test(`#1517 ${backend} square presence: a banned share/refresh is 403 chat_banned with no write and one log line; clear, GET and other citizens unaffected; sharing resumes at the end`, async t => {
    const r = await localRuntime({ backend }); t.after(() => r.close());
    const logged = [], info = console.info; console.info = (...a) => { const l = a.join(' '); if (l.includes('chat_ban_refused')) logged.push(l); else info(...a); }; t.after(() => { console.info = info; });
    const sec = () => Math.floor(r.now / 1000), later = s => r.setNow(r.now + s * 1000);
    const row = async u => r.db.prepare('SELECT user_id, expires_at FROM square_presence WHERE user_id=?').bind(u).first();
    const share = u => r.call('square', u, { action: 'presence', active: true });
    const clear = u => r.call('square', u, { action: 'presence', active: false });
    await r.call('city', 'alice'); await r.call('city', 'bob');

    for (const value of [undefined, '']) {
      r.setFixtureEnv('HARIMU_CHAT_BAN', value);
      const res = await share('alice');
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.ok(await row('alice'), `share works when var is ${String(value)}`);
      assert.equal((await clear('alice')).status, 200);
      assert.equal(await row('alice'), null);
    }

    const opened = await share('alice'); assert.equal(opened.status, 200);
    const before = await row('alice'); assert.ok(before);
    const end = sec() + 3600; r.setFixtureEnv('HARIMU_CHAT_BAN', `alice@${iso(sec() - 60)}..${iso(end)}`);

    const refused = await share('alice');
    assert.equal(refused.status, 403);
    assert.deepEqual(refused.data, { reason: 'chat_banned', error: `You can't post in chat until ${iso(end)}.` });
    const during = await row('alice');
    assert.equal(during?.expires_at, before.expires_at, 'refresh does not extend expires_at');
    assert.deepEqual(logged.map(l => JSON.parse(l)), [{ event: 'chat_ban_refused', citizenId: 'alice', channel: 'square-presence', reason: 'operator_chat_ban' }]);

    const invalid = await r.call('square', 'alice', { action: 'presence', active: 'yes' });
    assert.equal(invalid.status, 400, 'invalid active is 400 before the ban check');

    assert.equal((await clear('alice')).status, 200, 'clear still works');
    assert.equal(await row('alice'), null);
    const again = await share('alice');
    assert.equal(again.status, 403);
    assert.equal(await row('alice'), null, 'no row written after clear');
    assert.equal(logged.length, 2);

    const get = await r.call('square', 'alice');
    assert.equal(get.status, 200, 'GET stays open');
    assert.equal(get.data.present, 0);

    assert.equal((await share('bob')).status, 200, 'other citizens unaffected');
    assert.ok(await row('bob'));
    assert.equal((await r.call('square', 'alice')).data.present, 1, 'alice GET still sees bob');

    later(3600); assert.equal(sec() >= end, true);
    const after = await share('alice'); assert.equal(after.status, 200, JSON.stringify(after.data));
    assert.ok(await row('alice'));
    // bob's earlier share has expired (90s TTL) after the hour jump
    assert.equal((await r.call('square', 'alice')).data.present, 1);
  });
}

test('#1517 presence mutants: dropping the share gate, inverting it, or returning 200 instead of 403 fails the SQLite tests', { timeout: 600_000 }, () => {
  const cases = [
    { file: 'app/api/square/route.ts', find: "if(body.active){const banned=chatBanRefusal((env as unknown as {HARIMU_CHAT_BAN?:string}).HARIMU_CHAT_BAN,userId,now,'square-presence');if(banned)return privateResponse(banned,403);}", replace: '' },
    { file: 'app/api/square/route.ts', find: "if(body.active){const banned=chatBanRefusal", replace: "if(!body.active){const banned=chatBanRefusal" },
    { file: 'app/api/square/route.ts', find: "now,'square-presence');if(banned)return privateResponse(banned,403);", replace: "now,'square-presence');if(banned)return privateResponse(banned,200);" },
  ];
  const tree = mutantTree();
  try {
    for (const c of cases) {
      const restore = tree.mutate(c.file, c.find, c.replace);
      try { assert.notEqual(tree.run(['tests/chat-ban-presence.test.mjs'], '#1517 sqlite').status, 0, `mutant survived: ${c.find}`); } finally { restore(); }
    }
  } finally { tree.close(); }
});

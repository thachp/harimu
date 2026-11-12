/** #1354 (docs §18.1 Global channel): Korund citizens cannot see the global channel; Varkand citizens lose it while the stored Alert Level (#1081) is Red.
 *  The radio item and trade-delegate exceptions are out of scope (as lib/diplomatic-hall.ts). Refusals are 403 with a stable reason before any chat read or write;
 *  the alert is read only for a Varkand citizen with HARIMU_VARKAND_ALERT_ENABLED on (off: Green). No new flag, no migration. SQLite + PGlite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { localRuntime } from './helpers/local-runtime.mjs';

async function setup(t, backend, alertFlag = true) {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_GLOBAL_CHAT_ENABLED', 'true'); r.setFixtureEnv('HARIMU_VARKAND_ALERT_ENABLED', alertFlag ? 'true' : 'false');
  const iso = new Date(r.now).toISOString();
  const citizen = (user, nation) => r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,?,?,18,0,'Good standing',?,?)").bind(user, nation, `Private ${user}`, iso, iso).run();
  const post = (user, text) => r.call('global-chat', user, { action: 'post', id: randomUUID(), text });
  const later = s => r.setNow(r.now + s * 1000);
  const count = async () => Number((await r.db.prepare('SELECT COUNT(*) AS n FROM global_chat_messages').first()).n);
  const setAlert = level => r.db.prepare('INSERT INTO varkand_alert_levels (id, level, set_at) VALUES (1, ?, 1) ON CONFLICT(id) DO UPDATE SET level = excluded.level').bind(level).run();
  await citizen('kora', 'korund'); await citizen('vik', 'varkand');
  return { r, citizen, post, later, count, setAlert };
}
const refused = (res, reason, line) => { assert.equal(res.status, 403); assert.equal(res.data.reason, reason); assert.equal(res.data.error, line); assert.equal(res.data.messages, undefined, 'no feed leaks'); };
const korundLine = 'The global channel is closed to your nation.', redLine = 'The global channel is closed to your nation during a Red Alert.';

for (const backend of ['sqlite', 'postgres']) {
  test(`#1354 ${backend}: a Korund citizen cannot read or post in the global channel; other nations are unchanged`, async t => {
    const c = await setup(t, backend);
    assert.equal((await c.post('alice', 'hello from Kindle')).status, 200);
    refused(await c.r.call('global-chat', 'kora'), 'nation_closed', korundLine);
    refused(await c.post('kora', 'let me in'), 'nation_closed', korundLine);
    refused(await c.r.call('global-chat', 'kora', { action: 'delete', id: randomUUID() }), 'nation_closed', korundLine);
    assert.equal(await c.count(), 1, 'no Korund row written');
    c.later(1); const v = await c.post('vik', 'hello from Varkand'); assert.equal(v.status, 200);
    assert.deepEqual(v.data.messages.map(m => [m.body, m.nationId]), [['hello from Kindle', 'kindle'], ['hello from Varkand', 'varkand']]);
  });

  test(`#1354 ${backend}: Varkand loses the channel at Red Alert only; Amber and Green keep it; earlier posts stay for others`, async t => {
    const c = await setup(t, backend);
    await c.setAlert('green'); assert.equal((await c.post('vik', 'at green')).status, 200);
    await c.setAlert('amber'); c.later(11); assert.equal((await c.post('vik', 'at amber')).status, 200);
    await c.setAlert('red'); c.later(11);
    refused(await c.r.call('global-chat', 'vik'), 'alert_closed', redLine);
    refused(await c.post('vik', 'at red'), 'alert_closed', redLine);
    assert.equal(await c.count(), 2);
    assert.deepEqual((await c.r.call('global-chat', 'alice')).data.messages.map(m => m.body), ['at green', 'at amber'], 'other nations still read earlier Varkand posts');
    refused(await c.r.call('global-chat', 'kora'), 'nation_closed', korundLine);
    await c.setAlert('amber'); assert.equal((await c.r.call('global-chat', 'vik')).status, 200, 'back when the level drops');
  });

  test(`#1354 ${backend}: with HARIMU_VARKAND_ALERT_ENABLED off the level is Green and is not read; Korund is still closed`, async t => {
    const c = await setup(t, backend, false); await c.setAlert('red');
    const prepare = c.r.db.prepare.bind(c.r.db); const seen = []; c.r.db.prepare = sql => { seen.push(sql); return prepare(sql); };
    assert.equal((await c.post('vik', 'flag off')).status, 200);
    assert.equal((await c.r.call('global-chat', 'alice')).status, 200);
    c.r.db.prepare = prepare;
    assert.ok(!seen.some(sql => /varkand_alert_levels/.test(sql)), 'alert not read with the flag off');
    refused(await c.post('kora', 'still closed'), 'nation_closed', korundLine);
  });

  test(`#1354 ${backend}: the alert is read only for a Varkand citizen, and a refusal touches no chat table`, async t => {
    const c = await setup(t, backend); await c.setAlert('red');
    const prepare = c.r.db.prepare.bind(c.r.db); let seen = []; c.r.db.prepare = sql => { seen.push(sql); return prepare(sql); };
    assert.equal((await c.r.call('global-chat', 'alice')).status, 200);
    assert.ok(!seen.some(sql => /varkand_alert_levels/.test(sql)), 'Kindle read does not read the alert');
    for (const user of ['kora', 'vik']) {
      seen = []; assert.equal((await c.post(user, 'nope')).status, 403);
      assert.ok(!seen.some(sql => /global_chat_messages|square_handles/.test(sql)), `${user}: no chat read or write`);
    }
    c.r.db.prepare = prepare;
  });

  test(`#1354 ${backend}: the INSERT refuses a Korund author, so a move to Korund between the check and the write is refused`, async t => {
    const c = await setup(t, backend);
    const prepare = c.r.db.prepare.bind(c.r.db);
    c.r.db.prepare = sql => { if (/^INSERT INTO global_chat_messages/.test(sql)) { c.r.db.prepare = prepare; return { bind: (...a) => ({ run: async () => { await prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='alice'").run(); return prepare(sql).bind(...a).run(); } }) }; } return prepare(sql); };
    const res = await c.post('alice', 'mid-move'); c.r.db.prepare = prepare;
    refused(res, 'nation_closed', korundLine); assert.equal(await c.count(), 0);
  });
}

test('#1354: globalChatClosedFor', async () => {
  const r = await localRuntime(); try {
    const { globalChatClosedFor } = await r.importModule('lib/global-chat.ts');
    assert.equal(globalChatClosedFor('korund'), 'nation_closed'); assert.equal(globalChatClosedFor('korund', 'green'), 'nation_closed');
    assert.equal(globalChatClosedFor('varkand', 'red'), 'alert_closed');
    for (const level of ['green', 'amber']) assert.equal(globalChatClosedFor('varkand', level), null);
    for (const nation of ['kindle', 'aurelle', 'hoarvale', 'fulmara']) assert.equal(globalChatClosedFor(nation, 'red'), null, nation);
  } finally { await r.close(); }
});

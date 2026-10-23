/** #790: square chat shadow-mute via the operator var HARIMU_CHAT_SHADOW_MUTE (docs 21.3). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { localRuntime } from './helpers/local-runtime.mjs';
import { parseShadowMute, logShadowMuted } from '../lib/chat-shadow-mute.ts';

function capture(t) {
  const lines = { info: [], warn: [] }, info = console.info, warn = console.warn;
  console.info = (...a) => lines.info.push(a.join(' ')); console.warn = (...a) => lines.warn.push(a.join(' '));
  t.after(() => { console.info = info; console.warn = warn; });
  return lines;
}
async function setup(t, mute) {
  const r = await localRuntime(); t.after(() => r.close());
  await r.db.prepare("UPDATE citizens SET nation_id='kindle'").run();
  r.setFixtureEnv('HARIMU_CHAT_SHADOW_MUTE', mute);
  return r;
}
const post = async (r, user, text) => { const id = randomUUID(); const res = await r.call('square', user, { action: 'post', id, text, expectedNationId: 'kindle' }); assert.equal(res.status, 200, JSON.stringify(res.data)); return id; };
const bodies = async (r, user) => { const res = await r.call('square', user); assert.equal(res.status, 200); return res.data.messages.map(m => m.body); };

test('parse: empty mutes nobody; a list mutes its ids; malformed fails safe with one warning', () => {
  const warned = []; const w = m => warned.push(m);
  for (const empty of [undefined, null, '', '  ']) assert.equal(parseShadowMute(empty, w).size, 0);
  assert.deepEqual([...parseShadowMute(' alice , user_2X-y ', w)], ['alice', 'user_2X-y']);
  assert.equal(warned.length, 0);
  const bads = ['alice;bob', 'alice, b ob', ',,', 'x'.repeat(65), 42, 'all', 'ALL', 'true', 'False', 'alice,all', Array.from({ length: 91 }, (_, i) => `u${i}`).join(',')];
  for (const bad of bads) assert.equal(parseShadowMute(bad, w).size, 0, String(bad).slice(0, 20));
  assert.equal(warned.length, bads.length);
  assert.equal(parseShadowMute(Array.from({ length: 90 }, (_, i) => `u${i}`).join(','), w).size, 90, '90 ids: the D1 bound-parameter cap'); assert.match(warned[0], /malformed.*mutes nobody/);
  const logged = []; logShadowMuted('alice', 'm1', l => logged.push(l));
  assert.deepEqual(JSON.parse(logged[0]), { event: 'square_chat_shadow_muted', citizenId: 'alice', messageId: 'm1', reason: 'operator_shadow_mute' });
});

test('muted author sees their own message; other viewers do not; unlisted author unaffected; each suppressed post logged', async t => {
  const lines = capture(t); const r = await setup(t, 'alice');
  const muted = await post(r, 'alice', 'Fixture muted line');
  r.setNow(r.now + 2000); await post(r, 'bob', 'Fixture normal line');
  assert.deepEqual(await bodies(r, 'alice'), ['Fixture muted line', 'Fixture normal line'], 'author sees own message and others');
  assert.deepEqual(await bodies(r, 'bob'), ['Fixture normal line'], 'other viewers never see it');
  assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM square_messages WHERE id=?').bind(muted).first()).n, 1, 'still stored');
  const logs = lines.info.filter(l => l.includes('square_chat_shadow_muted')).map(l => JSON.parse(l));
  assert.deepEqual(logs, [{ event: 'square_chat_shadow_muted', citizenId: 'alice', messageId: muted, reason: 'operator_shadow_mute' }], 'one line, only for the muted author, no text');
});

test('empty var: no visible change; malformed var mutes nobody and warns', async t => {
  for (const value of ['', 'alice;bob']) {
    const lines = capture(t); const r = await setup(t, value);
    await post(r, 'alice', 'Fixture visible line');
    assert.deepEqual(await bodies(r, 'bob'), ['Fixture visible line'], JSON.stringify(value));
    assert.equal(lines.info.filter(l => l.includes('square_chat_shadow_muted')).length, 0);
    assert.equal(lines.warn.some(l => /HARIMU_CHAT_SHADOW_MUTE is malformed/.test(l)), value !== '');
  }
});

test('config: empty by default in preview and production', () => {
  const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
  for (const file of ['wrangler.jsonc', 'wrangler.prod.jsonc']) assert.equal(strip(readFileSync(file, 'utf8')).vars.HARIMU_CHAT_SHADOW_MUTE, '', file);
});

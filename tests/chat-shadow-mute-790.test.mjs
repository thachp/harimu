/** #790: square chat shadow-mute via the operator var HARIMU_CHAT_SHADOW_MUTE (docs 21.3; ARC: new messages only), entries `citizenId@ISO8601`. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { localRuntime } from './helpers/local-runtime.mjs';
import { parseShadowMute, logShadowMuted, isShadowMuted, SHADOW_MUTE_MAX_IDS } from '../lib/chat-shadow-mute.ts';

const iso = seconds => new Date(seconds * 1000).toISOString();
const entries = n => Array.from({ length: n }, (_, i) => `u${i}@2026-10-23T07:00:00Z`).join(',');
function capture(t) {
  const lines = { info: [], warn: [] }, info = console.info, warn = console.warn;
  console.info = (...a) => lines.info.push(a.join(' ')); console.warn = (...a) => lines.warn.push(a.join(' '));
  t.after(() => { console.info = info; console.warn = warn; });
  return lines;
}
async function setup(t) {
  const r = await localRuntime(); t.after(() => r.close());
  await r.db.prepare("UPDATE citizens SET nation_id='kindle'").run();
  return r;
}
const sec = r => Math.floor(r.now / 1000);
const post = async (r, user, text) => { const id = randomUUID(); const res = await r.call('square', user, { action: 'post', id, text, expectedNationId: 'kindle' }); assert.equal(res.status, 200, JSON.stringify(res.data)); r.setNow(r.now + 11000); return id; };
const bodies = async (r, user) => { const res = await r.call('square', user); assert.equal(res.status, 200); return res.data.messages.map(m => m.body); };

test('parse: id@ISO8601 entries only; bare ids, switch words, bad times, duplicates and over 90 entries fail safe with a warning', () => {
  const warned = []; const w = m => warned.push(m);
  for (const empty of [undefined, null, '', '  ']) assert.equal(parseShadowMute(empty, w).size, 0);
  const m = parseShadowMute(' alice@2026-10-23T07:00:00Z , user_2X-y@2026-10-23T09:30:00+02:00 ', w);
  assert.deepEqual([...m], [['alice', Date.parse('2026-10-23T07:00:00Z') / 1000], ['user_2X-y', Date.parse('2026-10-23T07:30:00Z') / 1000]]);
  assert.equal(warned.length, 0);
  const bads = ['alice', 'alice,bob', 'all', 'ALL', 'true', 'False', 'all@2026-10-23T07:00:00Z', 'alice@', 'alice@yesterday', 'alice@2026-10-23', 'alice@2026-10-23T07:00:00',
    'alice@2026-13-45T07:00:00Z', 'a b@2026-10-23T07:00:00Z', 'alice@2026-10-23T07:00:00Z,alice@2026-10-24T07:00:00Z', ',,', 42, entries(91)];
  for (const bad of bads) assert.equal(parseShadowMute(bad, w).size, 0, String(bad).slice(0, 30));
  assert.equal(warned.length, bads.length); assert.match(warned[0], /bare ids are refused.*mutes nobody/);
  assert.equal(SHADOW_MUTE_MAX_IDS, 90); assert.equal(parseShadowMute(entries(90), w).size, 90, '90 entries: the D1 bound-parameter cap');
  const at = 1000; assert.equal(isShadowMuted(new Map([['a', at]]), 'a', at - 1), false); assert.equal(isShadowMuted(new Map([['a', at]]), 'a', at), true); assert.equal(isShadowMuted(new Map([['a', at]]), 'b', at), false);
  const logged = []; logShadowMuted('alice', 'm1', l => logged.push(l));
  assert.deepEqual(JSON.parse(logged[0]), { event: 'square_chat_shadow_muted', citizenId: 'alice', messageId: 'm1', reason: 'operator_shadow_mute' });
});

test('new messages only: earlier posts stay visible; posts at or after mutedAt are hidden from others, shown to the author, logged once each', async t => {
  const lines = capture(t); const r = await setup(t);
  await post(r, 'alice', 'Fixture before mute');
  const mutedAt = sec(r);
  r.setFixtureEnv('HARIMU_CHAT_SHADOW_MUTE', `alice@${iso(mutedAt)}`);
  const hidden = await post(r, 'alice', 'Fixture after mute');
  await post(r, 'bob', 'Fixture normal line');
  assert.deepEqual(await bodies(r, 'alice'), ['Fixture before mute', 'Fixture after mute', 'Fixture normal line'], 'author sees everything of their own');
  assert.deepEqual(await bodies(r, 'bob'), ['Fixture before mute', 'Fixture normal line'], 'others see the pre-mute post, not the new one');
  assert.equal((await r.db.prepare('SELECT COUNT(*) AS n FROM square_messages WHERE id=?').bind(hidden).first()).n, 1, 'still stored');
  const logs = lines.info.filter(l => l.includes('square_chat_shadow_muted')).map(l => JSON.parse(l));
  assert.deepEqual(logs, [{ event: 'square_chat_shadow_muted', citizenId: 'alice', messageId: hidden, reason: 'operator_shadow_mute' }]);
  // Documented limit (no table, no migration): removing the entry shows the posts hidden during the mute again.
  r.setFixtureEnv('HARIMU_CHAT_SHADOW_MUTE', '');
  assert.deepEqual(await bodies(r, 'bob'), ['Fixture before mute', 'Fixture after mute', 'Fixture normal line']);
});

test('a future mutedAt hides nothing yet; 90 entries (two pre-mute chunks) keep the feed working', async t => {
  const r = await setup(t);
  r.setFixtureEnv('HARIMU_CHAT_SHADOW_MUTE', `alice@${iso(sec(r) + 86400)}`);
  await post(r, 'alice', 'Fixture early line');
  assert.deepEqual(await bodies(r, 'bob'), ['Fixture early line']);
  const list = Array.from({ length: 89 }, (_, i) => `u${i}@${iso(sec(r))}`).concat(`alice@${iso(sec(r))}`).join(',');
  r.setFixtureEnv('HARIMU_CHAT_SHADOW_MUTE', list);
  await post(r, 'alice', 'Fixture muted line');
  assert.deepEqual(await bodies(r, 'bob'), ['Fixture early line'], 'pre-mute post found through the chunked lookup; new post hidden');
});

test('empty var: no visible change; malformed var (bare id) mutes nobody and warns', async t => {
  for (const value of ['', 'alice']) {
    const lines = capture(t); const r = await setup(t); r.setFixtureEnv('HARIMU_CHAT_SHADOW_MUTE', value);
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

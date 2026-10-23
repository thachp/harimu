/** #790: square chat shadow-mute via the operator var HARIMU_CHAT_SHADOW_MUTE (docs 21.3; ARC: new messages only), entries `citizenId@ISO8601`. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { localRuntime } from './helpers/local-runtime.mjs';
import { parseShadowMute, logShadowMuted, isShadowMuted, visibleIntervals, SHADOW_MUTE_MAX_IDS } from '../lib/chat-shadow-mute.ts';

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

test('parse: id@mute or id@mute..unmute windows; duplicates allowed; bare ids, switch words, bad/inverted/overlapping windows and over 90 fail safe', () => {
  const warned = []; const w = m => warned.push(m);
  const T = h => `2026-10-23T${String(h).padStart(2, '0')}:00:00Z`, S = h => Date.parse(T(h)) / 1000;
  for (const empty of [undefined, null, '', '  ', ',', ' , ,']) assert.equal(parseShadowMute(empty, w).size, 0);
  const m = parseShadowMute(` alice@${T(9)}..${T(10)} , bob@2026-10-23T09:30:00+02:00, alice@${T(10)}..${T(11)},alice@${T(12)}, `, w);
  assert.deepEqual(m.get('alice'), [{ from: S(9), to: S(10) }, { from: S(10), to: S(11) }, { from: S(12), to: null }], 'sorted; touching windows are fine; trailing comma ignored');
  assert.deepEqual(m.get('bob'), [{ from: S(7) + 1800, to: null }]);
  assert.equal(warned.length, 0);
  const bads = ['alice', 'alice,bob', 'all', 'ALL', 'true', 'False', `all@${T(7)}`, 'alice@', 'alice@yesterday', 'alice@2026-10-23', 'alice@2026-10-23T07:00:00',
    `alice@${T(9)}..`, `alice@${T(9)}..${T(9)}`, `alice@${T(10)}..${T(9)}`, `alice@${T(9)}..${T(11)}..${T(12)}`, `alice@${T(9)}..${T(11)},alice@${T(10)}`,
    `alice@${T(9)},alice@${T(12)}..${T(13)}`, `alice@${T(9)},alice@${T(10)}`, `a b@${T(7)}`, 42, entries(91), `${entries(89)},alice@${T(1)}..${T(2)},alice@${T(3)}`];
  for (const bad of bads) assert.equal(parseShadowMute(bad, w).size, 0, String(bad).slice(0, 40));
  assert.equal(warned.length, bads.length); assert.match(warned[0], /bare ids are refused.*mutes nobody/);
  assert.equal(SHADOW_MUTE_MAX_IDS, 90); assert.equal(parseShadowMute(entries(90), w).size, 90, '90 entries: the D1 bound-parameter cap');
  const win = new Map([['a', [{ from: 100, to: 200 }, { from: 300, to: null }]]]);
  for (const [t, want] of [[99, false], [100, true], [199, true], [200, false], [299, false], [300, true], [9e9, true]]) assert.equal(isShadowMuted(win, 'a', t), want, String(t));
  assert.equal(isShadowMuted(win, 'b', 150), false);
  assert.deepEqual(visibleIntervals(win.get('a'), 1000), [[0, 100], [200, 300]]);
  assert.deepEqual(visibleIntervals([{ from: 0, to: 50 }], 1000), [[50, 1000]]);
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
  // Unmute by closing the window: the post made during the mute stays hidden; a post after the unmute is visible.
  const unmutedAt = sec(r);
  r.setFixtureEnv('HARIMU_CHAT_SHADOW_MUTE', `alice@${iso(mutedAt)}..${iso(unmutedAt)}`);
  await post(r, 'alice', 'Fixture after unmute');
  assert.deepEqual(await bodies(r, 'bob'), ['Fixture before mute', 'Fixture normal line', 'Fixture after unmute'], 'still hidden after the unmute');
  assert.deepEqual(await bodies(r, 'alice'), ['Fixture before mute', 'Fixture after mute', 'Fixture normal line', 'Fixture after unmute']);
  // Documented (no table, by ARC's ruling): deleting the entry instead of closing it reveals that window again.
  r.setFixtureEnv('HARIMU_CHAT_SHADOW_MUTE', '');
  assert.equal((await bodies(r, 'bob')).includes('Fixture after mute'), true);
});

test('a future mutedAt hides nothing yet; 90 entries incl. many windows of one citizen (several 32-term batches) keep the feed exact', async t => {
  const r = await setup(t);
  r.setFixtureEnv('HARIMU_CHAT_SHADOW_MUTE', `alice@${iso(sec(r) + 86400)}`);
  await post(r, 'alice', 'Fixture early line');
  assert.deepEqual(await bodies(r, 'bob'), ['Fixture early line']);
  // 50 closed one-second windows for alice in the past, 39 other citizens, then alice's active mute: 90 entries, 51 + 39 visible-interval terms.
  const base = sec(r) - 100000;
  const windows = Array.from({ length: 50 }, (_, i) => `alice@${iso(base + 10 * i)}..${iso(base + 10 * i + 1)}`);
  const list = [...windows, ...Array.from({ length: 39 }, (_, i) => `u${i}@${iso(base)}`), `alice@${iso(sec(r))}`].join(',');
  r.setFixtureEnv('HARIMU_CHAT_SHADOW_MUTE', list);
  await post(r, 'alice', 'Fixture muted line');
  assert.deepEqual(await bodies(r, 'bob'), ['Fixture early line'], 'pre-mute post found through the batched lookup; new post hidden');
});

test('empty var: no visible change; malformed var (bare id) mutes nobody and warns', async t => {
  for (const value of ['', ',', 'alice']) {
    const lines = capture(t); const r = await setup(t); r.setFixtureEnv('HARIMU_CHAT_SHADOW_MUTE', value);
    await post(r, 'alice', 'Fixture visible line');
    assert.deepEqual(await bodies(r, 'bob'), ['Fixture visible line'], JSON.stringify(value));
    assert.equal(lines.info.filter(l => l.includes('square_chat_shadow_muted')).length, 0);
    assert.equal(lines.warn.some(l => /HARIMU_CHAT_SHADOW_MUTE is malformed/.test(l)), !['', ','].includes(value));
  }
});

test('config: empty by default in preview and production', () => {
  const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
  for (const file of ['wrangler.jsonc', 'wrangler.prod.jsonc']) assert.equal(strip(readFileSync(file, 'utf8')).vars.HARIMU_CHAT_SHADOW_MUTE, '', file);
});

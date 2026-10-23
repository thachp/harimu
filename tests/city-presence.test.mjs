import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { presenceRoster, parsePresenceMessage, isFresh, cityPresenceKey, presenceEnabled } from '../lib/city-presence.ts';
import { presenceUpgrade } from '../lib/city-presence.ts';

test('roster dedupes accounts, is pseudonymous and capped', () => {
  const members = Array.from({ length: 60 }, (_, i) => ({ id: `u${i}`, name: `H${String(i).padStart(2, '0')}`, nationId: 'kindle' }));
  const r = presenceRoster('kindle:forgehaven', [...members, members[0]]);
  assert.equal(r.count, 60); assert.equal(r.members.length, 50); assert.equal(r.truncated, true);
  assert.ok(r.members.every(m => !('id' in m)));
  assert.deepEqual(parsePresenceMessage(JSON.stringify(r)), r);
  assert.equal(parsePresenceMessage('nope'), null); assert.equal(parsePresenceMessage('{"type":"x"}'), null);
});
test('heartbeat freshness and flag parsing fail closed', () => {
  assert.equal(isFresh(1000, 61_000), true); assert.equal(isFresh(1000, 61_001), false); assert.equal(isFresh(null, 1), false);
  assert.equal(presenceEnabled(undefined), false); assert.equal(presenceEnabled('1'), false); assert.equal(presenceEnabled('true'), true);
  assert.equal(cityPresenceKey('kindle', 'forgehaven'), 'kindle:forgehaven');
});

const forwarded = [];
const namespace = { idFromName: name => ({ name }), get: id => ({ fetch: async req => { forwarded.push({ id, headers: Object.fromEntries(req.headers) }); return new Response('ok', { status: 200 }); } }) };
const db = { prepare: () => ({ bind: user => ({ first: async () => user === 'alice' ? { nation_id: 'kindle', handle: 'Ember-12' } : null }) }) };
const deps = (user) => ({ authenticatedUserId: async () => user, getDatabase: async () => db, readCityLocation: async () => ({ nationId: 'kindle', homeCityId: 'forgehaven', currentCityId: 'forgehaven' }) });
const req = (headers = {}) => new Request('https://preview.harimu.com/api/presence/ws', { headers: { Upgrade: 'websocket', Origin: 'https://preview.harimu.com', ...headers } });

test('flag off or missing binding returns 404 without touching auth', async () => {
  let called = false; const d = { ...deps('alice'), authenticatedUserId: async () => { called = true; return 'alice'; } };
  assert.equal((await presenceUpgrade(req(), { HARIMU_REALTIME_PRESENCE: 'false', CITY_PRESENCE: namespace }, d)).status, 404);
  assert.equal((await presenceUpgrade(req(), { HARIMU_REALTIME_PRESENCE: 'true' }, d)).status, 404);
  assert.equal(called, false);
});
test('unauthorized, non-citizen, cross-origin and non-upgrade sockets are rejected', async () => {
  const on = { HARIMU_REALTIME_PRESENCE: 'true', CITY_PRESENCE: namespace };
  assert.equal((await presenceUpgrade(req(), on, deps(null))).status, 401);
  assert.equal((await presenceUpgrade(req(), on, deps('bob'))).status, 403);
  assert.equal((await presenceUpgrade(req({ Origin: 'https://evil.example' }), on, deps('alice'))).status, 403);
  assert.equal((await presenceUpgrade(new Request('https://preview.harimu.com/api/presence/ws', { headers: { Origin: 'https://preview.harimu.com' } }), on, deps('alice'))).status, 426);
  assert.equal(forwarded.length, 0);
});
test('authorized socket routes to its nation:city object with server-set identity headers', async () => {
  const on = { HARIMU_REALTIME_PRESENCE: 'true', CITY_PRESENCE: namespace };
  const res = await presenceUpgrade(req({ 'X-Harimu-Presence-User': 'mallory', 'X-Harimu-Presence-City': 'korund:x' }), on, deps('alice'));
  assert.equal(res.status, 200);
  const f = forwarded.at(-1);
  assert.deepEqual(f.id, { name: 'kindle:forgehaven' });
  assert.equal(f.headers['x-harimu-presence-user'], 'alice'); assert.equal(f.headers['x-harimu-presence-city'], 'kindle:forgehaven');
  assert.equal(f.headers['x-harimu-presence-name'], 'Ember-12');
});
test('wrangler binds the Durable Object; both flags on in preview, off in production', async () => {
  const cfg = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.match(cfg, /"main": "\.\/worker\/entry\.ts"/);
  assert.match(cfg, /"name": "CITY_PRESENCE", "class_name": "CityPresence"/);
  assert.match(cfg, /"new_sqlite_classes": \["CityPresence"\]/);
  assert.match(cfg, /"HARIMU_REALTIME_PRESENCE": "true"/); assert.match(cfg, /"NEXT_PUBLIC_HARIMU_REALTIME_PRESENCE": "true"/);
  const prod = await readFile(new URL('../wrangler.prod.jsonc', import.meta.url), 'utf8');
  assert.match(prod, /"HARIMU_REALTIME_PRESENCE": "false"/); assert.match(prod, /"NEXT_PUBLIC_HARIMU_REALTIME_PRESENCE": "false"/);
});

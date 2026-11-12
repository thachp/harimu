/** #1371: founding a city needs an expedition of at least 10 citizens of that nation. SQLite and PGlite. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { FLAG_PACKS, flagOn } from '../lib/flag-pack.mjs';
import { localRuntime } from './helpers/local-runtime.mjs';

const FLAG = 'HARIMU_CITY_EXPEDITION_ENABLED';
const strip = text => JSON.parse(text.replace(/^\s*\/\/.*$/gm, ''));
const found = (r, requestId = 'found-expedition01') => r.call('world/found-city', 'alice', { action: 'kindle-charter', x: 21, y: 13, name: 'Emberford', requestId });
const cities = async r => Number((await r.db.prepare('SELECT COUNT(*) AS n FROM world_cities').first()).n);
const blockOwned = async r => Number((await r.db.prepare("SELECT COUNT(*) AS n FROM world_squares WHERE x BETWEEN 19 AND 23 AND y BETWEEN 11 AND 15 AND owner IS NOT NULL").first()).n);

async function kindle(r, n) {
  const iso = new Date(r.now).toISOString();
  const have = Number((await r.db.prepare("SELECT COUNT(*) AS n FROM citizens WHERE nation_id='kindle'").first()).n);
  for (let i = have; i < n; i++) await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,'kindle',?,18,0,'Good standing',?,?)").bind(`exp-${i}`, `Exp ${i}`, iso, iso).run();
}

test('the flag is last in HARIMU_GRAY_PACK at index 89, preview on and production off, and is not its own binding', () => {
  const preview = strip(readFileSync('wrangler.jsonc', 'utf8')), prod = strip(readFileSync('wrangler.prod.jsonc', 'utf8'));
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf('HARIMU_PARTY_CHAT_ENABLED'), 88);
  assert.equal(FLAG_PACKS.HARIMU_GRAY_PACK.indexOf(FLAG), 89);
  assert.equal(preview.vars[FLAG], undefined); assert.equal(prod.vars[FLAG], undefined);
  assert.equal(preview.vars.HARIMU_GRAY_PACK[FLAG], 'true'); assert.equal(prod.vars.HARIMU_GRAY_PACK[FLAG], 'false');
  assert.equal(flagOn({ HARIMU_GRAY_PACK: preview.vars.HARIMU_GRAY_PACK, [FLAG]: 'false' }, FLAG), false, 'a direct string wins');
  assert.equal(Object.keys(preview.vars.HARIMU_GRAY_PACK).indexOf(FLAG), 89);
  assert.equal(Object.keys(prod.vars.HARIMU_GRAY_PACK).indexOf(FLAG), 89);
});

for (const backend of ['sqlite', 'postgres']) test(`expedition headcount (${backend})`, async t => {
  const r = await localRuntime({ backend }); t.after(() => r.close());
  r.setCityFounding(true);
  const prepare = r.db.prepare.bind(r.db);
  r.setFixtureEnv(FLAG, 'false');
  await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='bob'").run();
  const off = []; r.db.prepare = sql => { off.push(sql); return prepare(sql); };
  const alone = await found(r, 'found-expedition-off');
  r.db.prepare = prepare;
  assert.equal(alone.status, 200, JSON.stringify(alone.data));
  assert.equal(off.some(sql => /COUNT\(\*\) FROM citizens/.test(sql)), false, 'flag off: founding SQL has no citizen count');
  await r.db.prepare('DELETE FROM world_cities').run();
  await r.db.prepare("UPDATE world_squares SET owner=NULL, zone='wildlands', feature=NULL WHERE x BETWEEN 19 AND 23 AND y BETWEEN 11 AND 15").run();

  r.setFixtureEnv(FLAG, 'true');
  await kindle(r, 9);
  const seen = []; r.db.prepare = sql => { seen.push(sql); return prepare(sql); };
  const short = await found(r, 'found-expedition-9');
  r.db.prepare = prepare;
  assert.equal(short.data.reason, 'expedition_short', JSON.stringify(short.data));
  assert.match(short.data.error, /at least 10 citizens/);
  assert.match(seen.find(sql => sql.startsWith('INSERT INTO world_cities')), /COUNT\(\*\) FROM citizens WHERE nation_id=\?\)>=10/);
  assert.equal(await cities(r), 0); assert.equal(await blockOwned(r), 0);

  await kindle(r, 10);
  const batch = r.db.batch.bind(r.db);
  r.db.batch = async statements => { await prepare("DELETE FROM citizens WHERE clerk_user_id='exp-9'").run(); return batch(statements); };
  const raced = await found(r, 'found-expedition-race');
  r.db.batch = batch;
  assert.equal(raced.data.reason, 'expedition_short', JSON.stringify(raced.data));
  assert.equal(await cities(r), 0); assert.equal(await blockOwned(r), 0);

  await kindle(r, 10);
  const ok = await found(r, 'found-expedition-10');
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.claimed, 25);
  assert.equal((await r.db.prepare("SELECT zone,owner FROM world_squares WHERE x=21 AND y=13").first()).owner, 'kindle');
  assert.equal(await cities(r), 1);
});

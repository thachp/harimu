/** #309: formal war declarations behind HARIMU_WAR_ENABLED. 48-real-hour mobilization, Founding Period, NAP and peace locks, all with a fixed clock. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { localRuntime } from './helpers/local-runtime.mjs';
import { cleanLabel, declarationBlock, foundingPeriodEnd, inFoundingPeriod, mobilizationEnd, pairKey, peaceLockEnd, warConfig, warStatus } from '../lib/war-rules.ts';

const H = 3600, D = 86400;

test('pure rules: 48 real hours, 30-day Founding Period, 10-day peace lock, each boundary exact', () => {
  assert.equal(warConfig.mobilizationSeconds, 48 * H); assert.equal(warConfig.foundingPeriodSeconds, 30 * D); assert.equal(warConfig.peaceLockSeconds, 10 * D);
  const war = { declaredAt: 1000, mobilizationEndsAt: mobilizationEnd(1000), endedAt: null };
  assert.equal(war.mobilizationEndsAt, 1000 + 48 * H);
  assert.equal(warStatus(war, 1000), 'mobilizing'); assert.equal(warStatus(war, 1000 + 48 * H - 1), 'mobilizing', 'one second early');
  assert.equal(warStatus(war, 1000 + 48 * H), 'active', 'exactly 48 hours after declaration'); assert.equal(warStatus(war, 1000 + 99 * D), 'active');
  assert.equal(warStatus({ ...war, endedAt: 2000 }, 1500), 'ended');
  const start = 5_000_000;
  assert.equal(inFoundingPeriod(start, start), true); assert.equal(inFoundingPeriod(start, foundingPeriodEnd(start) - 1), true);
  assert.equal(inFoundingPeriod(start, foundingPeriodEnd(start)), false, 'the 30 days are over at exactly day 30');
  assert.equal(inFoundingPeriod(null, start + 999 * D), true, 'an unknown shard start fails closed');
  const open = { now: start + 31 * D, shardStartedAt: start, nonAggression: false, lastTreatyEndedAt: null };
  assert.equal(declarationBlock(open), null);
  assert.equal(declarationBlock({ ...open, now: start + 29 * D }), 'founding_period');
  assert.equal(declarationBlock({ ...open, nonAggression: true }), 'non_aggression');
  assert.equal(declarationBlock({ ...open, lastTreatyEndedAt: open.now - 10 * D + 1 }), 'peace_lock', 'one second before the lock ends');
  assert.equal(declarationBlock({ ...open, lastTreatyEndedAt: open.now - 10 * D }), null, 'locked for 10 real days, not 10 days and a second');
  assert.equal(peaceLockEnd(100), 100 + 10 * D);
  assert.equal(declarationBlock({ ...open, now: start + D, nonAggression: true, lastTreatyEndedAt: start }), 'founding_period', 'Founding Period is checked first');
  assert.equal(pairKey('korund', 'aurelle'), pairKey('aurelle', 'korund'));
  assert.equal(cleanLabel('  Border <b>incidents</b>\n\tat\u0007 the pass  ', 40), 'Border b incidents /b at the pass');
  assert.equal(cleanLabel('x'.repeat(100), 40).length, 40); assert.equal(cleanLabel(42, 40), '');
});

test('the war flag defaults to "false" in wrangler.jsonc and migration 0031 only adds a table', async () => {
  const cfg = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.deepEqual([...cfg.matchAll(/"HARIMU_WAR_ENABLED"\s*:\s*"([^"]*)"/g)].map(m => m[1]), ['false']);
  for (const file of ['../drizzle/0031_wars.sql', '../db/postgres/0031_wars.sql']) {
    const sql = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.doesNotMatch(sql, /\b(DROP|ALTER|RENAME|DELETE|UPDATE)\b/i, file); assert.match(sql, /CREATE TABLE IF NOT EXISTS wars/);
  }
  // No route can declare a war: declarations come only from server code (the AI leadership path).
  const walk = async dir => (await Promise.all((await readdir(dir, { withFileTypes: true })).map(e => e.isDirectory() ? walk(new URL(`${e.name}/`, dir)) : [new URL(e.name, dir)]))).flat();
  for (const file of await walk(new URL('../app/', import.meta.url))) if (/\.(ts|tsx)$/.test(file.pathname)) assert.doesNotMatch(await readFile(file, 'utf8'), /declareWar|endWar/, file.pathname);
});

async function setup(t, { flag = true, shardDaysAgo = 31 } = {}) {
  const r = await localRuntime(); t.after(() => r.close());
  const nowS = () => Math.floor(r.now / 1000);
  if (shardDaysAgo !== null) r.setFixtureEnv('HARIMU_SHARD_STARTED_AT', String(nowS() - shardDaysAgo * D));
  const war = await r.importModule('lib/war.ts');
  const declare = (over = {}, now = nowS(), options = {}) => war.declareWar(r.db, { attacker: 'kindle', defender: 'korund', casusBelli: 'Border incidents', declaredBy: 'AI President', requestId: randomUUID(), ...over }, now, { enabled: flag, ...options });
  const rows = async () => (await r.db.prepare('SELECT * FROM wars ORDER BY declared_at,id').all()).results.map(x => ({ ...x }));
  return { r, war, declare, rows, nowS };
}

test('flag off: nothing is declared, read or shown', async t => {
  const { r, declare, rows } = await setup(t, { flag: false });
  const res = await declare();
  assert.equal(res.ok, false); assert.equal(res.reason, 'disabled'); assert.deepEqual(await rows(), []);
  const world = await r.call('world', null);
  assert.equal(world.status, 200); assert.equal('wars' in world.data.simulation, false, 'no war state is sent while the flag is off');
  await r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES ('kim','kindle','Kim',18,0,'Good standing','2026-10-14T00:00:00Z','2026-10-14T00:00:00Z')").run();
  const news = (await r.call('news', 'kim')).data;
  assert.ok(!news.items.some(i => i.id.startsWith('war:')));
});

test('Founding Period: declarations are refused in the first 30 real days, allowed from day 30', async t => {
  const { r, declare, rows, nowS } = await setup(t, { shardDaysAgo: 29 });
  const blocked = await declare();
  assert.equal(blocked.status, 409); assert.equal(blocked.reason, 'founding_period'); assert.match(blocked.error, /Founding Period, a shard's first 30 days/);
  assert.deepEqual(await rows(), []);
  r.setNow(r.now + D * 1000 - 1000); // one second short of day 30
  assert.equal((await declare()).reason, 'founding_period');
  r.setNow(r.now + 1000); // exactly day 30
  assert.equal((await declare()).ok, true);
  assert.equal((await rows()).length, 1);
  void nowS;
});

test('an unknown shard start fails closed; the world clock epoch is the fallback start', async t => {
  const { r, declare, war } = await setup(t, { shardDaysAgo: null });
  assert.equal(await war.shardStartedAt(r.db, undefined), null, 'no clock row yet');
  assert.equal((await declare()).reason, 'founding_period');
  await r.db.prepare("INSERT INTO world_clock (id,epoch_seconds) VALUES ('main',?) ON CONFLICT(id) DO UPDATE SET epoch_seconds=excluded.epoch_seconds").bind(Math.floor(r.now / 1000) - 31 * D).run();
  assert.equal(await war.shardStartedAt(r.db, 'not a date'), Math.floor(r.now / 1000) - 31 * D, 'an invalid setting falls back to the world clock');
  assert.equal((await declare()).ok, true);
});

test('declaration: 48-hour mobilization, derived status, idempotent request id, sanitized label, one open war per pair', async t => {
  const { r, war, declare, rows, nowS } = await setup(t);
  const requestId = randomUUID(); const at = nowS();
  const made = await declare({ requestId, casusBelli: '<b>Border   incidents</b> ' + 'x'.repeat(80), declaredBy: 'AI President' });
  assert.equal(made.ok, true, JSON.stringify(made));
  assert.equal(made.war.status, 'mobilizing'); assert.equal(made.war.mobilizationEndsAt, at + 48 * H); assert.ok(made.war.casusBelli.length <= 40); assert.doesNotMatch(made.war.casusBelli, /[<>]/);
  const [row] = await rows(); assert.equal(Number(row.mobilization_ends_at) - Number(row.declared_at), 48 * H); assert.equal(row.ended_at, null);
  assert.equal((await declare({ requestId })).replay, true);
  assert.equal((await declare({ requestId, attacker: 'aurelle' })).reason, 'request_reused');
  assert.equal((await declare({ attacker: 'korund', defender: 'kindle' })).reason, 'war_exists', 'either direction');
  assert.equal((await declare({ attacker: 'kindle', defender: 'kindle' })).reason, 'bad_nations');
  assert.equal((await declare({ attacker: 'kindle', defender: 'varkand' })).reason, 'bad_nations');
  assert.equal((await declare({ requestId: 'short' })).reason, 'bad_request');
  assert.equal((await declare({ declaredBy: '  ' })).reason, 'bad_request');
  assert.equal((await declare({ attacker: 'aurelle', defender: 'korund' })).ok, true, 'another pair is independent');
  // Derived on read: no write turns mobilizing into active.
  const writes = []; const prepare = r.db.prepare.bind(r.db), batch = r.db.batch.bind(r.db);
  r.db.prepare = sql => { if (/^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i.test(sql)) writes.push(sql.slice(0, 50)); return prepare(sql); };
  r.db.batch = s => { writes.push('batch'); return batch(s); };
  try {
    const before = (await war.readWars(r.db, at + 48 * H - 1)).wars.find(w => w.id === made.war.id);
    const after = (await war.readWars(r.db, at + 48 * H)).wars.find(w => w.id === made.war.id);
    assert.equal(before.status, 'mobilizing'); assert.equal(after.status, 'active', 'exactly 48 real hours after the declaration');
    assert.deepEqual((await war.readWars(r.db, at)).foundingPeriodEndsAt, at - 31 * D + 30 * D);
    war.warNewsItems((await war.readWars(r.db, at)).wars, 'kindle');
  } finally { r.db.prepare = prepare; r.db.batch = batch; }
  assert.deepEqual(writes, [], 'reads never write');
});

test('non-aggression pact and peace lock each refuse a declaration (fixed clock)', async t => {
  const { r, declare, rows, nowS } = await setup(t);
  const pact = await declare({}, nowS(), { nonAggression: async (_db, a, b) => [a, b].sort().join() === 'korund,kindle'.split(',').sort().join() });
  assert.equal(pact.status, 409); assert.equal(pact.reason, 'non_aggression'); assert.match(pact.error, /non-aggression pact with Korund is in force/);
  assert.equal((await declare({ attacker: 'kindle', defender: 'aurelle' }, nowS(), { nonAggression: () => false })).ok, true, 'a pact only covers its own signatories');
  assert.equal((await declare({ attacker: 'aurelle', defender: 'korund' })).ok, true, 'the default stub reports no pact');
  assert.deepEqual((await rows()).map(x => x.pair_key).sort(), ['aurelle:kindle', 'aurelle:korund']);
  // Peace: a ceasefire or peace treaty locks declarations between the pair for 10 real days.
  const war = (await rows()).find(x => x.pair_key === 'aurelle:korund');
  const { endWar } = await r.importModule('lib/war.ts');
  const peaceAt = nowS() + 5 * D;
  assert.equal((await endWar(r.db, war.id, 'treaty', peaceAt, true)).war.peaceLockEndsAt, peaceAt + 10 * D);
  const again = (now) => declare({ attacker: 'korund', defender: 'aurelle' }, now);
  const early = await again(peaceAt + 10 * D - 1);
  assert.equal(early.status, 409); assert.equal(early.reason, 'peace_lock'); assert.match(early.error, /recent peace treaty with Aurelle/);
  assert.equal((await again(peaceAt + 10 * D)).ok, true, 'the lock lasts exactly 10 real days');
  // Another ending does not lock.
  const second = (await rows()).find(x => x.pair_key === 'aurelle:kindle');
  await endWar(r.db, second.id, 'other', peaceAt, true);
  assert.equal((await declare({ attacker: 'kindle', defender: 'aurelle' }, peaceAt + 1)).ok, true);
  assert.equal((await endWar(r.db, 'missing', 'other', peaceAt, true)).reason, 'not_found');
  assert.equal((await endWar(r.db, second.id, 'other', peaceAt, false)).reason, 'disabled');
});

test('world snapshot and national news show the war in each nation\'s voice, read-only', async t => {
  const { r, war, declare, nowS } = await setup(t);
  r.setFixtureEnv('HARIMU_WAR_ENABLED', 'true');
  const citizen = (id, nation) => r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,?,?,18,0,'Good standing','2026-10-14T00:00:00Z','2026-10-14T00:00:00Z')").bind(id, nation, id).run();
  await citizen('kim', 'kindle'); await citizen('kai', 'korund'); await citizen('ava', 'aurelle');
  const at = nowS(); const made = await declare({ casusBelli: 'Border incidents' }, at);
  assert.equal(made.ok, true);
  const titles = async user => (await r.call('news', user)).data.items.filter(i => i.id.startsWith('war:'));
  const kindle = await titles('kim'); assert.equal(kindle.length, 1); assert.equal(kindle[0].title, 'Kindle declares war'); assert.match(kindle[0].text, /Korund, citing Border incidents\. Nothing can happen for 48 real hours/);
  const korund = await titles('kai'); assert.equal(korund[0].title, 'War declared on Korund'); assert.match(korund[0].text, /Kindle declares war over Border incidents/);
  const aurelle = await titles('ava'); assert.equal(aurelle[0].title, 'War declared beyond the realm'); assert.equal(aurelle[0].kind, 'decree'); assert.match(aurelle[0].text, /Kindle declares war on Korund/);
  assert.equal((await r.call('world', null)).data.simulation.wars.wars[0].status, 'mobilizing');
  // 48 real hours later: the mobilization-ended line, and the snapshot says active.
  r.setNow(r.now + 48 * H * 1000);
  const later = await titles('kim'); assert.deepEqual(later.map(i => i.title).sort(), ['Kindle declares war', 'Mobilization is over']);
  assert.equal((await r.call('world', null)).data.simulation.wars.wars[0].status, 'active');
  // #334 mobilization-ended copy, per nation voice: the attacker, the defender, and the third nation.
  const korundLater = (await titles('kai')).find(i => i.id.endsWith(':mobilized')); assert.equal(korundLater.title, 'The war on Korund is active'); assert.equal(korundLater.kind, 'template');
  const aurelleLater = (await titles('ava')).find(i => i.id.endsWith(':mobilized')); assert.equal(aurelleLater.title, 'War is active beyond the realm'); assert.match(aurelleLater.text, /Kindle and Korund have ended mobilization/);
  const { endWar } = war; await endWar(r.db, made.war.id, 'treaty', Math.floor(r.now / 1000), true);
  const ended = (await titles('kim')).find(i => i.title === 'The war has ended'); assert.match(ended.text, /a peace treaty locks declarations until \d{4}-\d{2}-\d{2}/);
  // The Country view stops showing the banner once the war has ended.
  assert.equal((await r.call('world', null)).data.simulation.wars.wars[0].status, 'ended');
});

test('war banner: both nations see a mobilization countdown; the third nation and ended wars show nothing', async t => {
  const runtimeForCopy = await localRuntime(); t.after(() => runtimeForCopy.close());
  const { renderToStaticMarkup } = await import('react-dom/server');
  const require = createRequire(import.meta.url);
  const warCopy = await runtimeForCopy.importModule('lib/war-copy.ts');
  const load = async (file, stubs = {}) => { const exports = {}; const src = await readFile(new URL(file, import.meta.url), 'utf8');
    new Function('exports', 'require', ts.transpileModule(src, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText)(exports, name => name in stubs ? stubs[name] : require(name)); return exports; };
  const GameTimer = ({ endsAt, label }) => require('react').createElement('span', { 'data-timer': endsAt }, label);
  const rules = await runtimeForCopy.importModule('lib/war-rules.ts'), copy = warCopy;
  const { WarBanner } = await load('../app/war-banner.tsx', { '@/lib/war-copy': copy, '@/lib/war-rules': rules, './game-timer': { GameTimer }, './display-preferences': { useDisplayTimestamp: () => v => new Date(v).toISOString() }, '@/lib/war': {} });
  const base = { id: 'w1', attacker: 'kindle', defender: 'korund', casusBelli: 'Border incidents', declaredBy: 'AI President', declaredAt: 1000, mobilizationEndsAt: 1000 + 48 * H, status: 'mobilizing', endedAt: null, endKind: null, peaceLockEndsAt: null };
  const html = nation => renderToStaticMarkup(WarBanner({ wars: [base], nationId: nation }));
  assert.match(html('kindle'), /Kindle declares war/); assert.match(html('kindle'), /data-timer="\d+"/); assert.match(html('kindle'), /At war with Korund/); assert.match(html('kindle'), /Mobilization ends 1970-01-03\S+ No attack can begin before then/);
  assert.match(html('korund'), /War declared on Korund/); assert.match(html('korund'), /Mobilization ends in/);
  assert.equal(html('aurelle'), '', 'the third nation has no banner on its own view');
  assert.match(renderToStaticMarkup(WarBanner({ wars: [{ ...base, status: 'active' }], nationId: 'kindle' })), /war is active/i);
  assert.equal(renderToStaticMarkup(WarBanner({ wars: [{ ...base, status: 'ended', endedAt: 5000, endKind: 'other' }], nationId: 'kindle' })), '');
  assert.equal(renderToStaticMarkup(WarBanner({ wars: undefined, nationId: 'kindle' })), '', 'flag off: no wars are sent, nothing renders');
});

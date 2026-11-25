/** #1462: report AI leader addresses, AI news and Kindle player articles on HARIMU_REPORTS_ENABLED. SQLite and HARIMU_TEST_STORAGE=postgres. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {localRuntime} from './helpers/local-runtime.mjs';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const rows = async db => (await db.prepare('SELECT id,reporter_id,target_kind,target_id,reason_id FROM moderation_reports ORDER BY created_at,id').all()).results.map(row => ({...row}));
const report = (r, user, body) => r.call('reports', user, {requestId: randomUUID(), ...body});

test('migration 0133 keeps existing rows and widens target_kind on SQLite and Postgres', async () => {
  const {DatabaseSync} = await import('node:sqlite');
  const kept = "INSERT INTO moderation_reports(id,request_id,reporter_id,target_kind,target_id,reason_id,note,created_at) VALUES ('row-1','req-1','alice','citizen-message','11111111-1111-4111-8111-111111111111','hate-harassment','kept',10)";
  const next = (id, request, kind, target) => `INSERT INTO moderation_reports(id,request_id,reporter_id,target_kind,target_id,reason_id,note,created_at) VALUES ('${id}','${request}','alice','${kind}','${target}','spam-other',NULL,11)`;
  const lite = new DatabaseSync(':memory:');
  lite.exec(readFileSync('drizzle/0070_moderation_reports.sql', 'utf8'));
  lite.exec(kept);
  assert.throws(() => lite.exec(next('nope', 'req-x', 'ai-news', 'model:kindle:2026-01-15')));
  lite.exec(readFileSync('drizzle/0133_report_ai_targets.sql', 'utf8'));
  lite.exec(next('row-2', 'req-2', 'ai-leader-address', 'kindle:address:12'));
  assert.throws(() => lite.exec(next('dup', 'req-3', 'citizen-message', '11111111-1111-4111-8111-111111111111')));
  assert.throws(() => lite.exec(next('bad', 'req-4', 'poster', 'x')));
  lite.exec(readFileSync('drizzle/0133_report_ai_targets.sql', 'utf8'));
  assert.deepEqual(lite.prepare('SELECT id,target_kind,target_id,note FROM moderation_reports ORDER BY id').all().map(row => ({...row})), [
    {id: 'row-1', target_kind: 'citizen-message', target_id: '11111111-1111-4111-8111-111111111111', note: 'kept'},
    {id: 'row-2', target_kind: 'ai-leader-address', target_id: 'kindle:address:12', note: null},
  ]);
  assert.ok(lite.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='index' AND name='idx_moderation_reports_reporter'").get());
  const {PGlite} = await import('@electric-sql/pglite');
  const pg = new PGlite(); await pg.waitReady;
  await pg.exec(readFileSync('db/postgres/0070_moderation_reports.sql', 'utf8'));
  await pg.exec(kept);
  await assert.rejects(pg.exec(next('nope', 'req-x', 'ai-news', 'model:kindle:2026-01-15')));
  await pg.exec(readFileSync('db/postgres/0133_report_ai_targets.sql', 'utf8'));
  await pg.exec(next('row-2', 'req-2', 'player-article', 'paper-1'));
  await assert.rejects(pg.exec(next('dup', 'req-3', 'citizen-message', '11111111-1111-4111-8111-111111111111')));
  await assert.rejects(pg.exec(next('bad', 'req-4', 'name', 'x')));
  assert.deepEqual((await pg.query('SELECT id,target_kind,note FROM moderation_reports ORDER BY id')).rows, [
    {id: 'row-1', target_kind: 'citizen-message', note: 'kept'},
    {id: 'row-2', target_kind: 'player-article', note: null},
  ]);
  assert.ok((await pg.query("SELECT 1 AS ok FROM pg_indexes WHERE indexname='idx_moderation_reports_reporter'")).rows.length === 1);
  await pg.close();
});

test('flag off: no report control and the new kinds are rejected', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_REPORTS_ENABLED', 'false');
  await r.call('world', null);
  assert.equal((await r.call('addresses', 'alice')).data.reportsEnabled, false);
  assert.equal((await r.call('news', 'alice')).data.reportsEnabled, false);
  for (const targetKind of ['ai-leader-address', 'ai-news', 'player-article']) assert.equal((await report(r, 'alice', {targetKind, targetId: 'kindle:address:1', reasonId: 'spam-other'})).status, 404);
  assert.deepEqual(await rows(r.db), []);
});

test('a citizen reports an address, an AI news item and a player article; old kinds still need a UUID', async t => {
  const r = await localRuntime(); t.after(() => r.close());
  r.setFixtureEnv('HARIMU_REPORTS_ENABLED', 'true');
  r.setFixtureEnv('HARIMU_KINDLE_NEWSPAPERS_ENABLED', 'true');
  await r.call('world', null);
  assert.equal((await r.call('addresses', 'alice')).data.reportsEnabled, true);
  assert.equal((await r.call('news', 'alice')).data.reportsEnabled, true);
  const addressId = (await r.call('addresses', 'alice')).data.addresses[0].id;
  assert.equal(uuid.test(addressId), false);
  const body = {requestId: randomUUID(), targetKind: 'ai-leader-address', targetId: addressId, reasonId: 'ai-inappropriate'};
  assert.equal((await r.call('reports', 'alice', body)).status, 201);
  assert.equal((await r.call('reports', 'alice', body)).status, 201, 'replay');
  const dup = await report(r, 'alice', {targetKind: 'ai-leader-address', targetId: addressId, reasonId: 'spam-other'});
  assert.equal(dup.status, 409); assert.equal(dup.data.duplicate, true);
  await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='bob'").run();
  assert.equal((await report(r, 'bob', {targetKind: 'ai-leader-address', targetId: addressId, reasonId: 'ai-inappropriate'})).status, 404, 'other nation');
  assert.equal((await report(r, 'alice', {targetKind: 'ai-leader-address', targetId: 'kindle:address:99999', reasonId: 'ai-inappropriate'})).status, 404);
  assert.equal((await report(r, 'alice', {targetKind: 'ai-leader-address', targetId: 'x'.repeat(81), reasonId: 'spam-other'})).status, 400);
  assert.equal((await report(r, 'alice', {targetKind: 'citizen-message', targetId: addressId, reasonId: 'spam-other'})).status, 400, 'chat still requires a UUID');
  assert.equal((await report(r, 'alice', {targetKind: 'notable-reply', targetId: addressId, reasonId: 'ai-inappropriate'})).status, 400);
  const now = Math.floor(r.now / 1000);
  await r.db.prepare('INSERT INTO ai_news_articles(id,nation_id,title,body,created_at,model,facts_json) VALUES (?,?,?,?,?,?,?)').bind('kindle:2026-01-15', 'kindle', 'Ledger note', 'The public ledger records registered citizens.', now, 'fixture', '{}').run();
  r.setFixtureEnv('HARIMU_AI_TEMPLATES_ONLY', 'all');
  assert.equal((await report(r, 'alice', {targetKind: 'ai-news', targetId: 'model:kindle:2026-01-15', reasonId: 'ai-inappropriate'})).status, 404, 'hidden model article');
  r.setFixtureEnv('HARIMU_AI_TEMPLATES_ONLY', '');
  const edition = await r.call('news', 'alice');
  const model = edition.data.items.find(item => item.id === 'model:kindle:2026-01-15');
  const system = edition.data.items.find(item => item.source === 'system');
  assert.equal(model.source, 'model'); assert.ok(system);
  assert.equal((await report(r, 'alice', {targetKind: 'ai-news', targetId: model.id, reasonId: 'ai-inappropriate'})).status, 201);
  assert.equal((await report(r, 'alice', {targetKind: 'ai-news', targetId: model.id, reasonId: 'hate-harassment'})).status, 409);
  assert.equal((await report(r, 'alice', {targetKind: 'ai-news', targetId: system.id, reasonId: 'spam-other'})).status, 404, 'system record');
  await r.db.prepare('INSERT INTO kindle_newspapers(id,founder_user_id,name,founded_at,request_id) VALUES (?,?,?,?,?)').bind('paper', 'alice', 'Harbor Ledger', now, 'req-paper').run();
  await r.db.prepare('INSERT INTO kindle_articles(id,newspaper_id,author_user_id,headline,body,published_at,request_id) VALUES (?,?,?,?,?,?,?)').bind('paper-1', 'paper', 'alice', 'Shifts posted', '["One paragraph."]', 1800000000, 'req-art').run();
  r.setFixtureEnv('HARIMU_KINDLE_NEWSPAPERS_ENABLED', 'false');
  assert.equal((await report(r, 'alice', {targetKind: 'player-article', targetId: 'paper-1', reasonId: 'spam-other'})).status, 404, 'newspapers off');
  r.setFixtureEnv('HARIMU_KINDLE_NEWSPAPERS_ENABLED', 'true');
  assert.equal((await report(r, 'alice', {targetKind: 'ai-news', targetId: 'paper-1', reasonId: 'spam-other'})).status, 404, 'player article is not ai-news');
  assert.equal((await report(r, 'alice', {targetKind: 'player-article', targetId: 'paper-1', reasonId: 'ai-inappropriate'})).status, 400, 'human byline rejects the AI-only reason');
  assert.equal((await report(r, 'alice', {targetKind: 'player-article', targetId: 'paper-1', reasonId: 'spam-other'})).status, 201);
  assert.equal((await report(r, 'alice', {targetKind: 'player-article', targetId: 'paper-1', reasonId: 'hate-harassment'})).status, 409);
  const stamp = new Date(r.now).toISOString();
  await r.db.prepare("INSERT INTO citizens(clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES ('carol','kindle','Private carol',18,1,'Good standing',?,?)").bind(stamp, stamp).run();
  r.setFixtureEnv('HARIMU_CHAT_SHADOW_MUTE', 'alice@2020-01-01T00:00:00Z');
  assert.equal((await report(r, 'carol', {targetKind: 'player-article', targetId: 'paper-1', reasonId: 'spam-other'})).status, 404, 'shadow-muted author');
  assert.equal((await report(r, 'bob', {targetKind: 'player-article', targetId: 'paper-1', reasonId: 'spam-other'})).status, 404, 'other nation');
  await r.db.prepare("UPDATE citizens SET nation_id='aurelle' WHERE clerk_user_id='alice'").run();
  const aurelle = await r.call('news', 'alice');
  const decree = aurelle.data.items.find(item => item.source === 'deterministic');
  const record = aurelle.data.items.find(item => item.source === 'system');
  assert.ok(decree); assert.equal(uuid.test(decree.id), false);
  assert.equal((await report(r, 'alice', {targetKind: 'ai-news', targetId: decree.id, reasonId: 'ai-inappropriate'})).status, 201);
  assert.equal((await report(r, 'alice', {targetKind: 'ai-news', targetId: record.id, reasonId: 'spam-other'})).status, 404);
  assert.equal((await report(r, 'alice', {targetKind: 'poster', targetId: decree.id, reasonId: 'spam-other'})).status, 400);
  const stored = (await rows(r.db)).map(row => [row.reporter_id, row.target_kind, row.target_id, row.reason_id]).sort();
  assert.deepEqual(stored, [
    ['alice', 'ai-leader-address', addressId, 'ai-inappropriate'],
    ['alice', 'ai-news', decree.id.toLowerCase(), 'ai-inappropriate'],
    ['alice', 'ai-news', 'model:kindle:2026-01-15', 'ai-inappropriate'],
    ['alice', 'player-article', 'paper-1', 'spam-other'],
  ].sort());
});

/** #1416: a presidential receipt stores the voter's district at vote time. Per-district human counts are published only after close. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { PGlite } from '@electric-sql/pglite';
import { localRuntime as fixtureRuntime } from './helpers/local-runtime.mjs';
import { isDestructive, postgresMigrations, transactionProblem } from '../scripts/postgres-migrations.mjs';
import { resultsCaption } from '../lib/kindle-certification-copy.ts';

const localRuntime = (options = {}) => fixtureRuntime({ presidentialCalendar: true, ...options });
const eligible = (r, user) => r.setVerification(user, { userId: user, emailVerified: true, phoneVerified: true, phoneUnique: true, revoked: false, checkedAt: r.now, expiresAt: r.now + 60000 });
const vote = (id, ranking) => ({ action: 'vote', electionId: id, requestId: randomUUID(), ranking });
const home = (r, user, city) => r.db.prepare("INSERT INTO citizen_city_locations (user_id,nation_id,home_city_id,current_city_id,updated_at) VALUES (?,'kindle',?,?,?)").bind(user, city, city, Math.floor(r.now / 1000)).run();
const citizen = async (r, id) => r.db.prepare("INSERT INTO citizens (clerk_user_id,nation_id,display_name,capacity,influence,standing,created_at,updated_at) VALUES (?,'kindle',?,18,1240,'Good standing',?,?)").bind(id, `Private ${id}`, new Date(r.now).toISOString(), new Date(r.now).toISOString()).run();

test('#1416 district is stored at vote time, hidden while open, and published after close without dropping a one-ballot district', async t => {
  const r = await localRuntime({ ballotPrivacyReady: true }); t.after(() => r.close());
  const { candidateIds, electionId } = await r.importModule('lib/elections.ts');
  const ranking = [...candidateIds];
  for (const id of ['cara', 'dani']) await citizen(r, id);
  eligible(r, 'alice'); eligible(r, 'bob'); eligible(r, 'cara'); eligible(r, 'dani');
  await home(r, 'alice', 'tarrek-foundry');
  await home(r, 'cara', 'kolt-savanna');
  await home(r, 'dani', 'forgehaven');
  const cast = async user => r.call('election', user, vote(electionId, ranking));
  assert.equal((await cast('alice')).status, 200);
  assert.equal((await cast('bob')).status, 200);
  assert.equal((await cast('cara')).status, 200);
  assert.equal((await cast('dani')).status, 200);
  const receipts = (await r.db.prepare('SELECT clerk_user_id, district_id, ballot_written FROM civic_voter_receipts ORDER BY clerk_user_id').all()).results;
  assert.deepEqual(receipts.map(row => [row.clerk_user_id, row.district_id, Number(row.ballot_written)]), [
    ['alice', 'tarrek-foundry', 1], ['bob', 'forgehaven', 1], ['cara', 'kolt-savanna', 1], ['dani', 'forgehaven', 1],
  ]);
  const ballots = (await r.db.prepare('SELECT * FROM civic_anonymous_ballots').all()).results;
  assert.equal(ballots.length, 4);
  for (const row of ballots) assert.equal(Object.hasOwn(row, 'district_id'), false);
  const anonCols = (await r.db.prepare('PRAGMA table_info(civic_anonymous_ballots)').all()).results.map(col => col.name);
  assert.equal(anonCols.includes('district_id'), false);
  const open = await r.call('election', 'alice');
  assert.equal(open.data.status, 'open'); assert.equal(open.data.result, null);
  assert.equal(JSON.stringify(open.data).includes('"districts"'), false);
  await r.db.prepare("UPDATE civic_voter_receipts SET district_id=NULL WHERE clerk_user_id='dani'").run();
  r.setNow(open.data.closesAt * 1000);
  const closed = await r.call('election', 'bob');
  assert.equal(closed.data.status, 'closed');
  assert.equal(closed.data.result.humanBallots, 4, 'a null district still counts in the national total');
  assert.deepEqual(closed.data.result.districts, [
    { districtId: 'forgehaven', name: 'Forgehaven', ballots: 1 },
    { districtId: 'tarrek-foundry', name: 'Tarrek Foundry', ballots: 1 },
    { districtId: 'kolt-savanna', name: 'Kolt Savanna', ballots: 1 },
  ]);
  assert.equal(closed.data.result.districts.reduce((sum, row) => sum + row.ballots, 0), 3);
  for (const row of closed.data.result.districts) assert.equal(resultsCaption.district.replace('{district}', row.name).replace('{count}', String(row.ballots)), `${row.name}: ${row.ballots} ballots`);
  await (await r.importModule('lib/world-simulation.ts')).advanceWorld(r.db, Math.floor(r.now / 1000));
  assert.deepEqual((await r.call('election', 'alice')).data.result.districts, closed.data.result.districts);
});

test('migration 0130 adds a nullable district_id to civic_voter_receipts on SQLite and PGlite, and not to the anonymous ballot', async () => {
  const liteSql = readFileSync('drizzle/0130_civic_receipt_district.sql', 'utf8');
  const pgSql = readFileSync('db/postgres/0130_civic_receipt_district.sql', 'utf8');
  const code = sql => sql.replace(/--[^\n]*/g, '');
  assert.match(liteSql, /ALTER TABLE civic_voter_receipts ADD COLUMN district_id TEXT;/);
  assert.match(pgSql, /ALTER TABLE civic_voter_receipts ADD COLUMN IF NOT EXISTS district_id TEXT COLLATE "C";/);
  assert.doesNotMatch(`${code(liteSql)}\n${code(pgSql)}`, /civic_anonymous_ballots|\b(DROP|DELETE|TRUNCATE)\b/i);
  assert.equal(isDestructive(liteSql), false); assert.equal(isDestructive(pgSql), false);
  assert.equal(transactionProblem(liteSql), null); assert.equal(transactionProblem(pgSql), null);
  const migration = postgresMigrations().find(entry => entry.file === '0130_civic_receipt_district.sql');
  assert.ok(migration); assert.deepEqual(migration.tables, []);
  assert.deepEqual(migration.columns, [['civic_voter_receipts', 'district_id']]);
  const base = `CREATE TABLE civic_voter_receipts (election_id TEXT NOT NULL, clerk_user_id TEXT NOT NULL, request_id TEXT NOT NULL UNIQUE, checked_at INTEGER NOT NULL, ballot_written INTEGER NOT NULL DEFAULT 0, policy TEXT NOT NULL, PRIMARY KEY (election_id, clerk_user_id));
CREATE TABLE civic_anonymous_ballots (id TEXT PRIMARY KEY, election_id TEXT NOT NULL, ranking_json TEXT NOT NULL, policy TEXT NOT NULL);
INSERT INTO civic_voter_receipts (election_id, clerk_user_id, request_id, checked_at, ballot_written, policy) VALUES ('e', 'old', 'rq-old', 1, 1, 'tier1-human-v1');
INSERT INTO civic_anonymous_ballots (id, election_id, ranking_json, policy) VALUES ('b', 'e', '[]', 'tier1-human-v1');`;
  const lite = new DatabaseSync(':memory:');
  lite.exec(base); lite.exec(liteSql);
  const added = lite.prepare('PRAGMA table_info(civic_voter_receipts)').all().find(col => col.name === 'district_id');
  assert.equal(added.notnull, 0);
  assert.equal(lite.prepare("SELECT district_id FROM civic_voter_receipts WHERE clerk_user_id='old'").get().district_id, null);
  lite.prepare("INSERT INTO civic_voter_receipts (election_id, clerk_user_id, request_id, checked_at, ballot_written, policy, district_id) VALUES ('e', 'new', 'rq-new', 2, 1, 'tier1-human-v1', 'forgehaven')").run();
  assert.equal(lite.prepare('PRAGMA table_info(civic_anonymous_ballots)').all().some(col => col.name === 'district_id'), false);
  lite.close();
  const pg = new PGlite(); await pg.waitReady;
  await pg.exec(base); await pg.exec(pgSql); await pg.exec(pgSql);
  const column = (await pg.query("SELECT is_nullable FROM information_schema.columns WHERE table_name='civic_voter_receipts' AND column_name='district_id'")).rows[0];
  assert.equal(column.is_nullable, 'YES');
  assert.equal((await pg.query("SELECT district_id FROM civic_voter_receipts WHERE clerk_user_id='old'")).rows[0].district_id, null);
  assert.equal((await pg.query("SELECT column_name FROM information_schema.columns WHERE table_name='civic_anonymous_ballots' AND column_name='district_id'")).rows.length, 0);
  await pg.close();
});

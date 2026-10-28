/** #906: concurrent shift claims must never overdraw a finite state pool (Korund's Labor Note pool: the food brigade and the #886 (b) Bureau posts;
 *  Aurelle's estate treasury: the food estate) on REAL multi-connection Postgres. PGlite is single-connection, so the ordinary suites cannot show this.
 *  Same harness as tests/war-limits-postgres.test.mjs (#575): runs only with HARIMU_TEST_POSTGRES_URL set to an admin URL (it CREATEs and DROPs a scratch database);
 *  CI has no Postgres service, so there the real tests skip and the always-run tests pin the guard: every claim batch locks the pool row first. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { Client, types } from 'pg';
import { localRuntime } from './helpers/local-runtime.mjs';
import { bootstrapEmptyPostgres, connectPostgres } from '../scripts/postgres-migrations.mjs';

const databaseSource = (await readFile(new URL('../lib/postgres/database.ts', import.meta.url), 'utf8')).replace("'./sql'", JSON.stringify(new URL('../lib/postgres/sql.ts', import.meta.url).href));
const adapterSource = ts.transpileModule(databaseSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const load = async src => (await import(`data:text/javascript;base64,${Buffer.from(src).toString('base64')}`)).PostgresDatabase;
const PostgresDatabase = await load(adapterSource);
/** Control only: the same adapter with its global writer lock removed, so the pool guard itself is what is tested. */
const UnlockedDatabase = await load(adapterSource.replace(/if\s*\(transaction\)\s*await connection\.query\(`SELECT pg_advisory_xact_lock\(\$\{writerLock\}\)`\);/, ''));
const url = process.env.HARIMU_TEST_POSTGRES_URL;
const real = url ? {} : { skip: 'set HARIMU_TEST_POSTGRES_URL to a Postgres admin URL to run the real multi-connection tests (see tests/war-limits-postgres.test.mjs)' };

test('every pool-paid claim batch locks the pool row first (korund brigade, korund posts, aurelle food estate and charters)', async () => {
  const korund = await readFile(new URL('../lib/korund.ts', import.meta.url), 'utf8'), aurelle = await readFile(new URL('../lib/aurelle.ts', import.meta.url), 'utf8');
  assert.match(korund, /db\.batch\(\[db\.prepare\(korundPoolLockSql\),db\.prepare\(korundSettleSql\)/, 'brigade');
  assert.match(korund, /korundPoolLockSql/, 'posts'); assert.match(korund, /postSettleSql/, 'posts settle');
  assert.match(aurelle, /db\.batch\(\[\n? ?db\.prepare\(aurellePoolLockSql\),db\.prepare\(aurelleClaimReceiptSql\)/, 'food estate');
  assert.match(aurelle, /aurellePoolLockSql/, 'charter jobs lock'); assert.match(aurelle, /aurelleCharterClaimReceiptSql|claimReceipt/, 'charter jobs receipt (#886 c / #885)');
  assert.match(korund, /export const korundPoolLockSql="UPDATE korund_resources SET initial_minor=initial_minor WHERE id='state'"/);
  assert.match(aurelle, /export const aurellePoolLockSql="UPDATE aurelle_resources SET initial_minor=initial_minor WHERE id='estate'"/);
});

async function scratch(t) {
  const admin = await connectPostgres(url); const name = `harimu_906_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
  await admin.exec(`CREATE DATABASE ${name}`);
  const target = new URL(url); target.pathname = `/${name}`; const scratchUrl = target.toString();
  const boot = await connectPostgres(scratchUrl); await bootstrapEmptyPostgres(boot, { freshWorld: true });
  await boot.exec('CREATE TABLE harimu_postgres_write_journal (id bigserial PRIMARY KEY,statements_json text NOT NULL)'); await boot.close();
  const connect = async () => {
    const client = new Client({ connectionString: scratchUrl, types: { getTypeParser: (oid, format) => (format !== 'binary' && (oid === 20 || oid === 1700)) ? v => Number(v) : types.getTypeParser(oid, format) } });
    client.on('error', () => {}); await client.connect();
    return { query: async (text, values) => { const r = await client.query(text, values); return { rows: r.rows, rowCount: r.rowCount }; }, release: async () => { await client.end(); } };
  };
  const raw = await connectPostgres(scratchUrl);
  t.after(async () => { await raw.close(); await admin.exec(`DROP DATABASE ${name} WITH (FORCE)`).catch(() => {}); await admin.close(); });
  return { db: new PostgresDatabase(connect, { journalRetentionApproved: true }), unlocked: new UnlockedDatabase(connect, { journalRetentionApproved: true }), raw };
}

/** `racers` citizens, each with one finished shift of `order`, and a pool holding exactly one wage; then everyone claims at once. */
async function race(raw, claim, { nation, order, racers, resources, id }) {
  await raw.query('DELETE FROM labor_note_issuances'); await raw.query('DELETE FROM korund_post_settlements');
  await raw.query('DELETE FROM crown_issuances'); await raw.query('DELETE FROM aurelle_charter_settlements');
  for (const t of ['korund_settlements', 'aurelle_settlements', 'aurelle_receipts', 'korund_work_starts', 'work_shifts', 'citizens']) await raw.query(`DELETE FROM ${t}`);
  const cols = (await raw.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='nations' AND is_nullable='NO' AND column_default IS NULL ORDER BY ordinal_position")).rows;
  await raw.query(`INSERT INTO nations (${cols.map(c => c.column_name).join(',')}) VALUES (${cols.map((c, i) => `$${i + 1}`).join(',')}) ON CONFLICT DO NOTHING`, cols.map(c => c.column_name === 'id' ? nation : /int|numeric|double/.test(c.data_type) ? 0 : nation));
  await raw.query(`INSERT INTO work_orders (id,nation_id,name,detail,capacity_cost,status,sort_order) VALUES ($1,$2,$1,'',4,'closed',1000) ON CONFLICT DO NOTHING`, [order, nation]);
  const shifts = [];
  for (let i = 0; i < racers; i++) {
    const user = `u${i}`, shift = randomUUID(); shifts.push([user, shift]);
    await raw.query("INSERT INTO citizens (clerk_user_id,nation_id,capacity,created_at,updated_at) VALUES ($1,$2,24,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')", [user, nation]);
    await raw.query("INSERT INTO work_shifts (id,clerk_user_id,work_order_id,order_name,output,capacity_spent,started_at,completes_at) VALUES ($1,$2,$3,'x','x',4,'2026-01-01T00:00:00Z','2026-01-01T02:00:00Z')", [shift, user, order]);
    if (nation === 'korund') await raw.query('INSERT INTO korund_work_starts (id,capacity_applied) VALUES ($1,1)', [shift]);
    else await raw.query("INSERT INTO aurelle_receipts (id,clerk_user_id,action,quantity,occurred_at,capacity_applied) VALUES ($1,$2,'aurelle-start-work',0,0,1)", [shift, user]);
  }
  await raw.query(`INSERT INTO ${resources} (id,initial_food,initial_minor) VALUES ($1,40,800) ON CONFLICT (id) DO UPDATE SET initial_minor=800`, [id]);
  const results = await Promise.all(shifts.map(([user, shift]) => claim(user, shift).catch(e => ({ status: 500, error: String(e) }))));
  return results.filter(r => r.status === 200).length;
}

const pool = async (raw, resources, id) => {
  const k = resources === 'korund_resources';
  const sql = k ? "SELECT initial_minor-COALESCE((SELECT SUM(wage_minor) FROM korund_settlements),0)-COALESCE((SELECT SUM(wage_minor) FROM korund_post_settlements),0) AS p FROM korund_resources WHERE id='state'"
    : "SELECT initial_minor+COALESCE((SELECT SUM(spend_minor) FROM aurelle_purchases),0)-COALESCE((SELECT SUM(wage_minor) FROM aurelle_settlements),0)-COALESCE((SELECT SUM(wage_minor) FROM aurelle_charter_settlements),0) AS p FROM aurelle_resources WHERE id='estate'";
  return Number((await raw.query(sql)).rows[0].p);
};
const cases = [
  ['korund food brigade', { nation: 'korund', order: 'korund-food-production', resources: 'korund_resources', id: 'state' }],
  ['korund Bureau post', { nation: 'korund', order: 'korund-quarry-gang', resources: 'korund_resources', id: 'state' }],
  ['aurelle food estate', { nation: 'aurelle', order: 'aurelle-food-estate', resources: 'aurelle_resources', id: 'estate' }],
  ['aurelle charter job', { nation: 'aurelle', order: 'aurelle-quarry-charter', resources: 'aurelle_resources', id: 'estate' }],
];
const claimer = async (db, nation) => {
  const rt = await localRuntime(); const k = await rt.importModule('lib/korund.ts'), a = await rt.importModule('lib/aurelle.ts'); const now = Math.floor(Date.parse('2026-01-02T00:00:00Z') / 1000);
  return { rt, claim: nation === 'korund' ? (user, shift) => k.executeKorund(db, user, { action: 'korund-claim-work', shiftId: shift }, now)
    : (user, shift) => a.executeAurelle(db, user, { action: 'aurelle-claim-work', requestId: randomUUID(), shiftId: shift }, now) };
};

for (const [name, c] of cases) {
  test(`#906 real Postgres, even without the adapter's writer lock: ${name}, 6 concurrent claims on a one-wage pool pay exactly once, round after round`, real, async t => {
    const { unlocked, raw } = await scratch(t); const { rt, claim } = await claimer(unlocked, c.nation); t.after(() => rt.close());
    for (let round = 0; round < 15; round++) {
      const paid = await race(raw, claim, { ...c, racers: 6 });
      assert.equal(paid, 1, `round ${round}: ${paid} paid`); assert.equal(await pool(raw, c.resources, c.id), 0, 'never below zero');
    }
  });
}

test('#906 control, real Postgres: the bare guarded settle on separate connections (no row lock, no writer lock) DOES overdraw', real, async t => {
  const { raw } = await scratch(t); const rt = await localRuntime(); t.after(() => rt.close());
  const { korundSettleSql } = await rt.importModule('lib/korund.ts'); const { postgresSql } = await import('../lib/postgres/sql.ts');
  const now = Math.floor(Date.parse('2026-01-02T00:00:00Z') / 1000);
  const target = new URL(url); target.pathname = (await raw.query('SELECT current_database() AS d')).rows[0].d.replace(/^/, '/');
  let raced = 0;
  for (let round = 0; round < 30; round++) {
    const clients = await Promise.all(Array.from({ length: 6 }, async () => { const cl = new Client({ connectionString: target.toString() }); cl.on('error', () => {}); await cl.connect(); return cl; }));
    const paid = await race(raw, (user, shift) => (q => clients[Number(user.slice(1))].query(q.text, q.values))(postgresSql(korundSettleSql, [now, shift, user, '2026-01-02T00:00:00.000Z'])).then(r => ({ status: r.rowCount ? 200 : 409 })), { ...cases[0][1], racers: 6 });
    await Promise.all(clients.map(cl => cl.end()));
    if (paid > 1) raced++;
  }
  t.diagnostic(`bare settle overdrew the pool in ${raced} of 30 rounds`);
  assert.ok(raced > 0, 'the control must reproduce the race, or the exactly-once tests above prove nothing');
});

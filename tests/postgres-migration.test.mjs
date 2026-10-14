import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {reserveAiCall} from '../lib/ai-budget.ts';
import {DatabaseSync} from 'node:sqlite';
import {localRuntime} from './helpers/local-runtime.mjs';
import {snapshotSqlite,snapshotManifest,orderedSchema,replayJournalSqlite,importSnapshot} from '../scripts/postgres-migration.mjs';
import {postgresSql} from '../lib/postgres/sql.ts';
import {repoTables} from '../scripts/postgres-migrations.mjs';
import {assertPostgresApplicationRole,selectStorageBackend} from '../lib/storage-selection.ts';
const identifier=name=>`"${name}"`;
test('SQL literals and values stay separate; unsupported dialects fail closed',()=>{
 const result=postgresSql("SELECT 'integer ? MIN(1,2)' AS literal,MIN(?,MAX(0,?)),changes()",[4,7],1);assert.ok(result.text.includes("'integer ? MIN(1,2)'"));assert.match(result.text,/LEAST\(\$1::bigint,GREATEST\(0,\$2::bigint\)\)/);assert.deepEqual(result.values,[4,7]);
 assert.throws(()=>postgresSql('SELECT ?; DELETE FROM citizens',[1]));assert.throws(()=>postgresSql('SELECT ?',[1.5]));assert.throws(()=>postgresSql('SELECT json_extract(?,?)',['{}','$.unknown']));
});
test('storage activation requires preview, explicit cutover readiness and configured Hyperdrive; maintenance fails closed',()=>{
 const base={hyperdriveConfigured:false};assert.equal(selectStorageBackend(base),'d1');
 assert.equal(selectStorageBackend({...base,backend:'postgres',cutoverReady:'true'}),'d1');
 for(const input of [{...base,backend:'postgres',implementationEnabled:true},{...base,backend:'postgres',implementationEnabled:true,cutoverReady:'true',developmentPreview:'true'},{...base,backend:'unexpected'},{...base,maintenance:'true'}])assert.throws(()=>selectStorageBackend(input));
 assert.equal(selectStorageBackend({...base,backend:'postgres',implementationEnabled:true,hyperdriveConfigured:true,developmentPreview:'true',cutoverReady:'true',journalRetentionApproved:true}),'postgres');
 assertPostgresApplicationRole({canCreateSchema:1,canChangeMarker:1,superuser:0},true);assert.throws(()=>assertPostgresApplicationRole({canCreateSchema:1,canChangeMarker:1,superuser:1},true));assertPostgresApplicationRole({canCreateSchema:0,canChangeMarker:0,superuser:0});for(const flag of ['canCreateSchema','canChangeMarker','superuser'])assert.throws(()=>assertPostgresApplicationRole({canCreateSchema:0,canChangeMarker:0,superuser:0,[flag]:1}));
});
test('a PostgreSQL fixture preserves its snapshot and journal restores subsequent writes to SQLite exactly once',async t=>{
 const r=await localRuntime({backend:'postgres'});t.after(()=>r.close());const pgTables=r.postgresSnapshot.schema.filter(s=>s.type==='table').map(s=>s.name).sort();assert.deepEqual(pgTables,repoTables());assert.ok(pgTables.includes('nation_stability_scores'));assert.ok(pgTables.includes('citizen_first_week_goals'));assert.ok(pgTables.includes('world_cities'));assert.ok(pgTables.includes('world_square_purchases')&&pgTables.includes('citizen_tessera_ledger'));assert.ok(pgTables.includes('shift_quality'));assert.ok(pgTables.includes('citizen_travel'));assert.equal(pgTables.length,76); // #119: derived from drizzle/ + db/postgres/ (incl. 0019 citizen_travel #264, 0023 aurelle_pledges + aurelle_risings #71, 0021 market_spoilage #199, 0012 nation_stability #69, 0013 first-week goals #135, 0014 world_cities #124, 0015 shift_quality #40, 0016 market goods/orders/cancellations/trades #195, 0017 world registry #122)
 const source=new DatabaseSync(':memory:');t.after(()=>source.close());
 for(const entry of orderedSchema(r.postgresSnapshot))source.exec(entry.sql);
 for(const entry of orderedSchema(r.postgresSnapshot).filter(s=>s.type==='table'))for(const row of r.postgresSnapshot.data[entry.name]){const keys=Object.keys(row);source.prepare(`INSERT INTO ${identifier(entry.name)} (${keys.map(identifier).join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).run(...keys.map(key=>row[key]));}
 const started=await r.call('citizen','alice',{action:'commit-work',workOrderId:'harvest'});assert.equal(started.status,200);const shift=started.data.shifts[0];r.setNow(Date.parse(shift.completesAt));
 assert.equal((await r.call('citizen','alice',{action:'claim-work',shiftId:shift.id})).status,200);
 await r.call('citizen','alice');
 await r.db.prepare("UPDATE citizens SET nation_id='korund' WHERE clerk_user_id='alice'").run();
 const queueId=randomUUID();assert.equal((await r.call('citizen','alice',{action:'korund-join-ration-queue',requestId:queueId})).status,200);
 assert.equal((await r.call('citizen','alice',{action:'korund-cancel-ration-queue',requestId:randomUUID(),queueId})).status,200);
 const budgetNow=Math.floor(Date.now()/1000);assert.equal(await reserveAiCall(r.db,randomUUID(),'@cf/meta/llama-3.2-3b-instruct',budgetNow,{dailyBudgetMicro:970000,gatewayId:'harimu-test'}),true);
 const target={...r.postgresSnapshot,data:{}};for(const table of r.postgresSnapshot.schema.filter(s=>s.type==='table'))target.data[table.name]=(await r.db.prepare(`SELECT * FROM ${identifier(table.name)}`).all()).results;
 const journal=(await r.db.prepare('SELECT id,statements_json FROM harimu_postgres_write_journal ORDER BY id').all()).results;assert.ok(journal.length);
 replayJournalSqlite(source,journal);replayJournalSqlite(source,journal);
 const restored={...r.postgresSnapshot,data:{}};for(const table of r.postgresSnapshot.schema.filter(s=>s.type==='table'))restored.data[table.name]=source.prepare(`SELECT * FROM ${identifier(table.name)}`).all();
 assert.deepEqual(snapshotManifest(restored),snapshotManifest(target));
 assert.throws(()=>replayJournalSqlite(source,[...journal].reverse()),/ordering/);
 assert.throws(()=>replayJournalSqlite(source,[{...journal[0],statements_json:JSON.stringify([{sql:"UPDATE citizens SET capacity=0",values:[]}])}]),/content changed/);
 const afterRejected={...r.postgresSnapshot,data:{}};for(const table of r.postgresSnapshot.schema.filter(s=>s.type==='table'))afterRejected.data[table.name]=source.prepare(`SELECT * FROM ${identifier(table.name)}`).all();assert.deepEqual(snapshotManifest(afterRejected),snapshotManifest(target));
});

test('the production PostgreSQL adapter rejects ballot writes before connection or journal access',async()=>{
 const {readFile}=await import('node:fs/promises');const ts=(await import('typescript')).default;
 const source=(await readFile(new URL('../lib/postgres/database.ts',import.meta.url),'utf8')).replace("'./sql'",JSON.stringify(new URL('../lib/postgres/sql.ts',import.meta.url).href));
 const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;const {PostgresDatabase}=await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
 let connects=0;const db=new PostgresDatabase(async()=>{connects++;throw Error('Must not connect.');});
 await assert.rejects(db.prepare('INSERT INTO civic_voter_receipts(request_id) VALUES (?)').bind('fixture').run(),/disabled pending privacy/);
 await assert.rejects(db.prepare('UPDATE civic_anonymous_ballots SET ranking_json=?').bind('[]').run(),/disabled pending privacy/);await assert.rejects(db.prepare('INSERT INTO public."civic_anonymous_ballots"(id) VALUES (?)').bind('fixture').run(),/disabled pending privacy/);
 await assert.rejects(db.prepare('UPDATE citizens SET capacity=18').run(),/journal retention/);assert.equal(connects,0);
});

test('offline backup preparation keeps private rows outside the repository and reports only aggregate metadata',async t=>{
 const {mkdtemp,readFile,stat,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {spawnSync}=await import('node:child_process');
 const r=await localRuntime({backend:'sqlite'});t.after(()=>r.close());const output=await mkdtemp(join(tmpdir(),'harimu-private-migration-'));t.after(()=>rm(output,{recursive:true,force:true}));
 const result=spawnSync(process.execPath,['--experimental-strip-types','scripts/prepare-postgres-migration.mjs',r.sqliteBackupPath,output],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);assert.doesNotMatch(result.stdout,/alice|bob|Private/);
 const manifest=JSON.parse(await readFile(join(output,'manifest.json'),'utf8'));const snapshot=JSON.parse(await readFile(join(output,'snapshot.json'),'utf8'));const {backupSha256,...expected}=manifest;assert.match(backupSha256,/^[a-f0-9]{64}$/);assert.deepEqual(snapshotManifest(snapshot),expected);assert.equal((await stat(join(output,'snapshot.json'))).mode&0o077,0);
 const forbidden=spawnSync(process.execPath,['--experimental-strip-types','scripts/prepare-postgres-migration.mjs',r.sqliteBackupPath,process.cwd()],{encoding:'utf8'});assert.notEqual(forbidden.status,0);
});
test('unverified backup manifests and nonempty targets are refused before a migration writes',async()=>{
 let queries=0;const connection={query:async()=>{queries++;return {rows:[{tablename:'existing'}]};}};const snapshot={format:'harimu-sqlite-snapshot-v1',schema:[],data:{}};
 const options={backupSha256:'a'.repeat(64),expectedManifest:snapshotManifest(snapshot),compatibilitySql:'CREATE SCHEMA IF NOT EXISTS harimu_compat;'};
 await assert.rejects(importSnapshot(connection,snapshot,{...options,expectedManifest:{}}),/independently verified/);assert.equal(queries,0);
 await assert.rejects(importSnapshot(connection,snapshot,options),/Target must be empty/);assert.equal(queries,1);
});

test('Cloudflare service metadata remains outside the PostgreSQL game snapshot',()=>{
 const source=new DatabaseSync(':memory:');try{source.exec("CREATE TABLE _cf_KV(key TEXT PRIMARY KEY,value BLOB); CREATE INDEX cf_metadata_key ON _cf_KV(key); CREATE TABLE game_fixture(id TEXT PRIMARY KEY)");
 const snapshot=snapshotSqlite(source);assert.ok(snapshot.schema.every(entry=>entry.tbl_name!=='_cf_KV'));assert.equal(snapshot.data._cf_KV,undefined);assert.deepEqual(Object.keys(snapshot.data),['game_fixture']);
 }finally{source.close();}
});

test('D1 rollback transport commits receipts atomically, resumes once, and rejects unsafe groups',async()=>{
 const {replayJournalD1}=await import('../scripts/postgres-migration.mjs');
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('CREATE TABLE fixture(id INTEGER PRIMARY KEY,value INTEGER CHECK(value>=0));INSERT INTO fixture VALUES(1,0)');
 const prepare=(sql,values=[])=>({bind(...bound){return prepare(sql,bound)},async first(){return sqlite.prepare(sql).get(...values)??null},async run(){sqlite.prepare(sql).run(...values);return {success:true}},sql,values});
 const db={prepare,async batch(statements){sqlite.exec('BEGIN IMMEDIATE');try{const result=[];for(const statement of statements)result.push(await statement.run());sqlite.exec('COMMIT');return result}catch(error){sqlite.exec('ROLLBACK');throw error}}};
 const entry=(id,sql,values=[])=>({id,statements_json:JSON.stringify([{sql,values}])});const journal=[entry(1,'UPDATE fixture SET value=value+?', [2]),entry(2,'UPDATE fixture SET value=value+?', [3])];
 try{
  await assert.rejects(replayJournalD1(db,journal),/maintenance/);
  assert.deepEqual(await replayJournalD1(db,journal,{maintenanceConfirmed:true}),{applied:2,skipped:0});
  assert.deepEqual(await replayJournalD1(db,journal,{maintenanceConfirmed:true}),{applied:0,skipped:2});assert.equal(sqlite.prepare('SELECT value FROM fixture').get().value,5);
  await assert.rejects(replayJournalD1(db,[entry(3,'UPDATE fixture SET value=-1')],{maintenanceConfirmed:true}));assert.equal(sqlite.prepare('SELECT count(*) AS n FROM harimu_rollback_journal_receipts').get().n,2);
  await assert.rejects(replayJournalD1(db,[entry(1,'UPDATE fixture SET value=99')],{maintenanceConfirmed:true}),/content changed/);
  await assert.rejects(replayJournalD1(db,[entry(4,'DELETE FROM civic_voter_receipts')],{maintenanceConfirmed:true}),/Invalid rollback/);
  await assert.rejects(replayJournalD1(db,[...journal].reverse(),{maintenanceConfirmed:true}),/ordering/);
 }finally{sqlite.close();}
});

/** Offline preparation only. Never discovers credentials or connects to a host.
 * Source snapshots and validation output contain private game data: do not log,
 * commit, upload or place them in the repository. CLI outputs aggregate metadata.
 */
import {createHash} from 'node:crypto';
import {postgresSql,sqlTokens} from '../lib/postgres/sql.ts';
const identifier=name=>{if(!/^[a-z_][a-z_0-9]*$/i.test(name))throw Error('Unsafe schema identifier.');return `"${name}"`;};
const stable=value=>JSON.stringify(value,(_key,item)=>typeof item==='bigint'?String(item):item instanceof Uint8Array?{binary:Buffer.from(item).toString('base64')}:item);
export function snapshotSqlite(db){
 // Cloudflare's service-owned KV metadata stays in D1 and is never read/exported.
 const schema=db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND tbl_name!='_cf_KV' ORDER BY type,name").all();
 if(schema.some(entry=>!['table','view','index'].includes(entry.type)))throw Error('Unreviewed source schema object.');
 const tables=schema.filter(entry=>entry.type==='table');const data={};
 for(const table of tables){data[table.name]=db.prepare(`SELECT * FROM ${identifier(table.name)}`).all().map(row=>({...row}));}
 return {format:'harimu-sqlite-snapshot-v1',schema,data};
}
export function snapshotManifest(snapshot){
 if(snapshot.format!=='harimu-sqlite-snapshot-v1')throw Error('Unsupported snapshot format.');
 const tables={};for(const table of snapshot.schema.filter(entry=>entry.type==='table')){
  const rows=snapshot.data[table.name];if(!Array.isArray(rows))throw Error('Missing source table.');
  tables[table.name]={rows:rows.length,sha256:createHash('sha256').update(rows.map(stable).sort().join('\n')).digest('hex')};
 }
 return {format:'harimu-manifest-v1',schemaSha256:createHash('sha256').update(stable(snapshot.schema)).digest('hex'),tables};
}
export function orderedSchema(snapshot){
 const tables=snapshot.schema.filter(entry=>entry.type==='table'),sorted=[],pending=[...tables];
 while(pending.length){const ready=pending.filter(table=>[...table.sql.matchAll(/REFERENCES\s+["`]?([\w]+)["`]?/gi)].every(match=>match[1]===table.name||sorted.some(entry=>entry.name===match[1])));if(!ready.length)throw Error('Schema foreign-key cycle requires a reviewed migration.');for(const table of ready){sorted.push(table);pending.splice(pending.indexOf(table),1);}}
 const views=snapshot.schema.filter(entry=>entry.type==='view');const orderedViews=[];let remaining=[...views];
 while(remaining.length){const ready=remaining.filter(view=>!remaining.some(other=>other!==view&&new RegExp(`\\b${other.name}\\b`,'i').test(view.sql)));if(!ready.length)throw Error('View dependency cycle.');for(const view of ready){orderedViews.push(view);remaining=remaining.filter(entry=>entry!==view);}}
 return [...sorted,...snapshot.schema.filter(entry=>entry.type==='index'),...orderedViews];
}
export function postgresSchema(snapshot){
 return orderedSchema(snapshot).map(entry=>postgresSql(sqlTokens(entry.sql).filter(t=>!t.startsWith('--')&&!t.startsWith('/*')).join('')).text+';').join('\n\n');
}
export async function importSnapshot(connection,snapshot,{backupSha256,expectedManifest,compatibilitySql}={}){
 if(!/^[a-f0-9]{64}$/.test(backupSha256??''))throw Error('A verified source backup checksum is required before importing.');
 if(typeof compatibilitySql!=='string'||!compatibilitySql.startsWith('CREATE SCHEMA IF NOT EXISTS harimu_compat;'))throw Error('Reviewed PostgreSQL compatibility schema is required.');
 const manifest=snapshotManifest(snapshot);if(!expectedManifest||stable(manifest)!==stable(expectedManifest))throw Error('Source snapshot differs from its independently verified backup manifest.');const existing=await connection.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");if(existing.rows.length)throw Error('Target must be empty. Existing data will not be replaced.');
 await connection.query('BEGIN');
 try{
  await connection.query('SET LOCAL search_path TO public,pg_catalog');
  await connection.query(compatibilitySql);
  for(const sql of postgresSchema(snapshot).split(/;\s*(?:\n|$)/).filter(Boolean))await connection.query(sql);
  const tables=orderedSchema(snapshot).filter(entry=>entry.type==='table');
  for(const table of tables){for(const row of snapshot.data[table.name]){const columns=Object.keys(row);const values=columns.map(key=>row[key]);await connection.query(`INSERT INTO ${identifier(table.name)} (${columns.map(identifier).join(',')}) VALUES (${columns.map((_key,index)=>`$${index+1}`).join(',')})`,values);}
   if(/AUTOINCREMENT/i.test(table.sql)){const id=table.sql.match(/(?:\(|,)\s*["`]?([\w]+)["`]?\s+INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/i)?.[1];if(!id)throw Error('Unknown source sequence.');await connection.query(`SELECT setval(pg_get_serial_sequence($1,$2),GREATEST(COALESCE((SELECT MAX(${identifier(id)}) FROM ${identifier(table.name)}),0),1),EXISTS(SELECT 1 FROM ${identifier(table.name)}))`,[table.name,id]);}
  }
  await connection.query('CREATE TABLE harimu_postgres_write_journal (id bigserial PRIMARY KEY,statements_json text NOT NULL)');
  await connection.query('CREATE TABLE harimu_storage_migrations (id text PRIMARY KEY,backup_sha256 text NOT NULL,manifest_json text NOT NULL,validated integer NOT NULL CHECK(validated IN (0,1)))');
  await connection.query("INSERT INTO harimu_storage_migrations VALUES ('d1-to-postgres-v1',$1,$2,0)",[backupSha256,stable(manifest)]);
  await validateImportedSnapshot(connection,snapshot);await connection.query("UPDATE harimu_storage_migrations SET validated=1 WHERE id='d1-to-postgres-v1'");await connection.query('COMMIT');return manifest;
 }catch(error){await connection.query('ROLLBACK').catch(()=>{});const code=typeof error?.code==='string'&&/^[A-Z0-9]{5}$/.test(error.code)?` (${error.code})`:'';throw Error(`PostgreSQL import or validation failed${code}.`);}
}
export async function validateImportedSnapshot(connection,snapshot){
 const expected=snapshotManifest(snapshot);const target={...snapshot,data:{}};
 for(const name of Object.keys(expected.tables)){const result=await connection.query(`SELECT * FROM ${identifier(name)}`);target.data[name]=result.rows.map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,typeof value==='bigint'?Number(value):value])));}
 const actual=snapshotManifest(target);
 if(stable(actual)!==stable(expected))throw Error('Imported row counts or content checksums differ.');
 return actual;
}

export function replayJournalSqlite(db,entries){
 let last=0;db.exec('BEGIN IMMEDIATE');try{
  db.exec('CREATE TABLE IF NOT EXISTS harimu_rollback_journal_receipts(id INTEGER PRIMARY KEY,sha256 TEXT NOT NULL)');
  for(const entry of entries){
   const id=Number(entry.id);if(!Number.isSafeInteger(id)||id<=last)throw Error('Invalid journal ordering.');last=id;
   const hash=createHash('sha256').update(entry.statements_json).digest('hex');const prior=db.prepare('SELECT sha256 FROM harimu_rollback_journal_receipts WHERE id=?').get(id);
   if(prior){if(prior.sha256!==hash)throw Error('Journal identifier content changed.');continue;}
   const statements=JSON.parse(entry.statements_json);if(!Array.isArray(statements))throw Error('Invalid write journal.');
   db.prepare('UPDATE harimu_rollback_journal_receipts SET sha256=sha256 WHERE id=-1').run();
   for(const statement of statements){if(typeof statement.sql!=='string'||!Array.isArray(statement.values)||!/^\s*(SELECT|INSERT|UPDATE|DELETE)\b/i.test(statement.sql)||sqlTokens(statement.sql).some(token=>token===';'||token.startsWith('--')||token.startsWith('/*')))throw Error('Invalid journal statement.');db.prepare(statement.sql).run(...statement.values);}
   db.prepare('INSERT INTO harimu_rollback_journal_receipts VALUES (?,?)').run(id,hash);
  }db.exec('COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error;}
}

/** Operator-only rollback transport. D1 must remain frozen throughout replay.
 * Each journal group and its receipt commit together through native D1.batch.
 * Never expose this operation as an application route.
 */
export async function replayJournalD1(db,entries,{maintenanceConfirmed=false}={}){
 if(!maintenanceConfirmed)throw Error('D1 rollback requires confirmed maintenance.');
 let previous=0;
 const groups=entries.map(entry=>{
  const id=Number(entry.id);if(!Number.isSafeInteger(id)||id<=previous)throw Error('Invalid journal ordering.');previous=id;
  const statements=JSON.parse(entry.statements_json);
  if(!Array.isArray(statements)||!statements.length)throw Error('Invalid write journal.');
  for(const statement of statements){
   if(typeof statement.sql!=='string'||!Array.isArray(statement.values)||!/^\s*(INSERT|UPDATE|DELETE)\b/i.test(statement.sql)||sqlTokens(statement.sql).some(token=>token===';'||token.startsWith('--')||token.startsWith('/*'))||/\b(civic_voter_receipts|civic_anonymous_ballots)\b/i.test(statement.sql))throw Error('Invalid rollback statement.');
  }
  return {id,statements,sha256:createHash('sha256').update(entry.statements_json).digest('hex')};
 });
 await db.prepare('CREATE TABLE IF NOT EXISTS harimu_rollback_journal_receipts(id INTEGER PRIMARY KEY,sha256 TEXT NOT NULL)').run();
 let applied=0,skipped=0;
 for(const group of groups){
  const prior=await db.prepare('SELECT sha256 FROM harimu_rollback_journal_receipts WHERE id=?').bind(group.id).first();
  if(prior){if(prior.sha256!==group.sha256)throw Error('Journal identifier content changed.');skipped++;continue;}
  const latest=await db.prepare('SELECT MAX(id) AS id FROM harimu_rollback_journal_receipts').first();
  if(latest?.id>=group.id)throw Error('Invalid journal ordering.');
  const statements=[db.prepare('UPDATE harimu_rollback_journal_receipts SET sha256=sha256 WHERE id=-1'),...group.statements.map(statement=>db.prepare(statement.sql).bind(...statement.values)),db.prepare('INSERT INTO harimu_rollback_journal_receipts VALUES (?,?)').bind(group.id,group.sha256)];
  const results=await db.batch(statements);if(results.some(result=>!result.success))throw Error('D1 rollback group failed.');applied++;
 }
 return {applied,skipped};
}

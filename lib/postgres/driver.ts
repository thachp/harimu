import {accountElectionSchemas} from '../preview-election';
import {postgresSql} from './sql';
import {Client,types} from 'pg';
import {PostgresDatabase} from './database';
/** Hyperdrive owns the pool. Clients are never reused across Worker requests. */
export function postgresConnection(connectionString:string,journalRetentionApproved:boolean,allowAccountElectionWrites=false){
 return new PostgresDatabase(async()=>{
  const client=new Client({connectionString,types:{getTypeParser(oid:number,format?:'text'|'binary'){
   if(format!=='binary'&&(oid===20||oid===1700))return (value:string)=>{const number=Number(value);if(!Number.isSafeInteger(number))throw Error('Database integer exceeds safe application range.');return number;};
   return types.getTypeParser(oid,format);
  }}});
  try{await client.connect();}catch{await client.end().catch(()=>{});throw Error('PostgreSQL connection unavailable.');}
  return {query:async(text:string,values?:unknown[])=>{const result=await client.query(text,values);return {rows:result.rows,rowCount:result.rowCount};},release:async()=>{await client.end();}};
 },{journalRetentionApproved,allowAccountElectionWrites});
}

/** Narrow additive migration under the already approved preview admin role.
 * Existing world tables and migration markers are never replaced or rewritten.
 */
export async function initializeAccountElectionSchema(connectionString:string){
 const client=new Client({connectionString});
 try{await client.connect();await client.query('BEGIN');await client.query('SET LOCAL search_path TO public,pg_catalog');await client.query('SELECT pg_advisory_xact_lock(728391462)');
  for(const sql of accountElectionSchemas)await client.query(postgresSql(sql).text);
  await client.query('COMMIT');
 }catch{await client.query('ROLLBACK').catch(()=>{});throw Error('Preview election schema migration failed.');}finally{await client.end().catch(()=>{});}
}

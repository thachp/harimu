import {Client,types} from 'pg';
import {PostgresDatabase} from './database';
/** Hyperdrive owns the pool. Clients are never reused across Worker requests. */
export function postgresConnection(connectionString:string,journalRetentionApproved:boolean){
 return new PostgresDatabase(async()=>{
  const client=new Client({connectionString,types:{getTypeParser(oid:number,format?:'text'|'binary'){
   if(format!=='binary'&&(oid===20||oid===1700))return (value:string)=>{const number=Number(value);if(!Number.isSafeInteger(number))throw Error('Database integer exceeds safe application range.');return number;};
   return types.getTypeParser(oid,format);
  }}});
  try{await client.connect();}catch{await client.end().catch(()=>{});throw Error('PostgreSQL connection unavailable.');}
  return {query:async(text:string,values?:unknown[])=>{const result=await client.query(text,values);return {rows:result.rows,rowCount:result.rowCount};},release:async()=>{await client.end();}};
 },{journalRetentionApproved});
}

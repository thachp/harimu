/** Isolated PostgreSQL/WASM engine. No network, service account or secret. */
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import ts from 'typescript';
const databaseSource=(await readFile(new URL('../../lib/postgres/database.ts',import.meta.url),'utf8')).replace("'./sql'",JSON.stringify(new URL('../../lib/postgres/sql.ts',import.meta.url).href));
const databaseCode=ts.transpileModule(databaseSource,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {PostgresDatabase}=await import(`data:text/javascript;base64,${Buffer.from(databaseCode).toString('base64')}`);
import {postgresSql,sqlTokens} from '../../lib/postgres/sql.ts';
import {importSnapshot,snapshotSqlite,snapshotManifest} from '../../scripts/postgres-migration.mjs';
export async function postgresFixture(sqlite,path,directory){
 const snapshot=snapshotSqlite(sqlite);const options={parsers:{20:value=>Number(value),1700:value=>Number(value)}};
 let pg=new PGlite(`${directory}/postgres`,options),pending=Promise.resolve(),tail=Promise.resolve();
 await pg.waitReady;const compatibilitySql=await readFile(new URL('../../db/postgres/compatibility.sql',import.meta.url),'utf8');
 const direct={query:async(text,values)=>{try{if(text===compatibilitySql){await pg.exec(text);return {rows:[],rowCount:0};}return await pg.query(text,values);}catch(error){if(process.env.HARIMU_PG_FIXTURE_DEBUG==='1')console.error(text,error.message);throw error;}}};
 await importSnapshot(direct,snapshot,{backupSha256:createHash('sha256').update(await readFile(path)).digest('hex'),expectedManifest:snapshotManifest(snapshot),compatibilitySql});
 const connect=async()=>{const old=tail;let release;tail=new Promise(resolve=>release=resolve);await old;await pending;return{query:direct.query,release:async()=>release()};};
 const db=new PostgresDatabase(connect,{allowBallotFixtureWrites:true,journalRetentionApproved:true});
 db.sqlite={exec(sql){pending=pending.then(async()=>{for(const part of sqlTokens(sql).filter(token=>!token.startsWith('--')&&!token.startsWith('/*')).join('').split(';').filter(s=>s.trim()))await direct.query(postgresSql(part).text);});}};
 return {db,snapshot,reopen(){pending=pending.then(async()=>{await pg.close();pg=new PGlite(`${directory}/postgres`,options);await pg.waitReady;});},async close(){await pending;await tail;await pg.close();}};
}

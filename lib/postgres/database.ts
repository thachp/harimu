import type {DatabaseResult,DatabaseStatement,GameDatabase} from '../database-contract';
import {postgresSql,sqlTokens} from './sql';
export type QueryConnection={query:(text:string,values?:unknown[])=>Promise<{rows:Record<string,unknown>[];rowCount?:number|null;affectedRows?:number}>;release:()=>Promise<void>};
const writerLock='728391462';
function targetsBallot(sql:string){
 const tokens=sqlTokens(sql).filter(token=>token.trim()&&!token.startsWith('--')&&!token.startsWith('/*'));
 const first=tokens[0]?.toUpperCase();let index=first==='INSERT'?tokens.findIndex(token=>token.toUpperCase()==='INTO')+1:first==='UPDATE'?1:first==='DELETE'?tokens.findIndex(token=>token.toUpperCase()==='FROM')+1:-1;
 if(index<0)return false;if(tokens[index]?.toUpperCase()==='ONLY')index++;
 if(tokens[index+1]==='.')index+=2;
 return /^(civic|poc|assembly|primary)_(anonymous_ballots|voter_receipts)$/i.test(tokens[index]?.replace(/^["`]|["`]$/g,'')??'');
}
function normalize(value:unknown):unknown{
 if(typeof value==='bigint'){const number=Number(value);if(!Number.isSafeInteger(number))throw Error('Database integer exceeds safe application range.');return number;}
 if(typeof value==='boolean')return Number(value);
 if(Array.isArray(value))return value.map(normalize);
 if(value&&typeof value==='object'&&!(value instanceof Uint8Array))return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,normalize(item)]));
 return value;
}
class Statement implements DatabaseStatement{
 constructor(readonly owner:PostgresDatabase,readonly sql:string,readonly values:unknown[]=[]){ }
 bind(...values:unknown[]){return new Statement(this.owner,this.sql,values);}
 async run(){return (await this.owner.execute([this],!/^\s*(SELECT|PRAGMA)/i.test(this.sql)))[0];}
 async all<T>(){return await this.run() as DatabaseResult<T>;}
 async first<T>(){return (await this.all<T>()).results[0]??null;}
}
/** Each group has a fresh connection. Writes serialize like D1, on the primary.
 * No query caching/read replica may sit in front of authoritative gameplay reads.
 */
export class PostgresDatabase implements GameDatabase{
 constructor(private readonly connect:()=>Promise<QueryConnection>,private readonly options:{allowBallotFixtureWrites?:boolean;allowAccountElectionWrites?:boolean;journalRetentionApproved?:boolean;journal?:boolean}={}){ }
 prepare(sql:string){return new Statement(this,sql);}
 async batch(statements:DatabaseStatement[]){if(statements.some(s=>!(s instanceof Statement)||s.owner!==this))throw Error('Foreign database statement.');return this.execute(statements as Statement[],true);}
 async execute(statements:Statement[],transaction:boolean){
  const ballot=statements.some(statement=>targetsBallot(statement.sql));
  if(ballot&&statements.some(statement=>!targetsBallot(statement.sql)))throw Error('Ballot writes require a dedicated transaction; unrelated writes must remain journaled.');
  if(ballot&&!this.options.allowBallotFixtureWrites&&!(this.options.allowAccountElectionWrites&&statements.every(statement=>targetsBallot(statement.sql)&&/\bpoc_(anonymous_ballots|voter_receipts)\b/i.test(statement.sql)&&!/\bcivic_(anonymous_ballots|voter_receipts)\b/i.test(statement.sql))))throw Error('Ballot transitions remain disabled pending privacy review.');
  if(transaction&&this.options.journal!==false&&this.options.journalRetentionApproved!==true)throw Error('Rollback journal retention is not approved.');
  let connection:QueryConnection;try{connection=await this.connect();}catch{throw Error('PostgreSQL connection unavailable.');}let begun=false;const results:DatabaseResult[]=[];let changes=0;
  try{
   await connection.query(transaction?'BEGIN':'BEGIN READ ONLY');begun=true;await connection.query('SET LOCAL search_path TO public,pg_catalog');await connection.query("SET LOCAL TIME ZONE 'UTC'");
   if(transaction)await connection.query(`SELECT pg_advisory_xact_lock(${writerLock})`);
   for(const statement of statements){if(!/^\s*(SELECT|INSERT|UPDATE|DELETE|PRAGMA)\b/i.test(statement.sql))throw Error('Runtime database schema changes are not allowed.');const query=postgresSql(statement.sql,statement.values,changes);const result=await connection.query(query.text,query.values);
    const mutates=/^\s*(INSERT|UPDATE|DELETE)/i.test(query.text),statementChanges=mutates?result.rowCount??result.affectedRows??0:0;
    if(mutates)changes=statementChanges;
    results.push({success:true,meta:{changes:statementChanges},results:normalize(result.rows) as Record<string,unknown>[]});
   }
   // A ranking-free boundary makes journal-only rollback fail closed after a ballot.
   if(this.options.journal!==false&&transaction&&ballot&&results.some(result=>result.meta.changes>0))await connection.query('INSERT INTO harimu_postgres_write_journal(statements_json) VALUES ($1)',[JSON.stringify([{ballotBoundary:'separated-ballots-v1'}])]);
   if(this.options.journal!==false&&transaction&&!ballot&&results.some(result=>result.meta.changes>0))await connection.query('INSERT INTO harimu_postgres_write_journal(statements_json) VALUES ($1)',[JSON.stringify(statements.filter(statement=>/^\s*(INSERT|UPDATE|DELETE)\b/i.test(statement.sql)).map(statement=>({sql:statement.sql,values:statement.values})))]);
   await connection.query('COMMIT');return results;
  }catch(error){if(begun)await connection.query('ROLLBACK').catch(()=>{});const code=error&&typeof error==='object'&&'code' in error&&typeof error.code==='string'&&/^[A-Z0-9]{5}$/.test(error.code)?` (${error.code})`:'';// #179: keep only the relation name of an undefined-table error (no values or SQL) so callers can tell which table is missing.
   const relation=code===' (42P01)'&&typeof (error as {message?:unknown}).message==='string'?/relation "([\w.]+)" does not exist/.exec((error as {message:string}).message)?.[1]:undefined;
   throw Error(`PostgreSQL operation failed${code}${relation?`: relation "${relation}" does not exist`:''}.`);
  }finally{await connection.release().catch(()=>{});}
 }
}

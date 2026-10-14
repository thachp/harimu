import type {GameDatabase,DatabaseStatement} from './database-contract';
import {electionSchemas,electionId} from './elections';
export const accountElectionId='kindle-presidential-account-poc-1';
export function accountElectionEnabled(bindings:{NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW?:string;HARIMU_ACCOUNT_ELECTION_POC_ENABLED?:string}){
 return bindings.NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW==='true'&&bindings.HARIMU_ACCOUNT_ELECTION_POC_ENABLED==='true';
}
// Fixed namespace isolates the owner-approved account-level preview exception
// from Tier1 elections. No request input controls identifiers or eligibility.
export const accountElectionSql=(sql:string)=>sql.replace(/\bcivic_elections\b/g,'poc_elections').replace(/\bcivic_voter_receipts\b/g,'poc_voter_receipts').replace(/\bcivic_anonymous_ballots\b/g,'poc_anonymous_ballots').replace(/\bidx_anonymous_ballots_election\b/g,'idx_poc_ballots_election').replace(/tier1-human-v1/g,'preview-citizen-v1');
export const accountElectionSchemas=electionSchemas.map(accountElectionSql);
export function accountElectionDatabase(database:GameDatabase):GameDatabase{
 const wrap=(statement:DatabaseStatement):DatabaseStatement=>({
  bind:(...values)=>wrap(statement.bind(...values.map(value=>value===electionId?accountElectionId:value))),
  first:()=>statement.first(),all:()=>statement.all(),run:()=>statement.run(),
 });
 // batch needs the underlying statements rather than wrappers.
 const originals=new WeakMap<DatabaseStatement,DatabaseStatement>();
 const tracked=(statement:DatabaseStatement):DatabaseStatement=>{const result=wrap(statement);result.bind=(...values)=>tracked(statement.bind(...values.map(value=>value===electionId?accountElectionId:value)));originals.set(result,statement);return result;};
 return {prepare:sql=>tracked(database.prepare(accountElectionSql(sql))),batch:statements=>database.batch(statements.map(statement=>{const original=originals.get(statement);if(!original)throw Error('Foreign election statement.');return original;}))};
}

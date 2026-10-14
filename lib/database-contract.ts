/** Application-owned SQL contract. No connection or credential enters a DTO. */
export type DatabaseResult<T=Record<string,unknown>>={success:boolean;meta:{changes:number;last_row_id?:number};results:T[]};
export interface DatabaseStatement{
 bind(...values:unknown[]):DatabaseStatement;
 first<T=Record<string,unknown>>():Promise<T|null>;
 all<T=Record<string,unknown>>():Promise<DatabaseResult<T>>;
 run():Promise<DatabaseResult>;
}
export interface GameDatabase{
 prepare(sql:string):DatabaseStatement;
 batch(statements:DatabaseStatement[]):Promise<DatabaseResult[]>;
}

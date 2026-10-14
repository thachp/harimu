import {DatabaseSync} from 'node:sqlite';
import {readFile,mkdir,writeFile,realpath,stat} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {snapshotSqlite,snapshotManifest,postgresSchema} from './postgres-migration.mjs';
const [source,output]=process.argv.slice(2);if(!source||!output)throw Error('Usage: node --experimental-strip-types scripts/prepare-postgres-migration.mjs <protected-sqlite-backup> <private-output-directory-outside-repository>');
const root=fileURLToPath(new URL('../',import.meta.url)),target=resolve(output),distance=relative(root,target);if(!distance.startsWith('..'))throw Error('Private migration data must stay outside the repository.');
await mkdir(target,{recursive:true,mode:0o700});
const canonicalTarget=await realpath(target),canonicalRoot=await realpath(root);if(!relative(canonicalRoot,canonicalTarget).startsWith('..')||((await stat(canonicalTarget)).mode&0o077)!==0)throw Error('Migration output must be a private directory outside the repository.');
const db=new DatabaseSync(resolve(source),{readOnly:true});
try{
 db.exec('BEGIN');
 const snapshot=snapshotSqlite(db),manifest=snapshotManifest(snapshot),backupSha256=createHash('sha256').update(await readFile(resolve(source))).digest('hex');
 for(const [name,content] of [['snapshot.json',JSON.stringify(snapshot)],['manifest.json',JSON.stringify({...manifest,backupSha256})],['schema.sql',postgresSchema(snapshot)]])await writeFile(resolve(target,name),content,{mode:0o600,flag:'wx'});
 db.exec('COMMIT');
 console.log(JSON.stringify({tables:Object.keys(manifest.tables).length,rows:Object.values(manifest.tables).reduce((sum,table)=>sum+table.rows,0),backupSha256}));
}finally{db.close();}

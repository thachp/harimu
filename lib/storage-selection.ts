// Preview cutover validated against the protected D1 backup. #501a: production has its own explicit, fail-closed path (HARIMU_PRODUCTION_STORAGE=true, Postgres only, never D1,
// never together with the preview marker, never with the temporary admin waiver or the preview election POC). Nothing in wrangler.jsonc sets it, so preview is unchanged.
export const postgresRuntimeEnabled=true;
/** #501c: production keeps no rollback journal (harimu_postgres_write_journal), which would grow without bound and has no purpose with no D1 to roll back to. scripts/deploy-production.mjs refuses to deploy while this is not false. */
export const productionKeepsWriteJournal=false;
export function selectStorageBackend(input:{backend?:string;developmentPreview?:string;maintenance?:string;cutoverReady?:string;hyperdriveConfigured:boolean;implementationEnabled?:boolean;journalRetentionApproved?:boolean;productionStorage?:string;temporaryAdminApproved?:string;accountElectionEnabled?:boolean}){
 if(input.maintenance==='true')throw Error('Storage is paused for migration validation.');
 if(input.productionStorage==='true'){
  // Every condition is mandatory and none falls back to D1: a mistake here must stop the Worker, not serve from the wrong store.
  if(input.backend!=='postgres'||input.implementationEnabled!==true||input.developmentPreview==='true'||input.temporaryAdminApproved==='true'||input.accountElectionEnabled===true||input.cutoverReady!=='true'||!input.hyperdriveConfigured)throw Error('Production PostgreSQL storage is not approved and ready.');
  return 'postgres' as const;
 }
 if(input.backend===undefined||input.backend==='d1')return 'd1' as const;
 if(input.backend!=='postgres')throw Error('Unknown storage backend.');
 if(input.implementationEnabled!==true)return 'd1' as const;
 if(input.developmentPreview!=='true'||input.cutoverReady!=='true'||!input.hyperdriveConfigured||input.journalRetentionApproved!==true)throw Error('PostgreSQL cutover is not approved and ready.');
 return 'postgres' as const;
}

export function assertPostgresApplicationRole(role:{canCreateSchema:number;canChangeMarker:number;superuser:number},temporaryPreviewAdminApproved=false){
 if(role.superuser!==0||(!temporaryPreviewAdminApproved&&(role.canCreateSchema!==0||role.canChangeMarker!==0)))throw Error('PostgreSQL requires a restricted application role.');
}

/** #501a: readiness markers in harimu_storage_migrations. Preview accepts only the validated D1 import. Production also accepts fresh-world-v1, written by the empty-database bootstrap
 *  (backup_sha256 holds the sha256 of the applied migration manifest), because production launches empty (Patrick's ruling on #501). */
export const importedWorldMarker='d1-to-postgres-v1',freshWorldMarker='fresh-world-v1';
export const storageMarkerIds=(production:boolean)=>production?[freshWorldMarker,importedWorldMarker]:[importedWorldMarker];
export function assertStorageMarker(rows:{id:string;validated:number;backup_sha256:string}[],production:boolean){
 const ok=rows.some(row=>storageMarkerIds(production).includes(row.id)&&row.validated===1&&/^[a-f0-9]{64}$/.test(row.backup_sha256));
 if(!ok)throw Error(production?'PostgreSQL production world has not been initialized.':'PostgreSQL import has not been validated.');
}

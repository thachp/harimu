// Preview cutover validated against the protected D1 backup; production stays gated.
export const postgresRuntimeEnabled=true;
export function selectStorageBackend(input:{backend?:string;developmentPreview?:string;maintenance?:string;cutoverReady?:string;hyperdriveConfigured:boolean;implementationEnabled?:boolean;journalRetentionApproved?:boolean}){
 if(input.maintenance==='true')throw Error('Storage is paused for migration validation.');
 if(input.backend===undefined||input.backend==='d1')return 'd1' as const;
 if(input.backend!=='postgres')throw Error('Unknown storage backend.');
 if(input.implementationEnabled!==true)return 'd1' as const;
 if(input.developmentPreview!=='true'||input.cutoverReady!=='true'||!input.hyperdriveConfigured||input.journalRetentionApproved!==true)throw Error('PostgreSQL cutover is not approved and ready.');
 return 'postgres' as const;
}

export function assertPostgresApplicationRole(role:{canCreateSchema:number;canChangeMarker:number;superuser:number},temporaryPreviewAdminApproved=false){
 if(role.superuser!==0||(!temporaryPreviewAdminApproved&&(role.canCreateSchema!==0||role.canChangeMarker!==0)))throw Error('PostgreSQL requires a restricted application role.');
}

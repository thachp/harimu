/**
 * #138 QA tooling. Preview-only: a QA account listed in HARIMU_QA_TEST_CITIZEN_IDS can switch its own
 * citizen to a playable nation (e.g. Korund) without spending the one free citizenship change.
 * Requires HARIMU_QA_TEST_CITIZENS=true AND NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW=true; both default off
 * for production. The id list is account ids, not credentials.
 */
import {liveNations} from './playable-nations';
export type QaBindings={HARIMU_QA_TEST_CITIZENS?:string;HARIMU_QA_TEST_CITIZEN_IDS?:string;NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW?:string};
export const qaTestNations=liveNations; // #485: the shared playable list
export function qaTestCitizenAllowed(bindings:QaBindings|undefined,userId:string):boolean{
 if(bindings?.HARIMU_QA_TEST_CITIZENS!=='true'||bindings.NEXT_PUBLIC_HARIMU_DEVELOPMENT_PREVIEW!=='true')return false;
 return (bindings.HARIMU_QA_TEST_CITIZEN_IDS??'').split(',').map(id=>id.trim()).filter(Boolean).includes(userId);
}
export const qaTestNationSql=`UPDATE citizens SET nation_id=?,updated_at=? WHERE clerk_user_id=?`;

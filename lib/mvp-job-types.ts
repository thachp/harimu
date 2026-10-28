/** #886 (a): the single MVP job-type catalog. ARC ruling on #886 approved the eight MVP job types (docs §27 mvp-scope "8 job types", which the docs never
 *  name; grouped by the §11.3 job families). Every playable work order and every Korund Labor Bureau post maps to exactly one type, so the audit can count them.
 *  Pure data, no runtime imports (tests load it directly). Read-only: nothing here starts, pays or changes a shift.
 *  Flag HARIMU_MVP_JOB_TYPES_ENABLED: "true" in preview, "false" in production. Off: GET /api/jobs/types is 404 and nothing else reads this file.
 *  Later slices (ARC on #886): (b) Korund's quarry, foundry, rail and plan-clerk posts become playable shifts paid in Labor Notes, (c) Aurelle gets
 *  quarrying and foundry charter jobs paid in Crowns; each payment writes an issuance record (unblocks #885). (b) and (c) have landed, so every entry is now `playable` (Korund posts: lib/korund-posts; Aurelle charters: lib/aurelle). */
export const mvpJobTypesEnabled = (env: { HARIMU_MVP_JOB_TYPES_ENABLED?: string } | null | undefined) => env?.HARIMU_MVP_JOB_TYPES_ENABLED === 'true';

export const mvpJobTypeIds = ['farming', 'orchard', 'herding', 'forestry', 'quarrying', 'foundry', 'freight', 'archive'] as const;
export type MvpJobTypeId = typeof mvpJobTypeIds[number];
export type JobFamily = 'primary' | 'craft-industry' | 'commerce' | 'public-service';
export const mvpJobTypes: Readonly<Record<MvpJobTypeId, { name: string; family: JobFamily }>> = {
  farming: { name: 'Farming', family: 'primary' },
  orchard: { name: 'Orchard', family: 'primary' },
  herding: { name: 'Herding', family: 'primary' },
  forestry: { name: 'Forestry', family: 'primary' },
  quarrying: { name: 'Quarrying', family: 'primary' },
  foundry: { name: 'Foundry and industry', family: 'craft-industry' },
  freight: { name: 'Freight', family: 'commerce' },
  archive: { name: 'Archive and clerk', family: 'public-service' },
};

export type MvpNation = 'kindle' | 'korund' | 'aurelle';
/** `playable`: a shift exists (a lib/db.ts workOrderSeeds order, a #886 (b) Korund post or a #886 (c) Aurelle charter, the last two behind the flag). `planned`: approved but not yet built (none today). */
export type JobEntry = { id: string; nation: MvpNation; type: MvpJobTypeId; status: 'playable' | 'planned'; source: 'work-order' | 'labor-bureau' | 'charter' };
export const mvpJobs: readonly JobEntry[] = [
  { id: 'harvest', nation: 'kindle', type: 'farming', status: 'playable', source: 'work-order' },
  { id: 'orchard', nation: 'kindle', type: 'orchard', status: 'playable', source: 'work-order' },
  { id: 'herding', nation: 'kindle', type: 'herding', status: 'playable', source: 'work-order' },
  { id: 'logging', nation: 'kindle', type: 'forestry', status: 'playable', source: 'work-order' },
  { id: 'freight', nation: 'kindle', type: 'freight', status: 'playable', source: 'work-order' },
  { id: 'archive', nation: 'kindle', type: 'archive', status: 'playable', source: 'work-order' },
  { id: 'korund-food-production', nation: 'korund', type: 'farming', status: 'playable', source: 'work-order' },
  { id: 'korund-quarry-gang', nation: 'korund', type: 'quarrying', status: 'playable', source: 'labor-bureau' },
  { id: 'korund-foundry-hand', nation: 'korund', type: 'foundry', status: 'playable', source: 'labor-bureau' },
  { id: 'korund-rail-crew', nation: 'korund', type: 'freight', status: 'playable', source: 'labor-bureau' },
  { id: 'korund-plan-clerk', nation: 'korund', type: 'archive', status: 'playable', source: 'labor-bureau' },
  { id: 'aurelle-food-estate', nation: 'aurelle', type: 'farming', status: 'playable', source: 'work-order' },
  { id: 'aurelle-quarry-charter', nation: 'aurelle', type: 'quarrying', status: 'playable', source: 'charter' },
  { id: 'aurelle-foundry-charter', nation: 'aurelle', type: 'foundry', status: 'playable', source: 'charter' },
];
export const jobTypeOf = (jobId: unknown): MvpJobTypeId | null => mvpJobs.find(job => job.id === jobId)?.type ?? null;

/** The public catalog: each type with its jobs, and whether any of them is playable today. Deterministic order (mvpJobTypeIds, then catalog order). */
export function jobTypeCatalog() {
  return mvpJobTypeIds.map(id => {
    const jobs = mvpJobs.filter(job => job.type === id).map(({ id: jobId, nation, status }) => ({ id: jobId, nation, status }));
    return { id, ...mvpJobTypes[id], playable: jobs.some(job => job.status === 'playable'), jobs };
  });
}

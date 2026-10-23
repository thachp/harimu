import { env } from 'cloudflare:workers';
import { jobTypeCatalog, mvpJobTypesEnabled } from '@/lib/mvp-job-types';

// #886 (a): the MVP job-type catalog, read-only static data (no auth, no database). Flag off: 404, nothing else changes.
export const dynamic = 'force-dynamic';
export async function GET() {
  if (!mvpJobTypesEnabled(env as unknown as { HARIMU_MVP_JOB_TYPES_ENABLED?: string })) return Response.json({ error: 'Not found.', reason: 'not_found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return Response.json({ jobTypes: jobTypeCatalog() }, { headers: { 'Cache-Control': 'no-store' } });
}

/** #138: GET /api/version — which build is live. Public build identity only; never env or secrets. */
declare const __HARIMU_BUILD_SHA__: string | undefined;
declare const __HARIMU_BUILT_AT__: string | undefined;
export const dynamic = 'force-dynamic';
export function versionPayload() {
  return {
    sha: typeof __HARIMU_BUILD_SHA__ === 'string' ? __HARIMU_BUILD_SHA__ : 'unknown',
    builtAt: typeof __HARIMU_BUILT_AT__ === 'string' ? __HARIMU_BUILT_AT__ : null,
  };
}
export function GET() {
  return Response.json(versionPayload(), { headers: { 'Cache-Control': 'no-store' } });
}

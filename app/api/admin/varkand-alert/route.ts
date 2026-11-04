import { env } from 'cloudflare:workers';
import { getDatabase } from '@/lib/db';
import { bearerMatches } from '@/lib/war-authority'; // the same constant-time bearer check the other admin routes use
import { isVarkandAlert, readVarkandAlert, setVarkandAlert, varkandAlertEnabled } from '@/lib/varkand-alert';

export const dynamic = 'force-dynamic';
const privateJson = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });
type Bindings = { HARIMU_ADMIN_TOKEN?: string };

// #1081: staff set Varkand's Alert Level. Flag off or HARIMU_ADMIN_TOKEN unset/short = 404 before any DB access; a wrong bearer = 401.
async function guard(request: Request) {
  const token = (env as unknown as Bindings).HARIMU_ADMIN_TOKEN;
  if (!varkandAlertEnabled(env) || typeof token !== 'string' || token.length < 16) return privateJson({ error: 'Not found.' }, 404);
  if (!(await bearerMatches(request.headers.get('Authorization'), token))) return privateJson({ error: 'A server credential is required.' }, 401);
  return null;
}
export async function GET(request: Request) {
  const denied = await guard(request); if (denied) return denied;
  return privateJson(await readVarkandAlert(await getDatabase()));
}
export async function POST(request: Request) {
  const denied = await guard(request); if (denied) return denied;
  let body: unknown; try { body = await request.json(); } catch { return privateJson({ error: 'Invalid request.' }, 400); }
  const level = body !== null && typeof body === 'object' ? (body as { level?: unknown }).level : undefined;
  if (!isVarkandAlert(level)) return privateJson({ error: 'level must be green, amber or red.' }, 400);
  return privateJson(await setVarkandAlert(await getDatabase(), level, Math.floor(Date.now() / 1000)));
}

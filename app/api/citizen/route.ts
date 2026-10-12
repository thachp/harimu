import { createClerkClient } from '@clerk/backend';
import { env } from 'cloudflare:workers';
import { getDatabase } from '@/lib/db';

export const dynamic = 'force-dynamic';

const allowedHorizons = new Set(['today', 'week', 'season']);

async function authenticatedUserId(request: Request) {
  const bindings = env as unknown as {
    CLERK_SECRET_KEY?: string;
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?: string;
  };

  if (!bindings.CLERK_SECRET_KEY || !bindings.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    throw new Error('Clerk server credentials are unavailable.');
  }

  const requestState = await createClerkClient({
    secretKey: bindings.CLERK_SECRET_KEY,
    publishableKey: bindings.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  }).authenticateRequest(request, { acceptsToken: 'session_token' });

  return requestState.isAuthenticated ? requestState.toAuth().userId : null;
}

export async function GET(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return Response.json({ error: 'Sign in required.' }, { status: 401 });

  const database = await getDatabase();
  const [profile, plan, itemResult] = await Promise.all([
    database.prepare(`SELECT clerk_user_id, nation_id, display_name, capacity, influence, standing
      FROM citizens WHERE clerk_user_id = ?`).bind(userId).first<{
      clerk_user_id: string;
      nation_id: string | null;
      display_name: string | null;
      capacity: number;
      influence: number;
      standing: string;
    }>(),
    database.prepare(`SELECT horizon, private_note, saved_at
      FROM citizen_plans WHERE clerk_user_id = ?`).bind(userId).first<{
      horizon: string;
      private_note: string;
      saved_at: string;
    }>(),
    database.prepare(`SELECT task_id FROM citizen_plan_items
      WHERE clerk_user_id = ? AND completed = 1`).bind(userId).all<{ task_id: string }>(),
  ]);

  return Response.json({
    profile: profile ? {
      nationId: profile.nation_id,
      displayName: profile.display_name,
      capacity: profile.capacity,
      influence: profile.influence,
      standing: profile.standing,
    } : null,
    plan: plan ? {
      horizon: plan.horizon,
      note: plan.private_note,
      savedAt: plan.saved_at,
      completedIds: itemResult.results.map((item) => item.task_id),
    } : null,
  });
}

export async function POST(request: Request) {
  const userId = await authenticatedUserId(request);
  if (!userId) return Response.json({ error: 'Sign in required.' }, { status: 401 });

  const database = await getDatabase();
  const body = await request.json() as Record<string, unknown>;
  const now = new Date().toISOString();

  if (body.action === 'enroll') {
    const nationId = typeof body.nationId === 'string' ? body.nationId : '';
    const nation = await database.prepare('SELECT id FROM nations WHERE id = ?').bind(nationId).first();
    if (!nation) return Response.json({ error: 'Unknown nation.' }, { status: 400 });

    await database.prepare(`INSERT INTO citizens (
      clerk_user_id, nation_id, capacity, influence, standing, created_at, updated_at
    ) VALUES (?, ?, 18, 1240, 'Good standing', ?, ?)
    ON CONFLICT(clerk_user_id) DO UPDATE SET nation_id = excluded.nation_id, updated_at = excluded.updated_at`)
      .bind(userId, nationId, now, now)
      .run();

    return Response.json({ ok: true, nationId });
  }

  if (body.action === 'save-plan') {
    const horizon = typeof body.horizon === 'string' && allowedHorizons.has(body.horizon)
      ? body.horizon
      : 'week';
    const note = typeof body.note === 'string' ? body.note.slice(0, 2000) : '';
    const requestedIds = Array.isArray(body.completedIds)
      ? body.completedIds.filter((item): item is string => typeof item === 'string')
      : [];
    const taskResult = await database.prepare('SELECT id FROM planning_tasks').all<{ id: string }>();
    const allowedTaskIds = new Set(taskResult.results.map((task) => task.id));
    const completedIds = [...new Set(requestedIds.filter((id) => allowedTaskIds.has(id)))];

    await database.batch([
      database.prepare(`INSERT INTO citizens (
        clerk_user_id, nation_id, capacity, influence, standing, created_at, updated_at
      ) VALUES (?, 'jade', 18, 1240, 'Good standing', ?, ?)
      ON CONFLICT(clerk_user_id) DO UPDATE SET updated_at = excluded.updated_at`)
        .bind(userId, now, now),
      database.prepare(`INSERT INTO citizen_plans (clerk_user_id, horizon, private_note, saved_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(clerk_user_id) DO UPDATE SET
          horizon = excluded.horizon,
          private_note = excluded.private_note,
          saved_at = excluded.saved_at`)
        .bind(userId, horizon, note, now),
      database.prepare('DELETE FROM citizen_plan_items WHERE clerk_user_id = ?').bind(userId),
      ...completedIds.map((taskId) => database.prepare(`INSERT INTO citizen_plan_items (
        clerk_user_id, task_id, completed, updated_at
      ) VALUES (?, ?, 1, ?)`)
        .bind(userId, taskId, now)),
    ]);

    return Response.json({ ok: true, savedAt: now });
  }

  if (body.action === 'commit-work') {
    const workOrderId = typeof body.workOrderId === 'string' ? body.workOrderId : '';
    const order = await database.prepare(`SELECT id, name, capacity_cost
      FROM work_orders WHERE id = ? AND status = 'open'`).bind(workOrderId).first<{
      id: string;
      name: string;
      capacity_cost: number;
    }>();
    if (!order) return Response.json({ error: 'Work order unavailable.' }, { status: 404 });

    const update = await database.prepare(`UPDATE citizens
      SET capacity = capacity - ?, updated_at = ?
      WHERE clerk_user_id = ? AND nation_id IS NOT NULL AND capacity >= ?`)
      .bind(order.capacity_cost, now, userId, order.capacity_cost)
      .run();
    if (!update.meta.changes) {
      return Response.json({ error: 'Enroll and confirm sufficient capacity first.' }, { status: 409 });
    }

    await database.prepare(`INSERT INTO work_contributions (
      clerk_user_id, work_order_id, capacity_spent, created_at
    ) VALUES (?, ?, ?, ?)`)
      .bind(userId, order.id, order.capacity_cost, now)
      .run();
    const citizen = await database.prepare('SELECT capacity FROM citizens WHERE clerk_user_id = ?')
      .bind(userId)
      .first<{ capacity: number }>();

    return Response.json({ ok: true, capacity: citizen?.capacity ?? 0, orderName: order.name });
  }

  return Response.json({ error: 'Unknown action.' }, { status: 400 });
}
